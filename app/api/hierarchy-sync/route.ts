import { connectDB } from "@/lib/db";
import Membership from "@/lib/models/Membership";
import Designation, { PERMISSION_KEYS } from "@/lib/models/Designation";
import FlowLayout from "@/lib/models/FlowLayout";
import { unauthorized, forbidden, ok, badRequest } from "@/lib/helpers";
import { getVerifiedSession, hasPermission, invalidateHierarchyCache } from "@/lib/permissions";

interface EmpLink {
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  permissions?: Record<string, boolean>;
  designationId?: string;
}

function empId(nodeId: string): string {
  return nodeId.startsWith("emp-") ? nodeId.slice(4) : nodeId;
}

/**
 * Walk hierarchy downward: find all subordinates (transitive) with the
 * accumulated permissions from each link in the chain.
 * Returns { nodeId, mergedPerms } for each subordinate.
 */
function getSubordinatesWithPerms(employeeNodeId: string, links: EmpLink[]): { nodeId: string; mergedPerms: Record<string, boolean> }[] {
  const results: { nodeId: string; mergedPerms: Record<string, boolean> }[] = [];
  const visited = new Set<string>();

  interface QueueItem { nodeId: string; perms: Record<string, boolean> }
  const queue: QueueItem[] = [{ nodeId: employeeNodeId, perms: {} }];

  while (queue.length > 0) {
    const { nodeId: current, perms: accumPerms } = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const link of links) {
      let subNode: string | null = null;
      if (link.source === current && link.sourceHandle === "bottom" && link.targetHandle === "top") {
        subNode = link.target;
      } else if (link.target === current && link.sourceHandle === "top" && link.targetHandle === "bottom") {
        subNode = link.source;
      }
      if (!subNode || visited.has(subNode)) continue;

      // Merge: union of accumulated perms + this link's perms
      const merged = { ...accumPerms };
      if (link.permissions) {
        for (const [k, v] of Object.entries(link.permissions)) {
          if (v) merged[k] = true;
        }
      }

      results.push({ nodeId: subNode, mergedPerms: merged });
      queue.push({ nodeId: subNode, perms: merged });
    }
  }

  return results;
}

/**
 * POST /api/hierarchy-sync
 * Body: { canvasId?: string }
 *
 * Reads the current emp-to-emp links from FlowLayout, then:
 * 1. For every employee who has subordinates with department memberships,
 *    ensure the superior has an autoSource:"hierarchy" membership in those departments.
 * 2. Remove stale autoSource:"hierarchy" memberships that are no longer needed.
 */
export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "organization_manageLinks")) return forbidden();

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is ok */
  }

  const canvasId = (body.canvasId as string) ?? "org";

  await connectDB();

  const layout = await FlowLayout.findOne({ canvasId }).lean();
  const links: EmpLink[] = (layout?.links as unknown as EmpLink[]) ?? [];

  // Get a default designation for auto-memberships
  const defaultDesig = await Designation.findOne({}).select("_id").lean();
  if (!defaultDesig) return badRequest("No designations exist. Create at least one designation first.");

  // Get all existing memberships
  const allMemberships = await Membership.find({ isActive: true }).lean();

  // Build a map: employeeId -> department IDs they have MANUAL memberships in
  const empDeptMap = new Map<string, Set<string>>();
  for (const m of allMemberships) {
    if (m.autoSource === "hierarchy") continue;
    const uid = m.user.toString();
    if (!empDeptMap.has(uid)) empDeptMap.set(uid, new Set());
    empDeptMap.get(uid)!.add(m.department.toString());
  }

  // Collect all unique employee node IDs that are "above" someone
  const allEmpNodes = new Set<string>();
  for (const link of links) {
    if (link.source.startsWith("emp-")) allEmpNodes.add(link.source);
    if (link.target.startsWith("emp-")) allEmpNodes.add(link.target);
  }

  // For each employee, compute { deptId -> permissions } they need based on
  // their subordinates' departments and the accumulated link permissions
  const neededAuto = new Map<string, Map<string, Record<string, boolean>>>(); // userId -> Map<deptId, perms>

  for (const empNode of allEmpNodes) {
    const userId = empId(empNode);
    const subsWithPerms = getSubordinatesWithPerms(empNode, links);

    for (const { nodeId: subNode, mergedPerms } of subsWithPerms) {
      const subId = empId(subNode);
      const subDepts = empDeptMap.get(subId);
      if (!subDepts) continue;

      if (!neededAuto.has(userId)) neededAuto.set(userId, new Map());
      const userMap = neededAuto.get(userId)!;

      for (const deptId of subDepts) {
        if (!userMap.has(deptId)) {
          userMap.set(deptId, { ...mergedPerms });
        } else {
          // Union: if any path grants a permission, keep it
          const existing = userMap.get(deptId)!;
          for (const [k, v] of Object.entries(mergedPerms)) {
            if (v) existing[k] = true;
          }
        }
      }
    }
  }

  const existingAuto = allMemberships.filter((m) => m.autoSource === "hierarchy");
  const existingAutoMap = new Map(
    existingAuto.map((m) => [`${m.user.toString()}:${m.department.toString()}`, m]),
  );

  let created = 0;
  let removed = 0;
  let updated = 0;
  let skipped = 0;

  // Build full permission objects (fill missing keys with false)
  function fullPerms(partial: Record<string, boolean>): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const k of PERMISSION_KEYS) out[k] = !!partial[k];
    return out;
  }

  // Create or update auto-memberships
  const processedKeys = new Set<string>();
  for (const [userId, deptMap] of neededAuto) {
    for (const [deptId, linkPerms] of deptMap) {
      const key = `${userId}:${deptId}`;
      processedKeys.add(key);

      // Skip if user already has a MANUAL membership in this dept
      if (empDeptMap.get(userId)?.has(deptId)) { skipped++; continue; }

      const existing = existingAutoMap.get(key);
      if (existing) {
        // Update permissions if they changed
        const newPerms = fullPerms(linkPerms);
        const oldPerms = (existing.permissions ?? {}) as Record<string, boolean>;
        const changed = PERMISSION_KEYS.some((k) => !!newPerms[k] !== !!oldPerms[k]);
        if (changed) {
          await Membership.updateOne({ _id: existing._id }, { $set: { permissions: newPerms } });
          updated++;
        } else {
          skipped++;
        }
      } else {
        try {
          await Membership.create({
            user: userId, department: deptId,
            designation: defaultDesig._id, isActive: true,
            autoSource: "hierarchy", permissions: fullPerms(linkPerms),
          });
          created++;
        } catch { skipped++; }
      }
    }
  }

  // Remove stale auto-memberships
  for (const autoMem of existingAuto) {
    const key = `${autoMem.user.toString()}:${autoMem.department.toString()}`;
    if (!processedKeys.has(key)) {
      await Membership.deleteOne({ _id: autoMem._id });
      removed++;
    }
  }

  invalidateHierarchyCache();
  return ok({ created, updated, removed, skipped });
}
