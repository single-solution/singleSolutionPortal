/**
 * Self-service keys — always ON for every authenticated user.
 * These are NOT part of IPermissions and cannot be toggled per designation.
 */
export type SelfPermissionKey =
  | "overview_access" | "workspace_access" | "insightsDesk_access" | "settings_access"
  | "insightsDesk_openProgress" | "insightsDesk_openLeaves" | "insightsDesk_openPayroll"
  | "tasks_viewOwn" | "tasks_markChecklist" | "tasks_changeOwnStatus" | "tasks_viewHistory"
  | "campaigns_viewOwn"
  | "attendance_viewOwn" | "attendance_autoCheckin"
  | "leaves_viewOwn" | "leaves_request"
  | "payroll_viewOwn"
  | "ping_view" | "ping_send" | "ping_markRead"
  | "profile_edit" | "profile_changePassword" | "profile_changeEmail" | "profile_editPreferences";

/** Union of configurable + self-service keys — accepted by can() / hasPermission(). */
export type AnyPermissionKey = keyof IPermissions | SelfPermissionKey;

/**
 * Configurable permissions that can be toggled per designation.
 * Self-service keys are excluded — they are always ON.
 */
export interface IPermissions {
  /* ── Employees ── */
  employees_view: boolean;
  employees_viewDetail: boolean;
  employees_create: boolean;
  employees_edit: boolean;
  employees_delete: boolean;
  employees_toggleStatus: boolean;
  employees_resendInvite: boolean;
  employees_viewAttendance: boolean;
  employees_viewPayroll: boolean;
  employees_viewLeaves: boolean;
  employees_viewTasks: boolean;
  employees_viewLocation: boolean;
  employees_viewSchedule: boolean;

  /* ── Memberships ── */
  members_addToDepartment: boolean;
  members_removeFromDepartment: boolean;
  members_assignDesignation: boolean;
  members_customizePermissions: boolean;
  members_setReportingChain: boolean;

  /* ── Organization Chart ── */
  organization_view: boolean;
  organization_manageLinks: boolean;

  /* ── Departments ── */
  departments_view: boolean;
  departments_create: boolean;
  departments_edit: boolean;
  departments_delete: boolean;

  /* ── Tasks ── */
  tasks_view: boolean;
  tasks_create: boolean;
  tasks_edit: boolean;
  tasks_delete: boolean;
  tasks_reassign: boolean;
  tasks_viewTeamProgress: boolean;
  tasks_toggleActive: boolean;
  tasks_reorder: boolean;

  /* ── Campaigns ── */
  campaigns_view: boolean;
  campaigns_create: boolean;
  campaigns_edit: boolean;
  campaigns_delete: boolean;
  campaigns_tagEntities: boolean;
  campaigns_toggleStatus: boolean;

  /* ── Updates ── */
  updates_view: boolean;
  updates_create: boolean;
  updates_edit: boolean;
  updates_delete: boolean;

  /* ── Analytics ── */
  analytics_viewDashboard: boolean;
  analytics_viewNeedsAttention: boolean;
  analytics_viewPresence: boolean;

  /* ── Attendance ── */
  attendance_viewTeam: boolean;
  attendance_viewDetail: boolean;
  attendance_viewLocation: boolean;
  attendance_edit: boolean;
  attendance_overridePast: boolean;
  attendance_export: boolean;

  /* ── Leaves ── */
  leaves_viewTeam: boolean;
  leaves_approve: boolean;
  leaves_editPast: boolean;
  leaves_manageBulk: boolean;
  leaves_submitOnBehalf: boolean;

  /* ── Payroll ── */
  payroll_viewTeam: boolean;
  payroll_manageSalary: boolean;
  payroll_generateSlips: boolean;
  payroll_finalizeSlips: boolean;
  payroll_export: boolean;

  /* ── Communication ── */
  activityLogs_view: boolean;

  /* ── Designations ── */
  designations_view: boolean;
  designations_create: boolean;
  designations_edit: boolean;
  designations_delete: boolean;
  designations_toggleStatus: boolean;
  designations_setPermissions: boolean;

  /* ── Holidays ── */
  holidays_view: boolean;
  holidays_create: boolean;
  holidays_delete: boolean;
  holidays_toggleRecurring: boolean;

  /* ── Settings ── */
  settings_view: boolean;
  settings_manageCompany: boolean;
  settings_manageOffice: boolean;
  settings_toggleLiveUpdates: boolean;
  settings_sendTestEmail: boolean;
}

export const PERMISSION_KEYS: (keyof IPermissions)[] = [
  /* Employees */
  "employees_view", "employees_viewDetail", "employees_create", "employees_edit",
  "employees_delete", "employees_toggleStatus", "employees_resendInvite",
  "employees_viewAttendance", "employees_viewPayroll", "employees_viewLeaves",
  "employees_viewTasks", "employees_viewLocation", "employees_viewSchedule",
  /* Memberships */
  "members_addToDepartment", "members_removeFromDepartment",
  "members_assignDesignation", "members_customizePermissions",
  "members_setReportingChain",
  /* Organization */
  "organization_view", "organization_manageLinks",
  /* Departments */
  "departments_view", "departments_create", "departments_edit", "departments_delete",
  /* Tasks */
  "tasks_view", "tasks_create", "tasks_edit", "tasks_delete", "tasks_reassign",
  "tasks_viewTeamProgress", "tasks_toggleActive", "tasks_reorder",
  /* Campaigns */
  "campaigns_view", "campaigns_create", "campaigns_edit",
  "campaigns_delete", "campaigns_tagEntities", "campaigns_toggleStatus",
  /* Updates */
  "updates_view", "updates_create", "updates_edit", "updates_delete",
  /* Analytics */
  "analytics_viewDashboard", "analytics_viewNeedsAttention", "analytics_viewPresence",
  /* Attendance */
  "attendance_viewTeam", "attendance_viewDetail", "attendance_viewLocation",
  "attendance_edit", "attendance_overridePast", "attendance_export",
  /* Leaves */
  "leaves_viewTeam", "leaves_approve",
  "leaves_editPast", "leaves_manageBulk", "leaves_submitOnBehalf",
  /* Payroll */
  "payroll_viewTeam", "payroll_manageSalary",
  "payroll_generateSlips", "payroll_finalizeSlips", "payroll_export",
  /* Communication */
  "activityLogs_view",
  /* Designations */
  "designations_view", "designations_create", "designations_edit",
  "designations_delete", "designations_toggleStatus", "designations_setPermissions",
  /* Holidays */
  "holidays_view", "holidays_create", "holidays_delete", "holidays_toggleRecurring",
  /* Settings */
  "settings_view", "settings_manageCompany", "settings_manageOffice",
  "settings_toggleLiveUpdates", "settings_sendTestEmail",
];

export const PERMISSION_META: Record<keyof IPermissions, { label: string; desc: string }> = {
  /* ── Employees ── */
  employees_view:           { label: "View employee list",        desc: "See the directory of employees and their basic info" },
  employees_viewDetail:     { label: "View employee profiles",    desc: "Open full employee profiles, work history, and details" },
  employees_create:         { label: "Create employees",          desc: "Add new employee accounts and send onboarding invites" },
  employees_edit:           { label: "Edit employees",            desc: "Modify employee profiles, work shifts, and contact info" },
  employees_delete:         { label: "Delete employees",          desc: "Permanently remove employee accounts and all their data" },
  employees_toggleStatus:   { label: "Enable / disable accounts", desc: "Activate or deactivate employee accounts without deleting" },
  employees_resendInvite:   { label: "Resend invitations",       desc: "Re-send account setup emails to pending employees" },
  employees_viewAttendance: { label: "View employee attendance",  desc: "See attendance tab in the employee detail modal" },
  employees_viewPayroll:    { label: "View employee payroll",     desc: "See payroll tab in the employee detail modal" },
  employees_viewLeaves:     { label: "View employee leaves",      desc: "See leaves tab in the employee detail modal" },
  employees_viewTasks:      { label: "View employee tasks",       desc: "See tasks tab in the employee detail modal" },
  employees_viewLocation:   { label: "View employee location",    desc: "See location and coordinates on the employee card" },
  employees_viewSchedule:   { label: "View employee schedule",    desc: "See schedule tab in the employee detail modal" },

  /* ── Memberships ── */
  members_addToDepartment:      { label: "Add to department",      desc: "Assign employees into departments" },
  members_removeFromDepartment: { label: "Remove from department", desc: "Unassign employees from departments" },
  members_assignDesignation:    { label: "Assign designation",     desc: "Set or change an employee's role title (e.g. Manager)" },
  members_customizePermissions: { label: "Customize permissions",  desc: "Override the default role permissions for an individual" },
  members_setReportingChain:    { label: "Set reporting chain",    desc: "Define who an employee reports to in the hierarchy" },

  /* ── Organization ── */
  organization_view:        { label: "View org chart",       desc: "See the organization flow chart and hierarchy" },
  organization_manageLinks: { label: "Manage connections",   desc: "Create, edit, and remove links in the org chart" },

  /* ── Departments ── */
  departments_view:   { label: "View departments",  desc: "See the list of departments and their basic info" },
  departments_create: { label: "Create departments", desc: "Add new departments to the organization" },
  departments_edit:   { label: "Edit departments",   desc: "Rename or modify department details" },
  departments_delete: { label: "Delete departments", desc: "Remove departments and reassign their members" },

  /* ── Tasks ── */
  tasks_view:             { label: "View tasks",             desc: "See assigned and team tasks in the workspace" },
  tasks_create:           { label: "Create tasks",           desc: "Create and assign new tasks to employees" },
  tasks_edit:             { label: "Edit tasks",             desc: "Modify task details, status, and deadlines" },
  tasks_delete:           { label: "Delete tasks",           desc: "Permanently remove tasks" },
  tasks_reassign:         { label: "Reassign tasks",         desc: "Transfer tasks from one employee to another" },
  tasks_viewTeamProgress: { label: "View team progress",     desc: "See task progress and stats for all team members" },
  tasks_toggleActive:     { label: "Toggle task active",     desc: "Enable or disable a task without deleting it" },
  tasks_reorder:          { label: "Reorder tasks",          desc: "Drag to reorder tasks within a campaign" },

  /* ── Campaigns ── */
  campaigns_view:         { label: "View campaigns",       desc: "See campaigns, their progress, and metrics" },
  campaigns_create:       { label: "Create campaigns",     desc: "Start new campaigns with goals and timelines" },
  campaigns_edit:         { label: "Edit campaigns",       desc: "Modify campaign details, dates, and status" },
  campaigns_delete:       { label: "Delete campaigns",     desc: "Permanently remove campaigns" },
  campaigns_tagEntities:  { label: "Tag members",          desc: "Add or remove employees and departments from campaigns" },
  campaigns_toggleStatus: { label: "Toggle campaign status", desc: "Activate or deactivate a campaign" },

  /* ── Updates ── */
  updates_view:   { label: "View updates",   desc: "Read workspace updates and announcements" },
  updates_create: { label: "Post updates",   desc: "Publish new updates and announcements" },
  updates_edit:   { label: "Edit updates",   desc: "Modify existing updates" },
  updates_delete: { label: "Delete updates", desc: "Remove updates" },

  /* ── Analytics ── */
  analytics_viewDashboard:      { label: "View dashboard stats",    desc: "See the admin overview cards and dashboard statistics" },
  analytics_viewNeedsAttention: { label: "View needs-attention",    desc: "See employees flagged as needing attention" },
  analytics_viewPresence:       { label: "View presence analytics", desc: "See real-time presence and in-office / remote breakdown" },

  /* ── Attendance ── */
  attendance_viewTeam:     { label: "View team attendance",   desc: "See attendance records for team members" },
  attendance_viewDetail:   { label: "View session details",   desc: "See detailed check-in/out logs and session history" },
  attendance_viewLocation: { label: "View check-in location", desc: "See geographic coordinates on attendance entries" },
  attendance_edit:         { label: "Edit records",           desc: "Manually correct or modify attendance entries" },
  attendance_overridePast: { label: "Override past days",     desc: "Edit attendance records for previous days" },
  attendance_export:       { label: "Export reports",         desc: "Download attendance data as CSV or PDF" },

  /* ── Leaves ── */
  leaves_viewTeam:        { label: "View team leaves",         desc: "See leave requests from team members" },
  leaves_approve:         { label: "Approve / reject leaves",  desc: "Accept or decline leave requests" },
  leaves_editPast:        { label: "Edit past leaves",         desc: "Modify historical leave records after the fact" },
  leaves_manageBulk:      { label: "Bulk manage leaves",       desc: "Process multiple leave requests at once" },
  leaves_submitOnBehalf:  { label: "Submit on behalf",         desc: "Submit leave requests on behalf of another employee" },

  /* ── Payroll ── */
  payroll_viewTeam:      { label: "View team payroll",   desc: "See salary and payroll data for team members" },
  payroll_manageSalary:  { label: "Manage salaries",     desc: "Set and adjust employee salary amounts" },
  payroll_generateSlips: { label: "Generate pay slips",  desc: "Create monthly pay slips for employees" },
  payroll_finalizeSlips: { label: "Finalize pay slips",  desc: "Lock and approve pay slips for distribution" },
  payroll_export:        { label: "Export payroll",      desc: "Download payroll reports and summaries" },

  /* ── Communication ── */
  activityLogs_view: { label: "View activity logs", desc: "See the audit trail and activity history" },

  /* ── Designations ── */
  designations_view:           { label: "View designations",      desc: "See designation titles and their default permissions" },
  designations_create:         { label: "Create designations",    desc: "Add new designation definitions to the organization" },
  designations_edit:           { label: "Edit designations",      desc: "Modify designation names, descriptions, and colors" },
  designations_delete:         { label: "Delete designations",    desc: "Remove designation definitions from the organization" },
  designations_toggleStatus:   { label: "Toggle designation status", desc: "Activate or deactivate designation definitions" },
  designations_setPermissions: { label: "Set default permissions", desc: "Configure the default privilege set for a designation" },

  /* ── Holidays ── */
  holidays_view:            { label: "View holidays",          desc: "See the company holiday calendar" },
  holidays_create:          { label: "Create holidays",        desc: "Add new holidays to the company calendar" },
  holidays_delete:          { label: "Delete holidays",        desc: "Remove holidays from the company calendar" },
  holidays_toggleRecurring: { label: "Toggle recurring",       desc: "Mark holidays as recurring or one-time" },

  /* ── Settings ── */
  settings_view:              { label: "View settings",          desc: "See system configuration and company details" },
  settings_manageCompany:     { label: "Manage company info",    desc: "Edit company name, logo, and contact details" },
  settings_manageOffice:      { label: "Manage office settings", desc: "Configure office location, shifts, and work hours" },
  settings_toggleLiveUpdates: { label: "Toggle live updates",    desc: "Enable or disable real-time data refresh" },
  settings_sendTestEmail:     { label: "Send test email",        desc: "Send a test email to verify SMTP configuration" },
};

export const PERMISSION_CATEGORIES: { label: string; icon: string; keys: (keyof IPermissions)[] }[] = [
  {
    label: "Employees",
    icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
    keys: ["employees_view", "employees_viewDetail", "employees_create", "employees_edit", "employees_delete", "employees_toggleStatus", "employees_resendInvite", "employees_viewAttendance", "employees_viewPayroll", "employees_viewLeaves", "employees_viewTasks", "employees_viewLocation", "employees_viewSchedule"],
  },
  {
    label: "Memberships",
    icon: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8zM17 11l2 2 4-4",
    keys: ["members_addToDepartment", "members_removeFromDepartment", "members_assignDesignation", "members_customizePermissions", "members_setReportingChain"],
  },
  {
    label: "Organization",
    icon: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7",
    keys: ["organization_view", "organization_manageLinks"],
  },
  {
    label: "Designations",
    icon: "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z",
    keys: ["designations_view", "designations_create", "designations_edit", "designations_delete", "designations_toggleStatus", "designations_setPermissions"],
  },
  {
    label: "Departments",
    icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
    keys: ["departments_view", "departments_create", "departments_edit", "departments_delete"],
  },
  {
    label: "Tasks",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    keys: ["tasks_view", "tasks_create", "tasks_edit", "tasks_delete", "tasks_reassign", "tasks_viewTeamProgress", "tasks_toggleActive", "tasks_reorder"],
  },
  {
    label: "Campaigns",
    icon: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z",
    keys: ["campaigns_view", "campaigns_create", "campaigns_edit", "campaigns_delete", "campaigns_tagEntities", "campaigns_toggleStatus"],
  },
  {
    label: "Updates",
    icon: "M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2",
    keys: ["updates_view", "updates_create", "updates_edit", "updates_delete"],
  },
  {
    label: "Analytics",
    icon: "M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
    keys: ["analytics_viewDashboard", "analytics_viewNeedsAttention", "analytics_viewPresence"],
  },
  {
    label: "Attendance",
    icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    keys: ["attendance_viewTeam", "attendance_viewDetail", "attendance_viewLocation", "attendance_edit", "attendance_overridePast", "attendance_export"],
  },
  {
    label: "Leaves",
    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    keys: ["leaves_viewTeam", "leaves_approve", "leaves_editPast", "leaves_manageBulk", "leaves_submitOnBehalf"],
  },
  {
    label: "Payroll",
    icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
    keys: ["payroll_viewTeam", "payroll_manageSalary", "payroll_generateSlips", "payroll_finalizeSlips", "payroll_export"],
  },
  {
    label: "Communication",
    icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
    keys: ["activityLogs_view"],
  },
  {
    label: "Holidays",
    icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
    keys: ["holidays_view", "holidays_create", "holidays_delete", "holidays_toggleRecurring"],
  },
  {
    label: "Settings",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
    keys: ["settings_view", "settings_manageCompany", "settings_manageOffice", "settings_toggleLiveUpdates", "settings_sendTestEmail"],
  },
];

/** Keys that are always ON for every authenticated user (self-service actions). */
export const SELF_PERMISSIONS: ReadonlySet<SelfPermissionKey> = new Set<SelfPermissionKey>([
  "overview_access", "workspace_access", "insightsDesk_access", "settings_access",
  "insightsDesk_openProgress", "insightsDesk_openLeaves", "insightsDesk_openPayroll",
  "tasks_viewOwn", "tasks_markChecklist", "tasks_changeOwnStatus", "tasks_viewHistory",
  "campaigns_viewOwn",
  "attendance_viewOwn", "attendance_autoCheckin",
  "leaves_viewOwn", "leaves_request",
  "payroll_viewOwn",
  "ping_view", "ping_send", "ping_markRead",
  "profile_edit", "profile_changePassword", "profile_changeEmail", "profile_editPreferences",
]);
