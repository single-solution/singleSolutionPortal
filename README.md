# Single Solution Sync

Automatic employee presence and attendance tracking system. Detects when employees arrive at the office, when they leave, and how much time they spend — all without manual check-in/check-out.

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Styling**: Tailwind CSS 4, Framer Motion animations
- **Database**: MongoDB Atlas (Mongoose ODM)
- **Auth**: NextAuth.js v5 (JWT)
- **Email**: Nodemailer (SMTP)
- **Real-time**: Socket.IO (optional — dormant on Vercel, active on self-hosted)
- **PWA**: Installable, offline-first service worker
- **Deployment**: Vercel (serverless) or self-hosted Node.js

## Roles

5-level role hierarchy:

```
superadmin → manager → teamLead → businessDeveloper / developer
```

| Role | Access |
|------|--------|
| **SuperAdmin** | Full access to everything. Manages employees, departments, campaigns, tasks, system settings. No personal attendance — purely oversight. |
| **Manager** | Multi-department scoped. Manages employees, teams, tasks, and attendance across assigned departments. No access to Departments page. |
| **Team Lead** | Sees employees who report to them + members of teams they lead. Can manage tasks and view attendance for their scope. No access to Departments page. |
| **Business Developer** | Job pipeline tracking (17 BD-specific fields), personal attendance. |
| **Developer** | Personal attendance, task status updates, profile management. |

Employees can belong to multiple teams simultaneously. Managers can manage multiple departments. Team Leads manage the teams they're assigned to lead.

**Campaigns** replace the old standalone Teams page — use them to label initiatives that span one or more departments and specific people.

---

## Features

### Automatic Attendance Tracking

The core feature. Uses a **heartbeat model** — no manual check-in/check-out required.

- Employee opens the app on desktop → session starts automatically
- A heartbeat pings the server every 30 seconds with GPS coordinates
- If the heartbeat stops for 3+ minutes (laptop closed, crash, etc.), the session is auto-closed
- Mobile devices are read-only — they display synced data but never create sessions
- Only one active session per user at any time (prevents hour inflation)
- Sleep/wake is handled gracefully — old session closes at last heartbeat, new session starts fresh
- Idle detection: 1hr of inactivity triggers nudge toasts, then pauses the timer with an overlay

**Office Detection:**
- GPS coordinates compared against configurable office geofence (Haversine formula)
- Tracks office vs remote time separately with entry/exit segments
- Works with Wi-Fi triangulation on laptops (not phone GPS)
- Best-effort: if geo is denied, the session still works

**Anti-Spoofing (4 layers):**
1. Accuracy zero detection (fake GPS extensions)
2. Teleportation detection (impossible movement speed between heartbeats)
3. Round coordinate detection (crude manual entries)
4. Zero variance (disabled — incompatible with Wi-Fi positioning)
- When flagged: timer pauses, employee sees a warning with "Re-check Location" option
- Two-tier severity: Warning (≤2 flags/30d) vs Violation (>2 flags, pauses timer)
- Does not lock out employees — lets them self-correct

**Day Boundary:**
- Attendance day starts at 6 AM, not midnight
- Work done between midnight–6 AM counts toward the previous day
- All date math is timezone-aware (configurable, defaults to Asia/Karachi)

**Dual Lateness Tracking:**
- "Late to work" — when the employee first started any session (office or remote) vs shift deadline
- "Late to office" — when the employee physically arrived at the office vs shift deadline
- These are tracked independently, so a remote-on-time but office-late employee shows both statuses

**Timer Pill:**
- Floating pill at the bottom of the screen showing live elapsed time and today's total
- Color-coded: green (office), blue (remote), red (flagged), gray (offline)

### Dashboard

Real-time overview for each role:

- **SuperAdmin/Manager/Team Lead**: Welcome greeting with live status counts (In Office, Remote, Late, Absent) → Team Status grid with employee cards showing clock in/out, hours, shift progress, office/remote breakdown → Active Campaigns → Task Checklist
- **Developer/BD**: Personal overview with clock in/out times, office/remote split, shift progress bar → Weekly strip → Monthly summary

Each section loads independently with its own skeleton — no global loading gate. Manual refresh buttons on each section; Socket.IO pushes updates when enabled.

**Scope Strip**: SuperAdmin and Manager see a department filter strip on Dashboard, Employees, and Attendance — only if they have access to 2+ departments.

**View Groups**: "Group by" toggle (Flat / By Manager / By Department) on Dashboard and Employees page.

### Employee Management

- Full CRUD with role-based access control
- Employee cards with live status, hours, shift progress, tasks/campaigns
- Click any card → rich detail page with profile, today's KPIs, activity timeline, weekly/monthly stats
- Multi-department manager assignment via toggle chips
- Shift configuration per employee (type, hours, working days, break, grace period)
- Business Developer fields (17 additional pipeline fields)
- Quick active/inactive toggle with optimistic UI (deactivated cards stay visible but dimmed)
- Profile image upload, welcome email on creation
- Self-edit prevented server-side — employees manage their own profile under Settings only

### Department Management (SuperAdmin Only)

- Department CRUD with parent hierarchy support
- Inline add/edit within cards
- Manager assignment per department
- Employee and team count display

### Campaign / Project Tracking

- Track initiatives across departments and people
- Lifecycle statuses: Active → Paused → Completed / Cancelled
- Tag employees, departments, and teams to any campaign
- Filter by status, search across names and tagged entities

### Task Management

- Priority-based assignment (Low / Medium / High / Urgent) with deadlines
- Admins create and reassign; assignees update status only
- Status flow: Pending → In Progress → Completed / Cancelled

### Attendance Page

- **Aggregate mode**: Select "All Employees" to see team-wide monthly stats, pick a date to see everyone's status for that day
- **Individual mode**: Click an employee pill to see their calendar with color-coded dots, click a day for detailed breakdown (times, sessions, timeline)
- **Employee Overview**: Grid of monthly summary cards per employee (attendance %, hours, late days, on-time %)
- Month navigation, department scope filter, group-by toggles
- Self-exclusion enforced server-side — "My Attendance" pill for self-view

### Hierarchy Ping System

Peer-to-peer messaging within reporting chains:
- SuperAdmin can ping anyone; Manager pings their department; Team Lead pings reports + manager; Employee pings manager/lead + teammates
- Signal-wave icon in header with unread badge and dropdown inbox
- Quick-ping button on dashboard employee cards
- Non-admin roles see their manager's live status with a one-tap ping button

### Learning Guide (Onboarding)

- **Welcome modal**: 4-slide overview shown on first login (replayable anytime)
- **Page tours**: Each major page has a spotlight tour that highlights key UI elements with explanations — auto-triggers on first visit
- **Help button**: Question-mark icon in header to replay the welcome tour or current page guide
- Progress tracked in database — syncs across devices

### Activity Log & Notifications

- Every CRUD action is logged with role-hierarchical visibility
- SuperAdmin sees all; Manager sees their department scope; Team Lead sees their teams; Employees see logs where they're targeted
- Bell icon with unread badge, "Mark all read", cross-device sync
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
- IDOR protection (role + department scoping on all APIs)
- Server-side route guards in middleware
- Self-edit prevention on employee API

### PWA & Offline

- Installable as a native app (manifest + service worker)
- `sendBeacon` for best-effort check-out on tab close
- Cache-first + stale-while-revalidate strategy

### Mobile UX

- App-sized fonts and spacing on mobile
- Hamburger menu with profile, theme, pings, notifications, settings
- Bottom dock as primary navigation
- All content visible (no hidden-on-mobile patterns)

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

Open [http://localhost:3000](http://localhost:3000) and log in with your admin account. Create employees, departments, and tasks from the dashboard — all accounts are managed through the app itself (no seeding required).

**SuperAdmin can create other SuperAdmins** — requires confirming the requesting admin's own password for security.

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
  layout.tsx               Root layout
  globals.css              Global styles and design tokens
  login/                   Login page
  forgot-password/         Password reset request
  reset-password/          Reset password with strength meter
  preview/                 Public demo/preview
  (dashboard)/             Route group — authenticated pages
    layout.tsx             Dashboard layout wrapper
    Providers.tsx          Client providers (SessionProvider)
    page.tsx               Dashboard entry point
    DashboardHome.tsx      Real-time dashboard
    DashboardShell.tsx     Header, dock nav, theme, notifications
    SessionTracker.tsx     Heartbeat attendance tracker
    employees/
      page.tsx             Employee list
      loading.tsx          Skeleton loader
      EmployeeForm.tsx     Create/edit form
      new/page.tsx         Create employee
      [slug]/page.tsx      Employee detail (by username or ID)
      [slug]/edit/page.tsx Edit employee
    departments/
      page.tsx             Department management
      loading.tsx          Skeleton loader
    teams/
      page.tsx             Team management
      loading.tsx          Skeleton loader
    campaigns/
      page.tsx             Campaign tracking
      loading.tsx          Skeleton loader
    tasks/
      page.tsx             Task board
      loading.tsx          Skeleton loader
    attendance/page.tsx    Calendar + detail + team overview
    settings/
      page.tsx             Profile, security, system config
      loading.tsx          Skeleton loader
    components/
      SpotlightTour.tsx    Guided page tour overlay
      WelcomeGuide.tsx     First-login welcome modal
      ConfirmDialog.tsx    Reusable confirm/danger dialog
      DataTable.tsx        Sortable data table + StatusToggle
      EmployeeCard.tsx     Unified employee card component
      ScopeStrip.tsx       Department scope filter
      Portal.tsx           React Portal for modals
  api/
    auth/                  NextAuth + password reset
    employees/             Employee CRUD + dropdown
    departments/           Department CRUD (SuperAdmin write)
    teams/                 Team CRUD
    campaigns/             Campaign CRUD + entity tagging
    tasks/                 Task CRUD
    attendance/            Daily/monthly records + session + presence
    guide/                 Onboarding tour progress
    ping/                  Peer-to-peer pings
    activity-logs/         Activity log entries
    settings/              System settings (SuperAdmin)
    user/last-seen/        Notification read sync
    profile/               Self profile + password
    test-email/            SMTP testing
lib/
  auth.ts                  NextAuth config
  auth.config.ts           Middleware route guards
  permissions.ts           Role verification + scoping helpers
  db.ts                    MongoDB connection
  helpers.ts               Response utilities
  mail.ts                  Email templates + sending
  useQuery.ts              Client-side cache (stale-while-revalidate)
  useGuide.tsx             Onboarding tour provider
  tourConfigs.ts           Tour step definitions
  socket.ts                Server-side Socket.IO emitter
  useSocket.ts             Client-side Socket.IO hook
  activityLogger.ts        Activity logging utility
  geo.ts                   Geofence + anti-spoofing
  tz.ts                    Timezone-aware date math
  dayBoundary.ts           6 AM day boundary logic
  rateLimit.ts             Rate limiter
  motion.ts                Animation presets
  models/
    User.ts                User (5 roles, shifts, teams, reportsTo)
    Department.ts          Department with manager + parent hierarchy
    Team.ts                Team (department, lead)
    Campaign.ts            Campaign (status lifecycle, tagged entities)
    Ping.ts                Ping messages
    ActivitySession.ts     Work session with office segments + fraud detection
    ActivityTask.ts        Task (priority, deadline, status)
    DailyAttendance.ts     Daily attendance rollup
    MonthlyAttendanceStats.ts Monthly aggregate stats
    ActivityLog.ts         Activity log entries
    SystemSettings.ts      Global config
server.ts                  Custom server with Socket.IO
middleware.ts              Auth + route protection
```

## License

Private — Single Solution
