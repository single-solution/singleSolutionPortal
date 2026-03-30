# Single Solution Sync

Automatic employee presence and attendance tracking system. Detects when employees arrive at the office, when they leave, and how much time they spend — all without manual check-in/check-out.

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Styling**: Tailwind CSS 4, iOS 26.4 Liquid Glass design system (theme-aware glass dock, frosted header, aurora mesh)
- **Animations**: Framer Motion (spring-based micro-interactions, stagger entrances, layout animations)
- **Database**: MongoDB Atlas (Mongoose ODM)
- **Auth**: NextAuth.js v5 (Credentials provider, JWT strategy)
- **Email**: Nodemailer (SMTP — welcome, password reset, attendance alerts)
- **Real-time**: Heartbeat polling (30s), Browser Notifications API
- **Geolocation**: Haversine formula, configurable office geofence (50m default)
- **PWA**: Progressive Web App (installable, offline-first service worker)
- **Deployment**: Vercel (serverless, no persistent backend required)

## Roles

| Role | Access |
|------|--------|
| **SuperAdmin** | Full CRUD on employees, departments, tasks, system settings; attendance reports, email testing |
| **Manager** | Department-scoped team view, task management, attendance presence for their team |
| **Business Developer** | Job pipeline tracking (17 BD fields), personal attendance |
| **Developer** | Personal attendance, task status updates, profile management |

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
- Idle: dims to 65% opacity after 5 min of no mouse/keyboard activity

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
| Auto-logout (30 min idle) | Checkout API called before session redirect |
| Browser crash | No sendBeacon. Session stale → cleaned up on next check-in |

### Employee Management

- Full CRUD with role-based access (SuperAdmin manages all, Manager manages their team)
- Full-page create/edit forms (`/employees/new`, `/employees/[id]/edit`) with sectioned cards
- ConfirmDialog for all destructive actions (deactivate single + bulk)
- Profile image upload (base64, max 2MB)
- Shift configuration per employee (shift type, start/end hours, working days, break time, grace period)
- Business Developer fields (17 additional fields: jobID, platform, proposalStatus, clientCountry, etc.)
- Welcome email sent on account creation with temporary password
- StatusToggle for quick active/inactive toggle from card footer

### Department Management

- Search + "Add Department" button in action bar (matches employees/tasks layout)
- Collapsible inline add row with name input + Create/Cancel buttons
- Inline edit within card (expand fields on edit click)
- ConfirmDialog for delete confirmation
- Card grid with gradient avatars, employee count progress bars, manager display
- Sort toggles: Most Employees / Name
- Hover-visible edit/delete action buttons in card footer

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

### Design System

- **iOS 26.4 Liquid Glass**: theme-aware glass surfaces (`--glass-bg`, `--glass-border`), frosted blur (`saturate(200%) blur(40px)`), inset highlights (`--glass-border-inner`)
- **Floating dock navigation**: `.dock-glass` class with dark-mode-optimized borders and shadows, no visible border artifacts in either theme
- **Unified page layouts**: every CRUD page follows — header with sort toggles → card-static action bar (search + add button) → filter pill row → card grid
- **Card footer standard**: `border-t` footer with status/date left, hover-visible edit/delete buttons right
- **Shimmer skeleton loading**: on all pages (no spinners anywhere, including ProcessingOverlay)
- **Framer Motion**: spring constants `stiffness: 400, damping: 17` for buttons; `whileHover: 1.02, whileTap: 0.98` for primary actions; `1.05/0.92` for filter pills; stagger entrances for card grids and table rows
- **Form labels**: standardized `text-xs font-medium text-[var(--fg-secondary)] mb-1`
- **Input icons**: all icon-prefixed inputs use `left-3.5` icon + `paddingLeft: 40px`

### Settings & Configuration

- **Profile card**: full name, phone, profile image (base64 upload)
- **Security card**: email change (current password required), password change with PasswordStrength meter
- **Email testing**: toggle between invite/reset/alert types, centered send button, toast feedback
- **System Settings** (SuperAdmin only): company name, timezone, office geofence (lat/lng/radius), shift defaults (start time, work hours, work days)
- **Dark / Light / System** theme toggle (persisted to localStorage, no flash on load)

### Notifications

- Dynamic attendance alerts (absent, late, overtime employees) — generated from daily attendance data
- Browser push notifications with permission prompt (Notification API)
- In-app notification dropdown in header

### PWA & Offline

- `manifest.json` with app icons (192px, 512px, maskable SVG)
- Service worker (`sw.js`) with cache-first + stale-while-revalidate strategy
- "Install App" prompt (hidden when already in standalone mode)
- `sendBeacon` for best-effort check-out on tab/browser close

### Dashboard (SuperAdmin/Manager)

- Greeting header with current date/time
- KPI cards: total employees, present today, on-time percentage, average daily hours
- Employee presence board with live status indicators (In Office, Remote, Late, Overtime, Absent)
- Quick-action checklist
- Attendance overview with daily/monthly stats

### Attendance Page (All Roles)

- Personal attendance calendar with color-coded day indicators
- Recent attendance records list
- Session count per day
- Monthly summary stats

### Exports

- CSV export of attendance/presence report from dashboard

---

## Getting Started

```bash
# Install dependencies
npm install

# Seed the SuperAdmin account
npx tsx scripts/seed.ts

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with:
- **Email**: `admin@singlesolution.com`
- **Password**: `Admin@1234`

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
  dashboard/
    page.tsx             # Dashboard entry (reads session, renders DashboardHome)
    DashboardHome.tsx    # SuperAdmin/Manager overview with KPI + presence
    DashboardShell.tsx   # Header, dock nav, theme, notifications, PWA, auto-logout
    SessionTracker.tsx   # Heartbeat attendance: active/readonly/booting modes
    employees/
      page.tsx           # Employee list with filters, bulk actions, presence
      EmployeeForm.tsx   # Shared full-page create/edit form
      new/page.tsx       # Create employee route
      [id]/edit/page.tsx # Edit employee route
    departments/page.tsx # Department management (search, inline add/edit)
    tasks/page.tsx       # Task board (search, centered glass modal)
    components/
      ConfirmDialog.tsx  # Reusable glass confirm/danger dialog
      DataTable.tsx      # Sortable, searchable, paginated table
      ProcessingOverlay.tsx # Animated dot shimmer overlay
    attendance/page.tsx  # Personal attendance calendar + records
    settings/page.tsx    # Profile, security, system settings, email testing
  api/
    auth/[...nextauth]/  # NextAuth route handler
    auth/forgot-password/# Token generation + email
    auth/reset-password/ # Token validation + password update
    employees/           # CRUD with role scoping
    departments/         # CRUD with manager population
    tasks/               # CRUD with team scoping
    attendance/
      session/           # Check-in, check-out, heartbeat PATCH, session GET
      presence/          # Real-time employee status for dashboard
    profile/             # Self profile + base64 image upload
    profile/password/    # Password change with current password validation
    settings/            # SystemSettings CRUD (SuperAdmin only)
    test-email/          # SMTP testing endpoint
components/
  PasswordInput.tsx      # Reusable show/hide password field
  PasswordStrength.tsx   # Animated 5-bar strength meter
  ToasterProvider.tsx    # Global glass-styled toast notifications
lib/
  auth.ts               # NextAuth config (credentials, JWT, callbacks)
  auth.config.ts        # Middleware auth config with route guards
  db.ts                 # MongoDB connection singleton
  geo.ts                # Haversine + office geofence (reads SystemSettings)
  helpers.ts            # Response helpers (ok, badRequest, forbidden, etc.)
  mail.ts               # Nodemailer + HTML email templates
  rateLimit.ts          # In-memory rate limiter
  motion.ts             # Framer Motion animation presets
  models/
    User.ts             # User (roles, shifts, BD fields, reset tokens)
    Department.ts       # Department with manager ref
    ActivitySession.ts  # Session with office segments + heartbeat lastActivity
    ActivityTask.ts     # Task with priority, deadline, status
    DailyAttendance.ts  # Daily rollup (sessions, minutes, on-time)
    MonthlyAttendanceStats.ts # Monthly aggregated stats
    SystemSettings.ts   # Global config (office, shifts, company)
middleware.ts           # Auth + role-based route protection
scripts/
  seed.ts               # SuperAdmin seeder
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
