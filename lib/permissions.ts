import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import Membership from "@/lib/models/Membership";
import FlowLayout from "@/lib/models/FlowLayout";
import "@/lib/models/Department";
import type { IPermissions } from "@/lib/models/Designation";
import { PERMISSION_KEYS } from "@/lib/models/Designation";
import { auth } from "@/lib/auth";

/* ================================================================ */
/* MEMBERSHIP-ENRICHED SESSION                                       */
/* ================================================================ */

interface MembershipContext {
  membershipId: string;
  departmentId: string;
  departmentName: string;
  designationId: string;
  designationName: string;
  permissions: IPermissions;
}

export interface VerifiedUser {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  memberships: MembershipContext[];
  isActive: boolean;
}

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

export interface PermissionsPayload {
  isSuperAdmin: boolean;
  permissions: Partial<Record<keyof IPermissions, boolean>>;
  hasSubordinates: boolean;
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
    return { isSuperAdmin: false, permissions: {}, hasSubordinates: false };
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
  }

  const subordinateIds = userIsSuperAdmin ? [] : await getSubordinateUserIds(userId);

  return {
    isSuperAdmin: userIsSuperAdmin,
    permissions: merged,
    hasSubordinates: userIsSuperAdmin || subordinateIds.length > 0,
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
  permission: keyof IPermissions,
  departmentId?: string,
): boolean {
  if (actor.isSuperAdmin) return true;

  const relevantMemberships = departmentId
    ? actor.memberships.filter((m) => m.departmentId === departmentId)
    : actor.memberships;

  return relevantMemberships.some((m) => m.permissions[permission] === true);
}

/**
 * Check if user has ANY of the given permissions across any membership.
 */
function hasAnyPermission(actor: VerifiedUser, permissions: (keyof IPermissions)[]): boolean {
  if (actor.isSuperAdmin) return true;
  return permissions.some((p) => hasPermission(actor, p));
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
    FlowLayout.findOne({ canvasId: "org" }).select("links").lean(),
    Membership.find({ isActive: { $ne: false } })
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
    isActive: { $ne: false },
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
/* CONVENIENCE PERMISSION WRAPPERS                                   */
/* ================================================================ */

export function canManageDepartments(actor: VerifiedUser): boolean {
  return hasAnyPermission(actor, ["departments_create", "departments_edit"]);
}

export function canManageTasks(actor: VerifiedUser): boolean {
  return hasAnyPermission(actor, ["tasks_create", "tasks_edit"]);
}

export function canManageCampaigns(actor: VerifiedUser): boolean {
  return hasAnyPermission(actor, ["campaigns_create", "campaigns_edit"]);
}

export function canDeleteCampaign(actor: VerifiedUser): boolean {
  return hasPermission(actor, "campaigns_delete");
}

export function canManageSettings(actor: VerifiedUser): boolean {
  return hasPermission(actor, "settings_manage");
}

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
