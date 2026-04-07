export const isSuperAdmin = (role?: string, flagged?: boolean): boolean => flagged === true || role === "superadmin";
export const isAdmin = (role?: string): boolean => ["superadmin", "admin"].includes(role ?? "");
export const canManage = (role?: string): boolean => ["superadmin", "admin", "manager"].includes(role ?? "");
export const isManagerOrAbove = canManage;
export const isTeamLeadOrAbove = (role?: string): boolean => ["superadmin", "admin", "manager", "teamLead"].includes(role ?? "");
