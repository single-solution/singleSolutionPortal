# Single Solution Sync

Automatic employee presence, attendance, leave, and payroll management system. Detects when employees arrive at the office, when they leave, and how much time they spend — all without manual check-in/check-out.

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Styling**: Tailwind CSS 4, Framer Motion animations
- **Database**: MongoDB Atlas (Mongoose ODM)
- **Auth**: NextAuth.js v5 (JWT + DB verification)
- **Email**: Nodemailer (SMTP)
- **Real-time**: Socket.IO (optional — dormant on Vercel, active on self-hosted)
- **PWA**: Installable, offline-first service worker
- **Deployment**: Vercel (serverless) or self-hosted Node.js

---

## Authorization Model

There are **no roles**. Every user is equal — just a user. The system has exactly two concepts for access control:

### 1. SuperAdmin Flag

A single boolean field (`isSuperAdmin`) on the User document. That's it.

- **Verified from the database on every API request** — the JWT token carries a hint for UI rendering, but the server always reads the flag fresh from MongoDB via `getVerifiedSession()`. Even if someone tampers with their JWT, they cannot gain SuperAdmin access.
- **Cannot be set through any API endpoint** — only direct database access can grant or revoke SuperAdmin. There is no UI toggle, no endpoint, no form field for it.
- **SuperAdmin bypasses everything** — all permission checks, all reporting chain checks, all scoping. Zero restrictions.
- **Protected accounts** — non-SuperAdmin users (even with full privileges) cannot edit, delete, or modify a SuperAdmin account.

### 2. Membership Permissions

For everyone who is not SuperAdmin, access is controlled through **Memberships**.

A Membership links a User → Department (+ optional Team) with:
- A **Designation** (a named title like "Lead", "QA", "Analyst" — just a label with a color, created on-demand)
- **50+ granular permissions** organized in 10 categories (Employees, Members, Departments, Teams, Tasks, Campaigns, Attendance, Leaves, Payroll, System)
- An optional **reportsTo** field for reporting chain

Each user can have **multiple memberships** across different departments and teams simultaneously. Permissions are fully independent per membership — the same person can have full access in Engineering and read-only access in Marketing.

### How Access Works

```
Request comes in
  → getVerifiedSession() loads isSuperAdmin from DB (not JWT)
  → If isSuperAdmin === true → allow everything, return all data
  → If not → check memberships:
    → hasPermission(actor, "tasks_create") → do they have this toggle ON in any membership?
    → getDepartmentScope(actor, "employees_view") → which departments can they see employees in?
    → Data queries are scoped to only return records from their authorized departments/teams
```

### Designations

Designations are **not roles**. They are simple name + color labels created on-demand:
- When assigning an employee to a department/team in the flow diagram, you select or create a designation
- The designation is stored on the Membership, not on the user
- Two people with the same designation can have completely different permissions
- SuperAdmins can manage designations from the Organization sidebar

### Permission Categories

| Category | Permissions |
|----------|-------------|
| **Employees** | View, View Detail, Create, Edit, Delete, Toggle Status, Resend Invite |
| **Members** | Add to Department/Team, Remove from Department/Team, Assign Designation, Customize Permissions, Set Reporting Chain |
| **Departments** | View, Create, Edit, Delete |
| **Teams** | View, Create, Edit, Delete |
| **Tasks** | View, Create, Edit, Delete, Reassign |
| **Campaigns** | View, Create, Edit, Delete, Tag Entities |
| **Attendance** | View Team, View Detail, Edit, Override Past, Export |
| **Leaves** | View Team, Approve, Edit Past, Manage Bulk |
| **Payroll** | View Team, Manage Salary, Generate Slips, Finalize Slips, Export |
| **System** | Designations View/Manage, Holidays View/Manage, Settings View/Manage |

---

## Navigation

| Page | Route | Description |
|------|-------|-------------|
| **Overview** | `/` | Real-time dashboard with team status, campaigns, tasks |
| **Workspace** | `/workspace/` | Unified hub for campaigns, tasks, and activity |
| — Campaigns | `/workspace/campaigns` | Campaign cards with sidebar tree grouped by status |
| — Tasks | `/workspace/tasks` | Task list with sidebar grouping and filtering |
| — Updates | `/workspace/updates` | Activity feed with timeline |
| **Organization** | `/organization` | Employees + Departments + Teams + Designations + interactive flow diagram |
| **Insights Desk** | `/insights-desk/` | Analytics hub for attendance, calendar, leaves, and payroll |
| — Attendance | `/insights-desk/attendance` | Team/employee attendance with calendar, session timelines |
| — Calendar | `/insights-desk/calendar` | Monthly calendar with color-coded attendance/leaves/holidays |
| — Leaves | `/insights-desk/leaves` | Leave request form, approval queue, balance tracking |
| — Payroll | `/insights-desk/payroll` | Payroll configuration, holidays, payslip generation |
| **Settings** | `/settings` | Profile, security, system configuration |

Employee detail pages: `/employee/[slug]` with tabbed sections for Overview, Attendance, Profile, Activity, Leaves, and Payroll.

Legacy routes (`/employees`, `/departments`, `/teams`, `/campaigns`, `/tasks`, `/attendance`) are automatically redirected via middleware.

---

## Features

### Automatic Attendance Tracking

Uses a **heartbeat model** — no manual check-in/check-out required.

- Employee opens the app on desktop — session starts automatically
- A heartbeat pings the server every 30 seconds with GPS coordinates
- If the heartbeat stops for 3+ minutes, the session auto-closes
- Mobile devices are read-only — they display synced data but never create sessions
- Only one active session per user at any time
- Sleep/wake handled gracefully — old session closes at last heartbeat, new one starts fresh
- Idle detection: 1hr of inactivity triggers nudge toasts, then pauses the timer with an overlay
- **SuperAdmin is excluded** from attendance tracking entirely — no sessions, no heartbeats

**Office Detection:**
- GPS coordinates compared against configurable office geofence (Haversine formula)
- Tracks office vs remote time separately with entry/exit segments
- Coordinates displayed in attendance detail view with Google Maps links

**Anti-Spoofing (4 layers):**
1. Accuracy zero detection (fake GPS extensions)
2. Teleportation detection (impossible movement speed between heartbeats)
3. Round coordinate detection (crude manual entries)
4. Two-tier severity: Warning (≤2 flags/30d) vs Violation (>2 flags, pauses timer)

**Dual Lateness Tracking:**
- "Late to work" — first session start vs shift deadline
- "Late to office" — first physical office arrival vs shift deadline
- Tracked independently

**Day Boundary:**
- Attendance day starts at 6 AM, not midnight
- Work done between midnight–6 AM counts toward the previous day
- Timezone-aware (configurable, defaults to Asia/Karachi)

### Dashboard

Real-time overview that adapts to the user's access level:

- **SuperAdmin / Users with attendance permissions**: Welcome greeting with live status counts (In Office, Remote, Late, Absent) → Team Status grid with employee cards → Active Campaigns → Task Checklist
- **Users without team visibility**: Personal overview with clock in/out times, office/remote split, shift progress bar → Weekly strip → Monthly summary

Each section loads independently with its own skeleton. Department scope filter and group-by toggles for users with team visibility.

### Organization Management

Unified page with a left sidebar and a full-width interactive flow diagram:

- **Search + Add Employee card** at the top — search people, departments, teams. "Add Employee" opens a center modal
- **Left sidebar** with three separate cards, each with full CRUD (SuperAdmin):
  - **Departments** — add/edit/delete departments
  - **Teams** — add/edit/delete teams (a team can belong to **multiple departments** simultaneously)
  - **Designations** — create/edit/toggle/delete named titles with colors
  - **Summary** — total employees and unassigned count
- **Flow diagram** — interactive organizational chart powered by React Flow (@xyflow/react):
  - **Node types**: Departments (purple), Teams (blue), Employees (teal) — all draggable
  - **Positional hierarchy** — hierarchy is determined by vertical position, not labels. Node above = superior; node below = reports to
  - **Drag-and-drop connections**: Drag from any node handle to create:
    - Employee ↔ Department: creates a Membership
    - Employee ↔ Team: creates a Membership (auto-resolves department)
    - Employee → Employee: creates a reporting relationship
    - Team ↔ Department: adds the department to the team's multi-department list
  - **Designation pill** on each connection line — click to open context menu: change designation, edit privileges (50+ toggles), or remove assignment (with confirmation)
  - **Multiple memberships** — one employee can connect to multiple teams/departments, each with independent permissions
  - **Auto-save positions** — drag to rearrange, positions persist to FlowLayout model in MongoDB
- **All forms use center modals** — employee creation, editing, designation assignment, privilege management. No page navigation required

### Workspace

Three sub-pages under `/workspace/` with a persistent tab bar:

- **Campaigns**: Sidebar tree grouped by status. Card grid for browsing. Create/edit via center modal
- **Tasks**: Sidebar with grouping modes (status, assignee, campaign, priority). Clean task table. Create/edit via center modal
- **Updates**: Activity timeline with avatars, descriptions, timestamps. Auto-refresh on visibility

### Insights Desk

Four sub-pages under `/insights-desk/` with a persistent tab bar:

- **Attendance**: Aggregate team mode and individual mode with calendar, session timeline, monthly stats
- **Calendar**: Full monthly grid with color-coded days (present, late, absent, holiday, leave). Click any day for detail panel
- **Leaves**: Leave request form, approval queue, balance tracking
- **Payroll**: Configuration, holiday management, payslip generation, finalize/pay actions

### Leave Management

- Leave types: Annual, Sick, Casual, Unpaid, Maternity, Paternity, Bereavement, Other
- Per-employee annual balance allocation (configurable per year)
- Balance auto-deducted on approval, restored on rejection/cancellation
- Past-date corrections require appropriate permissions
- Approval workflow with review notes

### Payroll System

- Configurable: working days/month, late threshold, penalties, overtime multiplier, currency, pay day
- Holiday calendar management
- Auto-generation of monthly payslips from attendance data
- Calculations: base salary + allowances + overtime − absence deductions − late penalties = net pay
- Three-stage status: Draft → Finalized → Paid
- Per-employee salary field

### Employee Detail Page

Comprehensive hub at `/employee/[slug]` with tabbed sections:

- **Overview**: Today's attendance, active tasks/campaigns, memberships
- **Attendance**: Monthly calendar with color-coded dots, stats
- **Profile**: Personal details, shift configuration
- **Activity**: Recent activity log, task list
- **Leaves**: Leave balance and history
- **Payroll**: Salary and payslip info

### Ping System

Peer-to-peer messaging scoped by organizational relationships:
- SuperAdmin can ping anyone; others can ping within their department/team scope
- Signal-wave icon in header with unread badge and dropdown inbox
- Quick-ping button on dashboard employee cards

### Learning Guide (Onboarding)

- **Welcome modal**: 4-slide overview on first login (replayable)
- **Page tours**: Spotlight tours highlighting key UI elements — auto-triggers on first visit
- **Help button**: Question-mark icon in header to replay tours
- Progress tracked in database, syncs across devices

### Activity Log & Notifications

- Every CRUD action is logged with scope-based visibility
- Bell icon with unread badge, "Mark all read", cross-device sync
- Security events with severity badges and location links
- Clickable entries navigate to relevant pages

### Settings & Configuration

- Profile management (name, phone, image upload)
- Email change (requires current password, 24hr cooldown)
- Password change with strength meter
- System Settings (SuperAdmin): company name, timezone, office geofence, shift defaults
- Dark / Light / System theme toggle

---

## Security

- **DB-verified SuperAdmin** — `getVerifiedSession()` reads `isSuperAdmin` from MongoDB on every request, never trusts the JWT alone
- **JWT tamper-proof** — even a forged `isSuperAdmin: true` token is overridden by the DB check
- **SuperAdmin accounts are protected** — cannot be edited or deleted by non-SuperAdmin users, even if they have full permissions
- **`isSuperAdmin` cannot be set via any API** — only direct database access can grant/revoke it
- **Membership-scoped queries** — APIs only return data the user is authorized to see based on their membership department/team scope
- **Two-check enforcement** for write actions: permission toggle + reporting chain position
- **bcryptjs** password hashing
- **Token-based password reset** (SHA-256, 1hr expiry)
- **Rate limiting** (5 attempts / 15 min)
- **Self-edit prevention** on employee API
- **Server-side route guards** in middleware with legacy URL redirects

### PWA & Mobile

- Installable as a native app (manifest + service worker)
- `sendBeacon` for best-effort check-out on tab close
- Cache-first + stale-while-revalidate strategy
- Mobile-optimized fonts and spacing
- Hamburger menu with profile, theme, pings, notifications, settings
- Bottom dock as primary navigation with frosted glass effect

---

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server (Next.js + Socket.IO on one port)
npm run dev

# Or start Next.js only (no Socket.IO, for Vercel-like behavior)
npm run dev:next
```

Open [http://localhost:3000](http://localhost:3000) and log in with your admin account.

**First-time setup**: The initial user must have `isSuperAdmin: true` set directly in the database. From there, create employees from the Organization page, drag connections in the flow diagram to assign them to departments/teams, and configure their permissions on each connection's designation pill. Designations are created on-demand — no pre-seeded data required.

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

## Project Structure

```
app/
  (dashboard)/
    page.tsx                Dashboard entry point
    DashboardHome.tsx       Real-time dashboard
    DashboardShell.tsx      Header, dock nav, theme, notifications
    SessionTracker.tsx      Heartbeat attendance tracker (skipped for SuperAdmin)
    organization/           Employees + departments + teams + designations
      OrgFlowTree.tsx       Interactive flow diagram (React Flow)
      DepartmentsPanel.tsx  Departments CRUD (sidebar card)
      TeamsPanel.tsx        Teams CRUD (sidebar card, multi-department)
      DesignationsPanel.tsx Designation management (sidebar card)
    workspace/
      layout.tsx            Shared tab bar
      campaigns/            Campaign management
      tasks/                Task list with grouping + filters
      updates/              Activity feed timeline
    insights-desk/
      layout.tsx            Shared tab bar
      attendance/           Attendance tracking
      calendar/             Monthly calendar
      leaves/               Leave management
      payroll/              Payroll management
    employee/[slug]/        Employee detail hub
    settings/               Profile, security, system config
    components/
      EmployeeCard.tsx      Unified employee card
      SpotlightTour.tsx     Guided page tour
      WelcomeGuide.tsx      First-login welcome
      ScopeStrip.tsx        Department scope filter
  api/
    employees/              Employee CRUD + dropdown
    departments/            Department CRUD
    teams/                  Team CRUD (multi-department)
    campaigns/              Campaign CRUD + entity tagging
    tasks/                  Task CRUD
    attendance/             Daily/monthly records + session + presence
    designations/           Designation CRUD
    flow-layout/            Flow diagram position persistence
    memberships/            Membership CRUD (user-dept-team-designation-permissions)
    leaves/                 Leave CRUD + balance
    payroll/                Config, holidays, generate, payslips
    ping/                   Peer-to-peer pings
    activity-logs/          Activity log entries
    settings/               System settings
    profile/                Self profile + password
lib/
  auth.ts                   NextAuth config (JWT + isSuperAdmin)
  auth.config.ts            Middleware route guards + legacy redirects
  permissions.ts            Server-side permission system
  permissions.shared.ts     Permission key definitions (shared between server and client)
  clientPermissions.ts      Client-side permission helpers
  types.ts                  Shared TypeScript interfaces
  motion.ts                 Framer Motion variants
  useQuery.ts               Client-side cache (stale-while-revalidate)
  useGuide.tsx              Onboarding tour provider
  tourConfigs.ts            Tour step definitions
  payrollUtils.ts           Payroll calculations
  db.ts                     MongoDB connection
  helpers.ts                Response utilities
  mail.ts                   Email sending
  activityLogger.ts         Activity logging
  geo.ts                    Geofence + anti-spoofing
  tz.ts                     Timezone math
  dayBoundary.ts            6 AM day boundary logic
  rateLimit.ts              Rate limiter
  models/
    User.ts                 User (isSuperAdmin flag, salary, shifts)
    Designation.ts          Named title + default permission template
    Membership.ts           User-department-team assignment with custom permissions
    FlowLayout.ts           Persisted org chart node positions
    Department.ts           Department
    Team.ts                 Team (multi-department)
    Campaign.ts             Campaign (status lifecycle, tagged entities)
    ActivityTask.ts         Task (priority, deadline, status)
    Leave.ts                Leave request
    LeaveBalance.ts         Per-user annual leave allocations
    PayrollConfig.ts        Payroll configuration
    Holiday.ts              Holiday calendar
    Payslip.ts              Monthly payslip
    Ping.ts                 Ping messages
    ActivitySession.ts      Work session + fraud detection
    DailyAttendance.ts      Daily attendance rollup
    MonthlyAttendanceStats.ts Monthly aggregate stats
    ActivityLog.ts          Activity log entries
    SystemSettings.ts       Global config
middleware.ts               Auth + legacy redirects
```

## License

Private — Single Solution
