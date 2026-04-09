import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import Membership from "@/lib/models/Membership";
import FlowLayout from "@/lib/models/FlowLayout";
import type { IPermissions } from "@/lib/models/Designation";
import { VIEW_ONLY_PERMISSIONS } from "@/lib/models/Designation";
import { auth } from "@/lib/auth";

/* ================================================================ */
/* MEMBERSHIP-ENRICHED SESSION                                       */
/* ================================================================ */

export interface MembershipContext {
  membershipId: string;
  departmentId: string;
  departmentName: string;
  teamId?: string;
  teamName?: string;
  designationId: string;
  designationName: string;
  permissions: IPermissions;
  reportsTo?: string;
  isPrimary: boolean;
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
    .populate("team", "name")
    .lean();

  const membershipContexts: MembershipContext[] = memberships.map((m: any) => ({
    membershipId: m._id.toString(),
    departmentId: m.department?._id?.toString() ?? m.department?.toString() ?? "",
    departmentName: m.department?.title ?? "Unknown",
    teamId: m.team?._id?.toString() ?? m.team?.toString() ?? undefined,
    teamName: m.team?.name ?? undefined,
    designationId: m.designation?._id?.toString() ?? m.designation?.toString() ?? "",
    designationName: m.designation?.name ?? "Unknown",
    permissions: m.permissions ?? {},
    reportsTo: m.reportsTo?.toString() ?? undefined,
    isPrimary: m.isPrimary ?? false,
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
/* PERMISSION SYSTEM                                                 */
/* ================================================================ */

/**
 * Check if a permission is toggled ON in any of the user's memberships.
 * SuperAdmin always returns true.
 */
export function hasPermission(
  actor: VerifiedUser,
  permission: keyof IPermissions,
  departmentId?: string,
  teamId?: string,
): boolean {
  if (actor.isSuperAdmin) return true;

  const relevantMemberships = actor.memberships.filter((m) => {
    if (departmentId && m.departmentId !== departmentId) return false;
    if (teamId && m.teamId && m.teamId !== teamId) return false;
    return true;
  });

  return relevantMemberships.some((m) => m.permissions[permission] === true);
}

/**
 * Walk the reportsTo chain to check if the target is below the actor.
 */
export async function isAboveInChain(
  actorId: string,
  targetUserId: string,
  departmentId: string,
): Promise<boolean> {
  if (actorId === targetUserId) return false;

  await connectDB();

  const deptMemberships = await Membership.find({
    department: departmentId,
    isActive: true,
  }).select("user reportsTo").lean();

  const reportsToMap = new Map<string, string | null>();
  for (const m of deptMemberships) {
    reportsToMap.set(m.user.toString(), m.reportsTo?.toString() ?? null);
  }

  let current: string | null = targetUserId;
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current)) break;
    visited.add(current);
    const reportsTo = reportsToMap.get(current);
    if (!reportsTo) break;
    if (reportsTo === actorId) return true;
    current = reportsTo;
  }

  return false;
}

/**
 * Combined check: permission + reporting chain for write actions.
 */
export async function canActOn(
  actor: VerifiedUser,
  permission: keyof IPermissions,
  targetUserId: string,
  departmentId?: string,
): Promise<boolean> {
  if (actor.isSuperAdmin) return true;
  if (!hasPermission(actor, permission, departmentId)) return false;
  if (VIEW_ONLY_PERMISSIONS.has(permission)) return true;

  if (!departmentId) {
    for (const m of actor.memberships) {
      if (m.permissions[permission] && await isAboveInChain(actor.id, targetUserId, m.departmentId)) {
        return true;
      }
    }
    return false;
  }

  return isAboveInChain(actor.id, targetUserId, departmentId);
}

/**
 * Check if user has ANY of the given permissions across any membership.
 */
export function hasAnyPermission(actor: VerifiedUser, permissions: (keyof IPermissions)[]): boolean {
  if (actor.isSuperAdmin) return true;
  return permissions.some((p) => hasPermission(actor, p));
}

/**
 * Get all department IDs the user has a specific permission for.
 * Returns [] for SuperAdmin (meaning "all departments").
 */
export function getDepartmentScope(actor: VerifiedUser, permission: keyof IPermissions): string[] {
  if (actor.isSuperAdmin) return [];
  return actor.memberships
    .filter((m) => m.permissions[permission] === true)
    .map((m) => m.departmentId);
}

/**
 * Get all team IDs the user has a specific permission for.
 * Returns [] for SuperAdmin (meaning "all teams").
 */
export function getTeamScope(actor: VerifiedUser, permission: keyof IPermissions): string[] {
  if (actor.isSuperAdmin) return [];
  return actor.memberships
    .filter((m) => m.teamId && m.permissions[permission] === true)
    .map((m) => m.teamId!);
}

/**
 * Get all employee IDs visible to a user through their memberships.
 * SuperAdmin sees everyone. Others see employees in their scoped departments/teams.
 */
export async function getScopedEmployeeIds(actor: VerifiedUser): Promise<string[] | null> {
  if (actor.isSuperAdmin) return null; // null = all

  await connectDB();

  const ids = new Set<string>();
  ids.add(actor.id);

  const deptIds = [...new Set(actor.memberships.map((m) => m.departmentId))];
  if (deptIds.length > 0) {
    const membershipUsers = await Membership.find({
      department: { $in: deptIds },
      isActive: true,
    }).distinct("user");
    for (const id of membershipUsers) ids.add(id.toString());
  }

  const subordinateIds = await getSubordinateUserIds(actor.id);
  for (const id of subordinateIds) ids.add(id);

  return [...ids];
}

/**
 * Walk the org chart hierarchy (FlowLayout emp-to-emp links) downward
 * from a given user and return all subordinate user IDs (transitive).
 */
export async function getSubordinateUserIds(userId: string): Promise<string[]> {
  await connectDB();
  const layout = await FlowLayout.findOne({ canvasId: "org" }).lean();
  const links = (layout?.links ?? []) as { source: string; target: string; sourceHandle: string; targetHandle: string }[];
  if (links.length === 0) return [];

  const startNode = `emp-${userId}`;
  const visited = new Set<string>();
  const queue = [startNode];
  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
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
      if (subNode.startsWith("emp-")) {
        result.push(subNode.slice(4));
        queue.push(subNode);
      }
    }
  }

  return result;
}

/* ================================================================ */
/* BRIDGE FUNCTIONS — map old names to membership-based checks       */
/* These keep existing API routes working without changing every file */
/* ================================================================ */

export function isSuperAdmin(user: VerifiedUser): boolean {
  return user.isSuperAdmin;
}

/** Has elevated permissions (any write permission in any membership) */
export function isAdmin(user: VerifiedUser): boolean {
  if (user.isSuperAdmin) return true;
  return user.memberships.some((m) => {
    const p = m.permissions;
    return p.employees_create || p.employees_edit || p.tasks_create ||
      p.campaigns_create || p.attendance_edit || p.leaves_approve;
  });
}

export function isManager(user: VerifiedUser): boolean {
  return isAdmin(user);
}

export function isTeamLead(user: VerifiedUser): boolean {
  return isAdmin(user);
}

export function isEmployee(user: VerifiedUser): boolean {
  return !user.isSuperAdmin;
}

export function outranks(_actor: VerifiedUser, _targetRole: string): boolean {
  return _actor.isSuperAdmin;
}

export function isSameDepartment(user: VerifiedUser, targetDept?: string | null): boolean {
  if (!targetDept) return false;
  return user.memberships.some((m) => m.departmentId === targetDept);
}

export async function isInUsersDepartment(actor: VerifiedUser, targetUserId: string): Promise<boolean> {
  if (actor.isSuperAdmin) return true;
  await connectDB();
  const targetMemberships = await Membership.find({ user: targetUserId, isActive: true }).select("department").lean();
  const targetDepts = new Set(targetMemberships.map((m: any) => m.department?.toString()));
  return actor.memberships.some((m) => targetDepts.has(m.departmentId));
}

export async function getTeamMemberIds(teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return [];
  await connectDB();
  const members = await Membership.find({
    team: { $in: teamIds },
    isActive: true,
  }).distinct("user");
  return members.map((id: any) => id.toString());
}

export function isInLeadTeams(actor: VerifiedUser, targetTeams: string[]): boolean {
  if (targetTeams.length === 0) return false;
  const actorTeams = new Set(actor.memberships.filter((m) => m.teamId).map((m) => m.teamId!));
  return targetTeams.some((t) => actorTeams.has(t));
}

export function canManageEmployees(actor: VerifiedUser): boolean {
  return hasAnyPermission(actor, ["employees_create", "employees_edit"]);
}

export function canEditEmployee(actor: VerifiedUser, targetId: string, _targetDept?: string | null, _targetTeams?: string[]): boolean {
  if (actor.isSuperAdmin) return true;
  if (actor.id === targetId) return true;
  return hasPermission(actor, "employees_edit");
}

export function canViewEmployee(actor: VerifiedUser, targetId: string, _targetDept?: string | null, _targetTeams?: string[]): boolean {
  if (actor.isSuperAdmin) return true;
  if (actor.id === targetId) return true;
  return hasPermission(actor, "employees_view");
}

export function canManageDepartments(actor: VerifiedUser): boolean {
  return hasAnyPermission(actor, ["departments_create", "departments_edit"]);
}

export function canViewDepartment(actor: VerifiedUser, _deptId?: string | null): boolean {
  return hasPermission(actor, "departments_view");
}

export function canManageTeams(actor: VerifiedUser): boolean {
  return actor.isSuperAdmin;
}

export function canEditTeam(actor: VerifiedUser, _teamDept?: string | null, _teamId?: string | null): boolean {
  return actor.isSuperAdmin;
}

export function canManageTasks(actor: VerifiedUser): boolean {
  return hasAnyPermission(actor, ["tasks_create", "tasks_edit"]);
}

export function canAssignTaskTo(actor: VerifiedUser, _targetDept?: string | null, _targetTeams?: string[]): boolean {
  return hasPermission(actor, "tasks_reassign");
}

export function canViewAttendance(actor: VerifiedUser, targetId: string, _targetDept?: string | null, _targetTeams?: string[]): boolean {
  if (actor.isSuperAdmin) return true;
  if (actor.id === targetId) return true;
  return hasPermission(actor, "attendance_viewTeam");
}

export function canViewTeamStats(actor: VerifiedUser): boolean {
  return hasPermission(actor, "attendance_viewTeam");
}

export function canViewActivityLogs(actor: VerifiedUser): boolean {
  return hasAnyPermission(actor, ["employees_view", "attendance_viewTeam"]);
}

export function canManageCampaigns(actor: VerifiedUser): boolean {
  return hasAnyPermission(actor, ["campaigns_create", "campaigns_edit"]);
}

export async function getDeptTeamIds(deptId: string): Promise<string[]> {
  await connectDB();
  const { default: Team } = await import("@/lib/models/Team");
  const teams = await Team.find({ departments: deptId, isActive: true }).distinct("_id");
  return teams.map((id: any) => id.toString());
}

export async function getDeptEmployeeIds(deptId: string): Promise<string[]> {
  await connectDB();
  const members = await Membership.find({
    department: deptId,
    isActive: true,
  }).distinct("user");
  return members.map((id: any) => id.toString());
}

export async function getCampaignScopeFilter(actor: VerifiedUser): Promise<Record<string, unknown>> {
  if (actor.isSuperAdmin) return {};

  const deptIds = getDepartmentScope(actor, "campaigns_view");
  if (deptIds.length === 0) return { "tags.employees": actor.id };

  const orClauses: Record<string, unknown>[] = [
    { "tags.employees": actor.id },
    { "tags.departments": { $in: deptIds } },
  ];

  const allTeamIds: string[] = [];
  const allEmpIds: string[] = [];
  for (const deptId of deptIds) {
    const deptTeams = await getDeptTeamIds(deptId);
    allTeamIds.push(...deptTeams);
    const deptEmps = await getDeptEmployeeIds(deptId);
    allEmpIds.push(...deptEmps);
  }
  if (allTeamIds.length > 0) orClauses.push({ "tags.teams": { $in: allTeamIds } });
  if (allEmpIds.length > 0) orClauses.push({ "tags.employees": { $in: allEmpIds } });

  return { $or: orClauses };
}

export function canDeleteCampaign(actor: VerifiedUser): boolean {
  return hasPermission(actor, "campaigns_delete");
}

export function canViewOrgChart(actor: VerifiedUser): boolean {
  return hasPermission(actor, "organization_view");
}

export function canManageOrgLinks(actor: VerifiedUser): boolean {
  return hasPermission(actor, "organization_manageLinks");
}

export function canViewUpdates(actor: VerifiedUser): boolean {
  return hasPermission(actor, "updates_view");
}

export function canManageUpdates(actor: VerifiedUser): boolean {
  return hasAnyPermission(actor, ["updates_create", "updates_edit"]);
}

export function canSendPing(actor: VerifiedUser): boolean {
  return hasPermission(actor, "ping_send");
}

export function canManageSettings(actor: VerifiedUser): boolean {
  return hasPermission(actor, "settings_manage");
}

export function canGrantCrossDeptAccess(_actor: VerifiedUser): boolean {
  return _actor.isSuperAdmin;
}
