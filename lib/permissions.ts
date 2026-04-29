import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import Membership from "@/lib/models/Membership";
import FlowLayout from "@/lib/models/FlowLayout";
import "@/lib/models/Department";
import { PERMISSION_KEYS, SELF_PERMISSIONS, type IPermissions, type AnyPermissionKey } from "@/lib/permissions.shared";
import { auth } from "@/lib/auth";
import { ORG_CANVAS_ID } from "@/lib/constants";

/* ================================================================ */
/* MEMBERSHIP-ENRICHED SESSION                                       */
/* ================================================================ */

interface MembershipContext {
  membershipId: string;
  departmentId: string;
  departmentName: string;
  designationId: string;
  designationName: string;
  permissions: IPermissions | Record<string, boolean>;
}

export interface VerifiedUser {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  memberships: MembershipContext[];
  isActive: boolean;
}

/**
 * Get permissions granted to a user via emp-to-emp links in the org chart
 * where the user is the upper node (has subordinates below them on that link).
 */
async function getLinkPermissions(userId: string): Promise<Partial<Record<keyof IPermissions, boolean>>> {
  await connectDB();
  const layout = await FlowLayout.findOne({ canvasId: ORG_CANVAS_ID }).select("links").lean();
  const links = (layout?.links ?? []) as { source: string; target: string; sourceHandle: string; targetHandle: string; permissions?: Record<string, boolean> }[];
  const empNode = `emp-${userId}`;
  const merged: Partial<Record<keyof IPermissions, boolean>> = {};

  for (const link of links) {
    let isAbove = false;
    if (link.source === empNode && link.sourceHandle === "bottom" && link.targetHandle === "top") {
      isAbove = true;
    } else if (link.target === empNode && link.sourceHandle === "top" && link.targetHandle === "bottom") {
      isAbove = true;
    }
    if (isAbove && link.permissions) {
      for (const k of PERMISSION_KEYS) {
        if (link.permissions[String(k)]) merged[k] = true;
      }
    }
  }

  return merged;
}

/** Authenticates the current request and returns the verified user. Also establishes the DB connection (no need to call connectDB separately). */
export async function getVerifiedSession(): Promise<VerifiedUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  await connectDB();

  const dbUser = await User.findById(session.user.id)
    .select("email isSuperAdmin isActive")
    .lean();

  if (!dbUser || !dbUser.isActive) return null;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const raw = dbUser as any;

  const memberships = await Membership.find({ user: dbUser._id, isActive: true })
    .populate("designation", "name")
    .populate("department", "title")
    .lean();

  const membershipContexts: MembershipContext[] = memberships.map((m: any) => ({
    membershipId: m._id.toString(),
    departmentId: m.department?._id?.toString() ?? m.department?.toString() ?? "",
    departmentName: m.department?.title ?? "Unknown",
    designationId: m.designation?._id?.toString() ?? m.designation?.toString() ?? "",
    designationName: m.designation?.name ?? "Unknown",
    permissions: m.permissions ?? {},
  }));

  if (!raw.isSuperAdmin) {
    const linkPerms = await getLinkPermissions(dbUser._id.toString());
    if (Object.keys(linkPerms).length > 0) {
      membershipContexts.push({
        membershipId: "__link__",
        departmentId: "",
        departmentName: "",
        designationId: "",
        designationName: "",
        permissions: linkPerms as Record<string, boolean>,
      });
    }
  }

  return {
    id: dbUser._id.toString(),
    email: dbUser.email,
    isSuperAdmin: raw.isSuperAdmin === true,
    memberships: membershipContexts,
    isActive: dbUser.isActive,
  };
}

/* ================================================================ */
/* SERVER-SIDE PERMISSIONS PAYLOAD                                    */
/* ================================================================ */

interface PermissionsPayload {
  isSuperAdmin: boolean;
  permissions: Partial<Record<keyof IPermissions, boolean>>;
  hasSubordinates: boolean;
  subordinateIds: string[];
}

/**
 * Build the merged permissions object for a user — same shape as
 * GET /api/me/permissions. Called from the server layout so the client
 * hydrates with correct values on first paint.
 */
export async function getPermissionsPayload(userId: string): Promise<PermissionsPayload> {
  await connectDB();

  const dbUser = await User.findById(userId).select("isSuperAdmin isActive").lean();
  if (!dbUser || !dbUser.isActive) {
    return { isSuperAdmin: false, permissions: {}, hasSubordinates: false, subordinateIds: [] };
  }

  const userIsSuperAdmin = (dbUser as any).isSuperAdmin === true; // eslint-disable-line @typescript-eslint/no-explicit-any
  const merged: Partial<Record<keyof IPermissions, boolean>> = {};

  if (userIsSuperAdmin) {
    for (const k of PERMISSION_KEYS) merged[k] = true;
  } else {
    const memberships = await Membership.find({ user: userId, isActive: true })
      .select("permissions")
      .lean();
    for (const m of memberships) {
      for (const k of PERMISSION_KEYS) {
        if ((m.permissions as unknown as Record<string, boolean>)?.[k]) merged[k] = true;
      }
    }

    const linkPerms = await getLinkPermissions(userId);
    for (const k of PERMISSION_KEYS) {
      if (linkPerms[k]) merged[k] = true;
    }
  }

  const subordinateIds = userIsSuperAdmin ? [] : await getSubordinateUserIds(userId);

  return {
    isSuperAdmin: userIsSuperAdmin,
    permissions: merged,
    hasSubordinates: userIsSuperAdmin || subordinateIds.length > 0,
    subordinateIds,
  };
}

/* ================================================================ */
/* PERMISSION CHECKS                                                 */
/* ================================================================ */

export function isSuperAdmin(user: VerifiedUser): boolean {
  return user.isSuperAdmin;
}

/**
 * Check if a permission is toggled ON in any of the user's memberships.
 * SuperAdmin always returns true.
 */
export function hasPermission(
  actor: VerifiedUser,
  permission: AnyPermissionKey,
  departmentId?: string,
): boolean {
  if ((SELF_PERMISSIONS as ReadonlySet<string>).has(permission)) return true;
  if (actor.isSuperAdmin) return true;

  const relevantMemberships = departmentId
    ? actor.memberships.filter((m) => m.departmentId === departmentId)
    : actor.memberships;

  return relevantMemberships.some((m) => (m.permissions as Record<string, boolean>)[permission as string] === true);
}

/* ================================================================ */
/* HIERARCHY TRAVERSAL  (with request-level memoization)             */
/* ================================================================ */

type OrgGraphData = {
  empLinks: { source: string; target: string; sourceHandle: string; targetHandle: string }[];
  allMemberships: { user?: { toString(): string }; department?: { toString(): string }; direction?: string }[];
};

const _orgGraphCache: { data: OrgGraphData | null; expiry: number } = { data: null, expiry: 0 };
const _subordinateCache = new Map<string, { result: string[]; expiry: number }>();
const _hierarchyDeptCache = new Map<string, { result: string[]; expiry: number }>();
const HIERARCHY_TTL_MS = 10_000;

async function loadOrgGraph(): Promise<OrgGraphData> {
  const now = Date.now();
  if (_orgGraphCache.data && now < _orgGraphCache.expiry) return _orgGraphCache.data;

  await connectDB();
  const [layout, allMemberships] = await Promise.all([
    FlowLayout.findOne({ canvasId: ORG_CANVAS_ID }).select("links").lean(),
    Membership.find({ isActive: true })
      .select("user department direction")
      .lean(),
  ]);

  const data: OrgGraphData = {
    empLinks: (layout?.links ?? []) as OrgGraphData["empLinks"],
    allMemberships,
  };
  _orgGraphCache.data = data;
  _orgGraphCache.expiry = now + HIERARCHY_TTL_MS;
  return data;
}

function walkSubordinates(userId: string, graph: OrgGraphData): string[] {
  const { empLinks, allMemberships } = graph;
  const startNode = `emp-${userId}`;
  const visited = new Set<string>();
  const visitedDepts = new Set<string>();
  const queue = [startNode];
  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const empId = current.startsWith("emp-") ? current.slice(4) : null;
    if (!empId) continue;

    for (const link of empLinks) {
      let subNode: string | null = null;
      if (link.source === current && link.sourceHandle === "bottom" && link.targetHandle === "top") {
        subNode = link.target;
      } else if (link.target === current && link.sourceHandle === "top" && link.targetHandle === "bottom") {
        subNode = link.source;
      }
      if (!subNode || visited.has(subNode)) continue;
      if (subNode.startsWith("emp-")) {
        result.push(subNode.slice(4));
        queue.push(subNode);
      }
    }

    for (const mem of allMemberships) {
      if (mem.user?.toString() !== empId) continue;
      if (mem.direction !== "above") continue;
      const deptId = mem.department?.toString();
      if (!deptId || visitedDepts.has(deptId)) continue;
      visitedDepts.add(deptId);

      for (const other of allMemberships) {
        const otherUserId = other.user?.toString();
        if (!otherUserId) continue;
        if (other.department?.toString() !== deptId) continue;
        if (otherUserId === userId) continue;
        const otherNode = `emp-${otherUserId}`;
        if (visited.has(otherNode)) continue;
        result.push(otherUserId);
        queue.push(otherNode);
      }
    }
  }

  return [...new Set(result)];
}

/**
 * Walk the full org chart hierarchy downward from a given user, traversing
 * both emp-to-emp links (FlowLayout) AND department memberships where the
 * employee is "above" a department.  Returns all transitive subordinate IDs.
 *
 * Results are cached for 10 seconds to avoid duplicate DB reads within the
 * same request or rapid successive requests.
 */
export async function getSubordinateUserIds(userId: string): Promise<string[]> {
  const now = Date.now();
  const cached = _subordinateCache.get(userId);
  if (cached && now < cached.expiry) return cached.result;

  const graph = await loadOrgGraph();
  const result = walkSubordinates(userId, graph);
  _subordinateCache.set(userId, { result, expiry: now + HIERARCHY_TTL_MS });
  return result;
}

/**
 * Return department IDs visible to a non-SuperAdmin user based on hierarchy:
 * departments the user belongs to + departments their subordinates belong to.
 * Reuses the cached subordinate results from getSubordinateUserIds.
 */
export async function getHierarchyDepartmentIds(userId: string): Promise<string[]> {
  const now = Date.now();
  const cached = _hierarchyDeptCache.get(userId);
  if (cached && now < cached.expiry) return cached.result;

  await connectDB();
  const subordinateIds = await getSubordinateUserIds(userId);
  const allVisibleUsers = [userId, ...subordinateIds];

  const memberships = await Membership.find({
    user: { $in: allVisibleUsers },
    isActive: true,
  }).select("department").lean();

  const deptIds = new Set<string>();
  for (const m of memberships) {
    const dId = m.department?.toString();
    if (dId) deptIds.add(dId);
  }
  const result = [...deptIds];
  _hierarchyDeptCache.set(userId, { result, expiry: now + HIERARCHY_TTL_MS });
  return result;
}

/* ================================================================ */
/* CAMPAIGN SCOPE                                                    */
/* ================================================================ */

export async function getCampaignScopeFilter(actor: VerifiedUser): Promise<Record<string, unknown>> {
  if (actor.isSuperAdmin) return {};

  const subordinateIds = await getSubordinateUserIds(actor.id);
  const visibleUserIds = [actor.id, ...subordinateIds];
  const visibleDeptIds = await getHierarchyDepartmentIds(actor.id);

  const orClauses: Record<string, unknown>[] = [
    { "tags.employees": { $in: visibleUserIds } },
  ];
  if (visibleDeptIds.length > 0) {
    orClauses.push({ "tags.departments": { $in: visibleDeptIds } });
  }

  return { $or: orClauses };
}

/** Evict all hierarchy caches (call after org structure changes). */
export function invalidateHierarchyCache(): void {
  _orgGraphCache.data = null;
  _orgGraphCache.expiry = 0;
  _subordinateCache.clear();
  _hierarchyDeptCache.clear();
}
