# Single Solution Sync

Automatic employee presence, attendance, leave, and payroll management system. Detects when employees arrive, when they leave, and how much time they spend — all without manual check-in/check-out.

---

## How Access Works

There are **no roles**. Every user is just a user. Access is controlled by two things:

### SuperAdmin

One person has the SuperAdmin flag. They can do everything — no restrictions, no scoping. SuperAdmin is not set through any UI; it can only be granted through direct database access. SuperAdmin is also excluded from attendance tracking.

### Privileges via Connections

Everyone else gets their access through **connections** on the Organization flow diagram. When you connect an employee to a department, or to another employee, you configure exactly what they can and cannot do through privilege toggles on that connection.

The same person can be connected to multiple departments with completely different privileges in each one. There are 50+ individual privilege toggles across 10 categories:

| Category | What it controls |
|----------|-----------------|
| **Employees** | Viewing, creating, editing, deleting employees and their profiles |
| **Members** | Adding/removing people to departments, assigning designations, customizing privileges |
| **Departments** | Viewing, creating, editing, deleting departments |
| **Teams** | Viewing, creating, editing, deleting teams |
| **Tasks** | Viewing, creating, editing, deleting, reassigning tasks |
| **Campaigns** | Viewing, creating, editing, deleting campaigns and tagging entities |
| **Attendance** | Viewing team/individual attendance, editing records, exporting |
| **Leaves** | Viewing team leaves, approving requests, managing bulk actions |
| **Payroll** | Viewing team payroll, managing salaries, generating and finalizing payslips |
| **System** | Managing designations, holidays, and system settings |

### Designations

Designations are just labels (name + color) — "Manager", "Developer", "QA Lead", etc. They do not grant any access on their own. Two people with the same designation can have completely different privileges. Designations are created on-the-fly and shown as pills on connection lines.

---

## Organization (Flow Diagram)

The Organization page is the heart of the system. It shows an interactive drag-and-drop diagram where you build and manage your entire company structure.

### What you see

- **Department nodes** (purple) — your departments
- **Employee nodes** (teal) — your employees
- A **sidebar** on the left with CRUD panels for Departments and Designations, plus a search bar and "Add Employee" button at the top

### Creating connections

Drag from one node's handle to another to create a connection:

**Employee ↔ Department:**
- A modal opens where you pick a designation and choose the initial access level
- **Employee's bottom handle → Department's top handle** = the employee manages this department (scoped department privileges auto-enabled)
- **Department's bottom handle → Employee's top handle** = the employee belongs to this department with no special access
- You can always switch or fine-tune privileges later through the pill

**Employee ↔ Employee (reporting hierarchy):**
- Created instantly, no modal needed
- The person connected via their **bottom handle** is the superior; the person connected via their **top handle** is the subordinate (reports to the other)
- Shows as a **dashed line** to visually distinguish from department connections
- Default privileges: the superior can view the subordinate's details

**What happens behind the scenes with reporting links:**
- When Employee A is placed above Employee B, and B belongs to Department X, the system automatically gives A access to Department X with whatever privileges are configured on the A→B link
- If you give A the `leaves_approve` privilege on the link to B, A can approve B's leave requests in Department X
- This works transitively — if A is above B and B is above C, A gets access to C's departments too (with the combined privileges from both links)
- If you remove a link or an employee leaves a department, the auto-created access is cleaned up automatically

### The pill on each connection

Every connection line has a clickable pill. Click it to:
- **Change the designation** (the label shown on the line)
- **Edit Privileges** — opens a modal with all 50+ privilege toggles organized by category
- **Remove** the connection (with confirmation)

### Other details

- **Cycle detection** — you cannot create a circular hierarchy (A above B above A)
- **Positions persist** — wherever you drag nodes, they stay there on refresh
- **All forms use center modals** — no page navigation needed for creating or editing

---

## Dashboard

Adapts to what you have access to:

- **If you can see team attendance**: Welcome greeting, live status counts (In Office, Remote, Late, Absent), team status grid with employee cards, active campaigns, task checklist
- **If you cannot**: Personal overview with your own clock in/out times, office/remote split, shift progress, weekly and monthly summary

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

- **Campaigns** — Card grid for browsing campaigns. Sidebar tree grouped by status. Create/edit via center modal.
- **Tasks** — Task list with sidebar grouping (by status, assignee, campaign, or priority). Create/edit via center modal.
- **Updates** — Activity feed timeline with avatars, descriptions, and timestamps. Auto-refreshes.

---

## Insights Desk

Four sections under one tab bar:

- **Attendance** — Team view and individual view with calendar, session timeline, and monthly stats
- **Calendar** — Monthly grid with color-coded days (present, late, absent, holiday, leave). Click any day for details.
- **Leaves** — Leave request form, approval queue, and balance tracking. Leave types include Annual, Sick, Casual, Unpaid, Maternity, Paternity, Bereavement, and Other. Balances auto-deduct on approval and restore on rejection.
- **Payroll** — Configuration (working days, late thresholds, penalties, overtime multiplier, currency, pay day), holiday calendar, auto-generated monthly payslips from attendance data, three-stage status (Draft → Finalized → Paid)

---

## Employee Detail

Each employee has a dedicated page with tabbed sections:

- **Overview** — Today's attendance, active tasks and campaigns, department memberships
- **Attendance** — Monthly calendar with color-coded dots and stats
- **Profile** — Personal details and shift configuration
- **Activity** — Recent activity log and task list
- **Leaves** — Leave balance and request history
- **Payroll** — Salary info and payslips

---

## Ping System

Quick peer-to-peer messaging scoped by organizational relationships. SuperAdmin can ping anyone; others can ping within their department scope. Signal-wave icon in the header with unread badge and a dropdown inbox.

---

## Learning Guide

- **Welcome modal** on first login — a 4-slide overview (replayable anytime)
- **Page tours** — spotlight tours highlighting key UI elements, auto-triggered on first visit to each page
- **Help button** in the header to replay any tour
- Progress tracked per user, syncs across devices

---

## Notifications & Activity Log

- Every action (create, edit, delete) is logged with scope-based visibility
- Bell icon with unread badge and "Mark all read"
- Security events with severity badges and location links
- Clickable entries navigate to the relevant page

---

## Settings

- **Profile** — Name, phone, profile image upload
- **Email change** — Requires current password, 24-hour cooldown between changes
- **Password change** — With strength meter
- **System Settings** (SuperAdmin only) — Company name, timezone, office geofence coordinates, shift defaults
- **Theme** — Dark, Light, or System

---

## Mobile & PWA

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
