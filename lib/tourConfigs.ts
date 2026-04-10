import type { TourStep } from "@/app/(dashboard)/components/SpotlightTour";

export const dashboardTour: TourStep[] = [
  {
    target: "dashboard-welcome",
    title: "Welcome Header",
    description: "This greeting bar shows your name, the current time, and quick status badges showing how many employees are in office, remote, late, or absent right now.",
  },
  {
    target: "dashboard-team-status",
    title: "Team Status (Live)",
    description: "Real-time employee cards showing who's working, their location (office or remote), hours logged, and shift progress. Use the filter pills above to view by status.",
  },
  {
    target: "dashboard-campaigns",
    title: "Active Campaigns",
    description: "A quick view of your ongoing campaigns and projects. Click any campaign to jump to its detail page.",
  },
  {
    target: "dashboard-checklist",
    title: "Checklist",
    description: "Your pending tasks and deadlines at a glance. Check off completed items or click to open the full Tasks page.",
  },
  {
    target: "dock-nav",
    title: "Navigation Dock",
    description: "The bottom dock is your main navigation. Jump between Overview, Organization, Workspace, Insights, and Settings. The active page is highlighted.",
    placement: "top",
  },
];

export const employeesTour: TourStep[] = [
  {
    target: "employees-header",
    title: "Employee List",
    description: "This page shows all employees you have access to. Use the sort toggles (Recent / A-Z) to change the order.",
  },
  {
    target: "employees-search",
    title: "Search & Add",
    description: "Search employees by name or email. Authorized users can click 'Add Employee' to create new employees.",
  },
  {
    target: "employees-filters",
    title: "Role Filters",
    description: "Filter employees by designation — only designations that exist in your organization are shown. Click a pill to filter, click again to clear.",
  },
  {
    target: "employees-grid",
    title: "Employee Cards",
    description: "Each card shows the employee's name, designation, department, and active status. Click a card to view their full profile. Use the toggle in the footer to activate/deactivate.",
  },
];

export const departmentsTour: TourStep[] = [
  {
    target: "departments-header",
    title: "Department Management",
    description: "Manage your organization's departments here. Sort by most employees or alphabetically.",
  },
  {
    target: "departments-search",
    title: "Search & Create",
    description: "Search departments or click 'Add Department' to create a new one. Use the inline form to quickly set up departments with parent hierarchy.",
  },
  {
    target: "departments-grid",
    title: "Department Cards",
    description: "Each card shows the department name, manager, employee count, and parent department if any. Click edit to modify or manage the department hierarchy.",
  },
];

export const campaignsTour: TourStep[] = [
  {
    target: "campaigns-header",
    title: "Campaign Tracking",
    description: "Track ongoing campaigns, projects, and initiatives across your organization. Sort by recent or alphabetically.",
  },
  {
    target: "campaigns-filters",
    title: "Status Filters",
    description: "Filter campaigns by their lifecycle status — Active, Paused, Completed, or Cancelled. The count badge shows how many campaigns are in each status.",
  },
  {
    target: "campaigns-grid",
    title: "Campaign Cards",
    description: "Each card shows the campaign name, status, date range, budget, and tagged employees. Use the quick-action buttons to change status (Active → Paused → Completed).",
  },
];

export const tasksTour: TourStep[] = [
  {
    target: "tasks-header",
    title: "Task Management",
    description: "Assign and track tasks with priority levels and deadlines. Sort by recent activity or name.",
  },
  {
    target: "tasks-filters",
    title: "Priority Filters",
    description: "Filter tasks by priority — Low, Medium, High, or Urgent. See at a glance how many tasks are in each priority level.",
  },
  {
    target: "tasks-grid",
    title: "Task Cards",
    description: "Each card shows the task title, assignee, priority badge, status, and deadline. Assignees can update task status; admins can reassign tasks.",
  },
];

export const attendanceTour: TourStep[] = [
  {
    target: "attendance-header",
    title: "Attendance Tracking",
    description: "View detailed attendance data for employees in your hierarchy. Use month navigation to browse different periods and group toggles to organize by Flat or Department.",
  },
  {
    target: "attendance-pills",
    title: "Employee Pills",
    description: "Click 'All Employees' for aggregate stats. Click an individual to see their calendar, daily timeline, and monthly records in card format.",
  },
  {
    target: "attendance-calendar",
    title: "Calendar & Details",
    description: "The calendar shows attendance dots (green = on time, red = late, gray = absent, blue = leave). Click any date to see detailed stats on the right panel and session timeline below.",
  },
  {
    target: "attendance-overview",
    title: "Employee Overview",
    description: "In aggregate mode, this grid shows each employee's monthly summary — attendance %, present days, total hours, and on-time rate. Click any card to drill into their details.",
    placement: "top",
  },
];

export const organizationTour: TourStep[] = [
  {
    target: "org-header",
    title: "Organization Hub",
    description: "Manage your entire organizational structure from one place — employees, departments, and designations. Use the search bar and chart legend to navigate.",
  },
  {
    target: "org-tree",
    title: "Org Tree",
    description: "The sidebar shows departments and designations. The main area displays the interactive org chart with employee and department nodes connected by hierarchy links.",
  },
  {
    target: "org-context",
    title: "Context View",
    description: "The flow chart shows employee and department connections. Click designation pills to edit privileges, and click employee nodes to view their profile card.",
  },
  {
    target: "dock-nav",
    title: "Navigation",
    description: "Use the bottom dock to switch between Overview, Organization, Workspace, Insights, and Settings.",
    placement: "top",
  },
];

export const workspaceTour: TourStep[] = [
  {
    target: "workspace-toolbar",
    title: "Search & Organize",
    description: "Search tasks by keyword, group them by campaign, employee, or hierarchy, and filter by status. Toggle the Activity panel on the right to see recent team activity.",
  },
];

export const insightsDeskTour: TourStep[] = [
  {
    target: "insights-header",
    title: "Insights Desk",
    description: "Your unified hub for attendance, leaves, holidays, and payroll. Use the action buttons to manage holidays, apply leaves, or view payroll estimates.",
  },
  {
    target: "attendance-header",
    title: "Attendance & Calendar",
    description: "Browse attendance data by month and year. Use employee pills to drill into individuals, or view aggregate stats for the whole team.",
  },
];

export const settingsTour: TourStep[] = [
  {
    target: "settings-profile",
    title: "Your Profile",
    description: "Update your name, phone number, and profile picture. Your username, designation, and department are shown as info pills below your avatar.",
  },
  {
    target: "settings-security",
    title: "Security",
    description: "Change your email (requires current password and has a 24-hour cooldown) or update your password. The strength meter helps you pick a strong password.",
  },
  {
    target: "settings-system",
    title: "System Settings",
    description: "SuperAdmin-only section to configure company name, timezone, office geofence location, default shift settings, and enable/disable live Socket.IO updates.",
  },
];
