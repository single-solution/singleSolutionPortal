export const isSuperAdmin = (_role?: string, flagged?: boolean): boolean => flagged === true;
export const isAdmin = (_role?: string, flagged?: boolean): boolean => flagged === true;
export const canManage = (_role?: string, flagged?: boolean): boolean => flagged === true;
export const isManagerOrAbove = canManage;
export const isTeamLeadOrAbove = (_role?: string, flagged?: boolean): boolean => flagged === true;
