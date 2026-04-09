import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import Membership from "@/lib/models/Membership";
import FlowLayout from "@/lib/models/FlowLayout";
import type { IPermissions } from "@/lib/models/Designation";
import { PERMISSION_KEYS } from "@/lib/models/Designation";
import { auth } from "@/lib/auth";

/* ================================================================ */
/* MEMBERSHIP-ENRICHED SESSION                                       */
/* ================================================================ */

export interface MembershipContext {
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
export function hasAnyPermission(actor: VerifiedUser, permissions: (keyof IPermissions)[]): boolean {
  if (actor.isSuperAdmin) return true;
  return permissions.some((p) => hasPermission(actor, p));
}

/* ================================================================ */
/* HIERARCHY TRAVERSAL                                               */
/* ================================================================ */

/**
 * Walk the full org chart hierarchy downward from a given user, traversing
 * both emp-to-emp links (FlowLayout) AND department memberships where the
 * employee is "above" a department.  Returns all transitive subordinate IDs.
 *
 * Traversal:
 *  1.  emp → (bottom handle) → emp   (direct subordinate)
 *  2.  emp is "above" dept  →  every other employee in that dept
 *  3.  repeat recursively for every newly discovered employee
 */
export async function getSubordinateUserIds(userId: string): Promise<string[]> {
  await connectDB();

  const [layout, allMemberships] = await Promise.all([
    FlowLayout.findOne({ canvasId: "org" }).lean(),
    Membership.find({ isActive: { $ne: false } })
      .select("user department direction")
      .lean(),
  ]);

  const empLinks = (layout?.links ?? []) as {
    source: string; target: string;
    sourceHandle: string; targetHandle: string;
  }[];

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
 * Return department IDs visible to a non-SuperAdmin user based on hierarchy:
 * departments the user belongs to + departments their subordinates belong to.
 */
export async function getHierarchyDepartmentIds(userId: string): Promise<string[]> {
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
  return [...deptIds];
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
