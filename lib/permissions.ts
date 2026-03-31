import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import type { UserRole } from "@/lib/models/User";
import { auth } from "@/lib/auth";

/* ============================================ */
/* DB-VERIFIED SESSION                          */
/* Prevents JWT token forgery / role spoofing   */
/* ============================================ */

export interface VerifiedUser {
  id: string;
  email: string;
  role: UserRole;
  department?: string;
  isActive: boolean;
  crossDepartmentAccess: boolean;
  teamStatsVisible: boolean;
}

export async function getVerifiedSession(): Promise<VerifiedUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  await connectDB();

  const dbUser = await User.findById(session.user.id)
    .select("email userRole department isActive crossDepartmentAccess teamStatsVisible")
    .lean();

  if (!dbUser || !dbUser.isActive) return null;

  return {
    id: dbUser._id.toString(),
    email: dbUser.email,
    role: dbUser.userRole,
    department: dbUser.department?.toString(),
    isActive: dbUser.isActive,
    crossDepartmentAccess: (dbUser as Record<string, unknown>).crossDepartmentAccess === true,
    teamStatsVisible: (dbUser as Record<string, unknown>).teamStatsVisible !== false,
  };
}

/* ============================================ */
/* ROLE HIERARCHY                               */
/* superadmin > manager > businessDeveloper     */
/*                      > developer             */
/* ============================================ */

const ROLE_LEVEL: Record<UserRole, number> = {
  superadmin: 100,
  manager: 50,
  businessDeveloper: 10,
  developer: 10,
};

export function isSuperAdmin(user: VerifiedUser): boolean {
  return user.role === "superadmin";
}

export function isManager(user: VerifiedUser): boolean {
  return user.role === "manager";
}

export function isAdmin(user: VerifiedUser): boolean {
  return user.role === "superadmin" || user.role === "manager";
}

export function isEmployee(user: VerifiedUser): boolean {
  return user.role === "developer" || user.role === "businessDeveloper";
}

export function outranks(actor: VerifiedUser, targetRole: UserRole): boolean {
  return ROLE_LEVEL[actor.role] > ROLE_LEVEL[targetRole];
}

/* ============================================ */
/* DEPARTMENT SCOPE                             */
/* ============================================ */

export function isSameDepartment(user: VerifiedUser, targetDept?: string | null): boolean {
  if (!user.department || !targetDept) return false;
  return user.department === targetDept;
}

export async function isInUsersDepartment(actor: VerifiedUser, targetUserId: string): Promise<boolean> {
  if (isSuperAdmin(actor)) return true;
  if (!actor.department) return false;

  const target = await User.findById(targetUserId).select("department").lean();
  if (!target?.department) return false;

  return actor.department === target.department.toString();
}

/* ============================================ */
/* PERMISSION CHECKS                            */
/* ============================================ */

export function canManageEmployees(actor: VerifiedUser): boolean {
  return isSuperAdmin(actor) || isManager(actor);
}

export function canEditEmployee(actor: VerifiedUser, targetId: string, targetDept?: string | null): boolean {
  if (isSuperAdmin(actor)) return true;
  if (actor.id === targetId) return true;
  if (isManager(actor) && isSameDepartment(actor, targetDept)) return true;
  return false;
}

export function canViewEmployee(actor: VerifiedUser, targetId: string, targetDept?: string | null): boolean {
  if (isSuperAdmin(actor)) return true;
  if (actor.id === targetId) return true;
  if (isManager(actor) && isSameDepartment(actor, targetDept)) return true;
  if (isManager(actor) && actor.crossDepartmentAccess) return true;
  return false;
}

export function canManageDepartments(actor: VerifiedUser): boolean {
  return isSuperAdmin(actor);
}

export function canViewDepartment(actor: VerifiedUser, deptId?: string | null): boolean {
  if (isSuperAdmin(actor)) return true;
  if (isManager(actor) && isSameDepartment(actor, deptId)) return true;
  if (isManager(actor) && actor.crossDepartmentAccess) return true;
  return false;
}

export function canManageTasks(actor: VerifiedUser): boolean {
  return isSuperAdmin(actor) || isManager(actor);
}

export function canAssignTaskTo(actor: VerifiedUser, targetDept?: string | null): boolean {
  if (isSuperAdmin(actor)) return true;
  if (isManager(actor) && isSameDepartment(actor, targetDept)) return true;
  return false;
}

export function canViewAttendance(actor: VerifiedUser, targetId: string, targetDept?: string | null): boolean {
  if (isSuperAdmin(actor)) return true;
  if (actor.id === targetId) return true;
  if (isManager(actor) && isSameDepartment(actor, targetDept)) return true;
  if (isManager(actor) && actor.crossDepartmentAccess) return true;
  return false;
}

export function canViewTeamStats(actor: VerifiedUser): boolean {
  if (isSuperAdmin(actor)) return true;
  if (isManager(actor)) return true;
  if (isEmployee(actor) && actor.teamStatsVisible) return true;
  return false;
}

export function canViewActivityLogs(actor: VerifiedUser): boolean {
  return isSuperAdmin(actor) || isManager(actor);
}

export function canManageSettings(actor: VerifiedUser): boolean {
  return isSuperAdmin(actor);
}

export function canGrantCrossDeptAccess(actor: VerifiedUser): boolean {
  return isSuperAdmin(actor);
}
