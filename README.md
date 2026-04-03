# Single Solution Sync

Automatic employee presence and attendance tracking system. Detects when employees arrive at the office, when they leave, and how much time they spend — all without manual check-in/check-out.

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Styling**: Tailwind CSS 4, Poppins font, clean professional SaaS design (solid white/dark surfaces, shadow-based depth, red brand accent, frosted dock matching header)
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
| **Manager** | **Multi-department scoped**: can manage employees, departments, teams, and tasks across all departments they're assigned as manager. Nav includes Employees, Departments, Teams pages (scoped to managed departments). Can create teams in any managed department. Attendance presence for all managed departments |
| **Team Lead** | Team-scoped view of employees, tasks, and attendance for teams they lead. Nav includes Employees, Departments, Teams pages (scoped to their teams and team departments). Can create/manage tasks for team members. Sits under a manager |
| **Business Developer** | Job pipeline tracking (17 BD fields), personal attendance |
| **Developer** | Personal attendance, task status updates, profile management |

Employees can belong to **multiple teams simultaneously** — enabling cross-team/cross-project membership. A manager can be assigned as the manager of **multiple departments** — they see and manage employees, teams, and attendance across all of them. Team Leads manage the teams they're assigned to lead.

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
- Color-coded gradient: green = in-office, blue = remote, red = location flagged, gray = offline
- Shows: live ticking elapsed time | cumulative today total (completed sessions + active)
- Readonly mode: "another device" label or "📱 synced" for mobile
- Stale session: shows "inactive" instead of a running timer
- **Sleep/suspend recovery**: When the laptop lid is closed (device sleeps), heartbeats stop. On wake, the first heartbeat detects the stale gap (> 3 min since last activity), the server auto-closes the old session at the last heartbeat timestamp, and the client creates a fresh session. The timer resets to count from the new check-in — no inflated hours from sleep time. The client also tracks wall-clock time between heartbeats to detect sleep gaps even when `visibilitychange` doesn't fire (common in installed PWAs)
- Idle/Away: visibility-aware detection — tab hidden (user in another app) keeps timer running; tab visible + 1hr no interaction triggers 3 nudge toasts (5min apart starting at 1h 5m), then pauses timer with full-screen "Stepped Away" overlay

**Fake location detection (laptop-optimized anti-spoofing):**
- Designed for **laptop geolocation** (Wi-Fi triangulation / IP geolocation), not phone GPS. Mobile tracking is disabled
- **Layer 1 — Accuracy zero**: Fake GPS extensions report accuracy as exactly `0`. Real Wi-Fi triangulation on laptops reports 20–200 m. Only flags when accuracy is exactly zero
- **Layer 2 — Teleportation**: Compares haversine distance between consecutive heartbeats against elapsed time. Flags if implied speed exceeds 200 km/h (~55 m/s). Only fires within an active session — sleep/wake creates a new session so office→home jumps don't trigger it
- **Layer 3 — Zero variance**: **Disabled**. Wi-Fi positioning returns the exact same coordinates as long as the same networks are visible. An employee at their desk gets byte-identical coords all day. This layer was designed for phone GPS micro-drift and is incompatible with laptop geolocation
- **Layer 4 — Round coordinates**: Flags coordinates with fewer than 2 significant decimal digits (catches crude manual entries like `31.5, 74.3`). Lenient threshold accounts for Wi-Fi triangulation precision
- When flagged: timer pauses, heartbeat stops, red warning pill + full-screen overlay with reason text. Employee can click "Re-check Location" to trigger an immediate fresh geo reading — if clean, timer resumes automatically. A **browser notification** (system-level toast) is also sent so the employee sees the alert even when the app is in the background or minimized
- Session restart notifications: when the server auto-closes a stale session (e.g. after laptop sleep), the employee receives a browser notification informing them their session was restarted
- Flag state persisted on `ActivitySession.location` (flagReason, flaggedAt, consecutiveIdentical) and returned in both GET and PATCH responses — visible to managers/admins on the dashboard presence cards
- Does not ban or lock out — pauses and warns, letting employees self-correct. SuperAdmin exempt

**Day boundary (6 AM, not midnight) + timezone-aware attendance:**
- The attendance day starts at **6 AM**, not midnight. Work done between midnight and 6 AM counts toward the **previous day**
- Prevents employees who stay late past midnight from appearing as "early arrivals" the next day. Their post-midnight work is logged to the correct day, and the next morning's actual arrival time becomes the real "first entry"
- **Timezone-aware**: all attendance date math uses the company timezone from `SystemSettings.company.timezone` (default `Asia/Karachi`, UTC+5). `lib/tz.ts` provides `dateParts()`, `dateInTz()`, and `resolveTimezone()` — converting between IANA timezone strings and timezone-correct Date objects using `Intl.DateTimeFormat`. This ensures shift times like "10:00" are always interpreted as 10:00 AM in Pakistan time regardless of where the server is hosted (e.g. UTC cloud instances). The client also uses `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" })` to send the correct PKT date when fetching attendance data
- Shared `lib/dayBoundary.ts` exports `startOfDay(d, tz?)` and `isSameDay(a, b, tz?)` — used consistently across all attendance APIs (session, presence, presence/manager, trend, detail). When `tz` is provided, hour extraction uses the target timezone
- Example: employee works office until 1 AM on April 2nd → that session belongs to April 1st (logical day). Employee arrives next day at 11 AM → first entry for April 2nd is 11 AM (correctly marked late if shift starts at 10 AM)

**Daily & monthly rollup:**
- `DailyAttendance`: totalWorkingMinutes, officeMinutes, remoteMinutes, isPresent, isOnTime, lateBy, firstOfficeEntry, lastOfficeExit
- `MonthlyAttendanceStats`: presentDays, absentDays, onTimeArrivals, lateArrivals, averageDailyHours, totalWorkingHours, attendancePercentage
- Lateness calculated from employee's configured shift start + configurable grace period (read from SystemSettings, default 30 min)

**Real-world scenarios:**

| Scenario | What happens |
|----------|-------------|
| Normal workday (open 9am, close 6pm) | Check-in → 9h heartbeat → sendBeacon checkout → 540 min |
| Lunch break (close lid, sendBeacon fails) | Session #1 frozen at 12:00. Reopen at 1pm → heartbeat detects stale → server auto-closes #1 at 12:00 (3h) → new #2 starts → close at 6pm (5h) → total 8h |
| Leave office, open at home | Session #1 frozen at 6pm. Open at home → heartbeat stale → server auto-closes #1 at 6pm → new #2 starts from home (remote), timer resets |
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
- Centered modal for create/edit (department selector, lead selector from employees, description)
- Delete confirmation via ConfirmDialog (removes team references from members on delete)
- Sort toggles: Most Members / Name
- Card footer: StatusToggle + creation date + hover-visible edit/delete buttons
- Role-scoped: SuperAdmin sees all teams; Manager sees teams in all their managed departments; Team Lead sees teams they lead
- Employee form includes **multi-team selector** (toggle chips) — employees can belong to multiple teams simultaneously

### Campaign / Project Tracking

- Track ongoing campaigns, projects, and initiatives with lifecycle status management
- **Statuses**: Active → Paused → Completed / Cancelled (quick-action buttons on cards for instant transitions)
- **Tag anyone**: associate employees, departments, and teams with a campaign via toggle chip selectors
- Card grid with gradient avatars, status badges, date ranges, budget, tagged entity pills (color-coded by type)
- Search across campaign names, descriptions, and tagged entity names
- Filter pills by status (All, Active, Paused, Completed, Cancelled) with counts
- Sort toggles: Recent / A–Z
- Centered modal for create/edit with date pickers, budget field, multi-select tags, notes
- ConfirmDialog for delete confirmation (SuperAdmin only)
- StatusToggle for quick active/inactive flag in card footer
- Activity logging for all campaign CRUD actions
- Role-scoped visibility: SuperAdmin sees all; Manager sees campaigns tagged with their department/teams/employees; Team Lead sees campaigns tagged with teams they lead; Employees see campaigns they're tagged in

### Task Management

- Priority-based task assignment with deadline tracking
- Centered modal for create/edit (no page navigation required)
- Search field in action bar
- Filter pills by priority (All, Low, Medium, High, Urgent)
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

- **Glass design system**: theme-aware glass surfaces (`--glass-bg`, `--glass-border`), frosted blur on header + dock only (16–20px), inset highlights (`--glass-border-inner`). `backdrop-filter` removed from cards, inputs, badges, and buttons for performance — replaced with slightly more opaque solid-glass backgrounds
- **Floating dock navigation**: `.dock-glass` with dark-mode-optimized borders and shadows, Framer Motion `layoutId` sliding active indicator (LayoutGroup scoped to dock only — lightweight on 7 items)
- **Performance-first route transitions**: `AnimatePresence mode="wait"` with opacity + scale(0.985→1) + translateY (all GPU-compositable, no filter:blur). Prevents dual-page rendering during route changes
- **SSE event bus**: `EventBus` MongoDB model (single document tracking per-channel timestamps), `notifyChange()` utility (called from `logActivity` + attendance routes), `/api/events` SSE endpoint (4s server poll, pushes only diffs), `useEventStream` React hook (auto-connects, pauses on tab hide, auto-reconnects). Replaces all dashboard and notification polling — data fetched only when server confirms a change
- **`useQuery` client cache**: module-level `Map<string, CacheEntry>` with shared SSE singleton. On mount: returns cached data instantly (no loading flash), revalidates in background if stale. On SSE `change` event: marks channel stale, triggers refetch. `loading` only true on first-ever fetch — perfect for skeleton display. Navigation between cached pages is instant. Sparse dropdown endpoint (`/api/employees/dropdown`) for lightweight employee lists in forms
- **Dashboard GPU reduction**: All dashboard views use table-based presence lists and compact KPI strips (no gradient stat cards, no donut charts). `AnimatedNumber` only runs rAF on initial mount. `backdrop-filter` removed from dashboard headers. CSS `pulse-ring-*` and `.live-dot` classes replace JS animations
- **Unified page layouts**: every CRUD page follows — header with sort toggles → card-static action bar (search + add button) → filter pill row → card grid
- **Card footer standard**: `border-t` footer with status/date left, hover-visible edit/delete buttons right
- **Route-level `loading.tsx`**: every CRUD route has a dedicated `loading.tsx` file. Static content (page titles, subtitles, sort tabs, filter labels, search bars, action buttons) renders as real text immediately — only database-fetched data (card grids, counts, dynamic values) uses shimmer placeholders. Next.js shows these instantly on navigation before the page component mounts. Loaded content fades in via `contentReveal` variant (opacity + translateY transition) for a smooth skeleton-to-content crossfade — no hard swap
- **Inline skeleton loading**: Beyond route-level skeletons, every data-dependent card, section, and list within pages uses inline shimmer skeletons while its specific data loads. `useQuery` exposes `loading` state and all CRUD list pages (employees, tasks, departments, teams, campaigns) show a skeleton card grid when `loading && !data`. Dashboard sections (campaigns, tasks, teams, weekly, monthly, timeline, self-overview) always render their card shell immediately with skeleton content. Notification bell and ping inbox show skeleton entries before their respective API calls complete. This prevents "No data found" messages from flashing during initial load
- **Framer Motion**: spring constants `stiffness: 400, damping: 25` for buttons; `whileHover: 1.02, whileTap: 0.98` for primary actions; `1.05/0.92` for filter pills; `staggerContainerFast` + `cardVariants` + `cardHover` standardized across all 5 CRUD card grids (employees, departments, teams, tasks, campaigns) — GPU-only `transform` + `opacity` with staggered delays (0.06s per card); card-shine hover sweep; month label crossfade; timeline stagger; avatar crossfade on image change; modal form field stagger; empty state scale-in
- **GPU-optimized animations**: badge dots breathe via CSS `transform: scale` (3s, no repaints); status ring pulse uses border + `transform: scale` on `::after` pseudo-element (no `box-shadow` animation); `pulse-glow` uses transform-only scale (no shadow recalc); aurora background drifts via `transform: translate` on oversized `::before` pseudo (30s, `will-change: transform`); notification badge pulses via CSS keyframes; card entrance stagger uses Framer Motion `cardVariants` with 0.06s per-card delay. No infinite `box-shadow` animations anywhere. No `filter: blur()` in any animation
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
- **Self-referencing "You"** — if the logged-in user performed the action, the notification shows "You" instead of their name/email (e.g. "You created a task" instead of "admin created a task"). The subtitle also shows "you" instead of the username
- **Seen/unseen dimming** — read entries fade to 50% opacity
- **"Mark all read" button** — persists to server for cross-device consistency

### PWA & Offline

- `manifest.json` with SVG app icon
- Service worker (`sw.js`) with cache-first + stale-while-revalidate strategy
- "Install App" prompt (hidden when already in standalone mode)
- `sendBeacon` for best-effort check-out on tab/browser close

### Hierarchy Ping System

Real-time peer-to-peer pinging within your reporting chain. Everyone can ping people in their hierarchy pool:

- **SuperAdmin** can ping anyone in the organization
- **Manager** can ping anyone in their department
- **Team Lead** can ping their team members and their direct manager
- **Employee** can ping their manager/lead and same-team members

**Architecture:**
- `Ping` model: `from`, `to`, `message` (280 char), `read`, `createdAt`
- `POST /api/ping` — send a ping (pool validation enforced server-side)
- `GET /api/ping` — inbox with unread count
- `PATCH /api/ping` — mark pings as read (individual or all)
- Real-time delivery via SSE `ping` channel on EventBus
- Ping icon in header with unread badge and dropdown inbox
- Each employee card on the dashboard shows who they report to and a quick-ping button
- Non-admin roles see a rich "Reports to" card with manager's live status, arrival time, location (office/remote), hours worked, shift end, and a one-tap ping button
- `GET /api/attendance/presence/manager` — dedicated lightweight endpoint returning the logged-in user's manager/lead live presence (status, isLive, arrival, exit, office/remote split, shift times). Auto-refreshes every 30 seconds

### Dashboard (Real-Time)

The dashboard is **fully real-time** — no manual refresh needed. Data updates are silent (no loading spinners or skeleton flashes during updates).

- **Per-section loading**: No global skeleton gate — header and static sections render immediately while data-dependent sections (presence grid, attendance stats) show inline shimmers only for their own loading state. Presence data (`fetchLive`) loads in parallel with core data (`fetchFull`) on initial mount
- **Card-shell skeleton pattern**: Every card and section always renders its structural frame (borders, headings, layout) immediately. Data-dependent content inside cards uses shimmer placeholders (`shimmer` CSS class) until the API responds — no card appears/disappears during loading. Applied to: SelfOverviewCard (avatar + stat boxes), TodayTimelineCard (timeline events + task list), campaigns/tasks/teams sections (card with skeleton rows), weekly overview (day card strip), monthly summary (stat cards), all 5 CRUD list pages (skeleton card grids instead of "No X found" flash), settings system sections (skeleton inputs), attendance monthly insights (skeleton analytic chips), notification bell (skeleton log entries), ping inbox (skeleton ping entries), welcome header (skeleton task/campaign count text)
- **Live attendance detail**: `/api/attendance?type=detail` now includes elapsed minutes from the currently active session (not just closed sessions), so "hours logged" and status badges reflect real-time presence
- **SSE event stream**: Single persistent connection to `/api/events` replaces all polling. Server monitors an `EventBus` document (one lightweight DB read every 4s) and pushes change events only when data actually mutates. Client fetches only the affected data channel — zero wasted requests
- **Push channels**: `presence` (check-in/out/location transition), `employees`, `tasks`, `departments`, `teams`, `campaigns`, `activity` (notification log), `settings` — each channel triggers only its specific data fetch
- **Tab-aware**: SSE connection closes when tab is hidden, reconnects when visible — zero background CPU/network drain
- **Auto-reconnect**: SSE auto-closes after 55s (Vercel serverless limit); `EventSource` natively reconnects within 1s
- **Design language**: Matches preview page — card borders (`card`, `card-static`), blob gradient corners on stat cards, `badge-office`/`badge-remote`/`badge-late`/`badge-overtime`/`badge-absent` status pills, gradient avatar rings, animated numbers, `text-title`/`text-headline`/`text-caption` typography classes, animated segmented pill filters with `LayoutGroup`

**SuperAdmin (AdminDashboard):**
- **Welcome header**: time-of-day greeting with "Single Solution Sync" label, inline status badge pills showing **live** counts only (In Office = currently live + in office, Remote = currently live + remote, Late, Absent). Compact time card on the right with blob gradient and live clock (no task/campaign chips — full cards below already show this)
- **No stat cards row**: removed the duplicate Total/InOffice/Late/Absent card row — the welcome pills already convey this at a glance
- **Campaigns + Checklist**: campaigns vertical card on the left (lg:col-span-5), pending tasks checklist on the right (lg:col-span-7) with priority icons, labels, and assignee names. Both sections always show their card shell with skeleton rows while data loads
- **Team breakdown**: clickable rows showing team name, lead, live/present/absent/late counts. Clicking filters the presence cards below. Shows skeleton rows during initial load
- **Team Status (Live Presence)**: pulsing green dot header, segmented pill filter (All/Office/Remote/Late/Absent), animated employee cards with gradient avatars, breathing ring animations for live employees, `badge-*` status pills, live/flagged badges, arrival→status row, work duration pills, shift progress bars, pending tasks/campaign tags
- **Stale session detection**: Presence API checks `lastActivity` against a 3-minute threshold. Stale employees show as inactive
- No LivePulse on welcome bar — timer pill at bottom handles live indication for all roles

**Manager / Team Lead (AdminDashboard):**
- **Welcome header**: same design as SuperAdmin but with pending tasks + active campaigns count instead of status badge pills
- **Self Overview card** (DeveloperPreview-style): large avatar, name/department/email, status badge, 3 stat mini-cards (first entry, hours logged, office/remote split with percentages), animated shift progress bar. Shows skeleton avatar + stat boxes while attendance data loads
- **Today Timeline card**: vertical activity timeline (check-in, sessions, active now) + task summary with pulsing pending count badge, priority dots, "View All" link. Shows skeleton timeline dots + task list while loading
- Same campaigns, checklist, team breakdown, and team status sections as SuperAdmin

**Developer / Business Developer (OtherRoleOverview):**
- **Welcome header**: greeting with "Single Solution Sync" label, local time display (no LivePulse)
- **Self Overview + Timeline** (side-by-side on desktop): DeveloperPreview-style profile hero card with avatar, status badge, mini stat cards, shift progress bar. Timeline card with activity events and task summary
- **Weekly overview**: horizontal-scroll strip of day cards (like DeveloperPreview) — each card shows weekday, date, status dot, and total hours. Today highlighted with primary border + glow
- **Monthly summary**: nested stat cards (Present/Total, On-time, Avg daily hours, Total hours) with animated numbers, office vs remote stacked progress bar with percentages

**Navigation**: "Overview" (all roles), "Campaigns", "Tasks", "Attendance" visible to all. "Employees", "Departments", "Teams" visible to SuperAdmin, Manager, and Team Lead (each scoped to their departments/teams).

### Attendance Page (All Roles)

- Interactive calendar with clickable, selectable dates and color-coded day indicators
- Day detail panel (equal height with calendar): status pills, human-readable summary, stat chips (total/office/remote hours), animated work split bar
- Session timeline per day: time range, duration, location pills (Office/Remote), device detection (Mac/Windows/Mobile), "First In"/"Last Out" badges, last heartbeat timestamp, IP address, office segment sub-timeline
- Monthly insights row: avg daily hours, avg arrival/departure, on-time %, attendance %, office/remote split
- Team member selector (SuperAdmin/Manager) to view any employee's calendar
- Monthly records list with clickable rows that sync to calendar selection

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
  layout.tsx             # Root layout (fonts, metadata, ThemeProvider)
  globals.css            # Global styles (glass variables, shimmer, card classes, badges, dock)
  login/                 # Auth login page (hero, particles, orbs)
  forgot-password/       # Token-based password reset request
  reset-password/        # Reset password with strength meter
  preview/               # Public demo/preview feature (DeveloperPreview, SuperAdminPreview, ManagerPreview)
  (dashboard)/           # Route group — all authenticated pages (no /dashboard/ in URL)
    layout.tsx           # Dashboard layout (wraps DashboardShell)
    Providers.tsx        # Client providers (SessionProvider, ToasterProvider)
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
      Portal.tsx         # React Portal wrapper for modals (renders to document.body)
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
    employees/[id]/      # GET/PUT/DELETE single employee (role-scoped canViewEmployee/canEditEmployee)
    employees/[id]/resend-invite/ # POST resend welcome email with new setup-password link
    employees/dropdown/  # Sparse employee list (id, name, role, dept, teams) for form dropdowns
    departments/         # CRUD with manager population + server-side team/employee counts + activity logging
    departments/[id]/    # PUT/DELETE single department (SuperAdmin only)
    teams/               # CRUD with dept scoping + member count aggregation
    teams/[id]/          # GET/PUT/DELETE single team (role-scoped canEditTeam)
    campaigns/           # CRUD with entity tagging (employees, departments, teams) + status lifecycle
    campaigns/[id]/      # GET/PUT/DELETE single campaign (role-scoped)
    tasks/               # CRUD with team scoping + activity logging
    tasks/[id]/          # GET/PUT/DELETE single task (role-scoped)
    attendance/          # GET daily/monthly/detail/team attendance records (timezone-aware date queries)
      session/           # Check-in, check-out, heartbeat PATCH, session GET (timezone-aware lateness + settings grace)
      presence/          # Real-time employee status for dashboard (includes lateBy)
      presence/manager/  # Logged-in user's manager/lead live presence (30s polling)
      trend/             # Last 5 working days present count for team attendance chart
    ping/                # POST send ping, GET inbox with unread count, PATCH mark read
    activity-logs/       # GET latest 20 activity log entries
    events/              # SSE endpoint — streams change events per channel (replaces all polling)
    user/last-seen/      # GET + PUT lastSeenLogId for notification read sync
    profile/             # Self profile + base64 image upload
    profile/password/    # Password change with current password validation
    settings/            # SystemSettings CRUD (SuperAdmin only) + activity logging
    test-email/          # SMTP testing endpoint
components/
  Logo.tsx               # Shared logo component
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
  tz.ts                 # Timezone-aware date helpers — resolveTimezone(), dateParts(), dateInTz(), todayDateStr() using Intl.DateTimeFormat
  dayBoundary.ts        # 6 AM attendance day boundary — startOfDay(d, tz?) and isSameDay(a, b, tz?) used across all attendance APIs
  geo.ts                # Haversine + office geofence (reads SystemSettings) + validateLocation() 4-layer anti-spoofing
  helpers.ts            # Response helpers (ok, badRequest, forbidden, etc.)
  mail.ts               # Nodemailer + HTML email templates
  rateLimit.ts          # In-memory rate limiter
  motion.ts             # Framer Motion animation presets
  mockData.ts           # Mock data generator for preview/demo pages
  models/
    ActivityLog.ts      # Append-only activity log (user, action, entity, details, targeting: targetUserIds, targetDepartmentId, targetTeamIds, visibility)
    EventBus.ts         # Singleton document tracking per-channel last-modified timestamps (presence, employees, tasks, etc.)
    User.ts             # User (5 roles incl. teamLead, shifts, teams[], reportsTo supervisor ref, BD fields, reset tokens, lastSeenLogId)
    Department.ts       # Department with manager ref + optional parentDepartment ref (hierarchical)
    Team.ts             # Team (name, slug, department, lead, description)
    Campaign.ts         # Campaign (name, status lifecycle, tagged employees/departments/teams, dates, budget)
    Ping.ts             # Peer-to-peer ping messages (from, to, message, read, createdAt)
    ActivitySession.ts  # Session with office segments + heartbeat lastActivity + location fraud detection fields (accuracy, locationFlagged, flagReason, flaggedAt, consecutiveIdentical)
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
  icons/icon.svg        # SVG app icon for PWA manifest
  favicon.svg           # SVG favicon
ATTENDANCE_PLAN.md      # Detailed attendance system design document
```

## Attendance System Architecture

For the full technical design document including API contracts, data flow diagrams, edge case analysis, race condition handling, and stale threshold rationale, see [`ATTENDANCE_PLAN.md`](./ATTENDANCE_PLAN.md).

## License

Private — Single Solution
