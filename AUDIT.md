# Single Solution Portal — Full Audit

> Auto-generated comprehensive audit of every page, section, UI element, privilege, API route, and known bug.

---

## Table of Contents

1. [Pages & UI Elements](#1-pages--ui-elements)
2. [Shared Components](#2-shared-components)
3. [All Privileges by Area](#3-all-privileges-by-area)
4. [API Routes & Permission Checks](#4-api-routes--permission-checks)
5. [Bugs & Inconsistencies](#5-bugs--inconsistencies)

---

## 1. Pages & UI Elements

### 1.1 `/` — Dashboard (`DashboardHome.tsx`)

Renders **AdminDashboard** when `canPerm("attendance_viewTeam") || hasSubordinates`, otherwise **OtherRoleOverview**.

#### Welcome Header (both variants)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Single Solution Sync" | Caption text | — | Always |
| Greeting + user name | Heading | — | Always |
| Local time card | Clock + date | — | Always |
| "N In Office" badge | Badge (teal) | `attendance_viewTeam` | `hasTeamAccess` (admin variant) |
| "N Remote" badge | Badge (primary) | `attendance_viewTeam` | `hasTeamAccess` |
| "N Late" badge | Badge (amber) | `attendance_viewTeam` | `lateCount > 0` |
| "N Absent" badge | Badge (rose) | `attendance_viewTeam` | `hasTeamAccess` |
| "N tasks pending · M active campaigns" | Info text | — | Non-team variant |
| ScopeStrip | Segment buttons | — | Admin variant |

#### Self Overview Card (both variants, hidden for SuperAdmin in admin view)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Avatar / initials | Image or circle | — | Always |
| "Present"/"Late"/"Absent" | Status badge | — | Data loaded |
| Full name, dept, email | Text lines | — | Data loaded |
| Clock In / Hours / Clock Out | Mini stat cards (×3) | — | Data loaded |
| Arrived / Office / Left | Mini stat cards (×3) | — | Data loaded |
| Office total + % / Remote total + % | Pills | — | Data loaded |
| "Shift progress" + bar | Label + progress bar | — | Data loaded |
| Shimmer skeleton | Skeleton card | — | Loading |

#### Today's Timeline Card (both variants)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Today's Activity" | Heading | — | Always |
| Timeline rows (dot + time + label) | List | — | Data loaded |
| "No activity yet today" | Empty state | — | No events |
| Skeleton timeline | Skeleton | — | Loading |

#### Team Status (AdminDashboard only)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Pulsing "live" dot | Decorative | — | Always |
| "Team Status" | Heading | — | Always |
| Refresh button | Icon button | — | Always |
| "N live · N shown" | Text | `attendance_viewTeam` | Not loading |
| All/Office/Remote/Late/Absent | Segmented filter (×5 buttons) | `attendance_viewTeam` | `hasTeamAccess` |
| Flat / By Dept toggle | Toggle pair | — | Always |
| Employee cards | `EmployeeCard` grid | Mixed (see component) | Has data |
| Department group headers | Label + count chip | — | `groupMode === "department"` |
| "No employees match this filter" | Empty state | — | Filtered empty |
| Skeleton grid (×4) | Skeleton cards | — | Loading |

#### Active Campaigns (AdminDashboard only)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Active Campaigns" | Heading | — | Always |
| Refresh button | Icon button | — | Always |
| "View All →" link | Link → `/workspace` | — | Always |
| Campaign rows (icon + name + dept pill + people count) | List | — | Has campaigns |
| "No active campaigns" | Empty state | — | No campaigns |
| Skeleton rows (×3) | Skeleton | — | Loading |

#### Checklist (AdminDashboard only)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Checklist" | Heading | — | Always |
| Refresh button | Icon button | — | Always |
| "N Pending" badge | Pulsing badge (rose) | — | Not loading |
| Task rows (priority icon + title + priority pill + status pill + meta) | List | — | Has pending tasks |
| "All caught up!" | Empty state | — | No pending tasks |
| "View All Tasks →" link | Link → `/workspace` | — | Always |
| Skeleton rows (×4) | Skeleton | — | Loading |

#### Weekly Overview (OtherRoleOverview only)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Weekly overview" | Heading | — | Always |
| Day cards (weekday + status dot + date + minutes) | Cards (×5-7) | — | Data loaded |
| Today highlight border | Visual | — | Current day |
| Skeleton cards (×5) | Skeleton | — | Loading |

#### Monthly Summary (OtherRoleOverview only)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Monthly summary" | Heading | — | Always |
| Present/Total days, On-time %, Avg daily hours, Total hours | Stat cards (×4) | — | Data loaded |
| Office vs Remote split bar + labels | Bar + text | — | Data loaded |
| Skeleton stat cards (×4) | Skeleton | — | Loading |

#### Ping (AdminDashboard)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Pinged {name}" toast | Toast notification | `ping_send` | After successful ping |

---

### 1.2 `/` — Dashboard Shell (`DashboardShell.tsx`)

Wraps ALL dashboard pages.

#### PWA Install Bar
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Install App" button | Button + download icon | — | `installPrompt` available |
| "✕" dismiss button | Icon button | — | Same |

#### Sticky Header (Desktop)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Single Solution Sync" brand link | Link → `/` | — | Always |
| Theme button + dropdown (Light/Dark/System) | Button + panel | — | Always |
| Ping inbox button + unread badge | Button + badge | — | `liveUpdates` prop |
| Ping panel: title, refresh, "Mark all read", ping rows (avatar + name + message + time + unread dot) | Panel contents | — | Panel open |
| "No pings yet" | Empty state | — | No pings |
| Notifications bell + unseen badge | Button + badge | — | Always (data needs `activityLogs_view`) |
| Notification panel: "Activity Log", refresh, "Mark all read" | Panel header | `activityLogs_view` | Panel open |
| Notification rows: entity icon, name, action, details, time, security badges ("Violation"/"Warning"), Google Maps link | Panel list | `activityLogs_view` | Has logs |
| "No activity yet" | Empty state | — | No logs |
| Help button + dropdown ("Welcome Tour", contextual guide) | Button + menu | — | Always |
| "Settings" link | Link → `/settings` | — | Always |
| "Sign out" button | Button | — | Always |

#### Sticky Header (Mobile Hamburger)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Menu button (hamburger icon) | Icon button | — | Small screens |
| Mobile drawer: profile link (avatar + name + email) | Link → `/employee/{username}` | — | Drawer open |
| Theme buttons (Light/Dark/System) | Buttons (×3) | — | Drawer |
| "Pings" button + badge | Button | — | `liveUpdates` |
| "Notifications" button + badge | Button | — | Always |
| "Help & Guides" button | Button | — | Always |
| Settings link | Link | — | Always |
| "Sign out" button (rose) | Button | — | Always |

#### Bottom Dock Navigation
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| SessionTracker | Component | — | `!user.isSuperAdmin` |
| Overview link | Dock button | — | Always |
| Workspace link | Dock button | — | Always |
| Organization link | Dock button | `organization_view` | Hidden without perm |
| Insights Desk link | Dock button | — | Always |

---

### 1.3 `/workspace` — Workspace (`workspace/page.tsx`)

#### Header
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Workspace" heading + subtitle | Text | — | Always |
| "N tasks" stat pill | `HeaderStatPill` | — | Not loading |
| "N in progress" stat pill | `HeaderStatPill` (amber) | — | Count > 0 |
| "N done" stat pill | `HeaderStatPill` (teal) | — | Count > 0 |
| "N campaign(s)" stat pill | `HeaderStatPill` (primary) | — | Count > 0 |
| "+ Task" button | Primary button | `tasks_create` | Ready |
| "+ Campaign" button | Outlined button | `campaigns_create` | Ready |

#### Toolbar
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Search input ("Search tasks...") | Text input + search icon | — | Always |
| Campaign / Employee / Hierarchy | Segmented control (×3) | — | Always |
| All / Pending / In Progress / Completed + counts | Filter pills (×4) | — | Always |

#### Task Board
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Group card (collapse/expand header) | Card + button | — | Per group |
| Group label (campaign name / "Unlinked Tasks" / assignee) | Text | — | Per group |
| Campaign status badge (Active/Paused/Completed/Cancelled) | Badge | — | Has campaign |
| Campaign progress bar + "done/total" | Bar + text | — | `taskCount > 0` |
| Campaign date range | Text | — | Campaign has dates |
| Edit campaign button | Icon button (pencil) | `campaigns_edit` | Has campaign |
| Delete campaign button | Icon button (trash) | `campaigns_delete` | Has campaign |
| Add task to campaign button | Icon button (plus) | `tasks_create` | `groupMode === "campaign"` |
| "No tasks" / "No tasks in this campaign" | Empty state | — | No tasks in group |

#### Task Card (per task)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Status cycle button (dot: check/pulse/static) | Button | `tasks_edit` or assignee is self | Always (disabled without handler) |
| Task title (strikethrough if done) | Text | — | Always |
| Description snippet | Text (2-line clamp) | — | Has description |
| Assignee pill (person icon + name) | Pill | — | `groupMode !== "employee"` |
| Priority pill (Low/Medium/High/Urgent) | Colored pill | — | Always |
| Campaign name pill | Pill (primary) | — | `groupMode !== "campaign"` and has campaign |
| Deadline pill + urgency color + alert icon | Pill | — | Has deadline |
| Edit button (pencil) | Icon button (hover) | `tasks_edit` | Hover |
| Delete button (trash) | Icon button (hover) | `tasks_delete` | Hover |

#### Activity Sidebar
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Activity" heading | Text | `activityLogs_view` | `lg+` screens |
| Refresh button | Button | `activityLogs_view` | Sidebar visible |
| "No activity yet" | Empty state | `activityLogs_view` | No logs |
| Log entry cards (avatar, name/You/Your, action, details, entity badge, time) | Card list | `activityLogs_view` | Has logs |

#### Task Modal
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "New Task" / "Edit Task" title | Text | — | Modal open |
| Title input | Text input | — | Always |
| Description textarea | Textarea | — | Always |
| "Assign To" dropdown | Select | `tasks_reassign` | Perm + employees exist |
| "Campaign" dropdown | Select | — | Campaigns exist |
| Priority dropdown (Low–Urgent) | Select | — | Always |
| Deadline date input | Date input | — | Always |
| Status dropdown | Select | — | Edit mode only |
| Save / Cancel buttons | Buttons | — | Always |

#### Campaign Modal
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "New Campaign" / "Edit Campaign" title | Text | — | Modal open |
| Name, Description, Status, Budget, Start/End dates | Inputs | — | Always |
| "Tag Departments" chips | Toggle buttons | `campaigns_tagEntities` | Has departments |
| "Tag Employees" chips | Toggle buttons | `campaigns_tagEntities` | Has employees |
| Notes textarea | Textarea | — | Always |
| Save / Cancel buttons | Buttons | — | Always |

#### Delete Confirmation
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| ConfirmDialog (title, description, Cancel, Delete) | Modal | `campaigns_delete` / `tasks_delete` | Delete target set |

---

### 1.4 `/organization` — Organization (`organization/page.tsx`)

#### Access Denied State
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Lock icon + "Access Restricted" + explanation | Centered block | — | `!organization_view && !isSuperAdmin` |

#### Header
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Organization" heading + subtitle | Text | `organization_view` | Always (when allowed) |
| "N employee(s)" stat pill | `HeaderStatPill` (teal) | — | Always |
| "N department(s)" stat pill | `HeaderStatPill` (purple) | — | Always |
| "N active" stat pill | `HeaderStatPill` (green) | — | Not all employees active |
| Chart Legend hover panel (5 legend rows with swatches) | Popover | — | Hover |

#### Search + Action Bar
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Search input ("Search people, departments...") | Text input + icon | — | Always |
| "Add Employee" button | Primary button | `employees_create` | Session ready |

#### Sidebar
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Departments panel | Card (`DepartmentsPanel`) | `departments_create`/`edit`/`delete` props | Always |
| Designations panel | Card (`DesignationsPanel`) | `designations_manage` | `designations_view` |

#### Main Flow
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Org flow tree (visual chart) | `OrgFlowTree` | `organization_manageLinks`, `members_*` | Always |
| Shimmer loading placeholder | Skeleton | — | Chunk loading |

#### Employee Preview Modal
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| EmployeeCard (embedded, all attendance/task/campaign sections) | Composite | `attendance_viewTeam`, `attendance_viewDetail`, `tasks_view`, `campaigns_view` | Preview open |
| Active/Inactive toggle | `ToggleSwitch` | `employees_toggleStatus` | Not SuperAdmin target |
| "Joined {date}" info | Text | — | Always |
| "Invite" / "Sending..." button + send icon | Button | `employees_resendInvite` | Unverified employee |
| Copy invite link button | Icon button | `employees_resendInvite` | Unverified employee |
| Edit / Delete action buttons | Icon buttons (hover) | `employees_edit` / `employees_delete` | Not SuperAdmin target |

#### Employee Invite/Edit Modal
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Invite Employee" / "Edit Employee" title | Text | — | Modal open |
| Full Name input | Text input | — | Always |
| Email input (disabled on edit) | Email input | — | Always |
| New Password input | Password input | — | Edit mode only |
| Weekly schedule (×7 days): ToggleSwitch + Start/End/Break inputs | Toggle + inputs | — | Always |
| Shift Type dropdown (Full/Part/Contract) | Select | — | Always |
| Grace Minutes input | Number input | — | Always |
| Salary input | Number input | `payroll_manageSalary` | When allowed |
| Save / Cancel buttons | Buttons | — | Always |

#### Delete Confirmation
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| ConfirmDialog ("Remove Employee") | Modal | `employees_delete` | Delete target set |

---

### 1.5 `/employees` — Employee List (`employees/page.tsx`)

#### Header
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Employees" heading | Text | — | Always |
| Employee count subhead | Text | — | Data loaded |
| ScopeStrip (department pills) | Segment buttons | `employees_view`/`attendance_viewTeam`/`departments_view` | ≥2 departments |
| Flat / By Dept toggle | Segmented buttons | — | Always |
| Latest / A–Z sort toggle | Segmented buttons | — | Always |

#### Search + Actions
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Search input | Text input + icon | — | Always |
| "Add Employee" button | Primary button | `employees_create` | Session ready |

#### Batch Selection Bar
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "N selected" text | Info text | `employees_delete` | Selection > 0 |
| "Deactivate" button | Button | `employees_delete` | Selection > 0 |
| "Clear" button | Text button | `employees_delete` | Selection > 0 |

#### Results
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "N employee(s)" count | Animated text | — | Always |
| "Select all" / "Deselect all" | Text button | `employees_delete` | Has perm |

#### Employee Card Grid
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| EmployeeCard (full: link, status pill, checkbox, avatar, name, meta, attendance stats, activity strip, location alert, task/campaign chips, footer) | Card grid | Mixed (see EmployeeCard component) | Data loaded |
| Active/Inactive toggle (footer) | `ToggleSwitch` | `employees_toggleStatus` | Not SuperAdmin |
| "Joined {date}" | Text | — | Always |
| "Invite" button + copy button | Buttons | `employees_resendInvite` | Unverified |
| Edit / Delete buttons (hover) | Icon buttons | `employees_edit` / `employees_delete` | Not SuperAdmin |
| Department group headers + count | Heading + badge | — | `groupMode === "department"` |
| Skeleton cards (×8) | Skeleton grid | — | Loading |
| "No employees found" | Empty state | — | Filtered empty |

#### Modals
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| ConfirmDialog ("Deactivate Employee") | Modal | `employees_delete` | Single delete target |
| ConfirmDialog ("Deactivate Employees") | Modal | `employees_delete` | Bulk delete |

---

### 1.6 `/employee/[slug]` — Employee Detail (`EmployeeDetailHub.tsx`)

#### Profile Header
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Avatar / initials | Image or circle | — | Always |
| Breadcrumb "Employees" link | Link → `/employees` | — | Always |
| "@username" | Text | — | Always |
| "You" badge | Badge | — | Viewing own profile |
| Full name | Heading | — | Always |
| Designation line | Text | — | Always |
| Status badge (Active session/Checked in/Off shift/Inactive) | Badge | — | Always |
| Department badge | Badge | — | Has department |
| "Edit profile" link/button | Link | `employees_edit` (with SuperAdmin rules) or own profile | When allowed |

#### Tab Navigation
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Overview" tab | Button | — | Always |
| "Attendance" tab | Button | — | Hidden for SuperAdmin targets |
| "Profile" tab | Button | — | Always |
| "Activity" tab | Button | — | Always |
| "Leaves" tab | Button | — | Hidden for SuperAdmin targets |
| "Payroll" tab | Button | — | Hidden for SuperAdmin targets |

#### Overview Tab
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Today's attendance" heading | Heading | — | Always |
| Minutes logged stat | Stat card | — | Session loaded |
| Session location (In office/Remote/No active) | Stat card | — | Session loaded |
| "Stale heartbeat" warning | Info text | — | Stale session |
| Location (Flagged/OK) + flag reason | Stat card + text | — | Session loaded |
| "Active tasks" + count | Stat card | `tasks_view` | Always |
| "Campaign involvement" + count | Stat card | `campaigns_view` | Always |
| "Memberships" heading + list (dept + designation) | Card + list | — | Always |
| "Inactive" badge per membership | Badge | — | `m.isActive === false` |
| "No membership records yet" | Empty state | — | No memberships |

#### Attendance Tab
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Month label + prev/next buttons | Heading + buttons | `attendance_viewTeam` or own | Always |
| Calendar grid (day cells with colored dots, today highlight) | Button grid | Same | Data loaded |
| "Loading calendar..." | Text | Same | Loading |
| Monthly stats: Present days, On-time %, Avg hours, Total hours | Stat cards | Same | Stats loaded |
| Office vs Remote bar + hours | Bar + text | Same | Stats loaded |
| "No aggregated stats" | Empty state | Same | No stats |

#### Profile Tab
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Profile" heading + "Edit" button | Heading + link | `canEditProfile` | Edit button conditional |
| Personal card: Name, Email, Phone, Username | Definition list | — | Always |
| Organization card: Department, Role | Definition list | — | Always |
| Shift card: Today, Break, Type, Working days + weekly schedule | Definition list + list | — | Always |

#### Activity Tab
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Recent activity" heading + log cards | Card list | `activityLogs_view` | Has logs |
| "Tasks" heading + task rows (priority, title, status pill, due date) | Card list | `tasks_view` | Has tasks |
| Empty states for both | Text | — | No data |

#### Leaves Tab / Payroll Tab
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Coming soon" placeholder | Card | — | Tab visible |

---

### 1.7 `/employee/new` — Create Employee (`EmployeeForm.tsx`)

#### Access Denied
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Access Restricted" + explanation | Centered text | — | `!employees_create` |

#### Form
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Back button (→ `/organization`) | Icon button | `employees_create` | Always |
| "Invite Employee" title | Heading | — | Create mode |
| Full Name input | Text input (required) | — | Always |
| Email input | Email input | — | Create mode |
| "Username: @..." | Info text | — | Derived username |
| Assignment info callout | Text | — | Create mode |
| Weekly schedule (×7): ToggleSwitch + time/break inputs | Toggle + inputs | — | Always |
| "Copy Mon → All" button | Button | — | Always |
| Shift Type dropdown | Select | — | Always |
| Grace Minutes input | Number input | — | Always |
| Salary input | Number input | `payroll_manageSalary` | When allowed |
| "Send Invite" / "Saving..." button | Submit button | — | Always |
| "Cancel" button | Button | — | Always |
| Loading skeleton | Skeleton blocks | — | Loading |

---

### 1.8 `/insights-desk/attendance` — Attendance Page

#### Header Controls
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| ScopeStrip (dept filter) | Segment buttons | `attendance_viewTeam` | Team access + ≥2 depts |
| Flat / By Dept toggle | Segmented buttons | `attendance_viewTeam` | Team access |

#### Employee Pills (Team Mode)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "All Employees" pill (dot + stats) | Button | `attendance_viewTeam` | `groupMode === "flat"` |
| "My Attendance" pill | Button | `attendance_viewTeam` | `!isSuperAdmin && flat` |
| Per-employee pill (name + dot + stats) | Button | `attendance_viewTeam` | Team data loaded |
| Department section labels | Text | `attendance_viewTeam` | `groupMode === "department"` |
| "No employees found for this period" | Empty state | `attendance_viewTeam` | No data |
| Skeleton pills (×6) | Skeleton | — | Loading |

#### Calendar
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Month/year heading + prev/next buttons | Heading + buttons | — | Always |
| Weekday headers (Sun–Sat) | Text | — | Always |
| Day cells (number + status dot; disabled for future) | Buttons | — | Always |
| Legend: On Time (green), Late (amber), Absent (rose), Weekend, Holiday (purple), Leave (teal) | Legend items | — | Conditional per type |

#### Day Detail Panel (Team Aggregate)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Selected date heading | Text | `attendance_viewTeam` | Day selected + aggregate |
| "N present · N late · N absent" | Caption | — | Data loaded |
| Close button | Icon button (X) | — | Always |
| Per-employee row: dot, name, dept, hours, On Time/Late/Absent badge, Office badge, Arrived/Left/Office In/Out stats, location split | Card rows | `attendance_viewTeam` | Has team date data |
| "No employee data for this date" | Empty state | — | No data |
| Skeleton list (×5) | Skeleton | — | Loading |

#### Day Detail Panel (Individual)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Selected date heading + "Today" badge | Text + badge | — | Day selected + individual |
| Close button | Icon button (X) | — | Always |
| Status pill (On Time/Late/Absent) | Pill | — | Data loaded |
| "Late by..." pill | Pill (outline) | — | `lateBy > 0` |
| "Office +..." pill | Pill (outline) | — | `isLateToOffice` |
| "N break" pill | Pill (outline) | — | `breakMinutes > 0` |
| "N session(s)" pill | Pill (outline) | — | Always |
| Stat chips: Arrived, Left, Office In, Office Out (×4) | `StatChip` | — | Data loaded |
| Stat chips: Total, Office, Remote (×3) | `StatChip` | — | Data loaded |
| Work Split: progress bar (office+remote), legend "Office N% / Remote N%" | Bar + text | — | `totalWorkingMinutes > 0` |
| Calendar icon + "No data yet" / "No attendance recorded" | Empty state | — | No detail data |
| Skeleton (pills, stats) | Skeleton | — | Loading |

#### Summary Panel (No Day Selected)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "{Month} Summary" heading | Text | — | Always |
| "N employees · select..." or name caption | Caption | — | Not loading |
| Aggregate stats: Working Days, Total Hours, Avg Daily, Avg On-Time, Attendance, On-Time Days | `StatChip` (×6) | `attendance_viewTeam` | Aggregate mode |
| Individual stats: Working Days, Total Hours, Avg Daily, On-Time %, Attendance, Office/Remote | `StatChip` (×6) | — | Individual mode + data |
| "No data for this month" | Empty state | — | No stats |
| Skeleton grid (×6) | Skeleton | — | Loading |

#### Session Timeline
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Session Timeline" heading | Text | — | Individual + day selected + sessions exist |
| Timeline rail (vertical line) | Visual | — | Same |
| Per session: node (ring + pulse), time range, duration badge, Office/Remote pill, Active/Timed Out/Ended pill, device pill (laptop/phone/desktop icon), "First In"/"Last Out" pills, heartbeat caption, IP caption, Google Maps link | Card + elements | — | Per session |
| "Office Segments" sub-list (dot, time range, duration) | Nested list | — | `officeSegments?.length > 0` |

#### Employee Overview (Team)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Employee Overview · N" heading | Text | `attendance_viewTeam` | Aggregate + has data |
| Clickable employee cards: dot, name, dept, % badge, Days/Hours/Avg stats, On-time%/Late/Office footer, "View →" | Cards | `attendance_viewTeam` | Has data |
| Skeleton cards (×4) | Skeleton | — | Loading |

#### Leaves List (Individual)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Leaves · N" heading | Text | — | Has approved leaves |
| "+ Apply Leave" button | Text link | — | Same |
| Leave rows: status dot, date range, reason, duration, status badge | List | — | Has leaves |

#### Monthly Records (Individual, No Day Selected)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Monthly Records · N" heading | Text | — | Has records |
| Day cards: date, status badge, Total/Office/Remote stats, time range, "Details →" | Button cards | — | Has records |
| Skeleton cards (×6) | Skeleton | — | Loading |

---

### 1.9 `/insights-desk/*` — Insights Desk Layout

#### Header (Shared)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Insights Desk" heading | Text | — | Always |
| "N employee(s)" stat pill | `HeaderStatPill` | — | `teamCount > 0` |
| "N upcoming holidays" stat pill | `HeaderStatPill` | — | Upcoming > 0 |
| "N holidays this year" stat pill | `HeaderStatPill` | — | Holidays > 0 |
| "Leaves" button (teal, calendar icon) | Button | — | Always |
| "Payroll" button (green, currency icon) | Button | — | Always |
| "Holidays" button (purple, sparkle icon) + numeric badge | Button + badge | — | Badge when upcoming > 0 |

#### Holidays Modal
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Company Holidays" title + year/upcoming counts | Text | — | Modal open |
| Close button (X) | Icon button | — | Always |
| "Declare Holiday" button | Button | `holidays_manage` | When allowed + form not shown |
| Holiday name input | Text input | `holidays_manage` | Form open |
| Date input | Date input | `holidays_manage` | Form open |
| "Recurring yearly" toggle | `ToggleSwitch` | `holidays_manage` | Form open |
| Cancel / "Add" buttons | Buttons | `holidays_manage` | Form open |
| Holiday rows: date tile (month+day), name, weekday | List | — | Has holidays |
| Recurring toggle per row OR "Recurring" read-only badge | Toggle or badge | `holidays_manage` for toggle | Per row |
| Delete button (trash icon) per row | Icon button | `holidays_manage` | Per row |
| "No holidays declared for {year}" | Empty state | — | No holidays |
| ConfirmDialog ("Remove Holiday") | Modal | `holidays_manage` | Delete target set |
| Skeleton list (×4) | Skeleton | — | Loading |

---

### 1.10 Leaves Modal (`LeavesModal.tsx`) — Overlay

| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Leaves" / "Apply Leave" title | Text | — | Open |
| Balance subtitle "used/total · remaining" | Text | — | Balance loaded + not exempt |
| Close button (X) | Icon button | — | Open |
| Employee picker dropdown ("Yourself" + employees) | Select | `leaves_viewTeam` | Team perm + employees |
| "SuperAdmin is exempt" + "Select an employee above" | Centered text | — | `isSuperAdmin && !userId` |
| Balance bar (used/remaining labels + progress bar) | Bar | — | Balance loaded + not exempt |
| Full day / Half day segmented control | Buttons (×2) | — | Not exempt |
| "Multiple days" toggle | `ToggleSwitch` | — | Full day mode |
| Date / Start date input | Date input | — | Form visible |
| End date input | Date input | — | Multi-day mode |
| Reason input (optional) | Text input | — | Form visible |
| "Submit request" / "Submitting..." button | Submit button | — | Form visible |

---

### 1.11 Payroll Modal (`PayrollModal.tsx`) — Overlay

| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Payroll" title + month/year subtitle | Text | — | Open |
| Close button (X) | Icon button | — | Open |
| Employee picker dropdown | Select | `payroll_viewTeam` | Team perm + employees |
| "SuperAdmin is exempt" + help text | Centered text | — | SuperAdmin no user selected |
| YTD: Earned, Deductions, Net stat tiles (×3) | Stat tiles | — | `ytd.months > 0` |
| "{Month} Estimate" section label | Text | — | Estimate loaded |
| Estimate rows: Base Salary, Working Days, Present, Absent, Late, Leaves | Rows | — | Estimate loaded |
| Gross Pay, deductions (−label per item), **Net Pay** | Divider + rows | — | Estimate loaded |
| "Export CSV" button (download icon) | Button | — | Estimate loaded |
| "No payroll data available" | Empty state | — | No estimate |
| Skeleton tiles (×3) + block | Skeleton | — | Loading |

---

### 1.12 `/settings` — Settings Page

#### Loading Skeleton
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Header skeleton, profile card skeleton, security card skeleton, admin row skeleton | Skeleton blocks | — | Profile loading |

#### Header
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Gear icon | Gradient icon | — | Loaded |
| "Account Settings" heading + subtitle | Text | — | Loaded |

#### Profile Card
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Profile" heading | Text | — | Loaded |
| Avatar image or initials circle | Image or circle | — | Always |
| Camera icon overlay (hover) | Icon | — | Hover |
| Hidden file input (image upload) | File input | — | Always |
| Remove image button (×) | Icon button (rose) | — | Image set, hover |
| Display name + email | Text | — | Always |
| @username pill | Badge | — | Has username |
| Designation pill (System Admin / designation / Employee) | Badge | — | Always |
| Department pill | Badge | — | Has department |
| Full Name input (person icon) | Text input | — | Always |
| Phone input (phone icon) | Text input | — | Always |
| Success message | Animated text (green) | — | After save |
| "Save profile" / "Saving..." button | Submit button | — | Always |

#### Email & Password Card
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Email & Password" heading | Text | — | Always |
| Current password input + visibility toggle | Password input + button | — | Always |
| New email input (envelope icon) | Email input | — | Always |
| "Email will change from {email}" | Info text (primary) | — | Email changed |
| New password input + visibility toggle | Password input + button | — | Always |
| Password strength bars (×5) | Animated bars | — | New password entered |
| Confirm password input | Text input | — | New password entered |
| "Passwords match" / "do not match" | Info text | — | Confirm entered |
| Success/error alert | Alert card | — | After save |
| "Save changes" / "Saving..." button | Submit button | — | Always |

#### Preferences Card
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Preferences" heading | Text | — | Always |
| "Show coordinates in time pill" title + description | Text | — | Always |
| Coordinates toggle | `ToggleSwitch` | — | Always (disabled while saving) |

#### Admin Configuration Grid (3 columns on lg)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| **Entire grid** | Grid container | `payroll_manageSalary` OR `settings_manage` | Either perm |

##### Payroll Card
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Payroll heading + description | Text | `payroll_manageSalary` | Has perm |
| Error / Success alerts | Alert cards | Same | After save |
| "Late Penalty Tiers" label + "+ Add tier" button | Text + button | Same | Always |
| Per tier: minutes input + penalty % input + remove (×) button | Inputs + button | Same | Per tier |
| Absence penalty % input | Number input | Same | Always |
| Overtime multiplier input | Number input | Same | Always |
| Pay day input (1–28) | Number input | Same | Always |
| "Save config" / "Saving..." button | Submit button | Same | Always |
| Skeleton card | Skeleton | Same | Config loading |

##### System Card
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "System" heading + subtitle | Text | `settings_manage` | Has perm |
| Company Name input | Text input | Same | Always |
| Timezone dropdown (Asia/Karachi, UTC, America/New_York) | Select | Same | Always |
| Success message | Text (green) | Same | After save |
| "Save" / "Saving..." button | Submit button | Same | Always |
| Skeleton card | Skeleton | Same | Loading |

##### Office Configuration Card
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Office" heading + subtitle | Text | `settings_manage` | Has perm |
| Latitude / Longitude / Radius inputs | Number inputs | Same | Always |
| "Live Updates" label + description | Text | Same | Always |
| Live updates toggle | `ToggleSwitch` | Same | Always |
| Success message | Text (green) | Same | After save |
| "Reset" button (defaults) | Button | Same | Always |
| "Save" / "Saving..." button | Submit button | Same | Always |
| Skeleton card | Skeleton | Same | Loading |

#### Test Email Card (below grid)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Test Email" heading + subtitle | Text | `settings_manage` | Has perm |
| Type pills: Welcome/Invite, Password Reset, Attendance Alert | Segmented buttons | Same | Always |
| Email input (envelope icon) | Text input | Same | Always |
| "Send Test Email" / "Sending..." button | Submit button | Same | Always |

---

### 1.13 `/departments` — Department Management

| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Departments" heading + count/team stats | Text | — | Always |
| Most Employees / Name sort toggle | Segmented buttons | — | Always |
| Search input | Text input + icon | — | Always |
| "Add Department" button | Button | `departments_create` OR `departments_edit` | Session ready |
| Quick-add form: name input + parent dropdown + Create/Cancel | Inputs + buttons | Same | Form open |
| Department cards: title, manager line, parent line, employee count + %, description, created date | Card grid | `departments_view` (for data) | Has data |
| Edit mode: title input + textarea + manager/parent dropdowns + Save/Cancel | Inputs + buttons | `departments_create`/`edit` | Editing |
| Active/Inactive toggle (footer) | `ToggleSwitch` | Same | Per card |
| Edit / Delete buttons (hover) | Icon buttons | Same | Hover |
| "No departments yet. Add one above." | Empty state | — | No departments |
| ConfirmDialog ("Delete Department") | Modal | `departments_delete` | Delete target set |
| Skeleton cards (×8) | Skeleton | — | Loading |

---

### 1.14 `/tasks` — Tasks Page

| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Tasks" heading + count | Text | — | Always |
| Latest / Deadline / Priority sort | Segmented pills | — | Always |
| Search input | Text input + icon | — | Always |
| "Create Task" button | Button | `tasks_create` | Session ready |
| Priority filters: All / Low / Medium / High / Urgent | Segmented pills | — | Always |
| "Clear" link | Text button | — | Active filter/search |
| Task cards: priority badge, status pill OR status dropdown (assignee self), title, description, assignee, deadline (calendar icon), created/updated date | Card grid | `tasks_view` (data) | Has data |
| Status dropdown (select: Pending/In Progress/Completed) | Select | — | Not manage perm + assignee is self |
| Edit / Delete buttons (hover) | Icon buttons | `tasks_edit` / `tasks_delete` | Per perm |
| Create/Edit modal: title, description, "Assign To" dropdown, priority, deadline, status (edit only), Save/Cancel | Form modal | `tasks_reassign` for assignee | Modal open |
| ConfirmDialog ("Delete Task") | Modal | `tasks_delete` | Delete target set |
| "No tasks found." | Empty state | — | Filtered empty |
| Skeleton cards (×10) | Skeleton | — | Loading |

---

### 1.15 `/campaigns` — Campaigns Page

| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Campaigns" heading + count + hint | Text | — | Always |
| Recent / A–Z sort | Segmented pills | — | Always |
| Search input | Text input + icon | — | Always |
| "New Campaign" button | Button | `campaigns_create` OR `campaigns_edit` | Session ready |
| Status filters: All/Active/Paused/Completed/Cancelled + counts | Segmented pills | — | Always |
| "Clear" link | Text button | — | Active filter/search |
| Campaign cards: name + status badge, description, duration, budget, "Departments & people" label, dept pills (primary), employee pills (purple), notes, quick status buttons (Pause/Complete or Resume/Cancel), active toggle (footer), updated/created date | Card grid | `campaigns_view` (data) | Has data |
| Quick status buttons (Pause/Complete/Resume/Cancel) | Buttons | `campaigns_create`/`edit` | Per status |
| Active toggle (footer) | Toggle | `campaigns_create`/`edit` | Per card |
| Edit / Delete buttons (hover) | Icon buttons | `campaigns_create`/`edit` / `campaigns_delete` | Per perm |
| Create/Edit modal: name, description, status dropdown, budget, start/end dates, tag departments chips, tag employees chips, notes, Save/Cancel | Form modal | `campaigns_tagEntities` for tags | Modal open |
| ConfirmDialog ("Delete Campaign") | Modal | `campaigns_delete` | Delete target set |
| "No campaigns found. Create one above." | Empty state | — | Filtered empty |
| Skeleton cards (×8) | Skeleton | — | Loading |

---

### 1.16 Auth Pages (Public)

#### `/login`
| Element | Type | Condition |
|---------|------|-----------|
| "Single Solution Sync" heading + "Employee presence & attendance" + feature chips (Automatic · Real-time · Intelligent) | Text | Always |
| Email input (envelope icon) | Email input | Always |
| Password input + visibility toggle | Password input + button | Always |
| "Forgot password?" link | Link → `/forgot-password` | Always |
| Error alert ("Invalid email or password") | Alert card | After failed sign-in |
| "Sign in" / "Signing in..." button (spinner + arrow) | Submit button | Always |
| Trust footer: Encrypted (lock), Rate limited (shield), Fast (bolt) | Info text + icons | Always |

#### `/forgot-password`
| Element | Type | Condition |
|---------|------|-----------|
| Brand link → `/login` | Link | Always |
| Key icon + "Reset your password" heading | Icon + text | Form state |
| Email input (envelope icon) | Email input | Form state |
| "Send reset link" / "Processing..." button | Submit button | Form state |
| "Back to sign in" link | Link | Form state |
| Success: check icon + "Check your email" + bold email + dev reset link | Card | Sent state |
| "Back to sign in" button + "Try again" button | Buttons | Sent state |

#### `/reset-password`
| Element | Type | Condition |
|---------|------|-----------|
| Brand link → `/login` | Link | Always |
| Invalid token: warning icon + "Invalid Reset Link" + link to `/forgot-password` | Card | Missing token/email |
| Lock icon + "Set new password" + "For {email}" | Card + text | Valid token |
| New password input + PasswordStrength bars (×5, Weak→Excellent) | Input + bars | Valid token |
| Confirm password input + match/mismatch text | Input + text | Valid token |
| "Reset password" / "Resetting..." button | Submit button | Valid token |
| Success: shield/check icon + "Password reset!" + "Sign in now" link | Card | After reset |

---

## 2. Shared Components — Granular Element Breakdown

### EmployeeCard (`components/EmployeeCard.tsx`)

#### Card Shell
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| Animated card wrapper (`motion.div`) | Container | — | `!embedded` (standalone card) |
| Plain `div` wrapper | Container | — | `embedded` (parent supplies card chrome) |
| Dimmed opacity (0.72) | Visual effect | — | `!attendanceLoading && !emp.isLive` |
| Full-card `Link` overlay → `/employee/{username or _id}` | Link | — | Always |
| `aria-label="View {firstName} {lastName}"` | Accessibility | — | Always |

#### Status Pulse Pill (Desktop — top-right)
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| Entire pill container | Pill (absolute top-right) | `showAttendance` | Hidden when false |
| Shimmer loading bar inside pill | Skeleton | `showAttendance` | `attendanceLoading` |
| Pulsing green dot (ping animation) | Animated dot | `showAttendance` | `emp.isLive` |
| "In Office" label (green bg) | Text | `showAttendance` | `isLive && status === "office"` |
| "Remote" label (blue bg) | Text | `showAttendance` | `isLive && status === "remote"` |
| "Last seen" label + time value | Text + sub-text | `showAttendance` | `!isLive && firstEntry exists` |
| "Absent" label (amber bg) | Text | `showAttendance` | `!isLive && no firstEntry` |
| Rose border glow | Border style | `showAttendance` | `emp.locationFlagged` |

#### Status Pulse Pill (Mobile — inline with name)
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| Same pill as above but `sm:hidden` | Pill (inline) | `showAttendance` | Mobile breakpoint |

#### Checkbox (Selection)
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| `input type="checkbox"` | Checkbox | `selectable` | Hidden when false |
| Visible on hover or when checked | Visual | `selectable` | `group-hover` or `checked` |
| `aria-label="Select {name}"` | Accessibility | `selectable` | Always when selectable |

#### Avatar Row
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| Profile image (`img`) | Image | — | `emp.profileImage` truthy |
| Gradient initials circle | Circle + text | — | No `profileImage` |
| Gradient color (cycles through 8 colors) | Visual | — | Based on `idx` |

#### Name + Identity
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| "{firstName} {lastName}" | Bold text | — | Always |
| Ping button (radio-wave icon) | Icon button | `onPing` | Only when `onPing` provided |
| `title="Ping {firstName}"` | Tooltip | `onPing` | Same |
| "PENDING" badge (amber uppercase) | Badge | — | `emp.isVerified === false` |
| Subtitle: "{designation} · {department}" or email | Caption text | — | When subtitle non-empty |

#### Employee Meta Block
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| "Designation" label + value or "—" | Label/value row | `showEmployeeMeta` | Hidden when false |
| "Department" label + value or "—" | Label/value row | `showEmployeeMeta` | Hidden when false |
| "Shift" label + `shiftSummary` value | Label/value row | `showEmployeeMeta` | `emp.shiftSummary` truthy |
| "Phone" label + value | Label/value row | `showEmployeeMeta` | `emp.phone` truthy |

#### Clock In / Hours / Clock Out Row
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| "Clock In" label | Caption text | `showAttendance` | Hidden when false |
| Clock In value (formatted time or "—") | Bold tabular text | `showAttendance` | Always when row shown |
| "Hours" label | Caption text | `showAttendance` | Always when row shown |
| Hours value (e.g. "5h 23m" or "—") | Bold tabular text | `showAttendance` | Always when row shown |
| "Clock Out" label | Caption text | `showAttendance` | Always when row shown |
| Clock Out value (time or "—" if still live) | Bold tabular text | `showAttendance` | Always when row shown |
| Border-top divider | Visual | `showAttendance` | Always when row shown |

#### Arrived / Office / Left Row
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| "Arrived" label | Caption text | `showAttendance` | `!attendanceLoading` |
| Arrived value (first office entry time or "—") | Bold tabular text | `showAttendance` | Same |
| "Office" label | Caption text | `showAttendance` | Same |
| Office value (formatted minutes) | Bold tabular text | `showAttendance` | Same |
| "Left" label | Caption text | `showAttendance` | Same |
| Left value (last office exit time or "—") | Bold tabular text | `showAttendance` | Same |

#### Activity Strip (Segmented Progress Bar)
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| Track bar (full width, border-colored background) | Bar background | `showAttendanceDetail` | `!attendanceLoading` |
| Office segment (green fill) | Animated bar segment | `showAttendanceDetail` | `officeMinutes > 0` |
| Remote segment (blue fill) | Animated bar segment | `showAttendanceDetail` | `remoteMinutes > 0` |
| Break segment (purple fill) | Animated bar segment | `showAttendanceDetail` | `breakMinutes > 0` |
| Percentage text (e.g. "78%", green when ≥100%) | Bold text | `showAttendanceDetail` | Always when strip shown |

#### Activity Strip (Detail Chips)
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| "{N} session(s)" chip (gray bg, loop icon) | Chip | `showAttendanceDetail` | Always when strip shown |
| "{Xh Ym} remote" chip (blue tint) | Chip | `showAttendanceDetail` | `remoteMinutes > 0` |
| "{Xh Ym} break" chip (purple tint) | Chip | `showAttendanceDetail` | `breakMinutes > 0` |
| "+{Xm} late" chip (amber tint) | Chip | `showAttendanceDetail` | `lateBy > 0` |
| "+{Xm} late to office" chip (rose tint) | Chip | `showAttendanceDetail` | `isLateToOffice && lateToOfficeBy > 0` |
| "{Xh Ym} idle" chip (gray) | Chip | `showAttendanceDetail` | `idleMins > 5` |

#### Location Flagged Alert
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| Alert card (rose-tinted border + bg) | Card | `showAttendanceDetail && showLocationFlags` | `emp.locationFlagged` |
| Shield icon (SVG) | Icon | Same | Same |
| "Location Flagged" title (rose bold) | Text | Same | Same |
| Flag reason text | Paragraph (rose) | Same | `emp.flagReason` truthy |
| Google Maps external link (map-pin icon + coordinates + external-link icon) | Link (`<a>` `target="_blank"`) | Same | `emp.flagCoords` truthy |

#### Task & Campaign Chips
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| Border-top divider | Visual | `showTasks || showCampaigns` | `!attendanceLoading` |
| "{N} pending" chip (amber when > 0, gray when 0) | Bordered pill | `showTasks` | `!attendanceLoading` |
| "{N} active" chip (primary when > 0, gray when 0) | Bordered pill | `showTasks` | `!attendanceLoading` |
| "{N} campaign(s)" chip (teal when > 0, gray when 0) | Bordered pill | `showCampaigns` | `!attendanceLoading` |

#### Footer Row
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| Border-top divider | Visual | `showActions || footerSlot` | Either present |
| Footer slot (custom ReactNode from parent) | Slot | `footerSlot` | When provided |
| "Manage" button (lock icon + text, teal) | Button | `showActions && onManage` | Hover reveal |
| Edit button (pencil icon, primary) | Icon button | `showActions && onEdit` | Hover reveal |
| "Deactivate" button (trash icon, rose) | Icon button | `showActions && onDelete` | Hover reveal |
| Action cluster opacity-0 → visible on hover | Visual | `showActions` | `group-hover` |

---

### ScopeStrip (`components/ScopeStrip.tsx`)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Entire strip container (scrollable, bordered) | Container | `canAny("employees_view", "attendance_viewTeam", "departments_view")` | Returns `null` if perm missing OR `< 2` departments |
| "All departments" button (primary bg when active) | Segment button | Same | Always first option |
| Per-department button (one per dept) | Segment button | Same | Each department from API |
| Active state: primary bg + white text + shadow | Visual | — | `value === opt.id` |
| Inactive state: secondary text, hover to primary | Visual | — | Other buttons |

---

### ToggleSwitch (`components/ToggleSwitch.tsx`)
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| `<button role="switch">` | Button | — | Always |
| Track background (checked color or gray) | Visual | — | Color by `checked` |
| Animated thumb (`motion.span`, slides left/right) | Animated element | — | Position by `checked` |
| Disabled opacity (50%) | Visual | `disabled` | When disabled |
| Size: sm (h-4 w-7 / thumb h-3 w-3) | Visual | `size="sm"` | When sm |
| Size: md (h-5 w-9 / thumb h-3.5 w-3.5) | Visual | `size="md"` or default | Default |
| Size: lg (h-6 w-11 / thumb h-4.5 w-4.5) | Visual | `size="lg"` | When lg |
| Label text (to the left of switch) | Text | `label` | When `label` provided |

---

### Pill (`components/StatChips.tsx`)
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| Pill container (`span`, rounded) | Container | — | Always |
| Filled variant: solid bg + dot | Variant | `variant="filled"` | Default |
| Outline variant: border + no dot | Variant | `variant="outline"` | When outline |
| Leading dot (small filled circle) | Dot | — | `variant === "filled"` only |
| Icon: laptop SVG | Icon | `icon="laptop"` | When laptop |
| Icon: phone SVG | Icon | `icon="phone"` | When phone |
| Icon: desktop SVG | Icon | `icon="desktop"` | When desktop |
| Label text | Text | — | Always |
| Size: sm (text-[9px], px-1.5) | Visual | `size="sm"` | When sm |
| Size: md (text-[10px], px-2) | Visual | `size="md"` or default | Default |

### StatChip (`components/StatChips.tsx`)
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| Card container (rounded, grouped bg) | Container | — | Always |
| Label (uppercase caption) | Text | — | Always |
| Value (bold, colored) | Text | `color` | Always |

### HeaderStatPill (`components/StatChips.tsx`)
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| Pill container (bordered, elevated bg) | Container | — | Always |
| Leading colored dot | Dot | `dotColor` | When `dotColor` set |
| Numeric value (tabular-nums, bold) | Text | — | Always |
| Trailing label text | Text | — | Always |

---

### ConfirmDialog (`components/ConfirmDialog.tsx`)
| Element | Type | Prop Gate | Condition |
|---------|------|----------|-----------|
| Full-screen backdrop (black/40 + blur) | Overlay | `open` | `AnimatePresence` |
| Backdrop click → `onCancel` | Interaction | — | Click |
| Dialog panel (rounded, bordered, shadow) | Card | `open` | Scale animation |
| Title (`h3`) | Text | — | Always |
| Description (`p`) | Text | — | Always |
| "Cancel" button (secondary style) | Button | — | Disabled when `loading` |
| Confirm button (primary/danger/warning style) | Button | `variant` | Always |
| Confirm label: `confirmLabel` or "Working..." | Text | `loading` | Toggles on loading |
| Danger variant: rose bg | Visual | `variant="danger"` | When danger |
| Warning variant: amber bg | Visual | `variant="warning"` | When warning |

---

### Portal (`components/Portal.tsx`)
| Element | Type | Condition |
|---------|------|-----------|
| No intrinsic visual output | Wrapper | Renders `children` into `document.body` after mount |

---

### DataTable (`components/DataTable.tsx`)
| Element | Type | Condition |
|---------|------|-----------|
| Card container (`card-static`) | Container | Always |
| Search icon (magnifying glass SVG) | Icon | Always |
| Search text input | Input | Always; `searchPlaceholder` prop |
| Header action slot | ReactNode | When `headerAction` provided |
| Filter slot | ReactNode | When `filterSlot` provided |
| Table headers (`th` cells) | Table headers | Always |
| Sort chevron icon (up/down SVG) | Icon per column | `column.sortable` and active sort |
| Shimmer loading rows (×8) with shimmer `td` cells | Skeleton table | `loading` |
| Data rows (`motion.tr` per item) | Table rows | Not loading + has data |
| "No data found" row (single `td` colspan) | Empty state | Not loading + no data |
| Pagination bar (border-top) | Container | `totalPages > 1` |
| "N total" info text | Text | Pagination visible |
| Previous page button | Button | Disabled on page 0 |
| "current / total" page indicator | Text | Pagination visible |
| Next page button | Button | Disabled on last page |

---

### SpotlightTour (`components/SpotlightTour.tsx`)
| Element | Type | Condition |
|---------|------|-----------|
| Full-screen overlay (click → skip) | Overlay | Tour active |
| Spotlight hole (pulsing ring highlight) | Visual | Target element found |
| Tooltip card (animated, positioned near target) | Card | Step active |
| Progress bar (fill width by step %) | Bar | Always in tooltip |
| Step title | Bold text | Always in tooltip |
| Step description | Body text | Always in tooltip |
| Step counter "{current} / {total}" | Text | Always in tooltip |
| "Skip" button | Button | Always in tooltip |
| "Back" button (bordered) | Button | `currentStep > 0` |
| "Next" button (primary) | Button | Not last step |
| "Finish" button (primary) | Button | Last step |
| Keyboard: Escape → skip, ArrowRight/Enter → next, ArrowLeft → back | Keyboard shortcuts | Tour active |

---

### WelcomeGuide (`components/WelcomeGuide.tsx`)
| Element | Type | Condition |
|---------|------|-----------|
| Full-screen backdrop (blur) | Overlay | Guide active |
| Centered modal card (bordered, shadow, max-w-md) | Card | Guide active |
| Slide icon (SVG in tinted rounded square) | Icon | Always (per slide) |
| Slide 0: "{userName}!" title (replaces brand name) | Heading | First slide |
| Slide 0: "Single Solution Sync" brand line | Small text (primary) | First slide only |
| Slide 1: "Your Dashboard" title + description | Heading + text | Second slide |
| Slide 2: "Manage Your Team" title + description | Heading + text | Third slide |
| Slide 3: "Automatic Attendance" title + description | Heading + text | Fourth slide |
| Pagination dots (×4, one per slide) | Buttons | Always |
| Active dot: wider (24px), primary color | Visual | Current slide |
| Inactive dots: narrow (6px), gray | Visual | Other slides |
| "Skip tour" button | Button | Always (footer left) |
| "Back" button (bordered) | Button | `current > 0` |
| "Next" button (primary) | Button | Not last slide |
| "Get Started" button (primary) | Button | Last slide |

---

### ProcessingOverlay (`components/ProcessingOverlay.tsx`)
| Element | Type | Condition |
|---------|------|-----------|
| Full-screen backdrop (dim + blur) via Portal | Overlay | `visible` |
| Inner panel (rounded, solid bg, shadow) | Card | `visible` |
| Loading dots (×4 pulsing circles) | Animated dots | `visible` |
| Message text (default "Processing...") | Text | `visible` |

---

### EmployeeForm (`employees/EmployeeForm.tsx`)

#### Access Denied State
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Access Restricted" title | Text | — | `!employees_create` (new) or `!employees_edit` (edit) |
| Explanation text | Text | — | Same |

#### Loading Skeleton
| Element | Type | Condition |
|---------|------|-----------|
| Header skeleton: icon box shimmer + two text bars + two button shimmers | Skeleton | `loading` |
| Personal card skeleton: label + avatar + lines + pill shimmers + field shimmers | Skeleton | `loading` |
| Assignment card skeleton: label + lines | Skeleton | `loading` |
| Schedule card skeleton: weekday chips + input shimmers | Skeleton | `loading` |

#### Header
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| Back button (chevron-left icon → `/organization`) | Icon button | — | Always |
| "Invite Employee" / "Edit Employee" title | Heading | — | Create vs edit |
| Subtitle (invite copy, hidden on small) | Text | — | `sm:block` |
| "Cancel" button → `/organization` | Button | — | `sm:inline-flex` |
| Submit: "Invite" / "Update" / "Saving..." | Primary button | — | Desktop header |

#### Personal Information Card
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Personal Information" section title | Heading | — | Always |
| Full Name input (person icon prefix, required) | Text input | — | Always |
| Email input (envelope icon prefix, required) | Email input | — | Create mode (`!isEdit`) |
| "Username: @{derivedUsername}" | Info text | — | `derivedUsername` non-empty |
| Password input (PasswordInput component) | Password input | — | Edit mode only |
| Password strength bars (×5: Weak→Excellent) | PasswordStrength | — | Edit + password non-empty |

#### Assignment Card
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Assignment" section title | Heading | — | Always |
| Department label + description | Text | — | Edit mode |
| Department toggle chips (one per dept) | Toggle buttons | — | Edit + departments exist |
| "Manage multiple departments" / "Use single" link | Text button | — | Edit mode |
| Info callout ("drag from node to department") | Text (grouped bg) | — | Create mode |

#### Weekly Schedule Card
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Weekly Schedule" heading + helper text | Text | — | Always |
| "Copy Mon → All" button | Button | — | Always |
| Desktop table: Day / Working / Start / End / Break headers | Table headers | — | `sm:block` |
| Per weekday (×7): day label | Text | — | Always |
| Per weekday (×7): working toggle | `ToggleSwitch` | — | Always |
| Per weekday (×7): start time input | Time input | — | Disabled + faded when day off |
| Per weekday (×7): end time input | Time input | — | Same |
| Per weekday (×7): break minutes input | Number input | — | Same |
| Mobile per-day cards (same controls, stacked) | Cards | — | `sm:hidden` |
| Shift Type label + dropdown (Full Time/Part Time/Contract) | Select | — | Always |
| Grace Minutes label + input + helper text | Number input | — | Always |
| Base Salary label + input + helper text | Number input | `payroll_manageSalary` | When allowed |

#### Salary History (Edit Only)
| Element | Type | Permission | Condition |
|---------|------|-----------|-----------|
| "Salary History" heading | Text | `payroll_manageSalary` | Edit + history exists |
| Per entry: glyph circle (↑/↓/→) + amount + % change + date | Row | Same | Per history entry |

#### Mobile Footer
| Element | Type | Condition |
|---------|------|-----------|
| Submit button (full width): "Invite Employee" / "Update" / "Saving..." | Primary button | `sm:hidden` |
| "Cancel" button (full width) | Button | `sm:hidden` |

---

## 3. Complete Privilege System (Verified Against Codebase)

> Cross-referenced against `lib/permissions.shared.ts` (`IPermissions` interface) and every `hasPermission`/`canPerm` call in the codebase.

### 3.1 Actual Interface: All 54 Defined Privileges

Source: `lib/permissions.shared.ts`

| # | Key | Module | Actively Used in Code? | Where Used |
|---|-----|--------|:---------------------:|------------|
| 1 | `employees_view` | Employees | ✅ | Employee list, detail, dropdown, resolve, ScopeStrip, org chart, memberships |
| 2 | `employees_viewDetail` | Employees | ❌ UNUSED | Defined but never checked anywhere in client or API |
| 3 | `employees_create` | Employees | ✅ | "Add Employee" buttons, employee form, `/api/employees` POST |
| 4 | `employees_edit` | Employees | ✅ | Edit buttons, edit form, `/api/employees/[id]` PUT, employee detail "Edit profile" |
| 5 | `employees_delete` | Employees | ✅ | Delete/deactivate buttons, batch deactivate, checkboxes, `/api/employees/[id]` DELETE |
| 6 | `employees_toggleStatus` | Employees | ✅ | Active/Inactive toggle on cards, `/api/employees/[id]` PUT (isActive) |
| 7 | `employees_resendInvite` | Employees | ✅ | "Invite" + copy link buttons, `/api/employees/[id]/resend-invite` POST |
| 8 | `members_addToDepartment` | Members | ✅ | Org chart drag-to-dept, `/api/memberships` POST |
| 9 | `members_removeFromDepartment` | Members | ✅ | Org chart remove, `/api/memberships/[id]` DELETE |
| 10 | `members_assignDesignation` | Members | ✅ | Org chart designation selector prop |
| 11 | `members_customizePermissions` | Members | ✅ | Org chart permissions editor, `/api/memberships/[id]` PUT |
| 12 | `members_setReportingChain` | Members | ❌ UNUSED | Defined but never checked — reporting chains use `organization_manageLinks` instead |
| 13 | `organization_view` | Organization | ✅ | Org page access gate, dock nav link, `/api/flow-layout` GET, `/api/organization/scope` GET |
| 14 | `organization_manageLinks` | Organization | ✅ | Org flow tree editing, `/api/flow-layout` PUT, `/api/hierarchy-sync` POST |
| 15 | `departments_view` | Departments | ✅ | Department list, ScopeStrip, `/api/departments` GET |
| 16 | `departments_create` | Departments | ✅ | "Add Department" button, quick-add form, `/api/departments` POST |
| 17 | `departments_edit` | Departments | ✅ | Edit mode on cards, `/api/departments/[id]` PUT |
| 18 | `departments_delete` | Departments | ✅ | Delete button, `/api/departments/[id]` DELETE |
| 19 | `tasks_view` | Tasks | ✅ | Tasks page, Workspace board, Dashboard checklist, Employee detail, `/api/tasks` GET |
| 20 | `tasks_create` | Tasks | ✅ | "+ Task" buttons, empty state CTA, `/api/tasks` POST |
| 21 | `tasks_edit` | Tasks | ✅ | Edit buttons, status cycle (non-assignee), `/api/tasks/[id]` PUT |
| 22 | `tasks_delete` | Tasks | ✅ | Delete buttons, `/api/tasks/[id]` DELETE |
| 23 | `tasks_reassign` | Tasks | ✅ | "Assign To" dropdown, `/api/tasks/[id]` PUT (reassign) |
| 24 | `campaigns_view` | Campaigns | ✅ | Campaigns page, Workspace, Dashboard, Employee detail, `/api/campaigns` GET |
| 25 | `campaigns_create` | Campaigns | ✅ | "+ Campaign" button (via `canAny` for manage check) |
| 26 | `campaigns_edit` | Campaigns | ✅ | Edit buttons, quick status, active toggle, `/api/campaigns/[id]` PUT |
| 27 | `campaigns_delete` | Campaigns | ✅ | Delete buttons, `/api/campaigns/[id]` DELETE |
| 28 | `campaigns_tagEntities` | Campaigns | ✅ | Tag Departments/Employees chips, `/api/campaigns` POST/PUT (tags) |
| 29 | `updates_view` | Updates | ❌ UNUSED | Feature not built — no UI, no API route |
| 30 | `updates_create` | Updates | ❌ UNUSED | Feature not built |
| 31 | `updates_edit` | Updates | ❌ UNUSED | Feature not built |
| 32 | `updates_delete` | Updates | ❌ UNUSED | Feature not built |
| 33 | `attendance_viewTeam` | Attendance | ✅ | Dashboard team view, Attendance page team mode, Employee cards, session API, trend API, presence API, location flags, ScopeStrip |
| 34 | `attendance_viewDetail` | Attendance | ✅ | Employee card activity strip + location alert, Org chart preview detail props |
| 35 | `attendance_edit` | Attendance | ✅ | `/api/location-flags` PATCH (acknowledge flags) — no client button wired up |
| 36 | `attendance_overridePast` | Attendance | ❌ UNUSED | Defined but never checked — no override past attendance feature built |
| 37 | `attendance_export` | Attendance | ❌ UNUSED | Defined but never checked — no export feature built |
| 38 | `leaves_viewTeam` | Leaves | ✅ | Leaves modal employee picker, Attendance page leave overlay, `/api/leaves` GET, `/api/leaves/balance` GET |
| 39 | `leaves_approve` | Leaves | ✅ | `/api/leaves` POST (on behalf), `/api/leaves/[id]` PUT (approve/reject), past-date gate |
| 40 | `leaves_editPast` | Leaves | ✅ | `/api/leaves/[id]` DELETE |
| 41 | `leaves_manageBulk` | Leaves | ✅ | `/api/leaves/balance` PUT |
| 42 | `payroll_viewTeam` | Payroll | ✅ | Payroll modal employee picker, `/api/payroll/payslips` GET, `/api/payroll/estimate` GET, `/api/payroll/config` GET |
| 43 | `payroll_manageSalary` | Payroll | ✅ | Employee form salary field, Org chart salary field, `/api/employees` POST/PUT (salary), `/api/payroll/config` PUT |
| 44 | `payroll_generateSlips` | Payroll | ✅ | `/api/payroll/generate` POST |
| 45 | `payroll_finalizeSlips` | Payroll | ✅ | `/api/payroll/payslips` PUT |
| 46 | `payroll_export` | Payroll | ❌ UNUSED | Defined but never checked — no server-side export feature built |
| 47 | `ping_send` | Communication | ✅ | Dashboard EmployeeCard ping button, `/api/ping` POST |
| 48 | `activityLogs_view` | Communication | ✅ | Workspace sidebar, DashboardShell notifications, Employee detail activity tab, `/api/activity-logs` GET |
| 49 | `designations_view` | System | ✅ | Organization page designations panel, `/api/designations` GET, `/api/designations/[id]` GET |
| 50 | `designations_manage` | System | ✅ | Designations panel create/edit/delete, `/api/designations` POST, `/api/designations/[id]` PUT/DELETE |
| 51 | `holidays_view` | System | ❌ UNUSED | Defined but never checked — holidays GET is open to all authenticated users |
| 52 | `holidays_manage` | System | ✅ | Holiday modal add/toggle/delete, `/api/payroll/holidays` POST/PUT/DELETE |
| 53 | `settings_view` | System | ✅ | `/api/settings` GET |
| 54 | `settings_manage` | System | ✅ | Settings page System/Office/Test Email cards, `/api/settings` PUT, `canManageSettings` helper |

---

### 3.2 Analysis Summary

**54 total** defined in `IPermissions`.
**43 actively used** in code.
**11 defined but unused:**

| Key | Status | Recommendation |
|-----|--------|---------------|
| `employees_viewDetail` | Never checked | **Wire up** — should gate employee detail page access (currently `employees_view` covers both list and detail) |
| `members_setReportingChain` | Never checked | **Remove or wire up** — org links use `organization_manageLinks` instead |
| `updates_view` | Feature not built | **Keep** — reserved for future Updates/Announcements module |
| `updates_create` | Feature not built | **Keep** — reserved for future |
| `updates_edit` | Feature not built | **Keep** — reserved for future |
| `updates_delete` | Feature not built | **Keep** — reserved for future |
| `attendance_overridePast` | Never checked | **Wire up** — should gate manual corrections to past attendance records |
| `attendance_export` | Never checked | **Wire up** when export feature is built |
| `payroll_export` | Never checked | **Wire up** when server-side export is built (client CSV export exists but no perm check) |
| `holidays_view` | Never checked | **Wire up or remove** — holidays GET is currently open to all; this key could gate the holiday list in the modal if needed, but viewing holidays is reasonable for all users |
| `settings_view` | Used only in API | **OK** — used in `/api/settings` GET but not on client side (client uses `settings_manage` for the whole section) |

---

### 3.3 Privilege-to-Feature Mapping (Only Active Ones)

#### Employees (7 keys)
| Key | Client UI | API |
|-----|-----------|-----|
| `employees_view` | Employee list page, detail page, ScopeStrip (`canAny`), org chart | `/api/employees` GET, `/api/employees/[id]` GET, `/api/employees/dropdown`, `/api/employees/resolve`, `/api/memberships/[id]` GET |
| `employees_create` | "Add Employee" buttons (employees + org page), `/employee/new` form | `/api/employees` POST |
| `employees_edit` | Edit buttons, "Edit profile" link, edit form | `/api/employees/[id]` PUT |
| `employees_delete` | Delete/deactivate buttons, batch bar, checkboxes, "Select all" | `/api/employees/[id]` DELETE |
| `employees_toggleStatus` | Active/Inactive toggle | `/api/employees/[id]` PUT (`isActive`) |
| `employees_resendInvite` | "Invite" + copy link buttons | `/api/employees/[id]/resend-invite` POST |
| `employees_viewDetail` | **NOT WIRED** | **NOT WIRED** |

#### Members (5 keys, 1 unused)
| Key | Client UI | API |
|-----|-----------|-----|
| `members_addToDepartment` | Org chart drag-to-dept | `/api/memberships` POST |
| `members_removeFromDepartment` | Org chart remove | `/api/memberships/[id]` DELETE |
| `members_assignDesignation` | Org chart designation selector | (via membership PUT) |
| `members_customizePermissions` | Org chart permissions editor | `/api/memberships/[id]` PUT |
| `members_setReportingChain` | **NOT WIRED** | **NOT WIRED** |

#### Organization (2 keys)
| Key | Client UI | API |
|-----|-----------|-----|
| `organization_view` | Org page access, dock nav | `/api/flow-layout` GET, `/api/organization/scope` GET |
| `organization_manageLinks` | Org tree editing | `/api/flow-layout` PUT, `/api/hierarchy-sync` POST |

#### Departments (4 keys)
| Key | Client UI | API |
|-----|-----------|-----|
| `departments_view` | Department list, ScopeStrip | `/api/departments` GET |
| `departments_create` | "Add Department" button, quick-add | `/api/departments` POST |
| `departments_edit` | Edit mode on cards | `/api/departments/[id]` PUT |
| `departments_delete` | Delete button | `/api/departments/[id]` DELETE |

#### Tasks (5 keys)
| Key | Client UI | API |
|-----|-----------|-----|
| `tasks_view` | Tasks page, Workspace, Dashboard checklist, Employee detail | `/api/tasks` GET |
| `tasks_create` | "+ Task" buttons, empty state CTA | `/api/tasks` POST |
| `tasks_edit` | Edit buttons, status cycle | `/api/tasks/[id]` PUT |
| `tasks_delete` | Delete buttons | `/api/tasks/[id]` DELETE |
| `tasks_reassign` | "Assign To" dropdown | `/api/tasks/[id]` PUT (assignedTo) |

#### Campaigns (5 keys)
| Key | Client UI | API |
|-----|-----------|-----|
| `campaigns_view` | Campaigns page, Workspace, Dashboard, Employee detail | `/api/campaigns` GET |
| `campaigns_create` | "+ Campaign" buttons | `/api/campaigns` POST |
| `campaigns_edit` | Edit, quick status, active toggle | `/api/campaigns/[id]` PUT |
| `campaigns_delete` | Delete buttons | `/api/campaigns/[id]` DELETE |
| `campaigns_tagEntities` | Tag chips in modal | `/api/campaigns` POST/PUT (tags) |

#### Updates (4 keys — ALL UNUSED, feature not built)
| Key | Status |
|-----|--------|
| `updates_view` | Reserved |
| `updates_create` | Reserved |
| `updates_edit` | Reserved |
| `updates_delete` | Reserved |

#### Attendance (5 keys, 2 unused)
| Key | Client UI | API |
|-----|-----------|-----|
| `attendance_viewTeam` | Dashboard team view, Attendance page team mode, Employee cards status, ScopeStrip | `/api/attendance` team types, `/api/attendance/presence`, `/api/attendance/trend`, `/api/attendance/session` GET (others), `/api/location-flags` GET |
| `attendance_viewDetail` | Employee card activity strip + location alert | `/api/attendance/session` GET (detail) |
| `attendance_edit` | **No client button** (bug) | `/api/location-flags` PATCH |
| `attendance_overridePast` | **NOT WIRED** | **NOT WIRED** |
| `attendance_export` | **NOT WIRED** | **NOT WIRED** |

#### Leaves (4 keys)
| Key | Client UI | API |
|-----|-----------|-----|
| `leaves_viewTeam` | Leaves modal employee picker, attendance leave overlay | `/api/leaves` GET (others), `/api/leaves/balance` GET (others) |
| `leaves_approve` | — (no approve/reject button in UI) | `/api/leaves` POST (on behalf), `/api/leaves/[id]` PUT (approve/reject) |
| `leaves_editPast` | — | `/api/leaves/[id]` DELETE |
| `leaves_manageBulk` | — | `/api/leaves/balance` PUT |

#### Payroll (5 keys, 1 unused)
| Key | Client UI | API |
|-----|-----------|-----|
| `payroll_viewTeam` | Payroll modal employee picker | `/api/payroll/payslips` GET, `/api/payroll/estimate` GET, `/api/payroll/config` GET |
| `payroll_manageSalary` | Employee form salary field, Org chart salary field, Settings payroll config card | `/api/employees` POST/PUT (salary), `/api/payroll/config` PUT |
| `payroll_generateSlips` | — | `/api/payroll/generate` POST |
| `payroll_finalizeSlips` | — | `/api/payroll/payslips` PUT |
| `payroll_export` | **NOT WIRED** | **NOT WIRED** |

#### Communication (2 keys)
| Key | Client UI | API |
|-----|-----------|-----|
| `ping_send` | Dashboard EmployeeCard ping button | `/api/ping` POST |
| `activityLogs_view` | Workspace sidebar, Notification panel, Employee detail activity tab | `/api/activity-logs` GET |

#### System (6 keys, 1 unused)
| Key | Client UI | API |
|-----|-----------|-----|
| `designations_view` | Org page designations panel | `/api/designations` GET |
| `designations_manage` | Designations panel CRUD | `/api/designations` POST, `/api/designations/[id]` PUT/DELETE |
| `holidays_view` | **NOT WIRED** (all users can view) | **NOT WIRED** |
| `holidays_manage` | Holiday modal add/toggle/delete | `/api/payroll/holidays` POST/PUT/DELETE |
| `settings_view` | — (client uses `settings_manage`) | `/api/settings` GET |
| `settings_manage` | System/Office/Test Email cards | `/api/settings` PUT, `/api/test-email` GET |

---

### 3.4 Suggested Role Templates

| Privilege | Employee | Team Lead | Manager | HR Admin | SuperAdmin |
|-----------|:--------:|:---------:|:-------:|:--------:|:----------:|
| **Employees** | | | | | |
| `employees_view` | — | ✓ | ✓ | ✓ | ✓ |
| `employees_viewDetail` | — | — | ✓ | ✓ | ✓ |
| `employees_create` | — | — | — | ✓ | ✓ |
| `employees_edit` | — | — | — | ✓ | ✓ |
| `employees_delete` | — | — | — | ✓ | ✓ |
| `employees_toggleStatus` | — | — | — | ✓ | ✓ |
| `employees_resendInvite` | — | — | — | ✓ | ✓ |
| **Members** | | | | | |
| `members_addToDepartment` | — | — | — | ✓ | ✓ |
| `members_removeFromDepartment` | — | — | — | ✓ | ✓ |
| `members_assignDesignation` | — | — | — | ✓ | ✓ |
| `members_customizePermissions` | — | — | — | — | ✓ |
| `members_setReportingChain` | — | — | — | ✓ | ✓ |
| **Organization** | | | | | |
| `organization_view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `organization_manageLinks` | — | — | — | ✓ | ✓ |
| **Departments** | | | | | |
| `departments_view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `departments_create` | — | — | — | ✓ | ✓ |
| `departments_edit` | — | — | — | ✓ | ✓ |
| `departments_delete` | — | — | — | ✓ | ✓ |
| **Tasks** | | | | | |
| `tasks_view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `tasks_create` | — | ✓ | ✓ | ✓ | ✓ |
| `tasks_edit` | — | ✓ | ✓ | ✓ | ✓ |
| `tasks_delete` | — | — | ✓ | ✓ | ✓ |
| `tasks_reassign` | — | ✓ | ✓ | ✓ | ✓ |
| **Campaigns** | | | | | |
| `campaigns_view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `campaigns_create` | — | — | ✓ | ✓ | ✓ |
| `campaigns_edit` | — | — | ✓ | ✓ | ✓ |
| `campaigns_delete` | — | — | ✓ | ✓ | ✓ |
| `campaigns_tagEntities` | — | — | ✓ | ✓ | ✓ |
| **Updates** (future) | | | | | |
| `updates_view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `updates_create` | — | ✓ | ✓ | ✓ | ✓ |
| `updates_edit` | — | ✓ | ✓ | ✓ | ✓ |
| `updates_delete` | — | — | ✓ | ✓ | ✓ |
| **Attendance** | | | | | |
| `attendance_viewTeam` | — | ✓ | ✓ | ✓ | ✓ |
| `attendance_viewDetail` | — | — | ✓ | ✓ | ✓ |
| `attendance_edit` | — | — | ✓ | ✓ | ✓ |
| `attendance_overridePast` | — | — | — | ✓ | ✓ |
| `attendance_export` | — | — | ✓ | ✓ | ✓ |
| **Leaves** | | | | | |
| `leaves_viewTeam` | — | ✓ | ✓ | ✓ | ✓ |
| `leaves_approve` | — | — | ✓ | ✓ | ✓ |
| `leaves_editPast` | — | — | — | ✓ | ✓ |
| `leaves_manageBulk` | — | — | — | ✓ | ✓ |
| **Payroll** | | | | | |
| `payroll_viewTeam` | — | — | — | ✓ | ✓ |
| `payroll_manageSalary` | — | — | — | ✓ | ✓ |
| `payroll_generateSlips` | — | — | — | ✓ | ✓ |
| `payroll_finalizeSlips` | — | — | — | ✓ | ✓ |
| `payroll_export` | — | — | — | ✓ | ✓ |
| **Communication** | | | | | |
| `ping_send` | — | ✓ | ✓ | ✓ | ✓ |
| `activityLogs_view` | — | ✓ | ✓ | ✓ | ✓ |
| **System** | | | | | |
| `designations_view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `designations_manage` | — | — | — | ✓ | ✓ |
| `holidays_view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `holidays_manage` | — | — | — | ✓ | ✓ |
| `settings_view` | — | — | — | ✓ | ✓ |
| `settings_manage` | — | — | — | — | ✓ |

---

### 3.5 Things That Need No Privilege (Available to All Authenticated Users)

| Feature | Detail |
|---------|--------|
| Own dashboard | Self overview, timeline, weekly strip, monthly summary |
| Own attendance | Calendar, daily records, monthly stats, session detail |
| Own profile | View and edit name, phone, avatar, email, password |
| Own preferences | Theme, coordinates toggle |
| Apply leave for self | Submit leave request (non-SuperAdmin) |
| Own leave balance | View remaining/used leaves |
| Own payroll estimate | View own salary estimate and payslips |
| Own tasks | View tasks assigned to self, change own task status |
| Own campaigns | View campaigns where tagged |
| Own activity feed | Narrow feed of logs targeting self |
| View holidays | Read-only holiday calendar (despite `holidays_view` existing, it's not enforced) |
| Receive pings | View ping inbox, mark read |
| Guides & tours | Welcome guide, spotlight tours |
| Install app (PWA) | Install prompt |

### 3.6 SuperAdmin Special Rules

| Rule | Detail |
|------|--------|
| All privileges auto-granted | `hasPermission` returns `true` for any key when `isSuperAdmin` |
| Exempt from attendance tracking | No session tracking, attendance POST/PATCH blocked, self-view returns empty |
| Exempt from leave tracking | Cannot apply leave for self, leave/payroll tabs hidden on own detail |
| Exempt from payroll tracking | Own payroll estimate returns exempt status, not included in generation |
| Cannot be edited by non-SA | Only another SuperAdmin can edit a SuperAdmin employee |
| Cannot be deactivated | Delete/deactivate blocked for SA targets |

---

### 3.7 Privilege Overlap & Combination Analysis

Below are all cases where privileges overlap, duplicate each other, or where a single key is doing double-duty.

#### GROUP A: Dead Duplicates (one key makes the other redundant)

| # | Key A (active) | Key B (dead) | Why They Overlap | Recommendation |
|---|---------------|-------------|-----------------|----------------|
| 1 | `employees_view` | `employees_viewDetail` | `employees_view` gates **both** the employee list AND the employee detail page (`/api/employees/[id]`, `/employee/[slug]`). `employees_viewDetail` was meant to separately gate viewing full profiles, but it is **never checked anywhere**. | **Merge**: Remove `employees_viewDetail` entirely — `employees_view` already covers it. OR **Separate**: Wire up `employees_viewDetail` to gate detail pages while `employees_view` only gates the list. |
| 2 | `organization_manageLinks` | `members_setReportingChain` | Both intend to control "who reports to whom." Only `organization_manageLinks` is checked (flow-layout PUT, hierarchy-sync POST). `members_setReportingChain` is **never checked anywhere**. They do the same thing. | **Remove `members_setReportingChain`** — org chart link editing already covers reporting chain management. |
| 3 | *(open to all)* | `holidays_view` | Holiday GET endpoints have **no permission check** — all authenticated users see holidays. `holidays_view` exists in the interface but is **never enforced**. | **Remove `holidays_view`** — viewing holidays is always open and should stay that way. OR wire it up if you want to restrict holiday calendar visibility. |

#### GROUP B: View/Manage Pairs Where View Is Redundant

| # | View Key | Manage Key | Issue | Recommendation |
|---|---------|-----------|-------|----------------|
| 4 | `settings_view` | `settings_manage` | API: `settings_view` gates GET at `/api/settings`. Client: the entire settings page only checks `settings_manage` (line 90). So a user with `settings_view` but not `settings_manage` can fetch data via API but the page won't render for them. The view key is effectively useless on the client. | **Merge into `settings_manage`** — anyone who can manage should automatically see. Remove `settings_view` or make the client use it for the read-only view of settings. |

> **Note**: The `designations_view`/`designations_manage` and `holidays_view`/`holidays_manage` pairs do NOT have this problem — `designations_view` properly gates the GET endpoint and client panel visibility separately from manage.

#### GROUP C: Single Key Doing Double-Duty (Overloaded)

| # | Key | Action 1 | Action 2 | Issue | Recommendation |
|---|-----|---------|---------|-------|----------------|
| 5 | `leaves_approve` | **Apply leave on behalf of another user** (`/api/leaves` POST with `userId ≠ self`) | **Approve/reject leave requests** (`/api/leaves/[id]` PUT status → approved/rejected) | Two very different actions: submitting for someone vs. approving their request. A team lead might need to apply for a subordinate without having power to approve/reject all leaves. | **Split**: Keep `leaves_approve` for approve/reject. Add `leaves_applyForTeam` for applying on behalf. |
| 6 | `leaves_approve` | **Apply leave on behalf** (same as above) | **Past-dated leave submission** (`/api/leaves` POST with `past: true`) | Submitting a past-dated leave correction also requires `leaves_approve`. This means only approvers can backfill leave records. | Could be folded into `leaves_editPast` instead, since it's a historical correction. |
| 7 | `payroll_manageSalary` | **Set employee salary** (employee form, `/api/employees` POST/PUT salary field) | **Edit payroll config** (late tiers, penalties, pay day — `/api/payroll/config` PUT) | Salary management and payroll system configuration are different concerns. An HR person setting individual salaries shouldn't necessarily need to configure penalty structures. | **Split**: Keep `payroll_manageSalary` for salary values. Add `payroll_manageConfig` for system-level payroll rules. |

#### GROUP D: Hierarchical Sub-Gates (Not Duplicates, But Related)

| # | Parent Key | Child Key | Relationship |
|---|-----------|----------|-------------|
| 8 | `tasks_edit` | `tasks_reassign` | `tasks_edit` gates the entire PUT endpoint. `tasks_reassign` is an **additional** check within the same PUT — if changing `assignedTo`, you need BOTH `tasks_edit` AND `tasks_reassign`. Not a duplicate; `tasks_reassign` is a finer-grained sub-permission. | 
| 9 | `employees_delete` | `employees_toggleStatus` | `employees_delete` gates the DELETE endpoint (permanent removal). `employees_toggleStatus` gates the `isActive` toggle (soft disable/enable). Different operations, but both control "taking away access." Not duplicates — delete is destructive, toggle is reversible. |
| 10 | `attendance_viewTeam` | `attendance_viewDetail` | `attendance_viewTeam` = see team cards and aggregate stats. `attendance_viewDetail` = see session-level activity strips on those cards. Detail is a deeper layer within team view. Not duplicate, but `viewDetail` only matters if you already have `viewTeam`. |

#### GROUP E: Export Keys (All Three Unused, Potentially Mergeable)

| # | Key | Status | Overlap Concern |
|---|-----|--------|----------------|
| 11 | `attendance_export` | Unused | All three are "download data as CSV/PDF" for different modules. |
| 12 | `payroll_export` | Unused | They could be **merged into a single `export_data`** key, or kept separate per module for fine-grained control. |
| 13 | `attendance_overridePast` | Unused | Not an export key, but related — meant to gate editing past attendance records. Could overlap with `attendance_edit` if that key is expanded. |

---

#### Summary: Recommended Consolidations

If you want to **reduce** the 54 keys to eliminate dead weight:

| Action | Keys Affected | Result |
|--------|--------------|--------|
| Remove `employees_viewDetail` | 54 → 53 | `employees_view` covers it |
| Remove `members_setReportingChain` | 53 → 52 | `organization_manageLinks` covers it |
| Remove `holidays_view` | 52 → 51 | Never enforced, holidays are open |
| Merge `settings_view` into `settings_manage` | 51 → 50 | Client only uses manage anyway |

**Conservative total: 50 keys** (remove 4 dead ones)

If you also want to **split** the overloaded keys:

| Action | Keys Affected | Result |
|--------|--------------|--------|
| Split `leaves_approve` → add `leaves_applyForTeam` | 50 → 51 | Separate apply-for-others from approve/reject |
| Split `payroll_manageSalary` → add `payroll_manageConfig` | 51 → 52 | Separate salary editing from config editing |

**Optimized total: 52 keys** (remove 4 dead, add 2 new splits)

---

## 4. API Routes & Permission Checks

### Attendance APIs
| Route | Methods | Auth Check | Self Access | Subordinate Access | Notes |
|-------|---------|-----------|------------|-------------------|-------|
| `/api/attendance` | GET | `getVerifiedSession`; team types: `canTeam` (SA or `attendance_viewTeam`); individual: self or subordinate allowed | Yes (userId defaults to self) | Team types: subordinates. Individual: subordinates allowed without `attendance_viewTeam` | — |
| `/api/attendance/presence` | GET | `getVerifiedSession`; team perm OR subordinates > 0 | Always included | Included if team perm OR has subordinates | Wider than other attendance APIs |
| `/api/attendance/trend` | GET | `getVerifiedSession`; requires `attendance_viewTeam` for subordinates | Yes | Only with `attendance_viewTeam` | **Inconsistent with presence** |
| `/api/attendance/session` | GET/POST/PATCH | GET: SA self → empty; others need `attendance_viewTeam` + subordinate. POST/PATCH: own session | GET self (non-SA): full | GET: subordinates + team perm | SA self intentionally empty |
| `/api/attendance/presence/manager` | GET | `getVerifiedSession` only | N/A | N/A | Any user can read manager presence |

### Leave APIs
| Route | Methods | Auth Check | Self Access | Subordinate Access | Notes |
|-------|---------|-----------|------------|-------------------|-------|
| `/api/leaves` | GET/POST | GET: `leaves_viewTeam` for others. POST: `leaves_approve` for others + subordinate | Yes | GET: with team perm. POST: with approve + hierarchy | — |
| `/api/leaves/balance` | GET/PUT | GET: `leaves_viewTeam` + subordinate. PUT: `leaves_manageBulk` + subordinate | Yes | With respective perms | — |
| `/api/leaves/[id]` | GET/PUT/DELETE | Hierarchy check (SA/self/subordinate). Approve: `leaves_approve`. Delete: `leaves_editPast` | Yes (GET, limited PUT) | Hierarchy without `leaves_viewTeam` | **Wider than GET list** |

### Payroll APIs
| Route | Methods | Auth Check | Self Access | Subordinate Access | Notes |
|-------|---------|-----------|------------|-------------------|-------|
| `/api/payroll/payslips` | GET/PUT | GET: `payroll_viewTeam` for team. PUT: `payroll_finalizeSlips` + subordinate | GET: own always | PUT: subordinates only | **Can't finalize own** |
| `/api/payroll/estimate` | GET | Self or `payroll_viewTeam` + subordinate. SA self → exempt | Yes | With team perm | — |
| `/api/payroll/generate` | POST | `payroll_generateSlips` | Non-SA: never includes self | Subordinates only | **Self excluded** |
| `/api/payroll/config` | GET/PUT | GET: `payroll_viewTeam`. PUT: `payroll_manageSalary` | GET blocked without team perm | N/A (global) | — |
| `/api/payroll/holidays` | GET/POST/PUT/DELETE | GET: any user. Mutations: `holidays_manage` | N/A (global) | N/A | GET open to all |

### Employee APIs
| Route | Methods | Auth Check | Self Access | Subordinate Access | Notes |
|-------|---------|-----------|------------|-------------------|-------|
| `/api/employees` | GET/POST | GET: `employees_view` → self+subs; else self only. POST: `employees_create` | GET: always self | With `employees_view` | — |
| `/api/employees/[id]` | GET/PUT/DELETE | GET: `employees_view` + subordinate. PUT: not self + `employees_edit` + subordinate. DELETE: `employees_delete` + subordinate | GET self without perm. PUT blocked (use profile) | Standard hierarchy | — |
| `/api/employees/dropdown` | GET | Same as employees list | Yes | With `employees_view` | — |
| `/api/employees/resolve` | GET | `employees_view` + subordinate for others | Self allowed | Subordinates | — |
| `/api/employees/[id]/resend-invite` | POST | `employees_resendInvite` + subordinate | Cannot target self | Subordinates | — |
| `/api/memberships` | GET/POST | GET: no perm key — filter self+subordinates. POST: `members_addToDepartment` + subordinate | GET own | GET/POST subordinates | **GET wider than expected** |
| `/api/memberships/[id]` | GET/PUT/DELETE | Mixed: `employees_view` for GET dept, `members_customizePermissions`/`removeFromDepartment` for PUT/DELETE | GET self | Hierarchy | — |

### Task & Campaign APIs
| Route | Methods | Auth Check | Self Access | Subordinate Access | Notes |
|-------|---------|-----------|------------|-------------------|-------|
| `/api/tasks` | GET/POST | GET: `tasks_view` → assigned self+subs; else own. POST: `canManageTasks` + assignee must be subordinate | **POST can't assign to self** | Assign subordinates | — |
| `/api/tasks/[id]` | PUT/DELETE | PUT: owner or `tasks_edit` + subordinate. DELETE: `tasks_delete` + subordinate | Owner can PUT limited fields. **DELETE blocked for self-assigned** | With hierarchy | — |
| `/api/campaigns` | GET/POST | GET: `campaigns_view` → scope; else tagged. POST: `canManageCampaigns` | Tagged scope | Via campaign scope | — |
| `/api/campaigns/[id]` | GET/PUT/DELETE | Scope filter + respective perms | Same | Same | — |

### Other APIs
| Route | Methods | Auth Check | Self Access | Subordinate Access | Notes |
|-------|---------|-----------|------------|-------------------|-------|
| `/api/departments` | GET/POST | GET: hierarchy dept filter. POST: `canManageDepartments` | N/A | N/A | — |
| `/api/departments/[id]` | PUT/DELETE | `departments_edit`/`delete` + hierarchy scope | N/A | N/A | — |
| `/api/designations` | GET/POST | `designations_view`/`manage` | N/A | N/A | — |
| `/api/designations/[id]` | GET/PUT/DELETE | Same + system designation guard | N/A | N/A | — |
| `/api/flow-layout` | GET/PUT | `organization_view` / `organization_manageLinks` | N/A | N/A | — |
| `/api/hierarchy-sync` | POST | `organization_manageLinks` | N/A | N/A | — |
| `/api/organization/scope` | GET | Soft-fail (empty arrays without `organization_view`) | N/A | `getSubordinateUserIds` when perm | — |
| `/api/location-flags` | GET/PATCH | GET: SA/team/self. PATCH: `attendance_edit` + subordinate | GET own | PATCH subordinates only | **Can't acknowledge own** |
| `/api/activity-logs` | GET | SA: all. `activityLogs_view`: subs+depts+own. Else: own email/target only | Yes (narrow) | With perm | — |
| `/api/settings` | GET/PUT | `settings_view` / `settings_manage` | N/A | N/A | — |
| `/api/ping` | GET/POST/PATCH | GET/PATCH: inbox for self. POST: `ping_send` + subordinate | Cannot ping self | POST subordinates only | — |
| `/api/profile` | GET/PUT | `getVerifiedSession` only | Own only | No | — |
| `/api/profile/password` | PUT | `getVerifiedSession` only | Own only | No | — |
| `/api/me/permissions` | GET | `getVerifiedSession` | Own metadata | N/A | — |
| `/api/guide` | GET/PATCH | `getVerifiedSession` | Own tours | No | — |
| `/api/user/last-seen` | GET/PUT | `getVerifiedSession` | Own only | No | — |
| `/api/test-email` | GET | `isSuperAdmin` only | N/A | N/A | — |
| `/api/auth/forgot-password` | POST | Unauthenticated | N/A | N/A | Rate limited |
| `/api/auth/reset-password` | POST | Unauthenticated (token) | N/A | N/A | — |

---

## 5. Bugs & Inconsistencies

### Active Bugs

| # | Bug | Severity | Location | Detail |
|---|-----|----------|----------|--------|
| 1 | **Attendance trend excludes subordinates** | Medium | `/api/attendance/trend` | Requires `attendance_viewTeam` to include subordinates, but `/api/attendance/presence` allows subordinates even without it. Inconsistent — a manager who sees employees on the dashboard presence view gets only their own trend line. |
| 2 | **Tasks: can't self-assign** | Medium | `/api/tasks` POST | `getSubordinateUserIds` excludes self. A manager with `tasks_create` cannot assign a task to themselves — only to subordinates. |
| 3 | **Tasks: can't delete own assigned task** | Medium | `/api/tasks/[id]` DELETE | A user with `tasks_delete` cannot delete a task assigned to themselves because the subordinate check excludes self. |
| 4 | **Location flags: can't acknowledge own flag** | Low | `/api/location-flags` PATCH | A user with `attendance_edit` cannot PATCH their own location flag because self is not in `getSubordinateUserIds`. |
| 5 | **Leaves GET list vs GET by ID mismatch** | Low | `/api/leaves` vs `/api/leaves/[id]` | GET list requires `leaves_viewTeam` to see a subordinate's leaves, but GET by ID only checks hierarchy (no `leaves_viewTeam` needed). Policy inconsistency / potential info leak. |
| 6 | **Payslips: can't finalize own** | Low | `/api/payroll/payslips` PUT | Non-SuperAdmin with `payroll_finalizeSlips` cannot finalize their own payslip (self not in subordinateIds). |
| 7 | **Payroll generate excludes self** | Low | `/api/payroll/generate` POST | Non-SuperAdmin batch generation never includes themselves in the employee set. |
| 8 | **Memberships GET is wider than intended** | Low | `/api/memberships` GET | No `employees_view` check — any authenticated user can list membership rows for self + entire subtree. |
| 9 | **Manager presence readable by anyone** | Info | `/api/attendance/presence/manager` GET | No `attendance_viewTeam` check — any logged-in user with an org chart edge can read their manager's live presence. May be intentional. |

### Fixed in This Session

| # | Fix | Files Changed |
|---|-----|---------------|
| A | Dashboard presence: subordinates included without `attendance_viewTeam` | `app/api/attendance/presence/route.ts` |
| B | Attendance page: removed `hasSubordinates` from `hasTeamAccess` (Faiq sees only own) | `attendance/page.tsx`, `app/api/attendance/route.ts` |
| C | Duplicate employee picker in leave modal removed | `LeavesModal.tsx` |
| D | Individual subordinate access: managers can view subordinate detail without `attendance_viewTeam` | `app/api/attendance/route.ts` |
| E | Leaves & Payroll modals: sidebar/detail split layout with department grouping, search, and employee cards | `LeavesModal.tsx`, `PayrollModal.tsx` |
| F | Dropdown API: enriched with department info via Membership lookup | `app/api/employees/dropdown/route.ts` |
| G | Payroll modal: added multiple export formats (CSV, JSON, Print/PDF, Copy to Clipboard) | `PayrollModal.tsx` |
