# Single Solution Sync

Automatic employee presence and attendance tracking system. Detects when employees arrive at the office, when they leave, and how much time they spend — all without manual check-in/check-out.

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Styling**: Tailwind CSS 4, iOS 26 Liquid Glass design system
- **Animations**: Framer Motion
- **Database**: MongoDB Atlas (Mongoose ODM)
- **Auth**: NextAuth.js v5 (Credentials provider, JWT strategy)
- **Email**: Nodemailer (SMTP — welcome, password reset, attendance alerts)
- **Real-time**: Server-Sent Events (SSE), Browser Notifications API
- **Geolocation**: Haversine formula, configurable office geofence
- **PWA**: Progressive Web App (installable, offline-first service worker)
- **Deployment**: Vercel

## Roles

| Role | Access |
|------|--------|
| **SuperAdmin** | Full CRUD on employees, departments, tasks, system settings; attendance reports, email testing |
| **Manager** | Department-scoped team view, task management, attendance presence for their team |
| **Business Developer** | Job pipeline tracking (17 BD fields), personal attendance |
| **Developer** | Personal attendance, task status updates, profile management |

## Features

### Attendance & Presence
- Automatic check-in on app open / check-out on close (no manual buttons)
- Geolocation-based office detection (configurable radius via SystemSettings)
- Continuous GPS tracking with office/remote transition detection
- Persistent session timer bar (compact pill, color-coded status)
- Real-time presence board with live status (office, remote, late, overtime, absent)
- Daily & monthly attendance rollup with `isOnTime` / `lateBy` tracking
- Idle detection (5 min visual dim, 30 min auto-logout)

### Employee Management
- Full CRUD with role-based access (SuperAdmin manages all, Manager manages team)
- Profile image upload (base64, max 2MB)
- Shift configuration (type, hours, working days, break time, grace period)
- Business Developer fields (jobID, platform, proposalStatus, clientCountry, etc.)
- Welcome email sent on account creation with temporary password

### Task Management
- Priority-based task assignment with deadline tracking
- Role-scoped: SuperAdmin sees all, Manager sees team, others see own
- Status validation (pending, in-progress, completed, cancelled)
- Assignees can only update task status; admins can reassign

### Security
- Token-based password reset (SHA-256 hashed, 1hr expiry, emailed link)
- Rate limiting on reset endpoints (5 attempts per 15 min window)
- IDOR protection on employee API (role + department scoping)
- Server-side route guards in middleware (admin routes blocked for non-admin)
- Password strength meter on all password inputs

### Settings & Configuration
- System Settings (office location, shift defaults, company info) — SuperAdmin only
- Email testing UI (send test invite/reset/alert emails)
- Dark / Light / System theme toggle (no flash on load)

### Notifications
- Dynamic attendance alerts (absent, late, overtime employees)
- Browser push notifications with permission prompt
- In-app notification dropdown

### PWA & Offline
- `manifest.json` with app icons (192px, 512px, maskable)
- Service worker with cache-first + stale-while-revalidate strategy
- "Install App" button in sidebar (hidden when already standalone)
- `sendBeacon` for reliable check-out on tab close

### Exports
- CSV export of attendance/presence report from dashboard

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
  login/                 # Auth login page
  forgot-password/       # Token-based password reset request
  reset-password/        # Reset password with token + email
  dashboard/
    page.tsx             # Dashboard layout (reads session, renders DashboardHome)
    DashboardHome.tsx    # SuperAdmin/Manager overview with presence cards
    DashboardShell.tsx   # Header, sidebar, dock, theme, notifications, PWA
    SessionTracker.tsx   # Auto check-in/out, GPS, idle, live timer bar
    employees/page.tsx   # Employee CRUD with real presence status
    departments/page.tsx # Department management with manager assignment
    tasks/page.tsx       # Task board with priority & status
    attendance/page.tsx  # Personal attendance view
    settings/page.tsx    # Profile, security, system settings, email testing
    components/
      DataTable.tsx      # Sortable, searchable, paginated table
      SidebarModal.tsx   # Slide-in form modal
      ProcessingOverlay.tsx  # Loading overlay
  api/
    auth/[...nextauth]/  # NextAuth route handler
    auth/forgot-password/# Token generation + email
    auth/reset-password/ # Token validation + password update
    employees/           # CRUD with role scoping
    departments/         # CRUD with manager population
    tasks/               # CRUD with team scoping
    attendance/session/  # Check-in, check-out, GPS updates
    attendance/presence/ # Real-time employee status
    profile/             # Self profile + image upload
    profile/password/    # Password change
    settings/            # SystemSettings CRUD
    test-email/          # SMTP testing endpoint
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
    User.ts             # User model (roles, shifts, BD fields, reset tokens)
    Department.ts       # Department model with manager ref
    ActivitySession.ts  # Check-in/out session with office segments
    ActivityTask.ts     # Task model with priority & deadline
    DailyAttendance.ts  # Daily rollup (sessions, minutes, on-time)
    MonthlyStats.ts     # Monthly aggregated stats
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
```

## License

Private — Single Solution
