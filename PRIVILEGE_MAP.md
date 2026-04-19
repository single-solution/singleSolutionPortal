# Privilege Map — Every UI Element → Required Permission

## The Single Rule

```
ACCESS = isSelf(target) || isSuperAdmin || (hasPrivilege(key) && targetBelowInHierarchy)
```

Every employee **always** has access to self-service actions (defined in `SELF_PERMISSIONS`).
SuperAdmins bypass all privilege checks. Other access requires the specific privilege key
**and** the target must be below the actor in the organizational hierarchy.

> Legend: `✅` = existing key | `🔓` = self-service (always allowed via `SELF_PERMISSIONS`) | `—` = no gate needed

---

## AppLayout.tsx — Global Shell

| UI Element | Permission |
|-----------|------------|
| **Overview** nav link | `🔓 overview_access` |
| **Workspace** nav link | `🔓 workspace_access` |
| **Organization** nav link | `✅ organization_view` |
| **Insights Desk** nav link | `🔓 insightsDesk_access` |
| **Settings** nav link | `🔓 settings_access` |
| **Light / Dark / System** theme buttons | — (personal preference) |
| **Pings** bell icon | `🔓 ping_view` (system `liveUpdates` flag also required) |
| **Mark all as read** (pings) | `🔓 ping_markRead` |
| **Refresh** (pings) | `🔓 ping_view` |
| **Notifications** bell icon | `✅ activityLogs_view` ⚠️ bell always renders; only fetch is gated |
| **Mark all as read** (activity) | `✅ activityLogs_view` |
| **Refresh** (activity) | `✅ activityLogs_view` |
| Activity row click → navigate | `✅ activityLogs_view` (inherits dropdown gate) |
| **Welcome Tour** button | — (help system) |
| **{Page} Guide** button | — (help system) |
| **Sign out** button | — (universal) |
| Checkout on sign out | — (automatic, skipped for SA) |
| **Help** (?) menu toggle | — (help system) |
| **Install App** PWA button | — (browser feature) |
| **Dismiss** (✕) install banner | — (browser feature) |
| **Mobile menu** hamburger toggle | — (navigation chrome) |
| Mobile menu **Close** (X / backdrop) | — (dismiss) |
| Mobile menu → **Settings** link | `🔓 settings_access` |
| Mobile menu → **Theme** (Light/Dark/System) | — (personal preference) |
| Mobile menu → **Pings** | `🔓 ping_view` |
| Mobile menu → **Notifications** | `✅ activityLogs_view` |
| Mobile menu → **Welcome Tour** | — (help system) |
| Mobile menu → **Sign out** | — (universal) |

---

## Auth Pages (Pre-login)

| UI Element | Permission |
|-----------|------------|
| **Sign in** button | — (pre-auth) |
| **Forgot password?** link | — (pre-auth) |
| **Send reset link** button | — (pre-auth) |
| **Reset password** button | — (pre-auth) |
| **Back to sign in** / **Sign in now** links | — (pre-auth) |
| **Request a new link** link | — (pre-auth) |

---

## OverviewPage.tsx — Dashboard

| UI Element | Permission |
|-----------|------------|
| View Admin Dashboard layout | `✅ attendance_viewTeam` or has subordinates |
| View Admin Overview stats grid | `✅ analytics_viewDashboard` (currently SA only) |
| View Needs Attention cards | `✅ analytics_viewNeedsAttention` (currently SA only) |
| View live presence counts | `✅ analytics_viewPresence` (currently SA only) |
| **ScopeStrip** dept filter buttons | `✅ attendance_viewTeam` |
| **All / Office / Remote / Late / Absent** filter | `✅ attendance_viewTeam` |
| **RefreshBtn** (team presence) | `✅ attendance_viewTeam` |
| **EmployeeCard** click → open modal | `✅ attendance_viewTeam` |
| **Ping** button on employee card | `🔓 ping_send` (API enforces subordinate hierarchy) |
| **Request leave** link | `🔓 leaves_request` |
| **View payslip** link | `🔓 payroll_viewOwn` |
| **View schedule** link | `🔓 attendance_viewOwn` |
| **My campaigns** link | `🔓 campaigns_viewOwn` |
| Checklist **Mark complete** | `🔓 tasks_markChecklist` |
| Checklist **Undo** | `🔓 tasks_markChecklist` |
| Task **Mark as done/working/pending** | `🔓 tasks_changeOwnStatus` |
| Subtask **Mark complete / Undo** | `🔓 tasks_changeOwnStatus` |
| **RefreshBtn** (activity sidebar) | `✅ activityLogs_view` |
| **Mark all as read** (activity sidebar) | `✅ activityLogs_view` |
| Per-entity **Mark as read** | `✅ activityLogs_view` |
| Activity sidebar entity row **expand/collapse** | `✅ activityLogs_view` |

---

## workspace/page.tsx — Workspace

| UI Element | Permission |
|-----------|------------|
| **SearchField** | `🔓 workspace_access` (inherits page gate) |
| **Progress** button → open TaskHistoryModal | `🔓 tasks_viewHistory` (always visible, modal handles self vs team) |
| **New Campaign** button | `✅ campaigns_create` |
| **Create your first campaign** (empty state) | `✅ campaigns_create` |
| Campaign **Add task** (+) | `✅ tasks_create` + `isMyCampaign` |
| Campaign **Edit** button | `✅ campaigns_edit` + `isMyCampaign` |
| Campaign **Delete** button → confirm | `✅ campaigns_delete` + `isMyCampaign` |
| Campaign **ToggleSwitch** (active/paused) | `✅ campaigns_toggleStatus` + `isMyCampaign` |
| Task **ToggleSwitch** (active) | `✅ tasks_toggleActive` + `isMyTask` |
| Task **Edit** button | `✅ tasks_edit` + `isMyTask` |
| Task **Delete** button → confirm | `✅ tasks_delete` + `isMyTask` |
| Task **Subtask** (+) button | `✅ tasks_create` + `isMyTask` |
| Task **Drag handle** reorder | `✅ tasks_reorder` + `isMyCampaign` |
| Task expand chevron (load subtasks) | `🔓 workspace_access` (loads data from API) |
| Task form **Create** / **Create N Tasks** | `✅ tasks_create` |
| Task form **Update** | `✅ tasks_edit` |
| Task form **Assign To** other employees | `✅ tasks_reassign` |
| Task form **Recurrence** (One-time / Weekly / Monthly) | `✅ tasks_create` / `✅ tasks_edit` (inherits form gate) |
| Task form **Deadline** date picker | `✅ tasks_create` / `✅ tasks_edit` (inherits form gate) |
| Campaign form **Create** | `✅ campaigns_create` |
| Campaign form **Update** | `✅ campaigns_edit` |
| Campaign form **Tag Departments** | `✅ campaigns_tagEntities` |
| Campaign form **Tag Employees** | `✅ campaigns_tagEntities` |
| Activity sidebar **Refresh** | `✅ activityLogs_view` |
| Activity sidebar **Mark all as read** | `✅ activityLogs_view` |
| Activity sidebar per-entity **Mark as read** | `✅ activityLogs_view` |
| Activity sidebar entity row expand/collapse | `✅ activityLogs_view` |

---

## TaskHistoryModal.tsx — Workspace Progress

All read-only. Always accessible (self-view). Team data requires `tasks_view` or `tasks_viewTeamProgress`.

| UI Element | Permission |
|-----------|------------|
| Open modal | `🔓 tasks_viewHistory` (always visible) |
| Sidebar **Search…** input | `🔓 tasks_viewHistory` |
| **All Campaigns** sidebar item | `🔓 tasks_viewHistory` |
| Campaign row → select campaign | `🔓 tasks_viewHistory` |
| Campaign chevron → expand tasks | `🔓 tasks_viewHistory` |
| Task / subtask row → select | `🔓 tasks_viewHistory` |
| All campaigns grid view | `✅ tasks_viewTeamProgress` |
| Grid campaign card → select | `✅ tasks_viewTeamProgress` |
| Calendar month **‹** / **›** nav | `🔓 tasks_viewHistory` |
| Calendar day select | `🔓 tasks_viewHistory` |
| **Back to today** (under calendar) | `🔓 tasks_viewHistory` |
| Employee card → view timeline | `✅ tasks_viewTeamProgress` |
| Employee **completion pill** on task card → jump to employee | `✅ tasks_viewTeamProgress` |
| Task **"View timeline"** icon (clock) on task card → select scope | `🔓 tasks_viewHistory` |
| Employee detail **Back** chevron | `✅ tasks_viewTeamProgress` |
| **Show full month** | `🔓 tasks_viewHistory` |
| **Load more** timeline | `🔓 tasks_viewHistory` |
| Close (X) | — (dismiss) |
| Backdrop click | — (dismiss) |

---

## organization/page.tsx — Organization

| UI Element | Permission |
|-----------|------------|
| View page | `✅ organization_view` |
| **Search** sidebar | `✅ organization_view` (inherits page gate) |
| **Add Employee** (+) button | `✅ employees_create` |
| **Send Invite** submit | `✅ employees_create` (+`✅ payroll_manageSalary` for salary) |
| **Update** employee submit | `✅ employees_edit` (+`✅ payroll_manageSalary` for salary) |
| **Cancel** employee form | — (dismiss) |
| Close employee form (backdrop / X) | — (dismiss) |
| Close preview modal (backdrop) | — (dismiss) |
| Employee form: name, email, password, schedule, grace, shift select | Part of create/edit flow above |
| **ToggleSwitch** (account active) | `✅ employees_toggleStatus` (blocked for SA targets) |
| Weekly schedule **ToggleSwitch** per day | Part of create/edit flow above |
| **Invite** / resend button | `✅ employees_resendInvite` (unverified only) |
| **Copy invite link** | `✅ employees_resendInvite` |
| **Remove** employee confirm | `✅ employees_delete` (blocked for SA targets) |
| **EmployeeCard** actions strip | `✅ employees_edit` OR `✅ employees_delete` (hidden for SA targets) |
| **EmployeeCard** → open preview/modal | `✅ organization_view` |

---

## DepartmentsPanel.tsx

| UI Element | Permission |
|-----------|------------|
| **Add Department** (+) | `✅ departments_create` |
| **Create** / **Save** department | `✅ departments_create` / `✅ departments_edit` |
| **Cancel** department form | — (dismiss) |
| Close department modal (X / backdrop) | — (dismiss) |
| **Title** input | Part of create/edit flow above |
| **Description** input | Part of create/edit flow above |
| **ToggleSwitch** (dept active) | `✅ departments_edit` |
| **Edit** department | `✅ departments_edit` |
| **Delete** department confirm | `✅ departments_delete` |

---

## DesignationsPanel.tsx

Panel only renders when `✅ designations_view`.

| UI Element | Permission |
|-----------|------------|
| **Add Designation** (+) | `✅ designations_create` |
| **Create** designation submit | `✅ designations_create` |
| **Save** designation submit | `✅ designations_edit` |
| **ToggleSwitch** (designation active) | `✅ designations_toggleStatus` |
| **Edit** designation | `✅ designations_edit` |
| **Delete** designation confirm | `✅ designations_delete` (blocked for system) |
| Color swatches | `✅ designations_edit` (in modal) |
| **Default Privileges** expand | `✅ designations_edit` (in modal) |
| **All On / All Off** permissions | `✅ designations_setPermissions` |
| Per-permission **checkboxes** | `✅ designations_setPermissions` |
| **Name** input | Part of create/edit flow above |
| **Description** input | Part of create/edit flow above |
| Permission **search** input | `✅ designations_edit` (in modal) |
| **Cancel** / **Close** modal (X / backdrop) | — (dismiss) |

---

## OrgFlowTree.tsx

| UI Element | Permission |
|-----------|------------|
| **Drag node** on canvas | `✅ organization_manageLinks` |
| **Connect** employee → department (edge drag) | `✅ members_addToDepartment` + hierarchy |
| **Connect** employee → employee (link) | `✅ organization_manageLinks` + hierarchy |
| Edge pill **designation select** dropdown | `✅ members_assignDesignation` |
| **Edit Privileges** button | `✅ members_customizePermissions` |
| **Save Privileges** submit | `✅ members_customizePermissions` |
| **Reset to Original** permissions | `✅ members_customizePermissions` |
| **All On / All Off** permissions | `✅ members_customizePermissions` |
| Per-category **Toggle All** button | `✅ members_customizePermissions` |
| Per-permission **checkboxes** | `✅ members_customizePermissions` |
| Permission search input | `✅ members_customizePermissions` |
| **Remove** membership (edge X) | `✅ members_removeFromDepartment` + hierarchy |
| **Remove** employee–employee link | `✅ organization_manageLinks` |
| **Create Connection** modal submit | `✅ members_addToDepartment` |
| **Create Connection** designation select | `✅ members_addToDepartment` |
| **Cancel** connection modal | — (dismiss) |
| **Cancel / Close** privileges modal (backdrop / button) | — (dismiss) |
| **Department node** click → edit dept | `✅ departments_edit` (delegates to DepartmentsPanel) |
| React Flow zoom/fit controls | `✅ organization_view` (read-only view) |
| "Not Allowed" restriction dialog **OK** | — (informational dismiss) |

---

## settings/page.tsx — Settings

### Profile (SettingsProfile.tsx) — any authenticated user

| UI Element | Permission |
|-----------|------------|
| Upload avatar (file input + camera overlay) | `🔓 profile_edit` |
| Remove image (×) | `🔓 profile_edit` |
| **Full Name** input | `🔓 profile_edit` |
| **Phone** input | `🔓 profile_edit` |
| **Save profile** submit | `🔓 profile_edit` |

### Security (SettingsSecurity.tsx) — any authenticated user

| UI Element | Permission |
|-----------|------------|
| **Current password** input + eye toggle | `🔓 profile_changePassword` |
| **New password** input + eye toggle | `🔓 profile_changePassword` |
| **Confirm password** input | `🔓 profile_changePassword` |
| **Save changes** (password) submit | `🔓 profile_changePassword` |
| **Email** input | `🔓 profile_changeEmail` |
| **Save changes** (email) submit | `🔓 profile_changeEmail` |

### Preferences — any authenticated user

| UI Element | Permission |
|-----------|------------|
| **Show coordinates** ToggleSwitch | `🔓 profile_editPreferences` |

### System (SettingsSystem.tsx) — requires any settings privilege to mount

| UI Element | Permission |
|-----------|------------|
| **Company Name** input | `✅ settings_manageCompany` |
| **Timezone** input | `✅ settings_manageCompany` |
| **Save** system card | `✅ settings_manageCompany` |
| Office lat/long/radius inputs | `✅ settings_manageOffice` |
| **Live Updates** ToggleSwitch (local until save) | `✅ settings_toggleLiveUpdates` |
| **Reset** office to defaults | `✅ settings_manageOffice` |
| **Save** office card | `✅ settings_manageOffice` |
| Test email **type** SegmentedControl | `✅ settings_sendTestEmail` |
| Test email **recipient** input | `✅ settings_sendTestEmail` |
| **Send Test Email** button | `✅ settings_sendTestEmail` |

### Payroll Config (SettingsPayroll.tsx) — `payroll_manageSalary` to mount

| UI Element | Permission |
|-----------|------------|
| **+ Add tier** button | `✅ payroll_manageSalary` |
| **× Remove tier** button | `✅ payroll_manageSalary` |
| Tier minutes/percentage inputs | `✅ payroll_manageSalary` |
| Absence penalty / overtime / pay day inputs | `✅ payroll_manageSalary` |
| **Save config** submit | `✅ payroll_manageSalary` |

---

## insights-desk/layout.tsx — Insights Desk Header

| UI Element | Permission |
|-----------|------------|
| **Progress** button → open EmployeeTasksModal | `🔓 insightsDesk_openProgress` |
| **Leaves** button → open LeavesModal | `🔓 insightsDesk_openLeaves` |
| **Payroll** button → open PayrollModal | `🔓 insightsDesk_openPayroll` |
| **Holidays** button → open overlay | `✅ holidays_view` |
| Load holidays list | `✅ holidays_view` ⚠️ currently ungated — `GET` fires on mount |
| **Declare Holiday** button (show form) | `✅ holidays_create` |
| **Add holiday** submit | `✅ holidays_create` |
| Holiday form **name** / **date** inputs | `✅ holidays_create` |
| Holiday form **Recurring yearly** toggle | `✅ holidays_create` |
| Per-row **ToggleSwitch** recurring | `✅ holidays_toggleRecurring` |
| **Remove holiday** trash icon → confirm | `✅ holidays_delete` |
| **Cancel** form | — (dismiss) |
| Close holidays modal (X / backdrop) | — (dismiss) |

---

## insights-desk/attendance/page.tsx

| UI Element | Permission |
|-----------|------------|
| View personal attendance | `🔓 attendance_viewOwn` |
| View team attendance | `✅ attendance_viewTeam` |
| **Search employees** | `✅ attendance_viewTeam` (rendered when `hasTeamAccess`) |
| **ScopeStrip** dept filter | `✅ attendance_viewTeam` |
| **All Employees** pill | `✅ attendance_viewTeam` |
| **My Attendance** pill | `🔓 attendance_viewOwn` (hidden for SA) |
| **Employee name** pills | `✅ attendance_viewTeam` |
| Employee overview **cards** (aggregate) → select | `✅ attendance_viewTeam` |
| **MiniCalendar** prev/next month | `🔓 attendance_viewOwn` or `✅ attendance_viewTeam` |
| **MiniCalendar** day select | `🔓 attendance_viewOwn` or `✅ attendance_viewTeam` |
| Team date panel **Close** (X) | — (dismiss) |
| Individual detail panel **Close** (X) | — (dismiss) |
| Coords link → Google Maps | `✅ attendance_viewLocation` |
| **View Task Activity** link | `🔓 insightsDesk_openProgress` |
| **+ Apply Leave** link | `🔓 leaves_request` |
| **Monthly record** day cards | `🔓 attendance_viewOwn` |

---

## EmployeeTasksModal.tsx — Insights Progress

All read-only. `isPrivileged` = SA or `tasks_view` or `tasks_viewTeamProgress`. Self-view always available.

| UI Element | Permission |
|-----------|------------|
| Open modal | `🔓 insightsDesk_openProgress` |
| **Back** chevron (employee → all) | `✅ tasks_viewTeamProgress` |
| Month **‹** / **›** nav (header) | `🔓 tasks_viewHistory` |
| Close (X) / backdrop click | — (dismiss) |
| Sidebar **MiniCalendar** prev/next month | `🔓 tasks_viewHistory` (disabled in all mode) |
| Sidebar **MiniCalendar** day select | `🔓 tasks_viewHistory` (disabled in all mode) |
| Sidebar **Search employees…** input | `✅ tasks_viewTeamProgress` |
| Sidebar **All Employees** item | `✅ tasks_viewTeamProgress` |
| Sidebar department group headers | `✅ tasks_viewTeamProgress` |
| Sidebar employee rows → select | `✅ tasks_viewTeamProgress` |
| All employees grid: department stat cards | `✅ tasks_viewTeamProgress` |
| All employees grid: employee **cards** → select | `✅ tasks_viewTeamProgress` |
| Individual calendar data load | `🔓 tasks_viewHistory` (own) or `✅ tasks_viewTeamProgress` |
| Individual timeline load | same |
| Day campaign cards load | same |
| **Show full month** | `🔓 tasks_viewHistory` |
| **Load more** timeline | `🔓 tasks_viewHistory` |

---

## PayrollModal.tsx

| UI Element | Permission |
|-----------|------------|
| View own payslip | `🔓 payroll_viewOwn` |
| View team payroll | `✅ payroll_viewTeam` |
| Close (X) / backdrop click | — (dismiss) |
| Sidebar **Search employees…** input | `✅ payroll_viewTeam` |
| Sidebar employee rows → select | `✅ payroll_viewTeam` |
| **All Employees** sidebar item | `isSuperAdmin` |
| **Yourself** (ME) sidebar item | `🔓 payroll_viewOwn` (hidden for SA) |
| Department header filter buttons (sidebar) | `✅ payroll_viewTeam` |
| Tab: **Overview** / **Employees** (all mode) | `✅ payroll_viewTeam` |
| Tab: **Summary** / **Daily** / **Year** (individual) | `🔓 payroll_viewOwn` or `✅ payroll_viewTeam` |
| Bank Sheet tab | `✅ payroll_viewTeam` |
| Employees table row → select employee | `✅ payroll_viewTeam` |
| Year grid month row → jump to month | `🔓 payroll_viewOwn` or `✅ payroll_viewTeam` |
| Month **‹** / **›** nav | `🔓 payroll_viewOwn` or `✅ payroll_viewTeam` |
| Salary display text | `✅ payroll_manageSalary` (read-only) |
| **Export** dropdown toggle | `✅ payroll_export` ⚠️ exists but unwired — currently: none |
| **Payroll Report CSV** | `✅ payroll_export` ⚠️ currently: none |
| **Year Report CSV** | `✅ payroll_export` ⚠️ currently: none |
| **Month Report CSV** | `✅ payroll_export` ⚠️ currently: none |
| **Payroll Report JSON** | `✅ payroll_export` ⚠️ currently: none |
| **Year Report JSON** | `✅ payroll_export` ⚠️ currently: none |
| **Month Report JSON** | `✅ payroll_export` ⚠️ currently: none |
| **Print / PDF** | `✅ payroll_export` ⚠️ currently: none |
| **Copy to Clipboard** | `✅ payroll_export` ⚠️ currently: none |

---

## LeavesModal.tsx

| UI Element | Permission |
|-----------|------------|
| View own leaves | `🔓 leaves_viewOwn` |
| View team leaves | `✅ leaves_viewTeam` |
| Close (X) / backdrop click | — (dismiss) |
| Sidebar **Search employees…** input | `✅ leaves_viewTeam` |
| Sidebar employee rows → select | `✅ leaves_viewTeam` |
| Sidebar department header buttons → filter | `✅ leaves_viewTeam` |
| **All Employees** sidebar item | `isSuperAdmin` |
| **Yourself** sidebar item | `🔓 leaves_viewOwn` (hidden for SA) |
| Year **‹** / **›** nav | `🔓 leaves_viewOwn` or `✅ leaves_viewTeam` |
| Tab: **Overview** / **Employees** (all mode) | `✅ leaves_viewTeam` |
| **Request leave** button (show form) | `🔓 leaves_request` (relabeled when viewing others without `leaves_submitOnBehalf`) |
| **Submit request** (own) | `🔓 leaves_request` |
| **Submit request** (for another user) | `✅ leaves_submitOnBehalf` (API + client aligned) |
| Approve / reject leave request | `✅ leaves_approve` ⚠️ **no UI exists** — key enforced in API only |
| **Cancel** form | — (dismiss) |
| **Full day / Half day** toggle | `🔓 leaves_request` (inherits form gate) |
| **Multiple days** ToggleSwitch | `🔓 leaves_request` (inherits form gate) |
| Type **select** dropdown | `🔓 leaves_request` (inherits form gate) |
| Date / end date **inputs** | `🔓 leaves_request` (inherits form gate) |
| Reason **input** | `🔓 leaves_request` (inherits form gate) |

---

## EmployeeModal.tsx

| UI Element | Permission |
|-----------|------------|
| Close (X) / backdrop click | — (dismiss) |
| **Overview** tab | `✅ employees_viewDetail` (own: always; others: requires view detail perm) |
| **Attendance** tab | own OR `✅ attendance_viewTeam` OR `✅ employees_viewAttendance` (conditional, like other tabs) |
| **Payroll** tab | own OR `✅ payroll_viewTeam` |
| **Leaves** tab | own OR `✅ leaves_viewTeam` |
| **Tasks** tab | own OR `✅ tasks_view` |
| **Location** tab | own OR `✅ attendance_viewTeam` |
| **Schedule** tab | own OR `✅ employees_viewSchedule` |
| **Profile** tab | `✅ employees_viewDetail` (own: always; others: requires view detail perm) |
| **Edit** button (enter edit mode) | own OR `✅ employees_edit` (blocked for non-SA editing SA) |
| **Save** employee submit | own OR `✅ employees_edit` (+`✅ payroll_manageSalary` for salary) |
| **Cancel** edit | — (dismiss) |
| **Copy Mon → All** schedule | own OR `✅ employees_edit` (edit mode) |
| Per-day **ToggleSwitch** schedule | own OR `✅ employees_edit` (edit mode) |
| Shift **select** dropdown | own OR `✅ employees_edit` (edit mode) |
| Grace minutes **input** | own OR `✅ employees_edit` (edit mode) |
| Department **chips** select | own OR `✅ employees_edit` (edit mode) |
| **Manage multiple departments** toggle | own OR `✅ employees_edit` (edit mode) |
| **Use single department** toggle | own OR `✅ employees_edit` (edit mode) |
| **Full Name** input (profile tab) | own OR `✅ employees_edit` (edit mode) |
| **New Password** input (profile tab) | own OR `✅ employees_edit` (edit mode) |
| **Base Salary** input (profile tab) | `✅ payroll_manageSalary` (edit mode) |
| Calendar day select (attendance) | own OR `✅ attendance_viewTeam` |
| Location day nav arrows (prev/next) | own OR `✅ attendance_viewTeam` |
| Coords link / **Map** → Google Maps | `✅ attendance_viewLocation` |
| Overview flag coords → Google Maps | own OR `✅ attendance_viewTeam` |
| Salary display text (read-only) | `✅ payroll_manageSalary` |

---

## SessionTracker.tsx

Hidden for SuperAdmin. Automatic for all other authenticated users.

| UI Element | Permission |
|-----------|------------|
| Auto **Check-in** on page load | `🔓 attendance_autoCheckin` (all non-SA employees) |
| **Heartbeat** every 30s | `🔓 attendance_autoCheckin` |
| Auto **Checkout** on page unload (beacon) | `🔓 attendance_autoCheckin` |
| **Re-check Location** / **Checking…** button | `🔓 attendance_autoCheckin` |
| **Still there?** nudge toast tap | `🔓 attendance_autoCheckin` |
| Away overlay tap → resume | `🔓 attendance_autoCheckin` |
| Live coords display on pill | `showCoordinates` user pref |

---

## Shared Components

| Component | UI Element | Permission |
|-----------|-----------|------------|
| **ScopeStrip** | Dept filter buttons | `canAny("employees_view", "attendance_viewTeam", "departments_view")` + ≥2 depts |
| **EmployeeCard** | Card click → modal | Delegated via `onCardClick` prop |
| **EmployeeCard** | **Ping** button | `🔓 ping_send` + `liveUpdates` (API enforces hierarchy) |
| **EmployeeCard** | **Manage** button | Delegated via `onManage` prop |
| **EmployeeCard** | **Edit** button | Delegated via `onEdit` prop |
| **EmployeeCard** | **Deactivate** button | Delegated via `onDelete` prop |
| **EmployeeCard** | Checkbox multi-select | Delegated via `onSelect` prop |
| **EmployeeCard** | Flag coords → Google Maps | `✅ attendance_viewLocation` |
| **MiniCalendar** | Prev/Next month | Inherits parent's gate (delegated via callback) |
| **MiniCalendar** | Day cell click | Inherits parent's gate (delegated via callback) |
| **ConfirmDialog** | Backdrop click → cancel | — (dismiss) |
| **ConfirmDialog** | **Cancel** button | — (dismiss) |
| **ConfirmDialog** | **{confirmLabel}** confirm | Inherits parent's gate (delegated via callback) |
| **ToggleSwitch** | Switch toggle | Inherits parent's gate (`disabled` prop) |
| **SearchField** | Text input | Inherits parent's gate (client-side filter) |
| **RefreshBtn** | Refresh click | Inherits parent's gate (delegated via callback) |
| **ModalShell** | Close (X) | — (dismiss) |

---

## Onboarding

| UI Element | Permission |
|-----------|------------|
| **Skip tour** | — (help system, all users) |
| **Back** / **Next** / **Get Started** (Welcome) | — (help system, all users) |
| Pager dots (Welcome) | — (help system, all users) |
| Backdrop click (Welcome) | — (dismiss) |
| **Skip** / **Back** / **Next** / **Finish** (Spotlight) | — (help system, all users) |
| Overlay click (Spotlight) | — (dismiss) |
| Keyboard: Esc / Enter / arrows (Spotlight) | — (help system, all users) |

---

## Keys Summary

### Self-Service Keys (27 — always ON via `SELF_PERMISSIONS`, no designation needed)

| Key | Category |
|-----|----------|
| `overview_access` | Page Access |
| `workspace_access` | Page Access |
| `insightsDesk_access` | Page Access |
| `settings_access` | Page Access |
| `insightsDesk_openProgress` | Modal Entry |
| `insightsDesk_openLeaves` | Modal Entry |
| `insightsDesk_openPayroll` | Modal Entry |
| `tasks_viewOwn` | Data Access |
| `tasks_markChecklist` | Task Self-Service |
| `tasks_changeOwnStatus` | Task Self-Service |
| `tasks_viewHistory` | Task History |
| `campaigns_viewOwn` | Data Access |
| `attendance_viewOwn` | Data Access |
| `attendance_autoCheckin` | Attendance |
| `leaves_viewOwn` | Data Access |
| `leaves_request` | Leave Actions |
| `payroll_viewOwn` | Data Access |
| `ping_view` | Communication |
| `ping_send` | Communication (API enforces hierarchy) |
| `ping_markRead` | Communication |
| `profile_edit` | Profile |
| `profile_changePassword` | Profile |
| `profile_changeEmail` | Profile |
| `profile_editPreferences` | Profile |

### Privilege-Gated Keys (assigned via designations)

| Key | Category |
|-----|----------|
| `tasks_viewTeamProgress` | Task History |
| `tasks_toggleActive` | Task Granularity |
| `tasks_reorder` | Task Granularity |
| `campaigns_toggleStatus` | Campaign Granularity |
| `leaves_submitOnBehalf` | Leave Actions |
| `analytics_viewDashboard` | Analytics |
| `analytics_viewNeedsAttention` | Analytics |
| `analytics_viewPresence` | Analytics |
| `designations_create` | Designation Split |
| `designations_edit` | Designation Split |
| `designations_delete` | Designation Split |
| `designations_toggleStatus` | Designation Split |
| `designations_setPermissions` | Designation Split |
| `holidays_create` | Holiday Split |
| `holidays_delete` | Holiday Split |
| `holidays_toggleRecurring` | Holiday Split |
| `settings_manageCompany` | Settings Split |
| `settings_manageOffice` | Settings Split |
| `settings_toggleLiveUpdates` | Settings Split |
| `settings_sendTestEmail` | Settings Split |
| `employees_viewAttendance` | Employee Modal Tabs |
| `employees_viewPayroll` | Employee Modal Tabs |
| `employees_viewLeaves` | Employee Modal Tabs |
| `employees_viewTasks` | Employee Modal Tabs |
| `employees_viewLocation` | Employee Modal Tabs |
| `employees_viewSchedule` | Employee Modal Tabs |

---

## Existing Keys — Unused or Unwired in UI (15 keys)

### Defined but never referenced in any `.tsx` file

| Key | Status | Notes |
|-----|--------|-------|
| `✅ updates_view` | **No UI exists** | Entire "Updates" feature (4 keys) has no page/modal/component |
| `✅ updates_create` | **No UI exists** | Same |
| `✅ updates_edit` | **No UI exists** | Same |
| `✅ updates_delete` | **No UI exists** | Same |
| `✅ payroll_generateSlips` | **No UI exists** | Pay slip generation not yet built |
| `✅ payroll_finalizeSlips` | **No UI exists** | Pay slip finalization not yet built |
| `✅ attendance_overridePast` | **No UI exists** | Past attendance editing not yet built |
| `✅ leaves_editPast` | **No UI exists** | Past leave editing not yet built |
| `✅ members_setReportingChain` | **No UI exists** | Reporting chain management not yet built |
| `✅ settings_view` | **Not used** | Settings page has no access gate; key exists but is never checked |

### Defined and used in API only (not in UI)

| Key | Status | Notes |
|-----|--------|-------|
| `✅ leaves_approve` | **API-only** | Enforced in `POST /api/leaves` for past-dated leave corrections. On-behalf uses `leaves_submitOnBehalf`. No approval/rejection UI exists |
| `✅ leaves_manageBulk` | **No UI exists** | Bulk leave management not yet built |

### Defined but unwired to their intended UI elements

| Key | Where to Wire |
|-----|---------------|
| `✅ payroll_export` | PayrollModal.tsx — all 9 export buttons (CSV, JSON, PDF, clipboard) |
| `✅ attendance_export` | Attendance page — no export UI exists yet |
| `✅ campaigns_view` | workspace/page.tsx, OverviewPage.tsx — campaign data fetch gating |

---

*Final recheck — all items audited against the single rule: `isSelf || isSuperAdmin || (hasPrivilege && inHierarchy)`. Self-service items marked with 🔓 are always allowed via `SELF_PERMISSIONS`. All privilege-gated items use ✅ existing keys. April 2026*
