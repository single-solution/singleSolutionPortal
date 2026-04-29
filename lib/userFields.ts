/** Centralized User model field allowlists for safe API responses. */

export const USER_SAFE_FIELDS = [
  "_id", "email", "username", "about", "isActive", "isSuperAdmin",
  "memberships", "department", "weeklySchedule", "shiftType",
  "graceMinutes", "createdAt", "createdBy", "isVerified",
].join(" ");

export const USER_PAYROLL_FIELDS = "salary salaryHistory";

export function getUserFields(hasPayrollAccess: boolean): string {
  return hasPayrollAccess ? `${USER_SAFE_FIELDS} ${USER_PAYROLL_FIELDS}` : USER_SAFE_FIELDS;
}
