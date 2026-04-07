# Single Solution Sync

Automatic employee presence, attendance, leave, and payroll management system. Detects when employees arrive at the office, when they leave, and how much time they spend — all without manual check-in/check-out.

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Styling**: Tailwind CSS 4, Framer Motion animations
- **Database**: MongoDB Atlas (Mongoose ODM)
- **Auth**: NextAuth.js v5 (JWT)
- **Email**: Nodemailer (SMTP)
- **Real-time**: Socket.IO (optional — dormant on Vercel, active on self-hosted)
- **PWA**: Installable, offline-first service worker
- **Deployment**: Vercel (serverless) or self-hosted Node.js

---

## Authorization Model

The platform uses a **dynamic, permission-based** authorization system instead of fixed roles.

### Core Concepts

**Designations** are named titles (e.g., "Manager", "QA Lead", "Developer") with 50 configurable default permission toggles across 10 categories: Employees, Members, Departments, Teams, Tasks, Campaigns, Attendance, Leaves, Payroll, and System.

**Memberships** link a User to a Department and optional Team with a Designation. Permissions are copied from the Designation defaults but are fully customizable per assignment — two "QA Leads" in different departments can have completely different permissions.

**Reporting Chain** — each Membership has a `reportsTo` field defining who manages whom in each context. Write actions (edit, delete, toggle) are blocked against anyone above you in the chain.

**SuperAdmin** — a system-wide boolean flag (`isSuperAdmin`) that bypasses all permission and reporting chain checks. Multiple users can be SuperAdmin.

### Pre-seeded Designations

| Designation | Access Level |
|-------------|-------------|
| **Employee** | All 50 permissions OFF. Personal access only (own profile, attendance, tasks, leave requests, payslips). |
| **Team Lead** | View employees, teams, tasks, campaigns, attendance. Create/edit/reassign tasks. |
| **Manager** | All of Team Lead plus: create/edit employees, manage teams, approve leaves, view payroll, export attendance. |
| **Admin** | All 50 permissions ON within assigned scope (still bound by reporting chain for write actions). |

SuperAdmins can create additional designations with any combination of defaults from the Designations management page.

### Two-Check Security

Every action uses server-side enforcement:
1. **Permission check** — Does the user have the relevant permission toggled ON in their Membership?
2. **Reporting chain check** (write actions only) — Is the target below the user in the `reportsTo` chain?

SuperAdmin bypasses both checks. The client never decides access — it only reflects what the API allows.

---

## Navigation

| Page | Route | Description |
|------|-------|-------------|
| **Overview** | `/` | Real-time dashboard with team status, campaigns, tasks |
| **Workspace** | `/workspace/` | Unified hub for campaigns, tasks, and activity |
| — Campaigns | `/workspace/campaigns` | Campaign cards with sidebar tree grouped by status, detail view with linked tasks |
| — Tasks | `/workspace/tasks` | Task list with sidebar for grouping (by status/assignee/campaign/priority) and filtering |
| — Updates | `/workspace/updates` | Activity feed with timeline, auto-refresh |
| **Organization** | `/organization` | Unified Employees + Departments + Teams management with org tree sidebar |
| **Insights Desk** | `/insights-desk/` | Analytics hub for attendance, calendar, leaves, and payroll |
| — Attendance | `/insights-desk/attendance` | Team/employee attendance with calendar, session timelines, monthly stats |
| — Calendar | `/insights-desk/calendar` | Monthly calendar with color-coded attendance, leaves, and holidays |
| — Leaves | `/insights-desk/leaves` | Leave request form, approval queue, balance tracking |
| — Payroll | `/insights-desk/payroll` | Payroll configuration, holidays, payslip generation |
| **Settings** | `/settings` | Profile, security, system configuration |
| **Roles** | `/designations` | Designation management (SuperAdmin only) |

Employee detail pages use singular routes: `/employee/[slug]` with tabbed sections for Overview, Attendance, Profile, Activity, Leaves, and Payroll.

Legacy routes (`/employees`, `/departments`, `/teams`, `/campaigns`, `/tasks`, `/attendance`) are automatically redirected to their new locations via middleware.

---

## Features

### Automatic Attendance Tracking

Uses a **heartbeat model** — no manual check-in/check-out required.

- Employee opens the app on desktop — session starts automatically
- A heartbeat pings the server every 30 seconds with GPS coordinates
- If the heartbeat stops for 3+ minutes (laptop closed, crash), the session auto-closes
- Mobile devices are read-only — they display synced data but never create sessions
- Only one active session per user at any time
- Sleep/wake handled gracefully — old session closes at last heartbeat, new session starts fresh
- Idle detection: 1hr of inactivity triggers nudge toasts, then pauses the timer with an overlay

**Office Detection:**
- GPS coordinates compared against configurable office geofence (Haversine formula)
- Tracks office vs remote time separately with entry/exit segments
- Coordinates displayed in detailed attendance view with Google Maps links

**Anti-Spoofing (4 layers):**
1. Accuracy zero detection (fake GPS extensions)
2. Teleportation detection (impossible movement speed between heartbeats)
3. Round coordinate detection (crude manual entries)
4. Two-tier severity: Warning (≤2 flags/30d) vs Violation (>2 flags, pauses timer)

**Dual Lateness Tracking:**
- "Late to work" — when the employee first started any session vs shift deadline
- "Late to office" — when the employee physically arrived at the office vs shift deadline
- Tracked independently so remote-on-time but office-late employees show both statuses

**Day Boundary:**
- Attendance day starts at 6 AM, not midnight
- Work done between midnight–6 AM counts toward the previous day
- All date math is timezone-aware (configurable, defaults to Asia/Karachi)

### Dashboard

Real-time overview for each authorization level:

- **Admin/Manager/Team Lead**: Welcome greeting with live status counts (In Office, Remote, Late, Absent) → Team Status grid with employee cards → Active Campaigns → Task Checklist
- **Employee/BD**: Personal overview with clock in/out times, office/remote split, shift progress bar → Weekly strip → Monthly summary

Each section loads independently with its own skeleton. Department scope filter and group-by toggles (Flat / By Manager / By Department) for admin roles.

### Organization Management

Unified page for managing employees, departments, and teams:

- **Org tree sidebar** with department → team → employee hierarchy
- **Context views** that change based on selection (department overview, team members, unassigned employees)
- Employee cards with live status, designation badges, reporting chain
- Assignment modal for adding employees to departments/teams with designation and custom permissions
- Search, view mode toggles (Tree / Flat / Card Grid)

### Workspace

Three sub-pages under `/workspace/`, each with a persistent tab bar:

- **Campaigns** (`/workspace/campaigns`): Sidebar tree grouped by status (Active / Paused / Completed / Cancelled) with individual campaign names. Click a campaign to open its detail view with stats, progress bar, tags, and a linked tasks table. Card grid for browsing. Mobile uses horizontal pills.
- **Tasks** (`/workspace/tasks`): Sidebar with grouping modes (All Tasks, By Status, By Assignee, By Campaign, By Priority) and status filter with counts. Clean task table with priority/status/deadline columns.
- **Updates** (`/workspace/updates`): Activity timeline with user avatars, action descriptions, timestamps. Auto-refresh on tab/page visibility.

### Insights Desk

Four sub-pages under `/insights-desk/`, each with a persistent tab bar:

- **Attendance** (`/insights-desk/attendance`): Aggregate team mode and individual employee mode with calendar, session timeline, monthly stats, employee overview grid. Department scope filter and group-by toggles (Flat, By Manager, By Department).
- **Calendar** (`/insights-desk/calendar`): Full monthly calendar grid with color-coded day indicators — green (present), amber (late), red (absent), blue (holiday), purple (leave). Click any day to expand a detail panel showing attendance stats (clock in/out, office/remote time, lateness), holiday info, and leave details. Monthly summary cards with present/late/absent counts, total hours, and approved leave days. Month navigation with "Today" button.
- **Leaves** (`/insights-desk/leaves`): Leave request form, approval queue, balance tracking. Employees request future-only leaves; managers approve/reject; SuperAdmin can correct past records.
- **Payroll** (`/insights-desk/payroll`): Payroll configuration, holiday management, payslip generation, and payslip table with finalize/pay actions (SuperAdmin). Employees see only their own payslips.

### Leave Management

- Leave types: Annual, Sick, Casual, Unpaid, Maternity, Paternity, Bereavement, Other
- Per-employee annual balance allocation (configurable per year)
- Balance auto-deducted on approval, restored on rejection/cancellation
- Past-date leave corrections are SuperAdmin-only
- Manager+ approval workflow with review notes

### Payroll System

- Configurable payroll settings: working days/month, late threshold, penalties, overtime multiplier, currency, pay day
- Holiday calendar management
- Auto-generation of monthly payslips from attendance data
- Calculations: base salary + allowances + overtime − absence deductions − late penalties = net pay
- Three-stage status: Draft → Finalized → Paid
- Per-employee salary field on the User model

### Employee Detail Page

Comprehensive employee hub at `/employee/[slug]` with tabbed sections:

- **Overview**: Today's attendance summary, active tasks/campaigns, memberships
- **Attendance**: Monthly calendar with color-coded dots, monthly stats
- **Profile**: Personal details, department/team info, shift configuration
- **Activity**: Recent activity log, task list
- **Leaves**: Leave balance and history (placeholder)
- **Payroll**: Salary and payslip info (placeholder)

### Hierarchy Ping System

Peer-to-peer messaging within reporting chains:
- SuperAdmin can ping anyone; Manager pings their department; Team Lead pings reports + manager
- Signal-wave icon in header with unread badge and dropdown inbox
- Quick-ping button on dashboard employee cards

### Learning Guide (Onboarding)

- **Welcome modal**: 4-slide overview shown on first login (replayable anytime)
- **Page tours**: Each page has a spotlight tour that highlights key UI elements with explanations — auto-triggers on first visit. Tours for: Dashboard, Organization, Workspace, Insights Desk, Attendance, Settings
- **Help button**: Question-mark icon in header to replay tours
- Progress tracked in database — syncs across devices

### Activity Log & Notifications

- Every CRUD action is logged with scope-based visibility
- Bell icon with unread badge, "Mark all read", cross-device sync
- Security events with severity badges (Warning / Violation) and location links
- Clickable entries navigate to relevant pages

### Settings & Configuration

- Profile management (name, phone, image upload)
- Email change (requires current password, 24hr cooldown)
- Password change with strength meter
- System Settings (SuperAdmin): company name, timezone, office geofence, shift defaults, live updates toggle
- Dark / Light / System theme toggle

### Security

- bcryptjs password hashing
- Token-based password reset (SHA-256, 1hr expiry)
- Rate limiting (5 attempts / 15 min)
- Zero-trust: all permission checks are server-side via `getVerifiedSession()` + `hasPermission()` / `canActOn()`
- Membership-scoped MongoDB queries — APIs only return data the user is authorized to see
- Self-edit prevention on employee API
- Server-side route guards in middleware with legacy URL redirects

### PWA & Mobile

- Installable as a native app (manifest + service worker)
- `sendBeacon` for best-effort check-out on tab close
- Cache-first + stale-while-revalidate strategy
- App-sized fonts and spacing on mobile
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

Open [http://localhost:3000](http://localhost:3000) and log in with your admin account. Create employees, departments, and tasks from the dashboard.

**First-time setup**: Run the auth migration at `POST /api/migrate/auth` to create default designations and convert existing user roles to the new Membership model.

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
    DashboardHome.tsx       Real-time dashboard (decomposed into sub-components)
    DashboardShell.tsx      Header, dock nav, theme, notifications
    SessionTracker.tsx      Heartbeat attendance tracker
    organization/           Unified employees + departments + teams management
    workspace/
      layout.tsx            Shared header + tab bar for workspace sub-pages
      campaigns/            Campaign management with sidebar tree + detail view
      tasks/                Task list with sidebar grouping + filters
      updates/              Activity feed timeline
    insights-desk/
      layout.tsx            Shared header + tab bar for insights sub-pages
      attendance/           Full attendance tracking page
      calendar/             Monthly calendar with attendance/leaves/holidays
      leaves/               Leave management (imports LeavesTab)
      payroll/              Payroll management (imports PayrollTab)
      LeavesTab.tsx         Leave management UI component
      PayrollTab.tsx        Payroll management UI component
    employee/[slug]/        Employee detail hub (singular route)
      EmployeeDetailHub.tsx Tabbed employee profile
    attendance/             Legacy redirect → /insights-desk/attendance
    settings/               Profile, security, system config
      SettingsProfile.tsx   Profile sub-component
      SettingsSecurity.tsx  Security sub-component
      SettingsSystem.tsx    System settings sub-component
    designations/           Designation management (SuperAdmin)
    components/
      EmployeeCard.tsx      Unified employee card component
      SpotlightTour.tsx     Guided page tour overlay
      WelcomeGuide.tsx      First-login welcome modal
      ScopeStrip.tsx        Department scope filter
      CardSkeleton.tsx      Generic card loading skeleton
      GridSkeleton.tsx      Grid of card skeletons
      StatSkeleton.tsx      Stat card loading skeleton
      Overlay.tsx           Shared fullscreen overlay
  api/
    employees/              Employee CRUD + dropdown
    departments/            Department CRUD
    teams/                  Team CRUD
    campaigns/              Campaign CRUD + entity tagging
    tasks/                  Task CRUD
    attendance/             Daily/monthly records + session + presence
    designations/           Designation CRUD (SuperAdmin)
    memberships/            Membership CRUD (user-department-team assignments)
    leaves/                 Leave request CRUD + balance
    payroll/                Config, holidays, generate, payslips
    migrate/auth/           Migration from old roles to new authorization model
    guide/                  Onboarding tour progress
    ping/                   Peer-to-peer pings
    activity-logs/          Activity log entries
    settings/               System settings
    profile/                Self profile + password
lib/
  auth.ts                   NextAuth config (JWT + isSuperAdmin)
  auth.config.ts            Middleware route guards + legacy redirects
  permissions.ts            Permission checking (hasPermission, canActOn, isAboveInChain)
  clientPermissions.ts      Client-side role helpers
  types.ts                  Shared TypeScript interfaces
  motion.ts                 Centralized Framer Motion variants
  useQuery.ts               Client-side cache (stale-while-revalidate)
  useGuide.tsx              Onboarding tour provider
  tourConfigs.ts            Tour step definitions for all pages
  payrollUtils.ts           Payroll calculation helpers
  db.ts                     MongoDB connection
  helpers.ts                Response utilities
  mail.ts                   Email templates + sending
  socket.ts                 Server-side Socket.IO emitter
  useSocket.ts              Client-side Socket.IO hook
  activityLogger.ts         Activity logging utility
  geo.ts                    Geofence + anti-spoofing
  tz.ts                     Timezone-aware date math
  dayBoundary.ts            6 AM day boundary logic
  rateLimit.ts              Rate limiter
  models/
    User.ts                 User (isSuperAdmin, salary, guideTours)
    Designation.ts          Permission template (50 toggles, 10 categories)
    Membership.ts           User-department-team assignment with custom permissions
    Department.ts           Department with parent hierarchy
    Team.ts                 Team within a department
    Campaign.ts             Campaign (status lifecycle, tagged entities)
    ActivityTask.ts         Task (priority, deadline, status)
    Leave.ts                Leave request (type, status, review)
    LeaveBalance.ts         Per-user annual leave allocations
    PayrollConfig.ts        Payroll system configuration
    Holiday.ts              Holiday calendar entries
    Payslip.ts              Monthly payslip records
    Ping.ts                 Ping messages
    ActivitySession.ts      Work session with office segments + fraud detection
    DailyAttendance.ts      Daily attendance rollup
    MonthlyAttendanceStats.ts Monthly aggregate stats
    ActivityLog.ts          Activity log entries
    SystemSettings.ts       Global config
middleware.ts               Auth + route protection + legacy redirects
```

## License

Private — Single Solution
