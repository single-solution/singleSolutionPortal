# Attendance System Rewrite — Implementation Plan

## Overview

Replace the current "primary device lock + sendBeacon-only checkout" model with a **heartbeat-based session lifecycle** that mirrors the old portal's Socket.IO reliability using HTTP polling.

**Core principle:** Heartbeat = proof of life. No heartbeat for 3 minutes = session dead.

---

## Phase 1: API Changes

**File:** `app/api/attendance/session/route.ts`

### POST — Check-in (rewrite)

```
Input: { action: "checkin", latitude, longitude, platform, userAgent, deviceId, isMobile }

1. If isMobile → reject ("Mobile devices cannot start sessions")
2. Find active session for user (ANY day, status: "active")
3. If found:
   a. If sessionDate is a PREVIOUS day → ALWAYS auto-close it (stale by definition):
      - sessionTime.end = lastActivity
      - durationMinutes = floor((lastActivity - start) / 60000)
      - Close last open officeSegment (exitTime = lastActivity)
      - status = "disconnected"
      - Recompute daily totals for THAT session's date
      - Update monthly stats for that date
   b. If sessionDate is TODAY and lastActivity < 3 min ago
      → reject ("Session active on another device")
   c. If sessionDate is TODAY and lastActivity >= 3 min ago → AUTO-CLOSE it:
      - Same closure steps as (a)
4. Create new session (status: "active", sessionDate: today, lastActivity: now)
5. Upsert DailyAttendance for today, push session ID
6. Return { session, todayMinutes }
```

> **Why previous-day sessions are always closed:** If a user leaves their laptop
> open overnight, the heartbeat fires past midnight but PATCH detects the day changed
> and tells the client to re-check-in. The old session (yesterday) must be closed
> regardless of how fresh its lastActivity is — it belongs to a finished day.

### POST — Check-out (simplify)

```
Input: { action: "checkout" }

1. Find active session for user (ANY day, not just today — handles midnight edge case)
2. If not found → error
3. No device checks (removed primaryDeviceId validation)
4. Close session: end time = now, calculate duration, close office segments
5. Recompute daily totals for THAT session's sessionDate (sum all sessions)
6. Update monthly stats
7. Return { duration }
```

> **Why ANY day:** sendBeacon could fire at 12:01 AM for a session that started
> yesterday. Searching only "today" would miss it.

### PATCH — Heartbeat + Location (rewrite)

```
Input: { latitude, longitude }

1. Find active session for user (ANY day, status: "active")
2. If NOT found → return { updated: false, sessionClosed: true }
3. If found but sessionDate is a PREVIOUS day:
   → return { updated: false, sessionClosed: true, dayChanged: true }
   (Don't update it — let client re-check-in, which triggers proper closure)
4. Update: lastActivity = now, location coords, inOffice geofence check
5. Handle office segment transitions (in→out, out→in)
6. Return { updated: true, inOffice, transitioned }
```

> **Why check sessionDate:** If a user's laptop stays open past midnight, the heartbeat
> fires for yesterday's session. We don't want to keep extending yesterday — instead we
> signal the client to create a new session for the new day.

### GET — Session State (simplify)

```
1. Find active session for user (ANY day, status: "active")
2. Calculate isStale:
   - If sessionDate is a previous day → isStale = true (always)
   - If sessionDate is today → isStale = (now - lastActivity) > 3 minutes
3. Return { activeSession, todayMinutes, isStale }
   (activeSession includes sessionDate, sessionTime.start, location, lastActivity)
4. Remove primaryDeviceId from response
```

> **Why isStale includes previous day:** A session from yesterday with a fresh
> lastActivity (e.g., heartbeat was running past midnight before PATCH caught it)
> must still be treated as stale so clients know to take over and trigger the
> day transition.

---

## Phase 2: Model Changes

**File:** `lib/models/ActivitySession.ts`

- Remove `primaryDeviceId` field from interface and schema
- All other fields stay unchanged

---

## Phase 3: Client Rewrite

**File:** `app/dashboard/SessionTracker.tsx`

### Device modes

```
type DeviceMode = "active" | "readonly" | "booting";
```

- **active** — this device owns the session, sends heartbeat every 30s
- **readonly** — another device is active, or this is mobile; polls server every 30s for display
- **booting** — initial load, determining role

### Mount logic

```
1. getDeviceId() from localStorage
2. detectMobile()
3. GET /api/attendance/session

4. If mobile:
   → mode = "readonly"
   → start sync polling every 30s

5. If desktop:
   a. No active session
      → get geolocation (one-shot, 10s timeout)
         - If geo succeeds → coords available for check-in
         - If geo fails/denied → check in with null coords (still works, just no office detection)
      → POST check-in
      → if check-in succeeds → mode = "active", start heartbeat (30s)
      → if check-in fails (network) → retry after 5s, max 3 retries, then show error state

   b. Active session + NOT stale (lastActivity < 3 min)
      → mode = "readonly"
      → start sync polling every 30s

   c. Active session + IS stale (lastActivity >= 3 min) OR previous day
      → get geolocation (one-shot, same fallback as above)
      → POST check-in (server auto-closes stale session)
      → mode = "active", start heartbeat (30s)
```

> **Geo fallback:** Geolocation is best-effort. If denied or unavailable, the session
> still starts — it just can't determine in-office vs remote. This matches the old portal
> behavior ("Location Cannot be fetched!" but session still created).

### Heartbeat loop (active mode only, every 30s)

```
1. navigator.geolocation.getCurrentPosition() (one-shot, best-effort — use cached coords if fails)
2. PATCH /api/attendance/session { latitude, longitude }
3. If response says { sessionClosed: true } (covers both stale-closed AND dayChanged):
   → our session was closed or day rolled over
   → attempt POST check-in again (server handles closure + new session)
   → if check-in succeeds → stay active, timer resets for new session
   → if rejected ("active on another device") → switch to readonly mode
4. If response says { transitioned: true }:
   → update inOffice status in UI
5. If PATCH network fails:
   → skip this beat, try again in 30s (session survives in DB, no action needed)
```

Replaces the current watchPosition geo watcher — simpler, less battery drain, same result.
30s geo updates are more than enough for a 50m office geofence (old portal only captured location once at session start).

### Sync polling (readonly mode only, every 30s)

```
1. GET /api/attendance/session
2. If no active session AND this is desktop:
   → attempt check-in (take over from dead device)
3. If active session + stale AND this is desktop:
   → attempt check-in (take over)
4. If active session + fresh:
   → stay readonly, update display with server data
5. If mobile:
   → always stay readonly, update display
```

### beforeunload handler

```
- Only fires if mode === "active"
- sendBeacon POST { action: "checkout" }
- No device ID checks needed
- Best-effort immediate checkout (backup for heartbeat)
```

### Timer display

```
todayTotal = todayMinutes (from completed sessions) + currentElapsed (if active)

Pill shows:
  [status dot] Status | HH:MM:SS elapsed | Xh Xm today total

Active mode:   green/blue gradient, live ticking timer
Readonly:      "On another device" label + synced timer (ticks client-side between polls using startTime)
Mobile:        same as readonly + 📱 emoji
Stale/offline: if isStale=true in readonly → show "Session inactive" instead of running timer
Idle:          opacity dimmed (same as current)
```

> **Why "Session inactive" for stale:** If a mobile user sees an active session
> from hours ago with a giant elapsed time, it's confusing. When `isStale` is true,
> show a static "inactive" state instead of a ticking timer.

### Idle detection

- Only when mode === "active"
- Events: mousemove, keydown, touchstart, scroll
- 5 min timeout → dim pill opacity
- No auto-logout, no session close on idle

---

## Phase 4: Logout Checkout

**File:** `app/dashboard/DashboardShell.tsx`

Add checkout API call before signOut:

```
Sign out button → fetch POST { action: "checkout" } → then signOut()
```

---

## Phase 5: Cleanup

Remove all references to `primaryDeviceId`:
- `lib/models/ActivitySession.ts` — remove from interface + schema
- `app/api/attendance/session/route.ts` — remove from check-in creation, check-out validation, PATCH validation, GET response
- `app/dashboard/SessionTracker.tsx` — remove DeviceRole type ("primary"/"secondary"), remove isMobileRef for API calls

---

## Files Changed (5 files)

| File | Change type |
|------|-------------|
| `lib/models/ActivitySession.ts` | Remove `primaryDeviceId` |
| `app/api/attendance/session/route.ts` | Rewrite check-in/out/heartbeat logic |
| `app/dashboard/SessionTracker.tsx` | Full rewrite: heartbeat, active/readonly modes |
| `app/dashboard/DashboardShell.tsx` | Add checkout before signOut |
| `README.md` | Update attendance section |

## What stays the same (no changes needed)

- `lib/models/DailyAttendance.ts` — aggregation model unchanged
- `lib/models/MonthlyAttendanceStats.ts` — stats model unchanged
- `lib/geo.ts` — isInOffice geofence logic unchanged
- `app/dashboard/attendance/page.tsx` — reads from DailyAttendance, works as-is
- `app/dashboard/DashboardHome.tsx` — stats display unchanged

---

## Data Flow Examples

### Example 1: Normal workday

```
9:00 AM  — Open MacBook, login
           → GET: no active session
           → Geo: got coords
           → POST check-in → Session #1 created (active)
           → Heartbeat starts (every 30s PATCH)

9:00 AM  — Open phone, login
           → GET: active session, lastActivity 5s ago (fresh)
           → Mode: readonly, sync polling starts

6:00 PM  — Close MacBook lid
           → sendBeacon fires → Session #1 closed (9h)
           → Daily: totalWorkingMinutes = 540
           → Phone: next poll sees no active session
```

### Example 2: Lunch break (lid close, sendBeacon fails)

```
9:00 AM  — Check-in → Session #1 → heartbeat ticking
12:00 PM — Close lid for lunch → sendBeacon fails → heartbeat stops
           → lastActivity freezes at 12:00:00

1:00 PM  — Reopen MacBook
           → GET: active session, lastActivity = 12:00 (1 hour stale)
           → POST check-in
           → Server: auto-close Session #1
             duration = (12:00:00 - 9:00:00) = 180 min
             Recompute daily: totalWorkingMinutes = 180
           → Server: create Session #2 (active)
           → Heartbeat starts

6:00 PM  — Close MacBook → sendBeacon → Session #2 closed (5h = 300 min)
           → Daily: totalWorkingMinutes = 180 + 300 = 480 min = 8h
```

### Example 3: Second desktop takes over

```
9:00 AM  — Desktop A: check-in → Session #1 → heartbeat
9:30 AM  — Desktop B: GET → active, fresh → readonly

12:00 PM — Desktop A crashes, heartbeat stops
12:03 PM — Desktop B: poll → active but stale (3+ min)
           → POST check-in
           → Server: auto-close Session #1 (duration = lastActivity - start)
           → Server: create Session #2 on Desktop B
           → Desktop B: mode = active, heartbeat starts
```

### Example 4: Internet hiccup (< 3 min)

```
Heartbeat at 10:00:00 → lastActivity = 10:00:00
Internet drops at 10:00:05
Heartbeat at 10:00:30 → fails (no internet)
Heartbeat at 10:01:00 → fails
Internet back at 10:01:15
Heartbeat at 10:01:30 → succeeds → lastActivity = 10:01:30
→ Session never went stale (threshold is 3 min)
→ No interruption ✅
```

### Example 5: Internet hiccup (> 3 min)

```
Heartbeat at 10:00:00 → lastActivity = 10:00:00
Internet drops at 10:00:05
Heartbeats at 10:00:30, 10:01:00, 10:01:30, 10:02:00, 10:02:30, 10:03:00 → all fail
Internet back at 10:03:15
Heartbeat at 10:03:30 → PATCH → server: no active session (stale, closed by...)

Wait — who closed it? Nobody. The session is still "active" in DB.
Heartbeat PATCH finds active session, updates lastActivity → succeeds → continues.
→ Session survives! Only closed when ANOTHER device tries to check in.
→ For single-device user: no issue. Session resumes. ✅
→ Gap in lastActivity (3 min) is NOT counted as offline — session stayed active.
```

### Example 6: Working past midnight (day transition)

```
11:00 PM — Session #1 active (sessionDate = March 14), heartbeat ticking
11:59 PM — Heartbeat → PATCH → session is today → updates normally ✅

12:00 AM — Day changes to March 15
12:00 AM — Heartbeat → PATCH → finds Session #1 but sessionDate = March 14 (previous day)
           → returns { sessionClosed: true, dayChanged: true }

Client receives dayChanged:
  → attempts POST check-in for new day
  → Server: finds Session #1 (yesterday, active) → auto-closes it
    duration = (lastActivity 11:59 PM - start) → attributed to March 14
    Daily recomputed for March 14
  → Server: creates Session #2 (sessionDate = March 15)
  → Client: mode = active, heartbeat continues seamlessly
  → User sees no interruption, just timer resets for new day
```

---

## Stale Threshold Rationale

**3 minutes** at 30-second heartbeat = 6 missed heartbeats before a NEW device can take over.

- Normal heartbeat: lastActivity always < 30s old
- Brief network blip (1-2 missed): lastActivity < 1.5 min → safe
- Lid close / crash: lastActivity freezes → becomes > 3 min → takeover allowed
- Trade-off: up to 3 min of "ghost time" at end of interrupted session IS counted
  (because duration = lastActivity - start, and lastActivity was the last successful beat)

---

## Race Condition Note

If two desktop tabs try to check in simultaneously (both see no active session):
- Both POST check-in
- Both could succeed, creating two active sessions
- Mitigation: after creating a session, the server checks for duplicate active sessions
  for the same user+today. If found, keep the oldest, close the newer one.
- In practice this is extremely rare (requires sub-second timing).

---

## Issues Found During Review (all addressed above)

1. **Midnight transition bug** — Previous-day sessions must ALWAYS be auto-closed on
   check-in, regardless of lastActivity freshness. PATCH must detect day change and
   signal the client to re-check-in. → Fixed in POST check-in step 3a and PATCH step 3.

2. **Check-out searched "today" only** — sendBeacon at 12:01 AM wouldn't find
   yesterday's session. → Fixed: check-out now searches ANY day.

3. **Geo permission denied** — If geolocation is denied, check-in should still proceed
   with null coords (no office detection, but session works). → Fixed in mount logic
   step 5a with explicit fallback.
