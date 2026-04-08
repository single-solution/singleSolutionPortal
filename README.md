# Single Solution Sync

Automatic employee presence, attendance, leave, and payroll management system. Detects when employees arrive, when they leave, and how much time they spend — all without manual check-in/check-out.

---

## How Access Works

There are **no roles**. Every user is just a user. Access is controlled by two things:

### SuperAdmin

One person has the SuperAdmin flag. They can do everything — no restrictions, no scoping. SuperAdmin is not set through any UI; it can only be granted through direct database access. SuperAdmin is also excluded from attendance tracking.

### Privileges via Connections

Everyone else gets their access through **connections** on the Organization flow diagram. When you connect an employee to a department, or to another employee, you configure exactly what they can and cannot do through privilege toggles on that connection.

The same person can be connected to multiple departments with completely different privileges in each one.

**Example — giving someone hiring access in one department but read-only in another:**

> Sarah is connected to "Engineering" with `employees_create`, `employees_edit`, and `employees_view` enabled.
> She is also connected to "Marketing" with only `employees_view` enabled.
>
> Result: Sarah can add and edit engineers, but can only browse the marketing team roster.

**Example — creating a team lead who can approve leaves:**

> Ahmed is connected above three employees via reporting links. On each link, `leaves_approve` and `attendance_viewTeam` are enabled.
>
> Result: Ahmed can see his three reports' attendance and approve their leave requests. He cannot approve leaves for anyone else in the company.

**Example — a department manager with full control:**

> When you drag an employee's bottom handle to a department's top handle, the system auto-enables all scoped department privileges.
>
> Result: That employee can manage everything within that department — employees, tasks, campaigns, attendance, leaves — but has zero access to other departments unless separately connected.

### How Privileges Are Enforced

Every action in the system — whether clicking a button or calling an API — checks: **is this user a SuperAdmin, or do they have the specific privilege for this action?**

- On the **server**, every API endpoint verifies the user's privileges before processing the request. Even if someone crafts a manual API call, they cannot bypass the privilege system.
- On the **screen**, buttons and features are hidden when the user lacks the required privilege. A user without `campaigns_create` will never see the "New Campaign" button.

There are **63 individual privilege toggles** across **14 categories**:

| Category | What it controls |
|----------|-----------------|
| **Employees** | View employee list, view profiles, create accounts, edit details, delete accounts, enable/disable accounts, resend invitations |
| **Memberships** | Add/remove from departments, add/remove from teams, assign designations, customize individual permissions, set reporting chains |
| **Organization** | View the org chart, create/edit/remove connections in the flow diagram |
| **Departments** | View, create, edit, delete departments |
| **Teams** | View, create, edit, delete teams |
| **Tasks** | View, create, edit, delete, reassign tasks |
| **Campaigns** | View, create, edit, delete campaigns, tag employees and departments to campaigns |
| **Updates** | View, post, edit, delete workspace updates and announcements |
| **Attendance** | View team attendance, view session details, edit records, override past days, export reports |
| **Leaves** | View team leaves, approve/reject requests, edit past leaves, bulk manage requests |
| **Payroll** | View team payroll, manage salaries, generate pay slips, finalize pay slips, export reports |
| **Calendar** | View the shared calendar, manage calendar events |
| **Communication** | Send pings, view activity logs |
| **System** | View/manage designations, view/manage holidays, view/manage system settings |

Every toggle has a human-readable label and a plain-English description so there is no guesswork about what it does.

### Designations

Designations are labels (name + color) — "Manager", "Developer", "QA Lead", etc. They do not grant any access on their own. Two people with the same designation can have completely different privileges. Designations come with **preset templates** (Employee, Team Lead, Manager, Admin) that pre-fill sensible defaults, but every toggle can be changed afterward. Designations are shown as colored pills on connection lines in the org chart.

---

## Organization (Flow Diagram)

The Organization page is the heart of the system. It shows an interactive drag-and-drop diagram where you build and manage your entire company structure.

### What you see

- **Department nodes** (purple) — your departments
- **Employee nodes** (teal) — your employees
- A **sidebar** on the left with CRUD panels for Departments and Designations, plus a search bar and "Add Employee" button at the top

### Creating connections

Drag from one node's handle to another to create a connection:

**Employee to Department:**
- A modal opens where you pick a designation and choose the initial access level
- **Employee's bottom handle to Department's top handle** = the employee manages this department (scoped department privileges auto-enabled)
- **Department's bottom handle to Employee's top handle** = the employee belongs to this department with no special access
- You can always switch or fine-tune privileges later through the pill

**Employee to Employee (reporting hierarchy):**
- Created instantly, no modal needed
- The person connected via their **bottom handle** is the superior; the person connected via their **top handle** is the subordinate
- Shows as a **dashed line** to visually distinguish from department connections
- Default privileges: the superior can view the subordinate's details

**What happens behind the scenes with reporting links:**
- When Employee A is placed above Employee B, and B belongs to Department X, the system automatically gives A access to Department X with whatever privileges are configured on the A-to-B link
- If you give A the `leaves_approve` privilege on the link to B, A can approve B's leave requests in Department X
- This works transitively — if A is above B and B is above C, A gets access to C's departments too (with the combined privileges from both links)
- If you remove a link or an employee leaves a department, the auto-created access is cleaned up automatically

### The pill on each connection

Every connection line has a clickable pill. Click it to:
- **Change the designation** (the label shown on the line)
- **Edit Privileges** — opens a wide modal with all 63 privilege toggles organized by category, with per-category and global "Enable all / Disable all" buttons
- **Remove** the connection (with confirmation)

Non-admin users see the org chart in read-only mode — pills are visible but not interactive, and connections cannot be created or removed.

### Other details

- **Cycle detection** — you cannot create a circular hierarchy
- **Positions persist** — wherever you drag nodes, they stay there on refresh
- **All forms use center modals** — no page navigation needed

---

## Dashboard

Adapts to what you have access to:

- **If you have team access**: Welcome greeting, live status counts (In Office, Remote, Late, Absent), team status grid with employee cards, active campaigns, task checklist
- **If you do not**: Personal overview with your own clock in/out times, office/remote split, shift progress, weekly and monthly summary

---

## Automatic Attendance

No manual check-in or check-out. The system detects everything automatically.

**How it works:**
1. Employee opens the app on desktop — a session starts automatically
2. A heartbeat pings the server every 30 seconds with GPS coordinates
3. If the heartbeat stops for 3+ minutes, the session auto-closes
4. Mobile devices are read-only — they show data but never create sessions

**Office detection:**
- GPS coordinates compared against a configurable office geofence
- Tracks office vs remote time separately
- Coordinates shown in attendance detail with map links

**Anti-spoofing (4 layers):**
1. Fake GPS extension detection (accuracy zero)
2. Teleportation detection (impossible movement speed between heartbeats)
3. Round coordinate detection (crude manual entries)
4. Two-tier severity: Warning (2 or fewer flags in 30 days) vs Violation (pauses the timer)

**Lateness tracking:**
- "Late to work" — when you first open the app vs your shift deadline
- "Late to office" — when you first physically arrive at the office vs your shift deadline
- Tracked independently

**Day boundary:** Attendance day starts at 6 AM, not midnight. Work between midnight and 6 AM counts toward the previous day.

**Idle detection:** After 1 hour of inactivity, a nudge appears. If still idle, the timer pauses with an overlay until you return.

---

## Workspace

Three sections under one tab bar:

- **Campaigns** — Card grid for browsing campaigns. Sidebar tree grouped by status. Users with campaign privileges can create, edit, change status, toggle active/inactive, and delete campaigns. Everyone else sees a read-only view.
- **Tasks** — Task list with sidebar grouping (by status, assignee, campaign, or priority). Users with task privileges can create, edit, reassign, and delete tasks. Assignees can update the status of their own tasks.
- **Updates** — Activity feed timeline with avatars, descriptions, and timestamps. Auto-refreshes.

---

## Insights Desk

Four sections under one tab bar:

- **Attendance** — Users with team attendance access see team-wide stats, employee pills, grouping by scope, and per-employee drill-down with calendar and session timeline. Everyone else sees only their personal attendance calendar and monthly stats.
- **Calendar** — Monthly grid with color-coded days (present, late, absent, holiday, leave). Click any day for details.
- **Leaves** — Leave request form for yourself, approval queue for supervisors, and balance tracking. Leave types include Annual, Sick, Casual, Unpaid, Maternity, Paternity, Bereavement, and Other. Balances auto-deduct on approval and restore on rejection. Users with leave privileges can approve/reject requests, manage past leaves, and edit allocations.
- **Payroll** — Users with payroll access can configure payroll settings (working days, late thresholds, penalties, overtime multiplier, currency, pay day), manage the holiday calendar, auto-generate monthly payslips from attendance data, and move payslips through the three-stage pipeline (Draft, Finalized, Paid). Everyone else sees only their own payslips.

---

## Employee Detail

Each employee has a dedicated page with tabbed sections:

- **Overview** — Today's attendance, active tasks and campaigns, department memberships
- **Attendance** — Monthly calendar with color-coded dots and stats
- **Profile** — Personal details and shift configuration. The "Edit profile" button is visible only if you are viewing your own profile or you are a SuperAdmin.
- **Activity** — Recent activity log and task list
- **Leaves** — Leave balance and request history
- **Payroll** — Salary info and payslips

---

## Ping System

Quick peer-to-peer messaging scoped by organizational relationships. Pings are only available when the **Live Updates** toggle is enabled by the administrator in system settings. When disabled, the ping icon is hidden everywhere — header, mobile drawer, and employee cards.

When enabled:
- SuperAdmin can ping anyone
- Managers can ping anyone in their department
- Team leads can ping their team members and their reporting supervisor
- Employees can ping their reporting supervisor and same-team members

Signal-wave icon in the header with unread badge and a dropdown inbox. Sending a ping requires the `ping_send` privilege.

---

## Learning Guide

- **Welcome modal** on first login — a 4-slide overview (replayable anytime)
- **Page tours** — spotlight tours highlighting key UI elements, auto-triggered on first visit to each page
- **Help button** in the header to replay any tour
- Progress tracked per user, syncs across devices

---

## Notifications and Activity Log

- Every action (create, edit, delete) is logged with scope-based visibility
- Bell icon with unread badge and "Mark all read"
- Security events with severity badges and location links
- Clickable entries navigate to the relevant page
- Viewing activity logs requires the `activityLogs_view` privilege

---

## Settings

- **Profile** — Name, phone, profile image upload
- **Email change** — Requires current password, 24-hour cooldown between changes
- **Password change** — With strength meter
- **System Settings** (requires `settings_manage` privilege) — Company name, timezone, office geofence coordinates, shift defaults, Live Updates toggle
- **Theme** — Dark, Light, or System

---

## Mobile and PWA

- Installable as a native app on any device
- Mobile-optimized layout with bottom dock navigation and hamburger menu
- Offline-first with cache strategy
- Graceful tab-close handling for attendance sessions

---

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**First-time setup:** The initial user must have `isSuperAdmin` set directly in the database. From there, create employees from the Organization page, drag connections in the flow diagram to assign them to departments, and configure privileges on each connection's pill. Designations are created on-demand — no seed data needed.

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
