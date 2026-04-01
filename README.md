# Single Solution Sync

Automatic employee presence and attendance tracking system. Detects when employees arrive at the office, when they leave, and how much time they spend — all without manual check-in/check-out.

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Styling**: Tailwind CSS 4, iOS 26.4 Liquid Glass design system (theme-aware glass dock, frosted header, aurora mesh)
- **Animations**: Framer Motion (spring-based micro-interactions, stagger entrances, layout animations)
- **Database**: MongoDB Atlas (Mongoose ODM)
- **Auth**: NextAuth.js v5 (Credentials provider, JWT strategy)
- **Email**: Nodemailer (SMTP — welcome, password reset, attendance alerts)
- **Real-time**: SSE event stream (`/api/events`) for push-based dashboard updates — data fetched only when server signals a change. `useQuery` client-side cache with EventBus-aware invalidation (stale-while-revalidate). Heartbeat polling (30s) for attendance tracking. Browser Notifications API
- **Geolocation**: Haversine formula, configurable office geofence (50m default)
- **PWA**: Progressive Web App (installable, offline-first service worker)
- **Deployment**: Vercel (serverless, no persistent backend required)

## Roles

5-level role hierarchy:

```
superadmin (100) → manager (50) → teamLead (30) → businessDeveloper / developer (10)
```

| Role | Access |
|------|--------|
| **SuperAdmin** | Full CRUD on employees, departments, teams, tasks, system settings; attendance reports, email testing. **No personal attendance tracking** — purely oversight role ("god mode") |
| **Manager** | Department-scoped team/employee view, task management, team CRUD within own department, attendance presence for their department |
| **Team Lead** | Team-scoped view of employees, tasks, and attendance for teams they lead. Can create/manage tasks for team members. Has admin nav access (employees, departments, teams pages). Sits under a manager |
| **Business Developer** | Job pipeline tracking (17 BD fields), personal attendance |
| **Developer** | Personal attendance, task status updates, profile management |

Employees can belong to **multiple teams simultaneously** — enabling cross-team/cross-project membership. Team Leads manage the teams they're assigned to lead, while managers oversee their entire department.

---

## Features

### Attendance & Presence (Heartbeat-Based)

The core of this app. Uses a **heartbeat model** instead of Socket.IO or manual check-in/check-out.

**How it works:**
- When a desktop user opens the app, a session is automatically created and a heartbeat starts (PATCH every 30s)
- The heartbeat updates `lastActivity` and sends GPS coordinates for office detection
- If the heartbeat stops for **3 minutes** (6 missed beats), the session is considered dead
- Any new desktop device can then take over by creating a new session (the server auto-closes the dead one)
- Mobile devices are always read-only — they never create sessions, only display synced data

**Session lifecycle:**
- **Check-in**: automatic on page load (desktop only), with geolocation one-shot
- **Heartbeat**: every 30s PATCH with coords + lastActivity update
- **Check-out**: `sendBeacon` on tab close (best-effort) OR stale cleanup on next check-in OR explicit sign-out
- **Stale cleanup**: when a new check-in finds an existing session with `lastActivity > 3 min` ago, it auto-closes it (duration = lastActivity − start)
- **Daily recomputation**: on every session close, all sessions for that day are summed to produce daily totals

**One active session rule:**
- Only one active session per user at any time — prevents hour inflation from multiple devices
- Second desktop sees "active on another device" and polls every 30s in readonly mode
- When the active device dies, the readonly desktop auto-takes-over

**Geolocation:**
- Updated every 30s via the heartbeat (replaces continuous `watchPosition` — less battery, same accuracy for 50m geofence)
- Office/remote transition detection with office segment tracking (entryTime, exitTime, durationMinutes per segment)
- Best-effort: if geo is denied, the session still works — just can't determine in-office vs remote

**Timer pill (bottom of screen):**
- Color-coded gradient: green = in-office, blue = remote, gray = offline
- Shows: live ticking elapsed time | cumulative today total (completed sessions + active)
- Readonly mode: "another device" label or "📱 synced" for mobile
- Stale session: shows "inactive" instead of a running timer
- Idle/Away: visibility-aware detection — tab hidden (user in another app) keeps timer running; tab visible + 1hr no interaction triggers 3 nudge toasts (5min apart), then pauses timer with full-screen "Stepped Away" overlay

**Daily & monthly rollup:**
- `DailyAttendance`: totalWorkingMinutes, officeMinutes, remoteMinutes, isPresent, isOnTime, lateBy, firstOfficeEntry, lastOfficeExit
- `MonthlyAttendanceStats`: presentDays, absentDays, onTimeArrivals, lateArrivals, averageDailyHours, totalWorkingHours, attendancePercentage
- Lateness calculated from employee's configured shift start + 30 min grace period

**Real-world scenarios:**

| Scenario | What happens |
|----------|-------------|
| Normal workday (open 9am, close 6pm) | Check-in → 9h heartbeat → sendBeacon checkout → 540 min |
| Lunch break (close lid, sendBeacon fails) | Session #1 frozen at 12:00. Reopen at 1pm → auto-close #1 (3h) → new #2 → close at 6pm (5h) → total 8h |
| Laptop crash | Heartbeat stops → session stale after 3 min → next device takes over |
| Open on MacBook + phone | MacBook = active (heartbeat). Phone = readonly (polls). MacBook closed → phone shows last synced data |
| Two desktops | Desktop A = active. Desktop B = readonly. A dies → B auto-takes-over after 3 min |
| Working past midnight | Heartbeat detects day change → auto-closes yesterday's session → creates today's seamlessly |
| Internet drops < 3 min | Heartbeat fails silently, resumes on reconnect. Session stays alive. |
| Internet drops > 3 min (single device) | PATCH resumes and updates lastActivity. Session survives. Only closed if another device tries to check in. |
| Explicit sign-out | Checkout API called before signOut → clean session close |
| Tab visible, 1hr+ idle | 3 "Still there?" nudge toasts (5min apart) → if ignored, timer pauses + overlay. Any interaction resumes. |
| Tab hidden (user in VS Code etc.) | Timer runs normally — no idle detection while tab is backgrounded |
| Browser crash | No sendBeacon. Session stale → cleaned up on next check-in |

### Employee Management

- Full CRUD with role-based access (SuperAdmin manages all, Manager manages their team)
- Full-width create/edit forms (`/employees/new`, `/employees/[id]/edit`) with 2-column grid layout: Personal Info + Role & Department side-by-side on desktop, full-width Shift Configuration card with internal grid below
- **Reports To (Team Lead assignment)**: dropdown selector showing team leads and managers filtered by the selected department. If no supervisor is explicitly chosen, the employee is **automatically assigned to the department manager** as a fallback (resolved server-side on create)
- ConfirmDialog for all destructive actions (deactivate single + bulk)
- Profile image upload (base64, max 2MB) with initials fallback avatar
- Shift configuration per employee (shift type, start/end hours, working days, break time, grace period)
- Business Developer fields (17 additional fields: jobID, platform, proposalStatus, clientCountry, etc.)
- Welcome email sent on account creation with temporary password
- StatusToggle for quick active/inactive toggle from card footer
- Card details: profile image, "Pending" badge (unverified), shift type + working days (compact: "Mon – Fri"), phone, "Joined" date

### Department Management

- Search + "Add Department" button in action bar (matches employees/tasks layout)
- Collapsible inline add row with name input + **parent department selector** + Create/Cancel buttons
- **Parent Department hierarchy**: departments can optionally reference a parent department, enabling nested organizational structures (displayed as "↳ Parent Name" on cards)
- Inline edit within card (expand fields on edit click) — includes parent department selector (self-reference excluded from options)
- ConfirmDialog for delete confirmation
- Card grid with gradient avatars, employee count progress bars, manager display + email + parent department label
- Sort toggles: Most Employees / Name
- Hover-visible edit/delete action buttons in card footer
- Equal-height cards across all CRUD pages (flex-based stretch)

### Team Management

- **Teams as department sub-sections**: e.g., "Node Team" and "Laravel Team" under the "Development" department
- Full CRUD: create, edit, delete teams with department assignment and optional team lead
- Card grid with gradient avatars, member count badges, lead info display
- Search + filter by department toggle pills
- Centered glass modal for create/edit (department selector, lead selector from employees, description)
- Delete confirmation via ConfirmDialog (removes team references from members on delete)
- Sort toggles: Most Members / Name
- Card footer: StatusToggle + creation date + hover-visible edit/delete buttons
- Role-scoped: SuperAdmin sees all teams; Manager sees teams in their department; Team Lead sees teams they lead
- Employee form includes **multi-team selector** (toggle chips) — employees can belong to multiple teams simultaneously

### Campaign / Project Tracking

- Track ongoing campaigns, projects, and initiatives with lifecycle status management
- **Statuses**: Active → Paused → Completed / Cancelled (quick-action buttons on cards for instant transitions)
- **Tag anyone**: associate employees, departments, and teams with a campaign via toggle chip selectors
- Card grid with gradient avatars, status badges, date ranges, budget, tagged entity pills (color-coded by type)
- Search across campaign names, descriptions, and tagged entity names
- Filter pills by status (All, Active, Paused, Completed, Cancelled) with counts
- Sort toggles: Recent / A–Z
- Centered glass modal for create/edit with date pickers, budget field, multi-select tags, notes
- ConfirmDialog for delete confirmation (SuperAdmin only)
- StatusToggle for quick active/inactive flag in card footer
- Activity logging for all campaign CRUD actions
- Role-scoped visibility: SuperAdmin sees all; Manager sees campaigns tagged with their department/teams/employees; Team Lead sees campaigns tagged with teams they lead; Employees see campaigns they're tagged in

### Task Management

- Priority-based task assignment with deadline tracking
- Centered glass modal for create/edit (no page navigation required)
- Search field in action bar
- Filter pills by status (All, Pending, In Progress, Completed, Cancelled)
- Sort toggles: Recent / Name
- ConfirmDialog for delete confirmation
- Role-scoped: SuperAdmin sees all, Manager sees team, others see own
- Status validation (pending → in-progress → completed/cancelled)
- Assignees can only update task status; admins can reassign
- Card details: assignee role + department, "Updated" date in footer when modified

### Auth Module

- **Login page**: animated hero section with floating particles + gradient orbs, email/password inputs with icons, shake-on-error animation, toast notifications, "Encrypted · Rate limited · Fast" security badges footer
- **Forgot password**: animated orbs background, success state with dev-mode reset URL display, toast feedback
- **Reset password**: PasswordInput with show/hide toggle, PasswordStrength 5-bar meter (Weak→Excellent), confirm password match indicator with color feedback
- **Shared components**: `PasswordInput` (reusable toggle field), `PasswordStrength` (animated strength meter)
- **Toast notifications**: global glass-styled toaster via `ToasterProvider` (react-hot-toast)

### Security

- Token-based password reset (SHA-256 hashed, 1hr expiry, emailed link)
- Rate limiting on reset endpoints (5 attempts per 15 min window, in-memory)
- IDOR protection on employee API (role + department scoping)
- Server-side route guards in middleware (admin routes blocked for non-admin roles)
- Password strength meter enforced on all password inputs
- bcryptjs password hashing
- Auto-verification: `isVerified` flag set to `true` on first successful login AND on password reset completion (invite flow safety net)

### Design System

- **iOS 26.4 Liquid Glass**: theme-aware glass surfaces (`--glass-bg`, `--glass-border`), frosted blur on header + dock only (16–20px), inset highlights (`--glass-border-inner`). `backdrop-filter` removed from cards, inputs, badges, and buttons for performance — replaced with slightly more opaque solid-glass backgrounds
- **Floating dock navigation**: `.dock-glass` with dark-mode-optimized borders and shadows, Framer Motion `layoutId` sliding active indicator (LayoutGroup scoped to dock only — lightweight on 7 items)
- **Performance-first route transitions**: `AnimatePresence mode="wait"` with opacity + scale(0.985→1) + translateY (all GPU-compositable, no filter:blur). Prevents dual-page rendering during route changes
- **SSE event bus**: `EventBus` MongoDB model (single document tracking per-channel timestamps), `notifyChange()` utility (called from `logActivity` + attendance routes), `/api/events` SSE endpoint (4s server poll, pushes only diffs), `useEventStream` React hook (auto-connects, pauses on tab hide, auto-reconnects). Replaces all dashboard and notification polling — data fetched only when server confirms a change
- **`useQuery` client cache**: module-level `Map<string, CacheEntry>` with shared SSE singleton. On mount: returns cached data instantly (no loading flash), revalidates in background if stale. On SSE `change` event: marks channel stale, triggers refetch. `loading` only true on first-ever fetch — perfect for skeleton display. Navigation between cached pages is instant. Sparse dropdown endpoint (`/api/employees/dropdown`) for lightweight employee lists in forms
- **Dashboard GPU reduction**: `AnimatedNumber` only runs rAF on initial mount, subsequent updates are instant. `backdrop-filter` removed from all 3 dashboard role headers. Infinite Framer Motion `boxShadow` loops on N employee avatars replaced with CSS `pulse-ring-*` classes. `animate-ping` replaced with CSS `.live-dot` class
- **Unified page layouts**: every CRUD page follows — header with sort toggles → card-static action bar (search + add button) → filter pill row → card grid
- **Card footer standard**: `border-t` footer with status/date left, hover-visible edit/delete buttons right
- **Route-level `loading.tsx`**: every CRUD route has a dedicated `loading.tsx` file with pixel-perfect shimmer skeletons matching actual card layouts (avatar circles, badge pills, action button positions, grid columns). Next.js shows these instantly on navigation before the page component mounts. Loaded content fades in via `contentReveal` variant (opacity + translateY transition) for a smooth skeleton-to-content crossfade — no hard swap
- **Framer Motion**: spring constants `stiffness: 400, damping: 17` for buttons; `whileHover: 1.02, whileTap: 0.98` for primary actions; `1.05/0.92` for filter pills; `staggerContainerFast` + `cardVariants` + `cardHover` standardized across all 5 CRUD card grids (employees, departments, teams, tasks, campaigns) — GPU-only `transform` + `opacity` with staggered delays (0.06s per card); card-shine hover sweep; month label crossfade; timeline stagger; avatar crossfade on image change; modal form field stagger; empty state scale-in
- **GPU-optimized animations**: badge dots breathe via CSS `transform: scale` (3s, no repaints); status ring pulse uses border + `transform: scale` on `::after` pseudo-element (no `box-shadow` animation); `pulse-glow` uses transform-only scale (no shadow recalc); aurora background drifts via `transform: translate` on oversized `::before` pseudo (30s, `will-change: transform`); notification badge pulses via CSS keyframes; card entrance stagger uses `content-fade-in` with 5-step delay classes (0.08s increments). No infinite `box-shadow` animations anywhere. No `filter: blur()` in any animation
- **Form labels**: standardized `text-xs font-medium text-[var(--fg-secondary)] mb-1`
- **Input icons**: all icon-prefixed inputs use `left-3.5` icon + `paddingLeft: 40px`

### Settings & Configuration

- **Profile card**: full name, phone, profile image (base64 upload), metadata pills (@username, role badge, department)
- **Security card**: email change (current password required, 24h cooldown, auto-updates username and activity logs), password change with PasswordStrength meter
- **Email testing**: toggle between invite/reset/alert types, centered send button, toast feedback
- **System Settings** (SuperAdmin only): company name, timezone, office geofence (lat/lng/radius), shift defaults (start time, work hours, work days)
- **Dark / Light / System** theme toggle (persisted to localStorage, no flash on load)

### Activity Log & Notifications (Role-Hierarchical)

- **DB-backed activity log** (`ActivityLog` model) — every CRUD action recorded with user, action, entity, details, and **targeting metadata**
- **Role-hierarchical visibility** — notifications respect the org hierarchy, not just department/team membership:
  - **`targetUserIds[]`**: specific users the action is about (task assignee, employee created, campaign-tagged employees) — these users always see the log regardless of role
  - **`targetDepartmentId`**: department this action relates to — **only visible to managers** of that department (not regular developers/BDs)
  - **`targetTeamIds[]`**: teams this action relates to — **only visible to team leads** who lead those teams (not regular team members) + department managers
  - **`visibility`**: `"all"` (everyone sees) | `"targeted"` (role-filtered matching) | `"self"` (only the actor)
  - **`userEmail` match**: actors always see their own actions
  - **SuperAdmin** sees everything; **Manager** sees department + team scope; **Team Lead** sees teams they lead; **Developer/BD** only sees logs where they're directly targeted or performed the action
- **Cross-device read sync** — `lastSeenLogId` cursor on `User` model, synced via `GET/PUT /api/user/last-seen`
- **SSE push** — bell auto-fetches latest 20 logs only when the `activity` channel fires (no polling)
- **Mark as read on open** — opening the bell panel marks all current entries as seen
- **Unseen badge** — red pulsing badge with count (capped at 9+)
- **Entity SVG icons** — each entity type has a distinct icon and color
- **Clickable links** — each log entry navigates to the relevant page
- **Seen/unseen dimming** — read entries fade to 50% opacity
- **"Mark all read" button** — persists to server for cross-device consistency

### PWA & Offline

- `manifest.json` with app icons (192px, 512px, maskable SVG)
- Service worker (`sw.js`) with cache-first + stale-while-revalidate strategy
- "Install App" prompt (hidden when already in standalone mode)
- `sendBeacon` for best-effort check-out on tab/browser close

### Dashboard (Real-Time)

The dashboard is **fully real-time** — no manual refresh needed. Data updates are silent (no loading spinners or skeleton flashes during updates).

- **Per-section loading**: No global skeleton gate — header and static sections render immediately while data-dependent sections (presence grid, attendance stats) show inline shimmers only for their own loading state. Presence data (`fetchLive`) loads in parallel with core data (`fetchFull`) on initial mount
- **Live attendance detail**: `/api/attendance?type=detail` now includes elapsed minutes from the currently active session (not just closed sessions), so "hours logged" and status badges reflect real-time presence
- **SSE event stream**: Single persistent connection to `/api/events` replaces all polling. Server monitors an `EventBus` document (one lightweight DB read every 4s) and pushes change events only when data actually mutates. Client fetches only the affected data channel — zero wasted requests
- **Push channels**: `presence` (check-in/out/location transition), `employees`, `tasks`, `departments`, `teams`, `campaigns`, `activity` (notification log), `settings` — each channel triggers only its specific data fetch
- **Tab-aware**: SSE connection closes when tab is hidden, reconnects when visible — zero background CPU/network drain
- **Auto-reconnect**: SSE auto-closes after 55s (Vercel serverless limit); `EventSource` natively reconnects within 1s
- **Live indicator**: Pulsing green "LIVE" badge on all dashboard headers to show real-time status

**SuperAdmin:**
- Greeting header with live clock card (local time + date) + LIVE badge
- KPI cards: total employees, in office, late today, absent today
- Live Presence board: employee cards with animated status rings, department line, today's minutes
- Attendance Overview donut chart + Department Summary progress bars
- Checklist with assignee names, deadlines, and priority icons

**Manager / Team Lead:**
- Compact header: greeting + LIVE badge + personal stats glass pills (today hours, on-time/late, sessions, avg/day)
- KPI cards: Department/My Team count, Present Today, On-Time Rate (3 columns)
- **Team Breakdown**: clickable team cards showing team name, lead avatar/name, present/absent/late counts, attendance progress bar, member status dots. Manager sees all department teams + "Unassigned" group; Team Lead sees only their teams. Clicking a team filters the Live Presence grid below.
- Live Presence board with filter toggles (All / Office / Remote / Late / Absent) + optional team filter + fixed-height scrollable grid. Shows active team filter badge when a team is selected.
- **Late Arrivals** list: employees who arrived late today, sorted by severity, with `lateBy` duration
- **Team Attendance Trend** bar chart: last 5 working days present count (new `/api/attendance/trend` endpoint)
- **Task Status** breakdown: total / pending / in-progress / completed counts with animated stacked progress bar
- **Office vs Remote** donut chart: live split of in-office vs remote employees with percentage and absent count
- **Top Workers Today**: leaderboard of employees by hours logged, with animated progress bars and medal icons
- **Active Campaigns**: running campaigns tagged to the manager's scope, with department/team tag pills
- Attendance Overview donut + Checklist side-by-side (2-column grid)

**Developer / Business Developer:**
- Greeting + LIVE badge + role label + pending task count
- **Profile Card**: avatar with animated status ring pulse (green=on-time, amber=late, red=absent), full name, designation, department, quick stats grid (first entry, hours logged, office/remote split with percentage), shift progress bar (current minutes vs shift target with percentage)
- **Today's Activity Timeline**: vertical timeline with colored dots — check-in time, session count breakdown (office/remote), active-now indicator with cumulative minutes
- **Task stat cards**: Total, Pending, In Progress, Completed (4-column grid with gradient icons and animated counters)
- **Weekly Overview**: horizontal scrollable day cards (last 7 days) — day name, date, total hours, color-coded status dot (present/late/absent), today highlighted with ring
- **Monthly Summary**: 4-stat grid (present/total days, on-time%, avg daily hours, total hours) + animated office-vs-remote split bar with percentage labels
- **Self-assessment section** (same as manager: Today donut + monthly stats)
- **Checklist**: pending tasks with priority icons, assignee, deadline, link to tasks page

**Navigation**: "Overview" (all roles), "Campaigns", "Tasks", "Attendance" visible to all. "Employees", "Departments", "Teams" visible to SuperAdmin only.

### Attendance Page (All Roles)

- Interactive calendar with clickable, selectable dates and color-coded day indicators
- Day detail panel (equal height with calendar): status pills, human-readable summary, stat chips (total/office/remote hours), animated work split bar
- Session timeline per day: time range, duration, location pills (Office/Remote), device detection (Mac/Windows/Mobile), "First In"/"Last Out" badges, last heartbeat timestamp, IP address, office segment sub-timeline
- Monthly insights row: avg daily hours, avg arrival/departure, on-time %, attendance %, office/remote split
- Team member selector (SuperAdmin/Manager) to view any employee's calendar
- Monthly records list with clickable rows that sync to calendar selection

### Exports

- CSV export of attendance/presence report from dashboard

---

## Getting Started

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with your admin account. Create employees, departments, and tasks from the dashboard — all accounts are managed through the app itself (no seeding required).

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
  login/                 # Auth login page (hero, particles, orbs)
  forgot-password/       # Token-based password reset request
  reset-password/        # Reset password with strength meter
  (dashboard)/           # Route group — all authenticated pages (no /dashboard/ in URL)
    page.tsx             # Dashboard entry (reads session, renders DashboardHome)
    DashboardHome.tsx    # Real-time dashboard (SSE event-driven) with KPI, presence, trend, campaigns, tasks
    DashboardShell.tsx   # Header, dock nav, theme, notifications, PWA install prompt
    SessionTracker.tsx   # Heartbeat attendance: active/readonly/booting modes
    employees/
      page.tsx           # Employee list with filters, bulk actions, rich cards (useQuery cached)
      loading.tsx        # Route-level shimmer skeleton (pixel-perfect card grid)
      EmployeeForm.tsx   # Shared full-page create/edit form
      new/page.tsx       # Create employee route
      [id]/edit/page.tsx # Edit employee route
    departments/
      page.tsx           # Department management (useQuery cached, server-side team/employee counts)
      loading.tsx        # Route-level shimmer skeleton
    teams/
      page.tsx           # Team management (useQuery cached, dept filter, create/edit modal)
      loading.tsx        # Route-level shimmer skeleton
    campaigns/
      page.tsx           # Campaign/project tracking (useQuery cached, status lifecycle, entity tagging)
      loading.tsx        # Route-level shimmer skeleton
    tasks/
      page.tsx           # Task board (useQuery cached, centered glass modal)
      loading.tsx        # Route-level shimmer skeleton
    components/
      ConfirmDialog.tsx  # Reusable glass confirm/danger dialog
      DataTable.tsx      # Sortable, searchable, paginated table
      ProcessingOverlay.tsx # Animated dot shimmer overlay
    attendance/page.tsx  # Interactive calendar + detail panel + session timeline
    settings/
      page.tsx           # Profile (with metadata pills), security, system (deduplicated settings fetch), email testing
      loading.tsx        # Route-level shimmer skeleton
  api/
    auth/[...nextauth]/  # NextAuth route handler
    auth/forgot-password/# Token generation + email
    auth/reset-password/ # Token validation + password update
    employees/           # CRUD with role scoping + activity logging
    employees/dropdown/  # Sparse employee list (id, name, role, dept, teams) for form dropdowns
    departments/         # CRUD with manager population + server-side team/employee counts + activity logging
    teams/               # CRUD with dept scoping + member count aggregation
    campaigns/           # CRUD with entity tagging (employees, departments, teams) + status lifecycle
    tasks/               # CRUD with team scoping + activity logging
    attendance/
      session/           # Check-in, check-out, heartbeat PATCH, session GET
      presence/          # Real-time employee status for dashboard (includes lateBy)
      trend/             # Last 5 working days present count for team attendance chart
    activity-logs/       # GET latest 20 activity log entries
    events/              # SSE endpoint — streams change events per channel (replaces all polling)
    user/last-seen/      # GET + PUT lastSeenLogId for notification read sync
    profile/             # Self profile + base64 image upload
    profile/password/    # Password change with current password validation
    settings/            # SystemSettings CRUD (SuperAdmin only) + activity logging
    test-email/          # SMTP testing endpoint
components/
  PasswordInput.tsx      # Reusable show/hide password field
  PasswordStrength.tsx   # Animated 5-bar strength meter
  ToasterProvider.tsx    # Global glass-styled toast notifications
lib/
  activityLogger.ts     # Fire-and-forget logActivity() utility + notifyChange() integration
  eventBus.ts           # notifyChange() — bumps EventBus channel timestamps
  useEventStream.ts     # React hook: SSE connection to /api/events, dispatches per-channel handlers
  useQuery.ts           # Lightweight client cache: stale-while-revalidate with shared SSE singleton for EventBus invalidation
  auth.ts               # NextAuth config (credentials, JWT, callbacks)
  auth.config.ts        # Middleware auth config with route guards
  permissions.ts        # DB-verified session, role hierarchy, team/dept scoping helpers
  db.ts                 # MongoDB connection singleton
  geo.ts                # Haversine + office geofence (reads SystemSettings)
  helpers.ts            # Response helpers (ok, badRequest, forbidden, etc.)
  mail.ts               # Nodemailer + HTML email templates
  rateLimit.ts          # In-memory rate limiter
  motion.ts             # Framer Motion animation presets
  models/
    ActivityLog.ts      # Append-only activity log (user, action, entity, details, targeting: targetUserIds, targetDepartmentId, targetTeamIds, visibility)
    EventBus.ts         # Singleton document tracking per-channel last-modified timestamps (presence, employees, tasks, etc.)
    User.ts             # User (5 roles incl. teamLead, shifts, teams[], reportsTo supervisor ref, BD fields, reset tokens, lastSeenLogId)
    Department.ts       # Department with manager ref + optional parentDepartment ref (hierarchical)
    Team.ts             # Team (name, slug, department, lead, description)
    Campaign.ts         # Campaign (name, status lifecycle, tagged employees/departments/teams, dates, budget)
    ActivitySession.ts  # Session with office segments + heartbeat lastActivity
    ActivityTask.ts     # Task with priority, deadline, status
    DailyAttendance.ts  # Daily rollup (sessions, minutes, on-time)
    MonthlyAttendanceStats.ts # Monthly aggregated stats
    SystemSettings.ts   # Global config (office, shifts, company)
middleware.ts           # Auth + role-based route protection
types/
  global.d.ts           # BeforeInstallPromptEvent, PWA types
public/
  manifest.json         # PWA manifest
  sw.js                 # Service worker
  icons/                # PWA icons (192, 512, maskable)
  favicon.svg           # SVG favicon
ATTENDANCE_PLAN.md      # Detailed attendance system design document
```

## Attendance System Architecture

For the full technical design document including API contracts, data flow diagrams, edge case analysis, race condition handling, and stale threshold rationale, see [`ATTENDANCE_PLAN.md`](./ATTENDANCE_PLAN.md).

## License

Private — Single Solution
