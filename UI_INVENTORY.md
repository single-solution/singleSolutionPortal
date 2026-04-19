# UI & Action Inventory — Single Solution Portal

> Complete catalog of every button, toggle, form, card, and visual element.
> Each action lists: what it does, which API it calls, and what permission gates it.
> Use this for privilege mapping, QA, and feature planning.

---

## Permission Keys Reference

56 keys in `lib/permissions.shared.ts` → `IPermissions`. SuperAdmin bypasses all.

| Category | Keys |
|----------|------|
| **Employees** | `employees_view`, `employees_viewDetail`, `employees_create`, `employees_edit`, `employees_delete`, `employees_toggleStatus`, `employees_resendInvite` |
| **Memberships** | `members_addToDepartment`, `members_removeFromDepartment`, `members_assignDesignation`, `members_customizePermissions`, `members_setReportingChain` |
| **Organization** | `organization_view`, `organization_manageLinks`, `designations_view`, `designations_manage` |
| **Departments** | `departments_view`, `departments_create`, `departments_edit`, `departments_delete` |
| **Tasks** | `tasks_view`, `tasks_create`, `tasks_edit`, `tasks_delete`, `tasks_reassign` |
| **Campaigns** | `campaigns_view`, `campaigns_create`, `campaigns_edit`, `campaigns_delete`, `campaigns_tagEntities` |
| **Updates** | `updates_view`, `updates_create`, `updates_edit`, `updates_delete` |
| **Attendance** | `attendance_viewTeam`, `attendance_viewDetail`, `attendance_edit`, `attendance_overridePast`, `attendance_export` |
| **Leaves** | `leaves_viewTeam`, `leaves_approve`, `leaves_editPast`, `leaves_manageBulk` |
| **Payroll** | `payroll_viewTeam`, `payroll_manageSalary`, `payroll_generateSlips`, `payroll_finalizeSlips`, `payroll_export` |
| **Communication** | `ping_send`, `activityLogs_view` |
| **System** | `designations_view`, `designations_manage`, `holidays_view`, `holidays_manage`, `settings_view`, `settings_manage` |

---

## 1. Global Shell — `AppLayout.tsx`

### Navigation
| Element | Action | Permission |
|---------|--------|------------|
| **Overview** link | Navigate `/` | All authenticated |
| **Workspace** link | Navigate `/workspace` | All authenticated |
| **Organization** link | Navigate `/organization` | `organization_view` |
| **Insights Desk** link | Navigate `/insights-desk` | All authenticated |
| **Settings** link | Navigate `/settings` | All authenticated |
| Dock link hover | Prefetch route APIs | None |

### Header Actions
| Button | Action | API | Permission |
|--------|--------|-----|------------|
| **Light / Dark / System** | Set theme | `localStorage` only | None |
| **Pings** bell | Open pings panel | `GET /api/ping` | Only shown when `liveUpdates` |
| **Mark all as read** (pings) | Mark all pings read | `PATCH /api/ping` `{all:true}` | Same |
| **Notifications** bell | Open activity panel + mark seen | `GET /api/activity-logs`, `GET /api/user/last-seen` | `activityLogs_view` |
| **Mark all as read** (activity) | Update cursor | `PUT /api/user/last-seen` `{lastSeenLogId}` | `activityLogs_view` |
| **Refresh** (pings) | Reload pings | `GET /api/ping` | Same |
| **Refresh** (activity) | Reload logs | `GET /api/activity-logs` | Same |
| Activity row click | Navigate to entity page | `router.push(href)` | None |
| **Welcome Tour** | Start welcome guide | Client-only | None |
| **{Page} Guide** | Start spotlight tour | Client-only | None |
| **Sign out** | Checkout + sign out | `POST /api/attendance/session` `{action:"checkout"}` then `signOut()` | None (checkout skipped for SA) |
| **Install App** | Trigger PWA install | Browser API | None |
| **Dismiss** (✕) | Hide install | Client state | None |

### Mobile Drawer
Same actions as above: **Pings**, **Notifications**, **Help & Guides**, **Settings**, **Sign out**, theme buttons.

---

## 2. 404 Not Found — `app/not-found.tsx`

| Element | Action |
|---------|--------|
| **Go to Dashboard** | Navigate `/` |

---

## 3. Login / Auth Pages

### Login (`/login`)
| Element | Action | API |
|---------|--------|-----|
| **Sign in** | Submit credentials | `next-auth` `signIn("credentials")` |
| **Forgot password?** | Navigate `/forgot-password` | None |

### Forgot Password (`/forgot-password`)
| Element | Action | API |
|---------|--------|-----|
| **Send reset link** | Request reset | `POST /api/auth/forgot-password` `{email}` |
| **Back to sign in** | Navigate `/login` | None |

### Reset Password (`/reset-password`)
| Element | Action | API |
|---------|--------|-----|
| **Reset password** | Set new password | `POST /api/auth/reset-password` `{token,password}` |
| **Request a new link** | Navigate `/forgot-password` | None |
| **Sign in now** | Navigate `/login` | None |

---

## 4. Overview — `OverviewPage.tsx`

### Route Gate
- **`hasTeamAccess`** = `attendance_viewTeam` || has subordinates → `AdminDashboard`
- Otherwise → `OtherRoleOverview`

### Data Loads (automatic)
| Data | API | Condition |
|------|-----|-----------|
| Employees | `GET /api/employees` | `employees_view` |
| Tasks + subtasks | `GET /api/tasks`, `GET /api/tasks/:id/subtasks` | All authenticated |
| Campaigns | `GET /api/campaigns` | All |
| Live presence | `GET /api/attendance/presence` | `hasTeamAccess` |
| Personal attendance | `GET /api/attendance?type=detail\|daily\|monthly…` | Not SA |
| Personal profile | `GET /api/profile` | Not SA |
| Holidays | `GET /api/payroll/holidays?year=…` | Not SA |
| Leave balance | `GET /api/leaves/balance?…` | Not SA |
| Pending leaves | `GET /api/leaves?status=pending&userId=…` | Not SA |

### Actions
| Button / Control | Action | API | Permission |
|-----------------|--------|-----|------------|
| **ScopeStrip** dept buttons | Filter team data | None (client filter) | `hasTeamAccess` |
| **Request leave** | Navigate `/insights-desk?tab=leaves&action=new` | None | Not SA |
| **View payslip** | Navigate `/insights-desk?tab=payroll` | None | Not SA |
| **View schedule** | Navigate `/insights-desk?tab=attendance` | None | Not SA |
| **My campaigns** | Navigate `/workspace` | None | Not SA |
| Checklist **Mark complete** | Confirm → complete checklist | `POST /api/campaigns/:id/checklist` `{taskId}` | Not SA |
| Checklist **Undo** | Confirm → undo checklist | Same endpoint | Not SA |
| Task **Mark as done/working/pending** | Confirm → change status | `PUT /api/tasks/:id` `{status}` | Not SA |
| Subtask **Mark complete / Undo** | Confirm → toggle subtask | `PUT /api/tasks/:id` `{status}` | Not SA |
| **RefreshBtn** (team) | Reload presence | `GET /api/attendance/presence` | `hasTeamAccess` |
| Filter: **All/Office/Remote/Late/Absent** | Filter team grid | None (client filter) | `hasTeamAccess` |
| **EmployeeCard** click | Open `EmployeeModal` | None | `hasTeamAccess` |
| **Ping** (`title="Ping {name}"`) | Send ping | `POST /api/ping` `{to}` | `ping_send` + `liveUpdates` |
| **RefreshBtn** (activity) | Reload logs | `GET /api/activity-logs?limit=30` | `activityLogs_view` |
| **Mark all as read** (activity) | Update cursor | `PUT /api/user/last-seen` `{lastSeenLogId}` | `activityLogs_view` |
| Per-entity **Mark as read** | Update entity cursor | `PUT /api/user/last-seen` `{entity,lastSeenLogId}` | `activityLogs_view` |

### Visual-only elements
- Welcome header badges: `{n} In Office`, `{n} Remote`, `{n} Late`, `{n} Absent`
- My Day card: clock times, hours, office/remote chips, progress bar, monthly stats
- Quick Hub: On the Radar (next holiday, leaves remaining)
- Today's Activity timeline with colored dots
- Admin Overview stats grid (SA only): `{pct}% present`, overdue, flags
- Needs Attention mini-cards: overdue, due soon, absent, flags, unassigned

---

## 5. Workspace — `workspace/page.tsx`

### Permission Flags
`tasks_create`, `tasks_edit`, `tasks_delete`, `tasks_reassign`, `campaigns_create`, `campaigns_edit`, `campaigns_delete`, `campaigns_tagEntities`, `campaigns_view`, `activityLogs_view`, `isSuperAdmin`

### Data Loads
| Data | API |
|------|-----|
| Tasks | `GET /api/tasks` |
| Campaigns | `GET /api/campaigns` |
| Employees dropdown | `GET /api/employees/dropdown` (when `needsDropdown`) |
| Departments | `GET /api/departments` (when `campaigns_tagEntities`) |
| Activity logs | `GET /api/activity-logs?limit=30` (when `activityLogs_view`) |

### Toolbar
| Button | Action | Permission |
|--------|--------|------------|
| **SearchField** | Filter campaigns/tasks | None |
| **Progress** | Open `TaskHistoryModal` | `isPrivileged` (SA or `tasks_view`) |
| **New Campaign** | Open campaign create modal | `campaigns_create` |

### Campaign Card Actions
| Button | Action | API | Permission |
|--------|--------|-----|------------|
| **Add task** (+) | Open task create modal | None (opens form) | `tasks_create` + `isMyCampaign` |
| **Edit** campaign | Open campaign edit modal | None (opens form) | `campaigns_edit` + `isMyCampaign` |
| **Delete** campaign | Confirm → delete | `DELETE /api/campaigns/:id` | `campaigns_delete` + `isMyCampaign` |
| **ToggleSwitch** (campaign active) | Toggle active/paused | `PUT /api/campaigns/:id` `{status}` | `campaigns_edit` + `isMyCampaign` |

### Task Row Actions
| Button | Action | API | Permission |
|--------|--------|-----|------------|
| **ToggleSwitch** (task active) | Toggle task active | `PUT /api/tasks/:id` `{isActive}` | `tasks_edit` + `isMyTask` |
| **Edit** task | Open task edit modal | None (opens form) | `tasks_edit` + `isMyTask` |
| **Delete** task | Confirm → delete | `DELETE /api/tasks/:id` | `tasks_delete` + `isMyTask` |
| **Subtask** (+) | Open subtask create modal | None | `tasks_create` + `isMyTask` |
| **Drag handle** | Reorder tasks | `PUT /api/tasks/reorder` `{orderedIds}` | `tasks_edit` + `isMyCampaign` |
| Expand chevron | Load subtasks | `GET /api/tasks/:id/subtasks` | None |

### Task Modal Form
| Field | Purpose |
|-------|---------|
| **Title** | Task name (required) |
| **Brief description** | Description |
| **Assign To** chips | Select assignees (`tasks_reassign` for others) |
| **One-time / Weekly / Monthly** | Recurrence type |
| Day toggles (weekly/monthly) | Schedule days |
| **Deadline** date | Due date (one-time only) |

| Submit | API | Permission |
|--------|-----|------------|
| **Create** / **Create N Tasks** | `POST /api/tasks` (one per assignee) | `tasks_create` |
| **Update** | `PUT /api/tasks/:id` | `tasks_edit` |

### Campaign Modal Form
| Field | Purpose |
|-------|---------|
| **Name** | Campaign name |
| **Short description** | Description |
| **Tag Departments** chips | Department tags |
| **Tag Employees** chips | Employee tags |

| Submit | API | Permission |
|--------|-----|------------|
| **Create** | `POST /api/campaigns` | `campaigns_create` |
| **Update** | `PUT /api/campaigns/:id` | `campaigns_edit` |

### Visual-only
- `HeaderStatPill` values: campaign count, completion %, overdue, due soon, etc.
- Campaign footer pills: task counts, team size, date range
- Recurring/submission glass pills on cards

---

## 6. Organization — `organization/page.tsx`

### Gate
- **Access denied** if `!organization_view && !isSuperAdmin`

### Data Loads
| Data | API | Permission |
|------|-----|-----------|
| Departments | `GET /api/departments` | `organization_view` |
| Employees | `GET /api/employees?includeSelf=true` | Same |
| Designations | `GET /api/designations` | Same |
| Presence | `GET /api/attendance/presence` | Same |
| Org scope (non-SA) | `GET /api/organization/scope` | Same |

### Actions
| Button | Action | API | Permission |
|--------|--------|-----|------------|
| **Search** | Filter sidebar | None | None |
| **Add Employee** (+) | Open invite form | None | `employees_create` |
| **Send Invite** | Create employee | `POST /api/employees` `{email,fullName,weeklySchedule,graceMinutes,shiftType,salary?}` | `employees_create` (+`payroll_manageSalary` for salary) |
| **Update** (edit employee) | Update employee | `PUT /api/employees/:id` `{fullName,weeklySchedule,graceMinutes,shiftType,salary?,password?}` | `employees_edit` (+`payroll_manageSalary` for salary) |
| **ToggleSwitch** (active) | Toggle account | `PUT /api/employees/:id` `{isActive}` | `employees_toggleStatus` |
| **Invite** | Resend invite | `POST /api/employees/:id/resend-invite` | `employees_resendInvite` |
| Copy invite link | Same + clipboard | Same | Same |
| **Remove** employee confirm | Delete employee | `DELETE /api/employees/:id` | `employees_delete` |

### Visual-only
- `HeaderStatPill`: employee count, department count, active accounts
- Employee preview card with info rows
- Restricted state (lock icon + message)

---

## 7. Departments Panel — `DepartmentsPanel.tsx`

| Button | Action | API | Permission (prop) |
|--------|--------|-----|------------|
| **Add Department** (+) | Open create modal | None | `canCreate` |
| **Create** / **Save** | Create/update | `POST /api/departments` or `PUT /api/departments/:id` `{title,description}` | `canCreate` / `canEdit` |
| **ToggleSwitch** (active) | Toggle | `PUT /api/departments/:id` `{isActive}` | `canEdit` |
| **Edit** | Open edit modal | None | `canEdit` |
| **Delete** confirm | Delete | `DELETE /api/departments/:id` | `canDelete` |

---

## 8. Designations Panel — `DesignationsPanel.tsx`

| Button | Action | API | Permission |
|--------|--------|-----|------------|
| **Add Designation** (+) | Open create modal | None | `designations_manage` |
| **Create** / **Save** | Create/update + default permissions | `POST /api/designations` or `PUT /api/designations/:id` `{name,description,color,isActive,defaultPermissions}` | `designations_manage` |
| **ToggleSwitch** (active) | Toggle | `PUT /api/designations/:id` `{isActive}` | `designations_manage` |
| **Edit** / **Delete** | Modal / `DELETE /api/designations/:id` | Same | `designations_manage` |
| **All On / All Off** | Bulk toggle permissions | Client state | Same |
| Per-permission checkboxes | Toggle individual permission | Client state → saved on submit | Same |

---

## 9. Org Flow Tree — `OrgFlowTree.tsx`

### Data Loads
| Data | API |
|------|-----|
| Memberships | `GET /api/memberships` |
| Canvas layout | `GET /api/flow-layout?canvasId=org` |

### Actions
| Action | API | Permission |
|--------|-----|------------|
| **Drag node** | `PUT /api/flow-layout` `{canvasId,positions}` | `organization_manageLinks` |
| **Connect** emp→dept (edge drag) | `POST /api/memberships` `{user,department,designation}` + `POST /api/hierarchy-sync` | `members_addToDepartment` |
| **Connect** emp→emp (link) | `PUT /api/flow-layout` `{canvasId,links}` + `POST /api/hierarchy-sync` | `organization_manageLinks` |
| Edge pill **designation select** | `PUT /api/memberships/:id` `{designation}` | `members_assignDesignation` |
| **Edit Privileges** | `PUT /api/memberships/:id` `{permissions}` | `members_customizePermissions` |
| **Remove** membership | `DELETE /api/memberships/:id` | `members_removeFromDepartment` |
| **Remove** emp–emp link | `PUT /api/flow-layout` (filtered links) | `organization_manageLinks` |
| **Create Connection** (modal) | `POST /api/memberships` | `members_addToDepartment` |
| **Save Privileges** (modal) | `PUT /api/memberships/:id` `{permissions}` | `members_customizePermissions` |
| **Reset to Original** | Reset to designation defaults | Client state | Same |
| **All On / All Off** | Bulk toggle | Client state | Same |

---

## 10. Settings — `settings/page.tsx`

### Gate
- System settings cards shown only if `settings_manage`
- Payroll config shown only if `payroll_manageSalary`

### Profile (`SettingsProfile.tsx`)
| Action | API | Permission |
|--------|-----|------------|
| Upload avatar (file input) | Client-side FileReader | None |
| Remove image (×) | Client state | None |
| **Save profile** | `PUT /api/profile` `{fullName,phone,profileImage}` | Any authenticated user |

### Security (`SettingsSecurity.tsx`)
| Action | API | Permission |
|--------|-----|------------|
| **Save changes** (password) | `PUT /api/profile/password` `{currentPassword,newPassword}` | Any authenticated user |
| **Save changes** (email) | `PUT /api/profile` `{email,currentPassword}` | Any authenticated user |

### Preferences (in `page.tsx`)
| Action | API | Permission |
|--------|-----|------------|
| **Show coordinates** toggle | `PUT /api/profile` `{showCoordinates}` | Any authenticated user |

### System (`SettingsSystem.tsx`)
| Action | API | Permission |
|--------|-----|------------|
| **Save** (system card) | `PUT /api/settings` `{office,company,liveUpdates}` | `settings_manage` |
| **Save** (office card) | Same endpoint | `settings_manage` |
| **Reset** (office) | Reset to defaults | Client state | `settings_manage` |
| **Live Updates** toggle | Part of save payload | `settings_manage` |
| **Send Test Email** | `GET /api/test-email?type=…&email=…` | `settings_manage` |

### Payroll Config (`SettingsPayroll.tsx`)
| Action | API | Permission |
|--------|-----|------------|
| **+ Add tier** | Client state | `payroll_manageSalary` |
| **× Remove tier** | Client state | Same |
| **Save config** | `PUT /api/payroll/config` `{latePenaltyTiers,absencePenaltyPerDay,overtimeRateMultiplier,payDay}` | Same |

---

## 11. Insights Desk Layout — `insights-desk/layout.tsx`

### Header Buttons
| Button | Action | Opens |
|--------|--------|-------|
| **Progress** | `openTasksModal()` | `EmployeeTasksModal` |
| **Leaves** | `openLeavesModal()` | `LeavesModal` |
| **Payroll** | `openPayrollModal()` | `PayrollModal` |
| **Holidays** | `setHolidaysOpen(true)` | Holidays overlay |

### Holiday CRUD
| Action | API | Permission |
|--------|-----|------------|
| Load holidays | `GET /api/payroll/holidays?year=…` | None |
| **Add holiday** | `POST /api/payroll/holidays` `{name,date,isRecurring}` | `holidays_manage` |
| **ToggleSwitch** recurring | `PUT /api/payroll/holidays` `{id,isRecurring}` | `holidays_manage` |
| **Remove holiday** confirm | `DELETE /api/payroll/holidays?id=…` | `holidays_manage` |

---

## 12. Attendance — `insights-desk/attendance/page.tsx`

### Data Loads
| Data | API | Permission |
|------|-----|-----------|
| Team attendance | `GET /api/attendance?type=team-monthly\|team-date…` | `attendance_viewTeam` |
| Personal attendance | `GET /api/attendance?type=daily\|monthly\|detail…` | Any authenticated |
| Leaves | `GET /api/leaves?…` | Own or `leaves_viewTeam` |
| Holidays | `GET /api/payroll/holidays?year=…` | None |
| Leave balance | `GET /api/leaves/balance?…` | Own or `leaves_viewTeam` |

### Actions
| Button | Action | API | Permission |
|--------|--------|-----|------------|
| **Search employees** | Filter | None | None |
| **ScopeStrip** | Dept filter | None | `attendance_viewTeam` |
| **Employee pills** | Select employee | Triggers data loads | None |
| **MiniCalendar** day select | Select day → load detail | `GET /api/attendance?type=detail…` | None |
| **Close** (X) detail panel | Clear selection | None | None |
| Coords link | External Google Maps | None | None |
| **View Task Activity** | Open `EmployeeTasksModal` | None | None |
| **+ Apply Leave** | Open `LeavesModal` | None | None |
| **Monthly record** day cards | Select day detail | Loads detail data | None |

---

## 13. Employee Modal — `EmployeeModal.tsx`

### Permission Logic
- `canEdit` = own profile OR `employees_edit` (cannot edit another SA unless viewer is SA)
- `canAtt` = own OR `attendance_viewTeam`
- `canTasksNav` = own OR `tasks_view`
- `canViewPayroll` = own OR `payroll_viewTeam`
- `canViewLeaves` = own OR `leaves_viewTeam`

### Tab Visibility
| Tab | Condition |
|-----|-----------|
| **Overview** | Always |
| **Attendance** | `canAtt` |
| **Payroll** | `canViewPayroll` |
| **Leaves** | `canViewLeaves` |
| **Tasks** | `canTasksNav` |
| **Location** | `canAtt` |
| **Schedule** | Always |
| **Profile** | Always |

### Actions
| Button | Action | API | Permission |
|--------|--------|-----|------------|
| **Edit** | Enter edit mode + load depts | `GET /api/departments` | `canEdit` |
| **Save** | Update employee | `PUT /api/employees/:id` `{fullName,department,managedDepartments,weeklySchedule,graceMinutes,shiftType,password?,salary?}` | `canEdit` (+`payroll_manageSalary` for salary field) |
| **Cancel** | Exit edit mode | None | None |
| **Copy Mon → All** | Copy schedule | Client state | `canEdit` |
| Per-day **ToggleSwitch** | Toggle working day | Client state → saved on **Save** | `canEdit` |
| Shift **select** | Change employment type | Client state | `canEdit` |
| Department chips | Select dept(s) | Client state | `canEdit` |
| **Manage multiple departments** | Toggle multi-dept mode | Client state | `canEdit` |
| Calendar day select | Load attendance detail | `GET /api/attendance?type=detail…` | `canAtt` |
| Location day nav | Load location flags | `GET /api/location-flags?userId=…` | `canAtt` |
| Coords link / **Map** | External Google Maps | None | None |

---

## 14. Task History Modal — `TaskHistoryModal.tsx`

All read-only — no POST/PUT/DELETE. Permission: `isPrivileged` (SA or `tasks_view`) at caller level.

| Action | API |
|--------|-----|
| Select campaign | `GET /api/tasks/history?type=campaign-employees&days=1&campaignId=…` |
| All campaigns grid | `GET /api/tasks/history?type=campaign-employees&days=1` |
| Calendar month nav | `GET /api/tasks/history?type=daily&year&month…` |
| Day select | `GET /api/tasks/history?type=detail&date=…` |
| Employee click | `GET /api/tasks/history?type=employee-timeline&userId=…` |
| **Show full month** | Clear day selection |
| **Load more** | Next page of timeline |

---

## 15. Employee Tasks Modal — `EmployeeTasksModal.tsx`

All read-only. `isPrivileged` = SA or `tasks_view`.

| Action | API | Permission |
|--------|-----|------------|
| Employee dropdown load | `GET /api/employees/dropdown` | `isPrivileged` |
| All employees progress | `GET /api/tasks/history?type=campaign-employees&days=1` | `isPrivileged` |
| Individual calendar data | `GET /api/tasks/history?type=daily&year&month&userId=…` | Any (own) or `isPrivileged` |
| Individual timeline | `GET /api/tasks/history?type=employee-timeline&userId=…` | Same |
| Day campaign cards | `GET /api/tasks/history?type=campaign-employees&days=1&date=…` + `type=detail&date=…&userId=…` | Same |
| Select employee (sidebar) | Triggers above loads | `isPrivileged` |
| **Show full month** | Clear day | None |
| **Load more** | Next timeline page | None |

---

## 16. Payroll Modal — `PayrollModal.tsx`

### Data Loads
| Data | API | Permission |
|------|-----|-----------|
| Employee dropdown | `GET /api/employees/dropdown` | `payroll_viewTeam` |
| Payroll estimate | `GET /api/payroll/estimate?detail=true&month&year[&userId]` | Own or `payroll_viewTeam` |
| Year estimates | `GET /api/payroll/estimate?month&year[&userId]` (×12) | Same |
| Bank sheet | `GET /api/payroll/bank-sheet?month&year` | `payroll_viewTeam` |

### Actions
| Button | Action | Permission |
|--------|--------|------------|
| **Export** dropdown | Toggle menu | None |
| **Payroll Report CSV** | Client-side CSV download | None |
| **Year Report CSV** | Client-side CSV download | None |
| **Month Report CSV** | Client-side CSV download | None |
| **Payroll Report JSON** | Client-side JSON download | None |
| **Year Report JSON** | Client-side JSON download | None |
| **Month Report JSON** | Client-side JSON download | None |
| **Print / PDF** | `window.open` + `print()` | None |
| **Copy to Clipboard** | `navigator.clipboard` | None |
| Employee selection | Triggers estimate loads | None |
| Tab switching | Changes view | None |

---

## 17. Leaves Modal — `LeavesModal.tsx`

### Data Loads
| Data | API | Permission |
|------|-----|-----------|
| Employee dropdown | `GET /api/employees/dropdown` | `leaves_viewTeam` |
| Leave balance | `GET /api/leaves/balance?year[&userId]` | Own or `leaves_viewTeam` |
| Leaves list | `GET /api/leaves?year[&userId]` | Own or `leaves_viewTeam` |

### Actions
| Button | Action | API | Permission |
|--------|--------|-----|------------|
| **Request leave** | Show form | None | None |
| **Submit request** | Submit leave | `POST /api/leaves` `{date,isHalfDay,reason,type?,endDate?,userId?}` | Any (own); `leaves_viewTeam` to submit for another user |
| **Full day / Half day** | Toggle type | Client state | None |
| **Multiple days** toggle | Show date range | Client state | None |
| Type **select** | Choose leave type | Client state | None |
| Employee selection | View their leaves | Triggers loads | `leaves_viewTeam` |

---

## 18. Session Tracker — `SessionTracker.tsx`

Hidden for SuperAdmin. Automatic for all other users.

| Action | Trigger | API | Permission |
|--------|---------|-----|------------|
| **Check-in** | Automatic on page load (desktop) | `POST /api/attendance/session` `{action:"checkin",latitude,longitude,accuracy,platform,userAgent,deviceId,isMobile}` | Not SA |
| **Heartbeat** | Every 30s in active mode | `PATCH /api/attendance/session` `{latitude,longitude,accuracy}` | Not SA |
| **Checkout** | Page unload | `POST /api/attendance/session` `{action:"checkout"}` (sendBeacon) | Not SA |
| **Re-check Location** | User button click | `PATCH /api/attendance/session` `{latitude,longitude,accuracy}` | Not SA |
| **Still there?** toast tap | Dismiss nudge, resume timer | None (client state) | Not SA |
| Away overlay tap | Resume tracking | None (client state) | Not SA |

### Visual States
| Pill State | Gradient | Dot |
|-----------|----------|-----|
| **In Office** (active) | cyan→teal→green | White pinging |
| **Remote** (active) | indigo→purple→violet | White pinging |
| **Offline** | slate | None |
| **Flagged** (violation) | rose gradient | Red pinging |
| **Warning** | amber gradient | None |
| **Paused** (idle) | Same as active but 50% opacity | Amber solid |

---

## 19. Shared Components

### `EmployeeCard` (`EmployeeCard.tsx`)
| Element | Action | Permission (from props) |
|---------|--------|------------|
| Card click | Opens `EmployeeModal` | `onCardClick` prop |
| **Ping** | Send ping | `ping_send` + `liveUpdates` (via parent `onPing`) |
| **Manage** | Opens management | `onManage` prop |
| **Edit** | Opens edit | `onEdit` prop |
| **Deactivate** | Triggers deactivation | `onDeactivate` prop |
| Checkbox | Multi-select | `onSelect` prop |

### `MiniCalendar` (`MiniCalendar.tsx`)
| Element | Action |
|---------|--------|
| Prev/Next month | Change month (callback to parent) |
| Day cell click | Select day (callback to parent) |

### `ConfirmDialog` (`ConfirmDialog.tsx`)
| Element | Action |
|---------|--------|
| **Cancel** | Close dialog |
| **{confirmLabel}** / **Working…** | Execute confirm callback |
| Variants: `danger` (rose), `warning` (amber), default (primary) |

### `ToggleSwitch` (`ToggleSwitch.tsx`)
- `role="switch"` button; slides thumb; optional label; fires `onChange` callback

### `SearchField` (`ui.tsx`)
- Text input with magnifier icon; fires `onChange` / `onClear`

### `RefreshBtn` (`ui.tsx`)
- Circular arrows icon; fires `onRefresh` callback; `title="Refresh"`

### `SegmentedControl` (`ui.tsx`)
- Tab buttons; fires `onChange` with selected value

### `ModalShell` (`ui.tsx`)
- Title, subtitle, body, footer wrapper; close X button

### `ScopeStrip` (`ScopeStrip.tsx`)
- **All departments** + per-department buttons; fires `onChange` with selected dept

### `Pill` / `StatChip` / `HeaderStatPill` (`StatChips.tsx`)
- Display-only: colored dot + label, stat tile, inline stat pill

### `Portal` (`Portal.tsx`)
- React portal root for overlays — no interaction

---

## 20. Onboarding

### Welcome Guide (`WelcomeGuide.tsx`)
| Element | Action |
|---------|--------|
| **Skip tour** | Complete guide |
| **Back** | Previous slide |
| **Next** / **Get Started** | Next slide / complete |
| Pager dots | Jump to slide |
| Backdrop click | Complete guide |

### Spotlight Tour (`SpotlightTour.tsx`)
| Element | Action |
|---------|--------|
| **Skip** | End tour |
| **Back** | Previous step |
| **Next** / **Finish** | Next step / end |
| Overlay click | Skip tour |
| Keyboard: Esc = skip, Enter/→ = next, ← = back |

---

## 21. Root Components

### `ToasterProvider` — `react-hot-toast` `<Toaster />` (display only)
### `PasswordInput` — Password field with eye show/hide toggle
### `PasswordStrength` — 5 colored bars + label (Weak/Fair/Good/Strong/Excellent)
### `Providers` — `<SessionProvider>` wrapper (no UI)
### `useGuide.tsx` — `GuideProvider` composing WelcomeGuide + SpotlightTour
### `useLive.tsx` — `LiveProvider` context (no UI)
### `usePermissions.tsx` — `PermissionsProvider` context (no UI)

---

## 22. File Index (46 .tsx files)

| File | Section |
|------|---------|
| `app/layout.tsx` | Root HTML + theme script |
| `app/not-found.tsx` | §2 |
| `app/login/page.tsx` | §3 |
| `app/forgot-password/page.tsx` | §3 |
| `app/reset-password/page.tsx` | §3 |
| `app/(dashboard)/layout.tsx` | Auth gate + providers |
| `app/(dashboard)/page.tsx` | Re-exports → OverviewPage |
| `app/(dashboard)/AppLayout.tsx` | §1 |
| `app/(dashboard)/OverviewPage.tsx` | §4 |
| `app/(dashboard)/Providers.tsx` | §21 |
| `app/(dashboard)/SessionTracker.tsx` | §18 |
| `app/(dashboard)/components/ConfirmDialog.tsx` | §19 |
| `app/(dashboard)/components/EmployeeCard.tsx` | §19 |
| `app/(dashboard)/components/EmployeeModal.tsx` | §13 |
| `app/(dashboard)/components/MiniCalendar.tsx` | §19 |
| `app/(dashboard)/components/Portal.tsx` | §19 |
| `app/(dashboard)/components/ScopeStrip.tsx` | §19 |
| `app/(dashboard)/components/SpotlightTour.tsx` | §20 |
| `app/(dashboard)/components/StatChips.tsx` | §19 |
| `app/(dashboard)/components/ToggleSwitch.tsx` | §19 |
| `app/(dashboard)/components/ui.tsx` | §19 |
| `app/(dashboard)/components/WelcomeGuide.tsx` | §20 |
| `app/(dashboard)/insights-desk/layout.tsx` | §11 |
| `app/(dashboard)/insights-desk/page.tsx` | Redirect only |
| `app/(dashboard)/insights-desk/EmployeeTasksModal.tsx` | §15 |
| `app/(dashboard)/insights-desk/LeavesModal.tsx` | §17 |
| `app/(dashboard)/insights-desk/PayrollModal.tsx` | §16 |
| `app/(dashboard)/insights-desk/attendance/page.tsx` | §12 |
| `app/(dashboard)/organization/page.tsx` | §6 |
| `app/(dashboard)/organization/DepartmentsPanel.tsx` | §7 |
| `app/(dashboard)/organization/DesignationsPanel.tsx` | §8 |
| `app/(dashboard)/organization/OrgFlowTree.tsx` | §9 |
| `app/(dashboard)/settings/page.tsx` | §10 |
| `app/(dashboard)/settings/SettingsProfile.tsx` | §10 |
| `app/(dashboard)/settings/SettingsSecurity.tsx` | §10 |
| `app/(dashboard)/settings/SettingsPayroll.tsx` | §10 |
| `app/(dashboard)/settings/SettingsSystem.tsx` | §10 |
| `app/(dashboard)/workspace/layout.tsx` | Tour registration only |
| `app/(dashboard)/workspace/page.tsx` | §5 |
| `app/(dashboard)/workspace/TaskHistoryModal.tsx` | §14 |
| `components/ToasterProvider.tsx` | §21 |
| `components/PasswordInput.tsx` | §21 |
| `components/PasswordStrength.tsx` | §21 |
| `lib/useGuide.tsx` | §21 |
| `lib/useLive.tsx` | §21 |
| `lib/usePermissions.tsx` | §21 |

---

*Last updated: April 2026*
