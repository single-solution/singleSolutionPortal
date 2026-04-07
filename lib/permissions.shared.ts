export interface IPermissions {
  employees_view: boolean;
  employees_viewDetail: boolean;
  employees_create: boolean;
  employees_edit: boolean;
  employees_delete: boolean;
  employees_toggleStatus: boolean;
  employees_resendInvite: boolean;

  members_addToDepartment: boolean;
  members_removeFromDepartment: boolean;
  members_addToTeam: boolean;
  members_removeFromTeam: boolean;
  members_assignDesignation: boolean;
  members_customizePermissions: boolean;
  members_setReportingChain: boolean;

  departments_view: boolean;
  departments_create: boolean;
  departments_edit: boolean;
  departments_delete: boolean;

  teams_view: boolean;
  teams_create: boolean;
  teams_edit: boolean;
  teams_delete: boolean;

  tasks_view: boolean;
  tasks_create: boolean;
  tasks_edit: boolean;
  tasks_delete: boolean;
  tasks_reassign: boolean;

  campaigns_view: boolean;
  campaigns_create: boolean;
  campaigns_edit: boolean;
  campaigns_delete: boolean;
  campaigns_tagEntities: boolean;

  attendance_viewTeam: boolean;
  attendance_viewDetail: boolean;
  attendance_edit: boolean;
  attendance_overridePast: boolean;
  attendance_export: boolean;

  leaves_viewTeam: boolean;
  leaves_approve: boolean;
  leaves_editPast: boolean;
  leaves_manageBulk: boolean;

  payroll_viewTeam: boolean;
  payroll_manageSalary: boolean;
  payroll_generateSlips: boolean;
  payroll_finalizeSlips: boolean;
  payroll_export: boolean;

  designations_view: boolean;
  designations_manage: boolean;
  holidays_view: boolean;
  holidays_manage: boolean;
  settings_view: boolean;
  settings_manage: boolean;
}

export const PERMISSION_KEYS: (keyof IPermissions)[] = [
  "employees_view", "employees_viewDetail", "employees_create", "employees_edit",
  "employees_delete", "employees_toggleStatus", "employees_resendInvite",
  "members_addToDepartment", "members_removeFromDepartment", "members_addToTeam",
  "members_removeFromTeam", "members_assignDesignation", "members_customizePermissions",
  "members_setReportingChain",
  "departments_view", "departments_create", "departments_edit", "departments_delete",
  "teams_view", "teams_create", "teams_edit", "teams_delete",
  "tasks_view", "tasks_create", "tasks_edit", "tasks_delete", "tasks_reassign",
  "campaigns_view", "campaigns_create", "campaigns_edit", "campaigns_delete", "campaigns_tagEntities",
  "attendance_viewTeam", "attendance_viewDetail", "attendance_edit", "attendance_overridePast", "attendance_export",
  "leaves_viewTeam", "leaves_approve", "leaves_editPast", "leaves_manageBulk",
  "payroll_viewTeam", "payroll_manageSalary", "payroll_generateSlips", "payroll_finalizeSlips", "payroll_export",
  "designations_view", "designations_manage", "holidays_view", "holidays_manage", "settings_view", "settings_manage",
];

export const VIEW_ONLY_PERMISSIONS: Set<keyof IPermissions> = new Set([
  "employees_view", "employees_viewDetail",
  "departments_view",
  "teams_view",
  "tasks_view",
  "campaigns_view",
  "attendance_viewTeam", "attendance_viewDetail",
  "leaves_viewTeam",
  "payroll_viewTeam",
  "designations_view",
  "holidays_view",
  "settings_view",
]);

export const PERMISSION_CATEGORIES: { label: string; keys: (keyof IPermissions)[] }[] = [
  { label: "Employees", keys: ["employees_view", "employees_viewDetail", "employees_create", "employees_edit", "employees_delete", "employees_toggleStatus", "employees_resendInvite"] },
  { label: "Members", keys: ["members_addToDepartment", "members_removeFromDepartment", "members_addToTeam", "members_removeFromTeam", "members_assignDesignation", "members_customizePermissions", "members_setReportingChain"] },
  { label: "Departments", keys: ["departments_view", "departments_create", "departments_edit", "departments_delete"] },
  { label: "Teams", keys: ["teams_view", "teams_create", "teams_edit", "teams_delete"] },
  { label: "Tasks", keys: ["tasks_view", "tasks_create", "tasks_edit", "tasks_delete", "tasks_reassign"] },
  { label: "Campaigns", keys: ["campaigns_view", "campaigns_create", "campaigns_edit", "campaigns_delete", "campaigns_tagEntities"] },
  { label: "Attendance", keys: ["attendance_viewTeam", "attendance_viewDetail", "attendance_edit", "attendance_overridePast", "attendance_export"] },
  { label: "Leaves", keys: ["leaves_viewTeam", "leaves_approve", "leaves_editPast", "leaves_manageBulk"] },
  { label: "Payroll", keys: ["payroll_viewTeam", "payroll_manageSalary", "payroll_generateSlips", "payroll_finalizeSlips", "payroll_export"] },
  { label: "System", keys: ["designations_view", "designations_manage", "holidays_view", "holidays_manage", "settings_view", "settings_manage"] },
];
