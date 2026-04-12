# Privilege System — Summary & Action Plan

> Side-by-side comparison of **existing** privileges (54 keys in `lib/permissions.shared.ts`) vs. **recommended** final set, with every overlap, redundancy, and gap resolved.

---

## 1. Full Comparison: Existing vs. Recommended

| # | Existing Key | Used? | Verdict | Reason |
|---|-------------|:-----:|---------|--------|
| | **Employees** | | | |
| 1 | `employees_view` | Yes | **KEEP** | Gates employee list, detail, dropdown, resolve, org chart, ScopeStrip |
| 2 | `employees_viewDetail` | No | **REMOVE** | Never checked anywhere — `employees_view` already gates both the list page AND the detail page (`/employee/[slug]`, `/api/employees/[id]`) |
| 3 | `employees_create` | Yes | **KEEP** | Gates "Add Employee" buttons + POST |
| 4 | `employees_edit` | Yes | **KEEP** | Gates edit form + PUT |
| 5 | `employees_delete` | Yes | **KEEP** | Gates delete/deactivate + DELETE |
| 6 | `employees_toggleStatus` | Yes | **KEEP** | Gates active/inactive toggle (separate from delete — toggle is reversible, delete is permanent) |
| 7 | `employees_resendInvite` | Yes | **KEEP** | Gates resend invite + copy link buttons |
| | **Members** | | | |
| 8 | `members_addToDepartment` | Yes | **KEEP** | Gates adding employees to departments |
| 9 | `members_removeFromDepartment` | Yes | **KEEP** | Gates removing employees from departments |
| 10 | `members_assignDesignation` | Yes | **KEEP** | Gates assigning designation in org chart |
| 11 | `members_customizePermissions` | Yes | **KEEP** | Gates per-member permission overrides |
| 12 | `members_setReportingChain` | No | **REMOVE** | Never checked — `organization_manageLinks` already covers reporting chain management (flow-layout PUT, hierarchy-sync POST do the same thing) |
| | **Organization** | | | |
| 13 | `organization_view` | Yes | **KEEP** | Gates org page access + dock nav visibility |
| 14 | `organization_manageLinks` | Yes | **KEEP** | Gates editing org chart links and hierarchy |
| | **Departments** | | | |
| 15 | `departments_view` | Yes | **KEEP** | Gates department list + ScopeStrip |
| 16 | `departments_create` | Yes | **KEEP** | Gates "Add Department" |
| 17 | `departments_edit` | Yes | **KEEP** | Gates department editing |
| 18 | `departments_delete` | Yes | **KEEP** | Gates department deletion |
| | **Tasks** | | | |
| 19 | `tasks_view` | Yes | **KEEP** | Gates team task visibility |
| 20 | `tasks_create` | Yes | **KEEP** | Gates task creation |
| 21 | `tasks_edit` | Yes | **KEEP** | Gates task editing (parent gate for PUT) |
| 22 | `tasks_delete` | Yes | **KEEP** | Gates task deletion |
| 23 | `tasks_reassign` | Yes | **KEEP** | Sub-gate within `tasks_edit` — needs both to change assignee |
| | **Campaigns** | | | |
| 24 | `campaigns_view` | Yes | **KEEP** | Gates team campaign visibility |
| 25 | `campaigns_create` | Yes | **KEEP** | Gates campaign creation |
| 26 | `campaigns_edit` | Yes | **KEEP** | Gates campaign editing + status changes |
| 27 | `campaigns_delete` | Yes | **KEEP** | Gates campaign deletion |
| 28 | `campaigns_tagEntities` | Yes | **KEEP** | Gates tagging employees/departments to campaigns |
| | **Updates** | | | |
| 29 | `updates_view` | No | **KEEP (reserved)** | Feature not built yet — keep for future Updates/Announcements module |
| 30 | `updates_create` | No | **KEEP (reserved)** | Same — reserved for future |
| 31 | `updates_edit` | No | **KEEP (reserved)** | Same — reserved for future |
| 32 | `updates_delete` | No | **KEEP (reserved)** | Same — reserved for future |
| | **Attendance** | | | |
| 33 | `attendance_viewTeam` | Yes | **KEEP** | Gates all team attendance views (dashboard, attendance page, presence, trend, sessions, location flags) |
| 34 | `attendance_viewDetail` | Yes | **KEEP** | Gates session-level detail (activity strips, session timelines) — finer layer within team view |
| 35 | `attendance_edit` | Yes | **KEEP** | Gates acknowledging location flags (only API, no client button — bug) |
| 36 | `attendance_overridePast` | No | **KEEP (reserved)** | Intended for future past-attendance correction feature — distinct from `attendance_edit` |
| 37 | `attendance_export` | No | **KEEP (reserved)** | Intended for future attendance CSV/PDF export |
| | **Leaves** | | | |
| 38 | `leaves_viewTeam` | Yes | **KEEP** | Gates viewing other employees' leave records and balances |
| 39 | `leaves_approve` | Yes | **KEEP but SPLIT** | Currently overloaded: does both "apply on behalf" AND "approve/reject." See NEW keys below. |
| 40 | `leaves_editPast` | Yes | **KEEP** | Gates deleting historical leave records |
| 41 | `leaves_manageBulk` | Yes | **KEEP** | Gates bulk-editing leave balances |
| | **Payroll** | | | |
| 42 | `payroll_viewTeam` | Yes | **KEEP** | Gates viewing team payroll data (payslips, estimates, config) |
| 43 | `payroll_manageSalary` | Yes | **KEEP but SPLIT** | Currently overloaded: does both "set salary" AND "edit payroll config." See NEW keys below. |
| 44 | `payroll_generateSlips` | Yes | **KEEP** | Gates batch payslip generation |
| 45 | `payroll_finalizeSlips` | Yes | **KEEP** | Gates finalizing individual payslips |
| 46 | `payroll_export` | No | **KEEP (reserved)** | Intended for future payroll export feature |
| | **Communication** | | | |
| 47 | `ping_send` | Yes | **KEEP** | Gates sending pings to employees |
| 48 | `activityLogs_view` | Yes | **KEEP** | Gates viewing team-wide activity logs |
| | **System** | | | |
| 49 | `designations_view` | Yes | **KEEP** | Gates viewing designations list |
| 50 | `designations_manage` | Yes | **KEEP** | Gates creating/editing/deleting designations |
| 51 | `holidays_view` | No | **REMOVE** | Never enforced — holiday GET is open to all authenticated users. Viewing holidays should stay open. |
| 52 | `holidays_manage` | Yes | **KEEP** | Gates creating/toggling/deleting holidays |
| 53 | `settings_view` | Partially | **REMOVE** | Only checked on API GET, but client page uses `settings_manage` exclusively. A user with `settings_view` but not `settings_manage` has no way to access the page. Redundant. |
| 54 | `settings_manage` | Yes | **KEEP** | Gates all settings page actions + API writes |

---

## 2. Keys to Remove (4)

| Key | Why It's Redundant |
|-----|--------------------|
| `employees_viewDetail` | `employees_view` already gates both list and detail — this key is never checked in client or API |
| `members_setReportingChain` | `organization_manageLinks` does the exact same thing — org chart link editing IS reporting chain management |
| `holidays_view` | All users can view holidays (GET is ungated). No reason to restrict viewing the holiday calendar |
| `settings_view` | Client only checks `settings_manage` for the entire settings page. API-only gate with no client counterpart is pointless |

---

## 3. Keys to Add (2)

| Key | Split From | What It Controls | Why It's Needed |
|-----|-----------|-----------------|-----------------|
| `leaves_applyForTeam` | `leaves_approve` | Applying leave on behalf of another user (`/api/leaves` POST with `userId != self`) | A team lead should be able to submit leave for a subordinate without having power to approve/reject all team leaves. Currently both actions use `leaves_approve`. |
| `payroll_manageConfig` | `payroll_manageSalary` | Editing payroll configuration (late tiers, penalty rules, pay day, overtime rate — `/api/payroll/config` PUT) | Setting an individual's salary amount is different from configuring company-wide payroll rules. Currently both actions use `payroll_manageSalary`. |

---

## 4. Final Recommended Privilege Set (52 keys)

### Employees (6 keys)
| Key | Description |
|-----|------------|
| `employees_view` | View employee list + profiles |
| `employees_create` | Create/invite new employees |
| `employees_edit` | Edit employee profiles |
| `employees_delete` | Permanently remove employees |
| `employees_toggleStatus` | Activate/deactivate employee accounts |
| `employees_resendInvite` | Resend invitation emails |

### Members (4 keys)
| Key | Description |
|-----|------------|
| `members_addToDepartment` | Add employees to departments |
| `members_removeFromDepartment` | Remove employees from departments |
| `members_assignDesignation` | Assign designations to members |
| `members_customizePermissions` | Override per-member permission defaults |

### Organization (2 keys)
| Key | Description |
|-----|------------|
| `organization_view` | View org chart page |
| `organization_manageLinks` | Edit org chart links + reporting chains |

### Departments (4 keys)
| Key | Description |
|-----|------------|
| `departments_view` | View department list |
| `departments_create` | Create new departments |
| `departments_edit` | Edit departments |
| `departments_delete` | Delete departments |

### Tasks (5 keys)
| Key | Description |
|-----|------------|
| `tasks_view` | View team tasks |
| `tasks_create` | Create new tasks |
| `tasks_edit` | Edit task details and status |
| `tasks_delete` | Delete tasks |
| `tasks_reassign` | Change task assignee (requires `tasks_edit` too) |

### Campaigns (5 keys)
| Key | Description |
|-----|------------|
| `campaigns_view` | View team campaigns |
| `campaigns_create` | Create new campaigns |
| `campaigns_edit` | Edit campaigns and change status |
| `campaigns_delete` | Delete campaigns |
| `campaigns_tagEntities` | Tag employees/departments to campaigns |

### Updates (4 keys — reserved for future)
| Key | Description |
|-----|------------|
| `updates_view` | View updates and announcements |
| `updates_create` | Post new updates |
| `updates_edit` | Edit existing updates |
| `updates_delete` | Delete updates |

### Attendance (5 keys)
| Key | Description |
|-----|------------|
| `attendance_viewTeam` | View team attendance (dashboard, attendance page, presence, trend) |
| `attendance_viewDetail` | View session-level detail (activity strips, check-in/out logs) |
| `attendance_edit` | Acknowledge location flags / correct attendance records |
| `attendance_overridePast` | Edit attendance records for previous days (reserved) |
| `attendance_export` | Export attendance data as CSV/PDF (reserved) |

### Leaves (5 keys — was 4, +1 new)
| Key | Description |
|-----|------------|
| `leaves_viewTeam` | View team leave records and balances |
| `leaves_approve` | Approve or reject leave requests |
| `leaves_applyForTeam` | **NEW** — Apply leave on behalf of another employee |
| `leaves_editPast` | Delete historical leave records |
| `leaves_manageBulk` | Bulk-edit leave balances |

### Payroll (6 keys — was 5, +1 new)
| Key | Description |
|-----|------------|
| `payroll_viewTeam` | View team payroll data (payslips, estimates, config) |
| `payroll_manageSalary` | Set and adjust individual employee salary amounts |
| `payroll_manageConfig` | **NEW** — Edit payroll config (late tiers, penalties, pay day, overtime) |
| `payroll_generateSlips` | Trigger batch payslip generation |
| `payroll_finalizeSlips` | Lock and approve payslips for distribution |
| `payroll_export` | Export payroll data (reserved) |

### Communication (2 keys)
| Key | Description |
|-----|------------|
| `ping_send` | Send pings to team members |
| `activityLogs_view` | View team-wide activity logs |

### System (3 keys — was 6, -3 removed)
| Key | Description |
|-----|------------|
| `designations_view` | View designation titles and permissions |
| `designations_manage` | Create, edit, toggle, delete designations |
| `holidays_manage` | Create, edit, delete company holidays |
| `settings_manage` | Full settings page access (system, office, test email) |

---

## 5. Change Summary

```
BEFORE:  54 keys in IPermissions
 - Remove 4 dead/redundant keys
 + Add 2 new keys (split overloaded ones)
AFTER:   52 keys
```

| Change | Type | Detail |
|--------|------|--------|
| `employees_viewDetail` | REMOVE | Duplicate of `employees_view` |
| `members_setReportingChain` | REMOVE | Duplicate of `organization_manageLinks` |
| `holidays_view` | REMOVE | Never enforced, holidays are open |
| `settings_view` | REMOVE | Client only uses `settings_manage` |
| `leaves_applyForTeam` | ADD | Split from `leaves_approve` — separate "apply for others" from "approve/reject" |
| `payroll_manageConfig` | ADD | Split from `payroll_manageSalary` — separate "set salary" from "edit config rules" |

---

## 6. Role Template (Final 52 Keys)

| Privilege | Employee | Team Lead | Manager | HR Admin | SuperAdmin |
|-----------|:--------:|:---------:|:-------:|:--------:|:----------:|
| **Employees** | | | | | |
| `employees_view` | — | ✓ | ✓ | ✓ | ✓ |
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
| `leaves_applyForTeam` | — | ✓ | ✓ | ✓ | ✓ |
| `leaves_editPast` | — | — | — | ✓ | ✓ |
| `leaves_manageBulk` | — | — | — | ✓ | ✓ |
| **Payroll** | | | | | |
| `payroll_viewTeam` | — | — | — | ✓ | ✓ |
| `payroll_manageSalary` | — | — | — | ✓ | ✓ |
| `payroll_manageConfig` | — | — | — | ✓ | ✓ |
| `payroll_generateSlips` | — | — | — | ✓ | ✓ |
| `payroll_finalizeSlips` | — | — | — | ✓ | ✓ |
| `payroll_export` | — | — | — | ✓ | ✓ |
| **Communication** | | | | | |
| `ping_send` | — | ✓ | ✓ | ✓ | ✓ |
| `activityLogs_view` | — | ✓ | ✓ | ✓ | ✓ |
| **System** | | | | | |
| `designations_view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `designations_manage` | — | — | — | ✓ | ✓ |
| `holidays_manage` | — | — | — | ✓ | ✓ |
| `settings_manage` | — | — | — | — | ✓ |

---

## 7. No Privilege Required (all authenticated users)

| Feature | Detail |
|---------|--------|
| Own dashboard | Self overview, timeline, weekly strip, monthly summary |
| Own attendance | Calendar, daily records, monthly stats, session detail |
| Own profile | View and edit name, phone, avatar, email, password |
| Own preferences | Theme, coordinates toggle |
| Apply leave for self | Submit leave request (non-SuperAdmin) |
| Own leave balance | View remaining/used leaves |
| Own payroll | View own salary estimate and payslips |
| Own tasks | View tasks assigned to self, change own task status |
| Own campaigns | View campaigns where tagged |
| Own activity feed | Narrow feed of logs targeting self |
| View holidays | Read-only holiday calendar |
| Receive pings | View ping inbox, mark read |
| Guides & tours | Welcome guide, spotlight tours |
| Install app (PWA) | Install prompt |

---

## 8. Implementation Checklist

To go from 54 (current) → 52 (recommended):

- [ ] **Remove from `IPermissions`**: `employees_viewDetail`, `members_setReportingChain`, `holidays_view`, `settings_view`
- [ ] **Remove from `PERMISSION_KEYS` array**: same 4 keys
- [ ] **Remove from `PERMISSION_META`**: same 4 keys
- [ ] **Remove from `PERMISSION_CATEGORIES`**: remove from respective category `keys` arrays
- [ ] **Remove API usage of `settings_view`**: in `/api/settings` GET, replace `settings_view` check with `settings_manage`
- [ ] **Add to `IPermissions`**: `leaves_applyForTeam: boolean`, `payroll_manageConfig: boolean`
- [ ] **Add to `PERMISSION_KEYS`**: `"leaves_applyForTeam"`, `"payroll_manageConfig"`
- [ ] **Add to `PERMISSION_META`**: labels and descriptions for both new keys
- [ ] **Add to `PERMISSION_CATEGORIES`**: `leaves_applyForTeam` in Leaves category, `payroll_manageConfig` in Payroll category
- [ ] **Update `/api/leaves` POST**: check `leaves_applyForTeam` (instead of `leaves_approve`) when `userId != self`
- [ ] **Update `/api/payroll/config` PUT**: check `payroll_manageConfig` instead of `payroll_manageSalary`
- [ ] **Run DB migration**: add `leaves_applyForTeam` and `payroll_manageConfig` to all existing designations where `leaves_approve` / `payroll_manageSalary` were true (backward compat)
- [ ] **Update OrgFlowTree default perms** (line 389): remove `employees_viewDetail` from default assignment
