# Single Solution Sync

Automatic employee presence, attendance, leave, and payroll management system. Detects when employees arrive, when they leave, and how much time they spend — all without manual check-in or check-out.

---

## The 3-Level Access Model

Every request — whether a page load, a button click, or a direct API call — is governed by exactly three rules, checked in order:

### 1. SuperAdmin

One person has the SuperAdmin flag. They can do everything — no restrictions, no scoping. SuperAdmin is set through direct database access only (no UI). SuperAdmin is also excluded from attendance tracking entirely.

**Hard rule:** No one except a SuperAdmin can edit or remove another SuperAdmin.

### 2. Self

Every user can always see their own data and perform limited self-service actions — no permissions needed.

**What self-access allows:**

| Action | Example |
|--------|---------|
| **View** own attendance, payroll, tasks, campaigns, leaves, activity logs, location flags | Seeing your own attendance calendar |
| **Update own task status** | Marking an assigned task as "in-progress" or "completed" |
| **Apply for leave** | Submitting a new leave request for yourself |
| **Cancel own-created pending leave** | Cancelling a leave you applied for (not one a manager applied on your behalf) |
| **Update profile** | Changing your name, phone, email, profile image |
| **Change password** | With current password verification |
| **Check in / check out** | Automatic attendance session management |

**What self-access does NOT allow:**

- Deleting anything (tasks, leaves, memberships, campaigns)
- Modifying anything created by a higher authority (manager-created leaves, assigned task details)
- Approving or rejecting your own leave
- Editing your own department membership or privileges
- Adding or removing yourself from departments

### 3. Privilege + Hierarchy

For everything beyond self-service, a user needs **both**:

- A **specific privilege** enabled on their department connection (e.g., `tasks_delete`, `leaves_approve`, `employees_edit`)
- The **target employee must be within their hierarchy** — meaning a direct or indirect subordinate on the organization chart

A user with `employees_edit` in the Engineering department can only edit employees who report to them (directly or transitively). They cannot edit peers, superiors, or employees in other departments unless separately connected.

---

## How Privileges Are Assigned

There are **no roles**. Every user is just a user. Access comes from **connections** on the Organization flow diagram.

### Connections

When you connect an employee to a department, you configure exactly what they can and cannot do through privilege toggles on that connection. The same person can be connected to multiple departments with completely different privileges in each one.

**Example — hiring access in one department, read-only in another:**

> Sarah is connected to "Engineering" with `employees_create`, `employees_edit`, and `employees_view` enabled.
> She is also connected to "Marketing" with only `employees_view` enabled.
>
> Result: Sarah can add and edit engineers, but can only browse the marketing team roster.

**Example — a team lead who can approve leaves:**

> Ahmed is connected above three employees via reporting links. On each link, `leaves_approve` and `attendance_viewTeam` are enabled.
>
> Result: Ahmed can see his three reports' attendance and approve their leave requests. He cannot approve leaves for anyone else.

### Enforcement

- **Server side:** Every API endpoint verifies the user's privileges and hierarchy before processing. Even a crafted API call cannot bypass the system.
- **Client side:** Buttons and features are hidden when the user lacks the required privilege.

### 59 Privilege Toggles Across 13 Categories

| Category | What it controls |
|----------|-----------------|
| **Employees** | View list, view profiles, create accounts, edit details, delete accounts, enable/disable, resend invitations |
| **Memberships** | Add/remove from departments, assign designations, customize individual permissions |
| **Organization** | View the org chart, create/edit/remove connections |
| **Departments** | View, create, edit, delete departments |
| **Teams** | View, create, edit, delete teams |
| **Tasks** | View, create, edit, delete, reassign tasks |
| **Campaigns** | View, create, edit, delete campaigns, tag employees and departments |
| **Updates** | View, post, edit, delete workspace updates |
| **Attendance** | View team attendance, view session details, edit records, override past days, export reports |
| **Leaves** | View team leaves, approve/reject requests, edit past leaves, bulk manage |
| **Payroll** | View team payroll, manage salaries, generate/finalize pay slips, export reports |
| **Communication** | Send pings, view activity logs |
| **System** | View/manage designations, view/manage holidays, view/manage system settings |

### Designations

Designations are reusable templates — "Manager", "Developer", "QA Lead" — with a name, color, and a full set of default privileges. When a new connection is created with a designation, its defaults are copied automatically. You can customize privileges per-connection afterward; a **"Custom"** badge appears on connections that differ from their designation defaults.

Four built-in presets:

- **Employee** — minimal (view updates, send pings)
- **Team Lead** — view employees, tasks, campaigns, attendance, leaves, org; create/edit tasks
- **Manager** — everything a Team Lead has, plus create/edit employees, departments, campaigns; approve leaves; view payroll; manage attendance
- **Admin** — all privileges enabled

---

## Organization (Flow Diagram)

The Organization page is the heart of the system — an interactive drag-and-drop diagram where you build your entire company structure.

### What You See

- **Department nodes** (purple) — your departments
- **Employee nodes** (teal) — your employees
- A **sidebar** with panels for Departments and Designations, including search

### Creating Connections

**Employee to Department:**
- A modal opens where you pick a designation and access level
- **Employee's bottom → Department's top** — the employee manages this department (scoped privileges auto-enabled)
- **Department's bottom → Employee's top** — the employee belongs to this department with no special access

**Employee to Employee (reporting hierarchy):**
- Created instantly, no modal
- Bottom handle = superior, top handle = subordinate
- Shows as a dashed line

**Behind the scenes:**
- When Employee A is placed above Employee B, and B belongs to Department X, the system automatically gives A access to Department X
- This works transitively — if A is above B and B is above C, A gets access to C's departments too
- Removing a link or an employee leaving a department cleans up auto-created access automatically

### Connection Pills

Every connection has a clickable designation pill to change designation, edit privileges, or remove the connection. Non-admin users see the chart in read-only mode.

### Layout

- Full viewport height, persistent node positions, cycle detection prevents circular hierarchies

---

## Automatic Attendance

No manual check-in or check-out. The system detects everything automatically through background processes.

### Foreground (User-Visible)

- A floating **timer pill** shows elapsed time, status (office/remote), and location info
- **Idle nudges** appear after 1 hour of inactivity — up to 3 nudges every 5 minutes
- If all nudges are ignored, an **idle overlay** pauses the timer until the user interacts
- **Location violation overlay** appears when GPS spoofing is detected (severity: violation) — timer pauses until the user taps "Re-check Location"
- Location warnings (severity: warning) show a notice but do not pause the timer

### Background (Automatic)

| Process | Interval | What it does |
|---------|----------|-------------|
| **Heartbeat** | Every 30 seconds | Sends GPS coordinates to the server, updates `lastActivity` timestamp |
| **Elapsed tick** | Every 1 second | Updates the timer pill display (paused when idle or flagged) |
| **Stale detection** | On each heartbeat | If the server hasn't received a heartbeat for 3+ minutes, the session auto-closes at the last known activity time |
| **Sleep detection** | On heartbeat | If wall-clock gap exceeds 2× heartbeat interval, the client re-fetches session state to correct drift |
| **Day boundary** | On heartbeat | At 6:00 AM local time, the current session closes and a new attendance day begins |
| **Tab visibility** | On focus/blur | Hidden tab sends one best-effort heartbeat; re-focus triggers a full session refresh and re-check-in if needed |
| **Tab close** | On beforeunload | Attempts a checkout beacon so the session doesn't stay open |

### Office Detection

- GPS coordinates compared against a configurable office geofence (center + radius in settings)
- Office vs remote time tracked separately
- Office segments open/close as you enter/leave the geofence during a session

### Anti-Spoofing (3 Layers)

1. **Fake GPS detection** — accuracy value of exactly zero indicates a mock GPS extension
2. **Teleportation detection** — impossible movement speed between consecutive heartbeats (thresholds adjust for Wi-Fi vs GPS accuracy)
3. **Low-precision coordinates** — fewer than 2 significant decimal places indicates manually entered values

Two severity levels: **Warning** (informational, 2 or fewer flags in 30 days) escalates to **Violation** (pauses timer, notifies all super-admins).

### Lateness Tracking

- **Late to work** — when you first open the app vs your shift start + grace minutes
- **Late to office** — when you first physically enter the office vs your shift start + grace minutes
- Tracked independently per day

### Day Boundary

The attendance day starts at **6:00 AM**, not midnight. Any work between midnight and 6 AM counts toward the previous day.

### Mobile Behavior

Mobile devices are **read-only** — they display live session data but never create sessions or send heartbeats. Only desktop browsers create attendance sessions.

---

## Weekly Schedule

Each employee has a per-day weekly schedule (Monday through Sunday). Each day is configured independently:

- **Start time** and **End time** (e.g., 10:00–19:00)
- **Break minutes** (daily break duration)
- **Working / Off toggle**

Saturday and Sunday are off by default. Each employee also has a configurable **grace minutes** value (default 30) for lateness thresholds, and a shift type (Full-time, Part-time, or Contract).

The default schedule is applied when creating new employees and can be customized individually through the Organization page's employee edit modal.

---

## Dashboard

The dashboard adapts to what you have access to.

### Team View (users with `attendance_viewTeam` or any subordinates)

- Welcome greeting with live status counts: In Office, Remote, Late, Absent
- Department scope strip for filtering
- Team status grid with employee cards showing real-time presence, minutes worked, session count, shift progress, and optional location flags
- Active campaigns section
- Task checklist for pending assignments
- For non-super-admin users: personal overview card alongside team data

### Personal View (unprivileged employees)

- Greeting with your own clock in/out times
- Office vs remote time split and shift progress bar
- Today's activity timeline
- Weekly attendance strip and monthly summary

### Background Data Loading

The dashboard batch-fetches employees (if permitted), tasks, campaigns, attendance presence, and personal data in parallel on mount. A secondary live-data refresh updates presence state after initial load.

---

## Workspace

Three sections under one tab bar:

### Campaigns

Card grid for browsing campaigns with a sidebar tree grouped by status. Users with campaign privileges can create, edit, change status, and delete. Employees without privileges see only campaigns they are tagged on, in read-only view.

### Tasks

Task list with sidebar grouping by status, assignee, campaign, or priority. Users with task privileges can create, edit, reassign, and delete tasks. Assignees can update the **status** of their own tasks (self-assessment) but cannot edit other fields or delete.

### Updates

Activity feed timeline with avatars, descriptions, and timestamps. Auto-refreshes.

---

## Insights Desk

Three sections under one tab bar, plus a holiday management button.

### Attendance

- **Team view** (with `attendance_viewTeam`): team-wide stats, employee pills, grouping by scope, per-employee drill-down with calendar and session timeline
- **Personal view** (everyone): own attendance calendar and monthly stats

The calendar highlights weekends, declared holidays, and off-days. A legend explains all visual indicators.

### Leaves

- **Self-service**: leave request form, balance tracking. Leave types include Annual, Sick, Casual, Unpaid, Maternity, Paternity, Bereavement, and Other.
- **Approval workflow**: supervisors with `leaves_approve` can approve/reject pending requests from subordinates. Balances auto-deduct on approval and restore on cancellation.
- **Self-cancel rule**: you can only cancel a pending leave you created yourself. If a manager applied leave on your behalf, only an approver or super-admin can cancel it. The system tracks `createdBy` on every leave to enforce this.
- **Delete**: requires `leaves_editPast` privilege + hierarchy. You cannot delete your own leave records.

### Payroll

- **Payroll config** (with `payroll_manageSalary`): working days, late thresholds, penalties, overtime multiplier, currency, pay day
- **Slip generation** (with `payroll_generateSlips`): auto-generate monthly payslips from attendance data for subordinates
- **Pipeline**: Draft → Finalized → Paid (finalization requires `payroll_finalizeSlips`)
- **Personal view** (everyone): own payslips only

### Holidays

A "Holidays" button in the Insights Desk header opens a modal listing all declared holidays for the current year. All authenticated users can view the holiday calendar. Users with `holidays_manage` can add, edit, toggle recurring, and delete holidays. Declared holidays automatically mark employees as not absent and are factored into payroll and leave-day calculations.

---

## Employee Detail

Each employee has a dedicated page with tabbed sections:

- **Overview** — today's attendance, active tasks and campaigns, department memberships
- **Attendance** — monthly calendar with color-coded dots and stats
- **Profile** — personal details, weekly schedule, shift configuration (editable by the employee via self-service or anyone with `employees_edit` for subordinates only)
- **Activity** — recent activity log and task list
- **Leaves** — leave balance and request history
- **Payroll** — salary info and payslips

Clicking an employee node in the Organization chart opens their edit modal directly.

---

## Ping System

Quick peer-to-peer messaging scoped by hierarchy. Pings are only available when **Live Updates** is enabled in system settings — when disabled, the ping icon is hidden everywhere.

When enabled:

- SuperAdmin can ping anyone
- Users with `ping_send` can ping subordinates within their hierarchy
- Signal-wave icon in the header with unread badge and dropdown inbox

---

## Activity Logging and Notifications

Every action (create, edit, delete) is logged as an ActivityLog entry with scope-based visibility:

- **Targeted** — visible to affected users and their hierarchy
- **Self** — visible only to the actor
- **All** — broadcast to everyone

Notifications appear via a bell icon with unread badge and "Mark all read." Security events (location violations) include severity badges and are automatically pushed to all super-admins. Viewing the full activity log requires `activityLogs_view`; without it, users see only logs that target them or were authored by them.

---

## Settings

- **Profile** — name, phone, profile image upload
- **Email change** — requires current password, 24-hour cooldown
- **Password change** — with strength meter
- **Security** — active session info and trusted device status
- **System Settings** (requires `settings_manage`) — company name, timezone, office geofence coordinates, Live Updates toggle
- **Theme** — Dark, Light, or System

All users can access their own profile, password, and security settings. System settings require the specific privilege.

---

## Learning Guide

- **Welcome modal** on first login — a 4-slide overview (replayable anytime)
- **Page tours** — spotlight tours highlighting key UI elements, auto-triggered on first visit
- **Help button** in the header to replay any tour
- Progress tracked per user, syncs across devices

---

## Deletion Behavior

When a SuperAdmin deletes an entity (employee, department, campaign, task, or designation), it is a **permanent hard delete** with cascading cleanup. Related data (memberships, assignments, references) are cleaned up automatically. This is not a soft delete.

---

## Mobile and PWA

- Installable as a native app on any device
- Mobile-optimized layout with bottom dock navigation and hamburger menu
- Attendance sessions are **desktop-only** — mobile shows live data in read-only mode
- Graceful tab-close handling for attendance sessions

---

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**First-time setup:** Set `isSuperAdmin` on the initial user directly in the database. From there, create employees from the Organization page, drag connections to assign them to departments, and configure privileges on each connection's pill. Designations with preset default privileges can be created on-demand — no seed data needed.

### Environment Variables

Create `.env.local`:

```env
MONGODB_URI=mongodb+srv://...
AUTH_SECRET=your-secret-key
AUTH_URL=http://localhost:3000

OFFICE_LAT=31.4697
OFFICE_LNG=74.2728
OFFICE_RADIUS_METERS=50

# Optional: SMTP for emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
```

---

## License

Private — Single Solution
