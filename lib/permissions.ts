import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import Team from "@/lib/models/Team";
import Department from "@/lib/models/Department";
import Membership from "@/lib/models/Membership";
import type { UserRole } from "@/lib/models/User";
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

  /** @deprecated Transitional — use isSuperAdmin + memberships. */
  role: UserRole;
  /** @deprecated Transitional — use memberships. */
  department?: string;
  /** @deprecated Transitional — use memberships. */
  managedDepartments: string[];
  /** @deprecated Transitional — use memberships. */
  teams: string[];
  /** @deprecated Transitional — use memberships. */
  leadOfTeams: string[];
  isActive: boolean;
  /** @deprecated Transitional — use memberships. */
  crossDepartmentAccess: boolean;
  /** @deprecated Transitional — use memberships. */
  teamStatsVisible: boolean;
}

export async function getVerifiedSession(): Promise<VerifiedUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  await connectDB();

  const dbUser = await User.findById(session.user.id)
    .select("email userRole isSuperAdmin department teams isActive crossDepartmentAccess teamStatsVisible")
    .lean();

  if (!dbUser || !dbUser.isActive) return null;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const raw = dbUser as any;

  // Load memberships with populated designation + department + team names
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

  // --- Legacy fields (transitional) ---
  const userTeams = (raw.teams ?? []).map((t: any) => t.toString());
  let leadOfTeams: string[] = [];
  if (raw.userRole === "teamLead" || raw.userRole === "manager") {
    const led = await Team.find({ lead: dbUser._id, isActive: true }).select("_id").lean();
    leadOfTeams = led.map((t: any) => t._id.toString());
  }
  let managedDepartments: string[] = [];
  if (raw.userRole === "manager" || raw.userRole === "teamLead") {
    const managed = await Department.find({ manager: dbUser._id, isActive: true }).select("_id").lean();
    managedDepartments = managed.map((d: any) => d._id.toString());
  }

  return {
    id: dbUser._id.toString(),
    email: dbUser.email,
    isSuperAdmin: raw.isSuperAdmin === true || raw.userRole === "superadmin",
    memberships: membershipContexts,
    role: raw.userRole,
    department: raw.department?.toString(),
    managedDepartments,
    teams: userTeams,
    leadOfTeams,
    isActive: dbUser.isActive,
    crossDepartmentAccess: raw.crossDepartmentAccess === true,
    teamStatsVisible: raw.teamStatsVisible !== false,
  };
}

/* ================================================================ */
/* NEW PERMISSION SYSTEM                                             */
/* ================================================================ */

/**
 * Check if a permission is toggled ON in any of the user's memberships.
 * If departmentId is specified, only checks memberships for that department.
 * If teamId is also specified, additionally checks team-level memberships.
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
 * Returns true if the target (directly or indirectly) reports to the actor.
 * Returns false if the actor reports to the target, or they're unrelated.
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

  // Walk up from target to see if we reach actor
  let current: string | null = targetUserId;
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current)) break; // circular reference protection
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
 * View-only permissions only check hasPermission.
 * Write permissions additionally check isAboveInChain.
 */
export async function canActOn(
  actor: VerifiedUser,
  permission: keyof IPermissions,
  targetUserId: string,
  departmentId?: string,
): Promise<boolean> {
  if (actor.isSuperAdmin) return true;
  if (!hasPermission(actor, permission, departmentId)) return false;

  // View-only permissions don't need chain check
  if (VIEW_ONLY_PERMISSIONS.has(permission)) return true;

  // Write permissions need reporting chain check
  if (!departmentId) {
    // Check against any department where actor has this permission
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
 */
export function getDepartmentScope(actor: VerifiedUser, permission: keyof IPermissions): string[] {
  if (actor.isSuperAdmin) return []; // empty means "all" for SuperAdmin
  return actor.memberships
    .filter((m) => m.permissions[permission] === true)
    .map((m) => m.departmentId);
}

/* ================================================================ */
/* LEGACY FUNCTIONS (transitional — will be removed in Phase 2d)     */
/* ================================================================ */

const ROLE_LEVEL: Record<UserRole, number> = {
  superadmin: 100,
  manager: 50,
  teamLead: 30,
  businessDeveloper: 10,
  developer: 10,
};

/** @deprecated Use actor.isSuperAdmin */
export function isSuperAdmin(user: VerifiedUser): boolean {
  return user.isSuperAdmin || user.role === "superadmin";
}

/** @deprecated Use hasPermission */
export function isManager(user: VerifiedUser): boolean {
  return user.role === "manager";
}

/** @deprecated Use hasPermission */
export function isTeamLead(user: VerifiedUser): boolean {
  return user.role === "teamLead";
}

/** @deprecated Use hasPermission */
export function isAdmin(user: VerifiedUser): boolean {
  return user.isSuperAdmin || user.role === "superadmin" || user.role === "manager" || user.role === "teamLead";
}

/** @deprecated Use hasPermission */
export function isEmployee(user: VerifiedUser): boolean {
  return user.role === "developer" || user.role === "businessDeveloper";
}

/** @deprecated Use canActOn */
export function outranks(actor: VerifiedUser, targetRole: UserRole): boolean {
  return ROLE_LEVEL[actor.role] > ROLE_LEVEL[targetRole];
}

/** @deprecated Use memberships */
export function isSameDepartment(user: VerifiedUser, targetDept?: string | null): boolean {
  if (!targetDept) return false;
  if (user.department && user.department === targetDept) return true;
  if (user.managedDepartments.length > 0 && user.managedDepartments.includes(targetDept)) return true;
  return false;
}

/** @deprecated Use canActOn */
export async function isInUsersDepartment(actor: VerifiedUser, targetUserId: string): Promise<boolean> {
  if (isSuperAdmin(actor)) return true;
  const target = await User.findById(targetUserId).select("department").lean();
  if (!target?.department) return false;
  return isSameDepartment(actor, target.department.toString());
}

/** @deprecated Use memberships */
export async function getTeamMemberIds(teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const members = await User.find({
    teams: { $in: teamIds },
    isActive: true,
    isSuperAdmin: { $ne: true },
  }).distinct("_id");
  return members.map((id) => id.toString());
}

/** @deprecated Use memberships */
export function isInLeadTeams(actor: VerifiedUser, targetTeams: string[]): boolean {
  if (actor.leadOfTeams.length === 0 || targetTeams.length === 0) return false;
  return targetTeams.some((t) => actor.leadOfTeams.includes(t));
}

/** @deprecated Use hasPermission */
export function canManageEmployees(actor: VerifiedUser): boolean {
  return isSuperAdmin(actor) || isManager(actor) || isTeamLead(actor);
}

/** @deprecated Use canActOn */
export function canEditEmployee(actor: VerifiedUser, targetId: string, targetDept?: string | null, targetTeams?: string[]): boolean {
  if (isSuperAdmin(actor)) return true;
  if (actor.id === targetId) return true;
  if (isManager(actor) && isSameDepartment(actor, targetDept)) return true;
  if (isManager(actor) && actor.managedDepartments.length === 0 && !actor.department) return true;
  if (isTeamLead(actor) && targetTeams && isInLeadTeams(actor, targetTeams)) return true;
  return false;
}

/** @deprecated Use hasPermission */
export function canViewEmployee(actor: VerifiedUser, targetId: string, targetDept?: string | null, targetTeams?: string[]): boolean {
  if (isSuperAdmin(actor)) return true;
  if (actor.id === targetId) return true;
  if (isManager(actor) && actor.crossDepartmentAccess) return true;
  if (isManager(actor) && isSameDepartment(actor, targetDept)) return true;
  if (isManager(actor) && actor.managedDepartments.length === 0 && !actor.department) return true;
  if (isTeamLead(actor) && targetTeams && isInLeadTeams(actor, targetTeams)) return true;
  return false;
}

/** @deprecated Use hasPermission */
export function canManageDepartments(actor: VerifiedUser): boolean {
  return isSuperAdmin(actor);
}

/** @deprecated Use hasPermission */
export function canViewDepartment(actor: VerifiedUser, deptId?: string | null): boolean {
  if (isSuperAdmin(actor)) return true;
  if (isManager(actor) && isSameDepartment(actor, deptId)) return true;
  if (isManager(actor) && actor.crossDepartmentAccess) return true;
  if (isTeamLead(actor) && isSameDepartment(actor, deptId)) return true;
  return false;
}

/** @deprecated Use hasPermission */
export function canManageTeams(actor: VerifiedUser): boolean {
  return isSuperAdmin(actor) || isManager(actor);
}

/** @deprecated Use canActOn */
export function canEditTeam(actor: VerifiedUser, teamDept?: string | null, teamId?: string | null): boolean {
  if (isSuperAdmin(actor)) return true;
  if (isManager(actor) && isSameDepartment(actor, teamDept)) return true;
  if (isTeamLead(actor) && teamId && actor.leadOfTeams.includes(teamId)) return true;
  return false;
}

/** @deprecated Use hasPermission */
export function canManageTasks(actor: VerifiedUser): boolean {
  return isSuperAdmin(actor) || isManager(actor) || isTeamLead(actor);
}

/** @deprecated Use canActOn */
export function canAssignTaskTo(actor: VerifiedUser, targetDept?: string | null, targetTeams?: string[]): boolean {
  if (isSuperAdmin(actor)) return true;
  if (isManager(actor) && isSameDepartment(actor, targetDept)) return true;
  if (isTeamLead(actor) && targetTeams && isInLeadTeams(actor, targetTeams)) return true;
  return false;
}

/** @deprecated Use hasPermission */
export function canViewAttendance(actor: VerifiedUser, targetId: string, targetDept?: string | null, targetTeams?: string[]): boolean {
  if (isSuperAdmin(actor)) return true;
  if (actor.id === targetId) return true;
  if (isManager(actor) && actor.crossDepartmentAccess) return true;
  if (isManager(actor) && isSameDepartment(actor, targetDept)) return true;
  if (isManager(actor) && actor.managedDepartments.length === 0 && !actor.department) return true;
  if (isTeamLead(actor) && targetTeams && isInLeadTeams(actor, targetTeams)) return true;
  return false;
}

/** @deprecated Use hasPermission */
export function canViewTeamStats(actor: VerifiedUser): boolean {
  if (isSuperAdmin(actor)) return true;
  if (isManager(actor)) return true;
  if (isTeamLead(actor)) return true;
  if (isEmployee(actor) && actor.teamStatsVisible) return true;
  return false;
}

/** @deprecated Use hasPermission */
export function canViewActivityLogs(actor: VerifiedUser): boolean {
  return isSuperAdmin(actor) || isManager(actor) || isTeamLead(actor);
}

/** @deprecated Use hasPermission */
export function canManageCampaigns(actor: VerifiedUser): boolean {
  return isSuperAdmin(actor) || isManager(actor) || isTeamLead(actor);
}

/** @deprecated Use memberships */
export async function getDeptTeamIds(deptId: string): Promise<string[]> {
  const teams = await Team.find({ department: deptId, isActive: true }).distinct("_id");
  return teams.map((id) => id.toString());
}

/** @deprecated Use memberships */
export async function getDeptEmployeeIds(deptId: string): Promise<string[]> {
  const users = await User.find({
    department: deptId,
    isActive: true,
    isSuperAdmin: { $ne: true },
  }).distinct("_id");
  return users.map((id) => id.toString());
}

/** @deprecated Use hasPermission + memberships */
export async function getCampaignScopeFilter(actor: VerifiedUser): Promise<Record<string, unknown>> {
  if (isSuperAdmin(actor)) return {};
  if (isManager(actor) && actor.crossDepartmentAccess) return {};

  const orClauses: Record<string, unknown>[] = [{ "tags.employees": actor.id }];

  if (isManager(actor) && actor.managedDepartments.length > 0) {
    orClauses.push({ "tags.departments": { $in: actor.managedDepartments } });
    const allTeamIds: string[] = [];
    const allEmpIds: string[] = [];
    for (const deptId of actor.managedDepartments) {
      const deptTeams = await getDeptTeamIds(deptId);
      allTeamIds.push(...deptTeams);
      const deptEmps = await getDeptEmployeeIds(deptId);
      allEmpIds.push(...deptEmps);
    }
    if (allTeamIds.length > 0) orClauses.push({ "tags.teams": { $in: allTeamIds } });
    if (allEmpIds.length > 0) orClauses.push({ "tags.employees": { $in: allEmpIds } });
  } else if (isTeamLead(actor)) {
    if (actor.department) orClauses.push({ "tags.departments": actor.department });
    if (actor.leadOfTeams.length > 0) {
      orClauses.push({ "tags.teams": { $in: actor.leadOfTeams } });
      const memberIds = await getTeamMemberIds(actor.leadOfTeams);
      if (memberIds.length > 0) orClauses.push({ "tags.employees": { $in: memberIds } });
    }
  } else {
    if (actor.department) orClauses.push({ "tags.departments": actor.department });
    if (actor.teams.length > 0) orClauses.push({ "tags.teams": { $in: actor.teams } });
  }

  return { $or: orClauses };
}

/** @deprecated Use hasPermission */
export function canDeleteCampaign(actor: VerifiedUser): boolean {
  return isSuperAdmin(actor) || isManager(actor);
}

/** @deprecated Use hasPermission */
export function canManageSettings(actor: VerifiedUser): boolean {
  return isSuperAdmin(actor);
}

/** @deprecated Use hasPermission */
export function canGrantCrossDeptAccess(actor: VerifiedUser): boolean {
  return isSuperAdmin(actor);
}
