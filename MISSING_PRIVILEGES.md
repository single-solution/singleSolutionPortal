# Missing & Proposed Privileges

> Every privilege that **does not exist** but **should**, based on a full scan of the
> UI inventory and codebase. Organized into three tiers:
>
> 1. **Ungated Actions** — functional UI actions that currently have **zero** permission check
> 2. **Coarse Keys to Split** — existing keys that bundle too many distinct operations
> 3. **Missing Categories** — entirely new permission areas with no coverage at all

Reference: 56 existing keys in `lib/permissions.shared.ts` → `IPermissions`.

---

## Tier 1 — Ungated Actions (no `canPerm` / `isSuperAdmin` check today)

These are real buttons/forms/mutations in the UI that any authenticated user can trigger.

### 1.1 Page & Route Access

Currently only `/organization` has a page-level deny. All other dashboard routes
are accessible to every authenticated user with no permission gate.

| Proposed Key | Protects | Current State |
|-------------|----------|---------------|
| `overview_access` | View the Overview dashboard (`/`) | All authenticated |
| `workspace_access` | View the Workspace page (`/workspace`) | All authenticated |
| `insightsDesk_access` | View Insights Desk (`/insights-desk/*`) | All authenticated |
| `settings_access` | View the Settings page (`/settings`) | All authenticated |

**Where to enforce:** `AppLayout.tsx` nav link filter + early return in each `page.tsx`.

---

### 1.2 Insights Desk Modal Entry

The header buttons for Progress / Leaves / Payroll are shown to everyone.
The modals apply their own internal gates, but the buttons themselves are ungated.

| Proposed Key | Protects | Current State |
|-------------|----------|---------------|
| `insightsDesk_openProgress` | "Progress" button → `EmployeeTasksModal` | Button always visible |
| `insightsDesk_openLeaves` | "Leaves" button → `LeavesModal` | Button always visible |
| `insightsDesk_openPayroll` | "Payroll" button → `PayrollModal` | Button always visible |

**Where to enforce:** `insights-desk/layout.tsx` header button rendering.

---

### 1.3 Self-Service Task Actions (Overview)

On the Overview page, task checklist and status actions have only a `!isSuperAdmin`
guard — no `canPerm` check. Any non-SA user can mark/undo checklists and change
task statuses.

| Proposed Key | Protects | Current State |
|-------------|----------|---------------|
| `tasks_markChecklist` | Mark checklist item complete / undo (`POST /api/campaigns/:id/checklist`) | Not SA only |
| `tasks_changeOwnStatus` | Change own task status to done/working/pending (`PUT /api/tasks/:id`) | Not SA only |

**Where to enforce:** `OverviewPage.tsx` — `handleDashStatusConfirm`, `OtherRoleOverview` checklist/task handlers.

---

### 1.4 Payroll Exports

Every export button inside the Payroll modal (CSV, JSON, PDF, clipboard) has
**no permission check**. Anyone who opens the modal can export all data.

| Proposed Key | Protects | Current State |
|-------------|----------|---------------|
| `payroll_exportReport` | All export actions in PayrollModal (CSV, JSON, PDF, print, clipboard) | None — button always rendered |

**Where to enforce:** `PayrollModal.tsx` — export dropdown and individual export handlers.

> Note: `payroll_export` already exists in `IPermissions` but is **never used in the UI**.
> Either wire it to these buttons or replace with the key above.

---

### 1.5 Leave Request Submission

Any authenticated user can submit a leave request — there is no `canPerm` gate on
the submit handler. Submitting on behalf of another user uses `leaves_viewTeam`
(a read permission) as the only gate.

| Proposed Key | Protects | Current State |
|-------------|----------|---------------|
| `leaves_request` | Submit own leave request (`POST /api/leaves`) | Any authenticated |
| `leaves_requestOnBehalf` | Submit leave for another employee (`POST /api/leaves` with `userId`) | `leaves_viewTeam` (read perm) |

**Where to enforce:** `LeavesModal.tsx` — `handleSubmit`.

---

### 1.6 Profile & Account Self-Service

Profile editing, password change, and email change have no permission check —
any logged-in user can perform them.

| Proposed Key | Protects | Current State |
|-------------|----------|---------------|
| `profile_edit` | Edit own name, phone, avatar (`PUT /api/profile`) | Any authenticated |
| `profile_changePassword` | Change own password (`PUT /api/profile/password`) | Any authenticated |
| `profile_changeEmail` | Change own email (`PUT /api/profile` with email) | Any authenticated |
| `profile_editPreferences` | Toggle "show coordinates" (`PUT /api/profile` with showCoordinates) | Any authenticated |

**Where to enforce:** `settings/page.tsx`, `SettingsProfile.tsx`, `SettingsSecurity.tsx`.

> Decision needed: some orgs want all employees to freely edit their profile.
> If so, mark these as "always on by default" but still gate-able.

---

### 1.7 Ping Inbox Visibility

The ping inbox in the header is shown/hidden based on the **`liveUpdates` system
setting**, not a user permission. Any user sees pings when liveUpdates is on.

| Proposed Key | Protects | Current State |
|-------------|----------|---------------|
| `ping_view` | See the pings bell + inbox panel | `liveUpdates` system flag only |
| `ping_markRead` | Mark pings as read (`PATCH /api/ping`) | Same |

**Where to enforce:** `AppLayout.tsx` — ping bell + panel rendering, mark-read handler.

---

### 1.8 Session Tracker / Auto Check-in

The SessionTracker fires automatic check-in, heartbeat, and checkout for every
non-SA user. There is no individual permission to exempt someone or control it.

| Proposed Key | Protects | Current State |
|-------------|----------|---------------|
| `attendance_autoCheckin` | Whether session tracker runs for this user | All non-SA (automatic) |
| `attendance_exemptTracking` | Exempt user from geolocation tracking | Only SA is exempt |

**Where to enforce:** `SessionTracker.tsx` — initial `useEffect`.

---

### 1.9 Data Fetch Gates (Reads Without Permission)

Several data fetches fire unconditionally for all users.

| Proposed Key | Protects | Current State |
|-------------|----------|---------------|
| `tasks_viewOwn` | Fetch own tasks on Overview/Workspace (`GET /api/tasks`) | Always fetched |
| `campaigns_viewOwn` | Fetch own campaigns on Overview/Workspace (`GET /api/campaigns`) | Always fetched; `campaigns_view` exists but is unused for gating |
| `attendance_viewOwn` | Fetch own attendance data | All non-SA (implicit) |
| `leaves_viewOwn` | Fetch own leave balance and history | All non-SA (implicit) |
| `payroll_viewOwn` | Fetch own payslip/estimate | All non-SA (implicit) |

**Where to enforce:** `OverviewPage.tsx` `fetchFull`, `workspace/page.tsx` data hooks,
`attendance/page.tsx`, `LeavesModal.tsx`, `PayrollModal.tsx`.

> Decision needed: "view own" permissions are unusual — most apps grant this by
> default. But for orgs that want to hide payslips or attendance from certain
> employees, these keys are necessary.

---

## Tier 2 — Coarse Keys to Split

These are existing permission keys that cover too many distinct operations.
Splitting gives finer control.

### 2.1 `designations_manage` → 5 keys

Currently one key controls all designation CRUD + permissions assignment.

| Proposed Key | Replaces | Specific Action |
|-------------|----------|-----------------|
| `designations_create` | `designations_manage` | Create new designation |
| `designations_edit` | `designations_manage` | Edit designation name/description/color |
| `designations_delete` | `designations_manage` | Delete designation |
| `designations_toggleStatus` | `designations_manage` | Toggle designation active/inactive |
| `designations_setPermissions` | `designations_manage` | Set default permissions for designation |

**Where used:** `DesignationsPanel.tsx` — each modal/button currently checks `canManage`.

---

### 2.2 `holidays_manage` → 3 keys

| Proposed Key | Replaces | Specific Action |
|-------------|----------|-----------------|
| `holidays_create` | `holidays_manage` | Add a new holiday |
| `holidays_delete` | `holidays_manage` | Remove a holiday |
| `holidays_toggleRecurring` | `holidays_manage` | Toggle recurring flag |

**Where used:** `insights-desk/layout.tsx` — holiday CRUD section.

---

### 2.3 `settings_manage` → 4 keys

| Proposed Key | Replaces | Specific Action |
|-------------|----------|-----------------|
| `settings_manageCompany` | `settings_manage` | Edit company name, logo, details |
| `settings_manageOffice` | `settings_manage` | Edit office coordinates, shift config |
| `settings_toggleLiveUpdates` | `settings_manage` | Enable/disable live updates system-wide |
| `settings_sendTestEmail` | `settings_manage` | Trigger test email (`GET /api/test-email`) |

**Where used:** `SettingsSystem.tsx` — currently one card per group.

---

### 2.4 `campaigns_edit` → 2 keys

| Proposed Key | Replaces | Specific Action |
|-------------|----------|-----------------|
| `campaigns_editDetails` | `campaigns_edit` | Edit campaign name, description, dates |
| `campaigns_toggleStatus` | `campaigns_edit` | Pause / activate a campaign |

**Where used:** `workspace/page.tsx` — edit modal vs. toggle switch.

---

### 2.5 `tasks_edit` → 3 keys

| Proposed Key | Replaces | Specific Action |
|-------------|----------|-----------------|
| `tasks_editDetails` | `tasks_edit` | Edit task title, description, schedule |
| `tasks_toggleActive` | `tasks_edit` | Toggle task active/inactive |
| `tasks_reorder` | `tasks_edit` | Drag-reorder tasks within a campaign |

**Where used:** `workspace/page.tsx` — edit modal, toggle switch, drag handler.

---

### 2.6 `attendance_viewTeam` → 2 keys

| Proposed Key | Replaces | Specific Action |
|-------------|----------|-----------------|
| `attendance_viewTeamRecords` | `attendance_viewTeam` | See team attendance calendar/stats |
| `attendance_viewLocation` | `attendance_viewTeam` | See GPS coordinates and location flags |

**Where used:** `EmployeeModal.tsx` — Location tab, `attendance/page.tsx` — coords links.

---

### 2.7 `leaves_viewTeam` (dual use as write gate)

`leaves_viewTeam` currently gates both **reading** other employees' leaves AND
**submitting** leaves on their behalf. These should be separate.

| Proposed Key | Replaces | Specific Action |
|-------------|----------|-----------------|
| `leaves_viewTeam` | (keep) | Read-only: view other employees' leave data |
| `leaves_submitOnBehalf` | Implicit in `leaves_viewTeam` | Write: submit a leave request for another user |

**Where used:** `LeavesModal.tsx` — employee dropdown (read) vs. `handleSubmit` (write).

---

## Tier 3 — Missing Categories (no coverage at all)

### 3.1 Admin Dashboard Analytics

The "Admin Overview" section on Overview is visible only to SuperAdmin.
No regular permission key can grant access to these stats.

| Proposed Key | Protects |
|-------------|----------|
| `analytics_viewDashboard` | See admin overview stats grid (present %, overdue, flags) |
| `analytics_viewNeedsAttention` | See "Needs Attention" mini-cards (absent, overdue, unassigned) |
| `analytics_viewPresence` | See live presence data (in office / remote / absent counts) |

**Where to enforce:** `OverviewPage.tsx` — `AdminDashboard` component, `hasTeamAccess` derived flag.

---

### 3.2 Task History & Progress Reports

Task history (Progress modals in both Workspace and Insights) uses `isPrivileged`
= `isSuperAdmin || tasks_view`. There is no dedicated history/reporting permission.

| Proposed Key | Protects |
|-------------|----------|
| `tasks_viewHistory` | Access task history / progress modals (`GET /api/tasks/history`) |
| `tasks_viewTeamProgress` | See all-employees progress view (vs. only own timeline) |

**Where to enforce:** `workspace/page.tsx` — Progress button, `EmployeeTasksModal.tsx` — `isPrivileged` checks.

---

### 3.3 Bulk & Batch Operations

No permissions exist for bulk actions. If bulk features are added, these would
be needed.

| Proposed Key | Protects |
|-------------|----------|
| `employees_bulkImport` | Import employees via CSV/file |
| `employees_bulkExport` | Export employee directory |
| `attendance_bulkEdit` | Batch-edit attendance records |
| `leaves_bulkApprove` | Approve/reject multiple leaves at once (extends `leaves_manageBulk`) |

---

### 3.4 Audit & Security

`activityLogs_view` is the only audit key. Missing granularity.

| Proposed Key | Protects |
|-------------|----------|
| `activityLogs_export` | Export activity log data |
| `activityLogs_viewSensitive` | See security-sensitive entries (password changes, permission edits) |
| `activityLogs_markRead` | Mark activity items as read (currently bundled into `activityLogs_view`) |

---

### 3.5 Employee Modal Cross-Domain Tabs

The Employee Modal shows tabs based on `canAtt`, `canTasksNav`, `canViewPayroll`,
`canViewLeaves` — all derived from "own OR team-level permission". But there is
no way to say "User X can view another employee's tasks but NOT their payroll"
without the existing keys bleeding together.

| Proposed Key | Protects |
|-------------|----------|
| `employees_viewAttendance` | See Attendance tab for other employees |
| `employees_viewTasks` | See Tasks tab for other employees |
| `employees_viewPayroll` | See Payroll tab for other employees |
| `employees_viewLeaves` | See Leaves tab for other employees |
| `employees_viewLocation` | See Location tab for other employees |
| `employees_viewSchedule` | See Schedule tab for other employees |

> These would override the current "own or team-level" fallback with explicit
> cross-domain grants per employee viewer.

---

### 3.6 Onboarding & Tours

Tours and welcome guide are client-only — no permission control at all.

| Proposed Key | Protects |
|-------------|----------|
| `onboarding_manageTours` | Configure which tours display, reset tour state for users |

> Individual tour skip/complete is self-service and likely doesn't need a gate.

---

### 3.7 Notifications & Communication (extended)

Beyond `ping_send` and `activityLogs_view`, there is no granularity.

| Proposed Key | Protects |
|-------------|----------|
| `ping_viewHistory` | See past pings (if a history feature is added) |
| `notifications_manage` | Configure notification preferences (if per-user settings are added) |

---

## Summary Count

| Tier | Count | Description |
|------|-------|-------------|
| **Tier 1** — Ungated Actions | **25** new keys | Actions with zero permission check today |
| **Tier 2** — Splits | **22** new keys (replacing 7 existing) | Finer granularity on existing coarse keys |
| **Tier 3** — New Categories | **18** new keys | Entirely new areas with no coverage |
| **Total proposed** | **65** new keys | On top of 56 existing = ~121 total |

---

## Priority Recommendation

**Implement first (high risk / high impact):**
1. `payroll_exportReport` — financial data leaks via unrestricted exports
2. `leaves_requestOnBehalf` / `leaves_submitOnBehalf` — write action gated by a read perm
3. `insightsDesk_openPayroll` — modal entry should match internal gate
4. Page access keys (`overview_access`, `workspace_access`, etc.) — route hardening
5. Wire existing unused `payroll_export` to export buttons

**Implement second (moderate impact):**
6. `ping_view` / `ping_markRead` — separate from system setting
7. `tasks_markChecklist` / `tasks_changeOwnStatus` — self-service task ops
8. `attendance_autoCheckin` — control who gets tracked
9. Split `designations_manage` — most commonly needed fine-grained control
10. `analytics_*` keys — let non-SA see dashboard stats

**Implement later (nice to have):**
11. `profile_*` keys — most orgs allow self-service
12. `*_viewOwn` keys — unusual; only for restrictive orgs
13. Remaining Tier 2 splits
14. Tier 3 bulk/audit/onboarding keys

---

*Generated from UI_INVENTORY.md audit + codebase scan — April 2026*
