import { connectDB } from "@/lib/db";
import ActivitySession from "@/lib/models/ActivitySession";
import DailyAttendance from "@/lib/models/DailyAttendance";
import Holiday from "@/lib/models/Holiday";
import LocationFlagEvent from "@/lib/models/LocationFlagEvent";
import MonthlyAttendanceStats from "@/lib/models/MonthlyAttendanceStats";
import SystemSettings from "@/lib/models/SystemSettings";
import User from "@/lib/models/User";
import { getVerifiedSession, hasPermission, getSubordinateUserIds } from "@/lib/permissions";
import { unauthorized, badRequest, ok } from "@/lib/helpers";
import { isInOffice, validateLocation } from "@/lib/geo";
import { emitSocket } from "@/lib/socket";
import { logActivity } from "@/lib/activityLogger";
import { startOfDay, isSameDay } from "@/lib/dayBoundary";
import { resolveTimezone, dateParts, dateInTz } from "@/lib/tz";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const STALE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
const FLAG_TOLERANCE_WINDOW_DAYS = 30;
const FLAG_TOLERANCE_THRESHOLD = 2;

let cachedTz: string | null = null;
let tzCacheTime = 0;
const TZ_CACHE_TTL = 60_000;

async function loadTz(): Promise<string> {
  if (cachedTz && Date.now() - tzCacheTime < TZ_CACHE_TTL) return cachedTz;
  const s = await SystemSettings.findOne({ key: "global" }).select("company.timezone").lean();
  cachedTz = resolveTimezone((s?.company as { timezone?: string })?.timezone ?? "asia-karachi");
  tzCacheTime = Date.now();
  return cachedTz;
}

// ─── GET: session state ────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  const url = new URL(req.url);
  const targetUserId = url.searchParams.get("userId") ?? actor.id;

  if (actor.isSuperAdmin && targetUserId === actor.id) {
    return ok({ activeSession: null, todayMinutes: 0, isStale: false });
  }

  if (targetUserId !== actor.id) {
    if (!hasPermission(actor, "attendance_viewTeam")) {
      return ok({ activeSession: null, todayMinutes: 0, isStale: false });
    }
    if (!actor.isSuperAdmin) {
      const subordinateIds = await getSubordinateUserIds(actor.id);
      if (!subordinateIds.includes(targetUserId)) {
        return ok({ activeSession: null });
      }
    }
  }

  const tz = await loadTz();
  const now = new Date();
  const today = startOfDay(now, tz);

  const activeSession = await ActivitySession.findOne({
    user: targetUserId,
    status: "active",
  }).lean();

  let isStale = false;
  if (activeSession) {
    const isPreviousDay = !isSameDay(activeSession.sessionDate, now, tz);
    isStale =
      isPreviousDay ||
      now.getTime() - new Date(activeSession.lastActivity).getTime() > STALE_THRESHOLD_MS;
  }

  let todayMinutes = 0;
  const daily = await DailyAttendance.findOne({ user: targetUserId, date: today }).lean();
  if (daily) todayMinutes = daily.totalWorkingMinutes ?? 0;

  const locFlagged = activeSession?.location?.locationFlagged ?? false;
  let flagSeverity: "warning" | "violation" | null = null;
  if (locFlagged) flagSeverity = "violation";

  return ok({
    activeSession,
    todayMinutes,
    isStale,
    locationFlagged: locFlagged,
    flagSeverity,
    flagReason: activeSession?.location?.flagReason ?? null,
    companyTimezone: tz,
  });
}

// ─── POST: check-in / check-out ───────────────────────────────────
export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (actor.isSuperAdmin) return ok({ message: "Superadmin is exempt from attendance tracking" });

  await connectDB();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body. Provide { action: 'checkin' | 'checkout' }.");
  }
  const action = body.action as string;

  if (action === "checkin") {
    if (body.isMobile) {
      return badRequest("Mobile devices cannot start attendance sessions. Use a laptop or PC.");
    }
    return handleCheckIn(actor.id, body);
  } else if (action === "checkout") {
    return handleCheckOut(actor.id);
  }

  return badRequest("Invalid action. Use 'checkin' or 'checkout'.");
}

// ─── PATCH: heartbeat + location ──────────────────────────────────
export async function PATCH(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (actor.isSuperAdmin) return ok({ status: "exempt" });

  await connectDB();

  let body: { latitude?: number; longitude?: number; accuracy?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { latitude, longitude, accuracy } = body;

  const tz = await loadTz();
  const now = new Date();

  const active = await ActivitySession.findOne({
    user: actor.id,
    status: "active",
  });

  if (!active) {
    return ok({ updated: false, sessionClosed: true });
  }

  if (!isSameDay(active.sessionDate, now, tz)) {
    return ok({ updated: false, sessionClosed: true, dayChanged: true });
  }

  const lastActivityMs = active.lastActivity ? new Date(active.lastActivity).getTime() : 0;
  if (lastActivityMs > 0 && (now.getTime() - lastActivityMs) > STALE_THRESHOLD_MS) {
    const closeTime = new Date(lastActivityMs);
    await closeSession(active, closeTime, tz);
    emitSocket("presence", { type: "update" }, { room: "presence" });
    return ok({ updated: false, sessionClosed: true, sleepDetected: true });
  }

  const prevTime = active.lastActivity ? new Date(active.lastActivity) : undefined;
  active.lastActivity = now;

  if (latitude != null && longitude != null) {
    const prevLat = active.location?.latitude;
    const prevLng = active.location?.longitude;

    let consecutive = active.location?.consecutiveIdentical ?? 0;
    if (
      prevLat != null && prevLng != null &&
      latitude === prevLat && longitude === prevLng
    ) {
      consecutive += 1;
    } else {
      consecutive = 0;
    }

    const validation = validateLocation(
      latitude, longitude, accuracy,
      prevLat, prevLng, prevTime, now,
      consecutive,
    );

    active.location.accuracy = accuracy;
    active.location.consecutiveIdentical = consecutive;

    if (validation.flagged) {
      const windowStart = new Date(now.getTime() - FLAG_TOLERANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const priorCount = await LocationFlagEvent.countDocuments({
        user: actor.id,
        createdAt: { $gte: windowStart },
      });
      const severity: "warning" | "violation" = priorCount >= FLAG_TOLERANCE_THRESHOLD ? "violation" : "warning";

      if (severity === "violation") {
        active.location.locationFlagged = true;
        active.location.flagReason = validation.reasons.join("; ");
        active.location.flaggedAt = now;
      }

      const flagEvent = await LocationFlagEvent.create({
        user: actor.id,
        session: active._id,
        latitude,
        longitude,
        accuracy,
        reasons: validation.reasons,
        severity,
      });

      notifyFlagAsync(actor.id, flagEvent._id.toString(), validation.reasons, severity, priorCount + 1, latitude, longitude, accuracy);
    } else if (active.location.locationFlagged) {
      active.location.locationFlagged = false;
      active.location.flagReason = undefined;
      active.location.flaggedAt = undefined;
    }

    const wasInOffice = active.location?.inOffice ?? false;
    const nowInOffice = await isInOffice(latitude, longitude);

    active.location.latitude = latitude;
    active.location.longitude = longitude;
    active.location.inOffice = nowInOffice;

    if (wasInOffice && !nowInOffice) {
      const lastSeg = active.officeSegments?.[active.officeSegments.length - 1];
      if (lastSeg && !lastSeg.exitTime) {
        lastSeg.exitTime = now;
        lastSeg.durationMinutes = Math.floor(
          (now.getTime() - lastSeg.entryTime.getTime()) / 60000,
        );
      }
    } else if (!wasInOffice && nowInOffice) {
      active.officeSegments.push({ entryTime: now, durationMinutes: 0 });
    }

    const flagSeverity = validation.flagged
      ? (active.location.locationFlagged ? "violation" : "warning")
      : null;

    await active.save();
    if (wasInOffice !== nowInOffice) emitSocket("presence", { type: "update" }, { room: "presence" });
    return ok({
      updated: true,
      inOffice: nowInOffice,
      transitioned: wasInOffice !== nowInOffice,
      locationFlagged: active.location.locationFlagged ?? false,
      flagSeverity,
      flagReasons: validation.flagged ? validation.reasons : [],
    });
  }

  await active.save();
  return ok({
    updated: true,
    inOffice: active.location?.inOffice ?? false,
    locationFlagged: active.location?.locationFlagged ?? false,
  });
}

// ─── Async flag notification (fire-and-forget) ────────────────────
function notifyFlagAsync(
  userId: string,
  flagEventId: string,
  reasons: string[],
  severity: "warning" | "violation",
  totalCount: number,
  latitude: number,
  longitude: number,
  accuracy?: number,
) {
  (async () => {
    try {
      const employee = await User.findById(userId).select("about email").lean();
      if (!employee) return;

      const empName = `${employee.about?.firstName ?? ""} ${employee.about?.lastName ?? ""}`.trim() || employee.email;
      const prefix = severity === "violation" ? "VIOLATION" : "Warning";
      const action = `location flagged — ${prefix} (#${totalCount})`;

      const superAdmins = await User.find({ isSuperAdmin: true, isActive: true }).select("_id").lean();
      const targetIds: string[] = superAdmins.map((sa) => sa._id.toString());

      if (targetIds.length === 0) return;

      const detailsJson = JSON.stringify({
        severity,
        totalCount,
        latitude,
        longitude,
        accuracy: accuracy ?? null,
        reasons,
        windowDays: FLAG_TOLERANCE_WINDOW_DAYS,
      });

      await logActivity({
        userEmail: employee.email ?? "",
        userName: empName,
        action,
        entity: "security",
        entityId: flagEventId,
        details: detailsJson,
        targetUserIds: targetIds,
        visibility: "targeted",
      });

      emitSocket("presence", { type: "flag", userId, severity }, { room: "presence" });
    } catch {
      /* fire-and-forget */
    }
  })();
}

// ─── Close a session and recompute daily/monthly ──────────────────
async function closeSession(
  activeSession: InstanceType<typeof ActivitySession>,
  endTime: Date,
  tz: string,
) {
  const startTime = activeSession.sessionTime.start;
  const durationMinutes = Math.max(
    0,
    Math.floor((endTime.getTime() - startTime.getTime()) / 60000),
  );

  activeSession.sessionTime.end = endTime;
  activeSession.status = "disconnected";
  activeSession.durationMinutes = durationMinutes;

  if (activeSession.officeSegments.length > 0) {
    const lastSeg = activeSession.officeSegments[activeSession.officeSegments.length - 1];
    if (lastSeg && !lastSeg.exitTime) {
      lastSeg.exitTime = endTime;
      lastSeg.durationMinutes = Math.floor(
        (endTime.getTime() - lastSeg.entryTime.getTime()) / 60000,
      );
    }
  }

  await activeSession.save();

  const sessionDate = startOfDay(activeSession.sessionDate, tz);
  await recomputeDaily(String(activeSession.user), sessionDate, endTime, tz);
}

// ─── Recompute daily totals by summing all sessions ───────────────
async function recomputeDaily(userId: string, sessionDate: Date, _now: Date, tz: string) {
  const allSessions = await ActivitySession.find({
    user: userId,
    sessionDate,
  }).lean();

  let totalWorkingMinutes = 0;
  let officeMinutes = 0;
  let firstOfficeEntry: Date | null = null;
  let lastOfficeExit: Date | null = null;
  let lastSessionEnd: Date | null = null;

  for (const s of allSessions) {
    totalWorkingMinutes += s.durationMinutes ?? 0;
    for (const seg of s.officeSegments ?? []) {
      officeMinutes += seg.durationMinutes ?? 0;
    }
    const sEnd = s.sessionTime.end;
    if (sEnd && (!lastSessionEnd || sEnd > lastSessionEnd)) lastSessionEnd = sEnd;
    if (s.location?.inOffice) {
      const sStart = s.sessionTime.start;
      if (!firstOfficeEntry || sStart < firstOfficeEntry) firstOfficeEntry = sStart;
      if (sEnd && (!lastOfficeExit || sEnd > lastOfficeExit)) lastOfficeExit = sEnd;
    }
  }

  await DailyAttendance.findOneAndUpdate(
    { user: userId, date: sessionDate },
    {
      $set: {
        totalWorkingMinutes,
        officeMinutes,
        remoteMinutes: totalWorkingMinutes - officeMinutes,
        isPresent: totalWorkingMinutes > 0,
        ...(firstOfficeEntry ? { firstOfficeEntry } : {}),
        ...(lastOfficeExit ? { lastOfficeExit } : {}),
        ...(lastSessionEnd ? { lastSessionEnd } : {}),
      },
    },
    { upsert: true },
  );

  await updateMonthlyStats(userId, sessionDate, tz);
}

async function isTodayHoliday(date: Date, tz: string): Promise<boolean> {
  const localStr = date.toLocaleDateString("en-CA", { timeZone: tz.replace(/-/g, "/") });
  const [y, m, d] = localStr.split("-").map(Number);
  const holidays = await Holiday.find({
    $or: [{ year: y }, { isRecurring: true }],
  }).lean();
  for (const h of holidays) {
    const hd = new Date(h.date);
    const hMonth = hd.getUTCMonth() + 1;
    const hDay = hd.getUTCDate();
    if (hMonth === m && hDay === d) {
      if (h.isRecurring || h.year === y) return true;
    }
  }
  return false;
}

// ─── Check-in ─────────────────────────────────────────────────────
async function handleCheckIn(
  userId: string,
  body: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    platform?: string;
    userAgent?: string;
    deviceId?: string;
  },
) {
  const settings = await SystemSettings.findOne({ key: "global" })
    .select("company.timezone")
    .lean();
  const tz = resolveTimezone((settings?.company as { timezone?: string })?.timezone ?? "asia-karachi");

  const now = new Date();
  const today = startOfDay(now, tz);

  const existing = await ActivitySession.findOne({
    user: userId,
    status: "active",
  });

  if (existing) {
    const isPreviousDay = !isSameDay(existing.sessionDate, now, tz);
    const isStale =
      now.getTime() - new Date(existing.lastActivity).getTime() > STALE_THRESHOLD_MS;

    if (!isPreviousDay && !isStale) {
      return badRequest("Session active on another device. Please wait or close that session.");
    }

    const closeTime = new Date(existing.lastActivity);
    await closeSession(existing, closeTime, tz);
  }

  const inOffice = await isInOffice(body.latitude, body.longitude);

  let initialFlagged = false;
  let initialFlagReason: string | undefined;
  if (body.latitude != null && body.longitude != null) {
    const v = validateLocation(
      body.latitude, body.longitude, body.accuracy,
      undefined, undefined, undefined, now,
      0,
    );
    if (v.flagged) {
      initialFlagged = true;
      initialFlagReason = v.reasons.join("; ");
    }
  }

  const todayOfficeSessionExists = await ActivitySession.exists({
    user: userId,
    sessionDate: today,
    "location.inOffice": true,
    status: { $in: ["active", "disconnected"] },
  });

  const activitySession = await ActivitySession.create({
    session: randomUUID(),
    user: userId,
    platform: body.platform,
    userAgent: body.userAgent,
    deviceId: body.deviceId,
    location: {
      inOffice,
      latitude: body.latitude,
      longitude: body.longitude,
      accuracy: body.accuracy,
      locationFlagged: initialFlagged,
      flagReason: initialFlagReason,
      flaggedAt: initialFlagged ? now : undefined,
      consecutiveIdentical: 0,
    },
    sessionTime: { start: now },
    lastActivity: now,
    status: "active",
    sessionDate: today,
    durationMinutes: 0,
    officeSegments: inOffice ? [{ entryTime: now, durationMinutes: 0 }] : [],
    isFirstOfficeEntry: !todayOfficeSessionExists && inOffice,
    isLastOfficeExit: false,
  });

  const activeCount = await ActivitySession.countDocuments({
    user: userId,
    sessionDate: today,
    status: "active",
  });
  if (activeCount > 1) {
    const oldest = await ActivitySession.findOne({
      user: userId,
      sessionDate: today,
      status: "active",
    }).sort({ "sessionTime.start": 1 });
    if (oldest && String(oldest._id) !== String(activitySession._id)) {
      await ActivitySession.deleteOne({ _id: activitySession._id });
      return badRequest("Session active on another device. Please wait or close that session.");
    }
  }

  const todayIsHoliday = await isTodayHoliday(now, tz);

  let daily = await DailyAttendance.findOne({ user: userId, date: today });
  if (!daily) {
    const user = await User.findById(userId).select("weeklySchedule graceMinutes").lean();
    const { resolveWeeklySchedule, resolveGraceMinutes } = await import("@/lib/models/User");
    const schedule = resolveWeeklySchedule((user ?? {}) as Record<string, unknown>);
    const grace = resolveGraceMinutes((user ?? {}) as Record<string, unknown>);
    const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
    const tp = dateParts(today, tz);
    const localNow = new Date(now.toLocaleString("en-US", { timeZone: tz.replace(/-/g, "/") }));
    const todayDay = schedule[dayMap[localNow.getDay()]];
    const shiftStart = todayDay.start;
    const [sh, sm] = shiftStart.split(":").map(Number);

    const shiftDeadline = dateInTz(tp.year, tp.month, tp.day, sh, sm + grace, 0, tz);
    const skipLate = todayIsHoliday || !todayDay.isWorking;
    const isLate = skipLate ? false : now > shiftDeadline;
    const isLateToOffice = skipLate ? false : inOffice && now > shiftDeadline;

    daily = await DailyAttendance.create({
      user: userId,
      date: today,
      firstOfficeEntry: inOffice ? now : undefined,
      isPresent: true,
      isOnTime: !isLate,
      isHoliday: todayIsHoliday,
      lateBy: isLate ? Math.floor((now.getTime() - shiftDeadline.getTime()) / 60000) : 0,
      isLateToOffice,
      lateToOfficeBy: isLateToOffice ? Math.floor((now.getTime() - shiftDeadline.getTime()) / 60000) : 0,
      activitySessions: [activitySession._id],
    });
  } else {
    daily.isPresent = true;
    if (todayIsHoliday) daily.isHoliday = true;
    daily.activitySessions.push(activitySession._id);
    if (inOffice && !daily.firstOfficeEntry) {
      daily.firstOfficeEntry = now;

      if (!todayIsHoliday) {
        const user = await User.findById(userId).select("weeklySchedule graceMinutes").lean();
        const { resolveWeeklySchedule, resolveGraceMinutes } = await import("@/lib/models/User");
        const schedule = resolveWeeklySchedule((user ?? {}) as Record<string, unknown>);
        const grace = resolveGraceMinutes((user ?? {}) as Record<string, unknown>);
        const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
        const tp = dateParts(today, tz);
        const localNow = new Date(now.toLocaleString("en-US", { timeZone: tz.replace(/-/g, "/") }));
        const todayDay = schedule[dayMap[localNow.getDay()]];
        const shiftStart = todayDay.start;
        const [sh, sm] = shiftStart.split(":").map(Number);
        const shiftDeadline = dateInTz(tp.year, tp.month, tp.day, sh, sm + grace, 0, tz);
        if (!todayDay.isWorking) {
          /* non-working day — skip late-to-office flag */
        } else if (now > shiftDeadline) {
          daily.isLateToOffice = true;
          daily.lateToOfficeBy = Math.floor((now.getTime() - shiftDeadline.getTime()) / 60000);
        }
      }
    }
    await daily.save();
  }

  let todayMinutes = 0;
  const freshDaily = await DailyAttendance.findOne({ user: userId, date: today }).lean();
  if (freshDaily) todayMinutes = freshDaily.totalWorkingMinutes ?? 0;

  emitSocket("presence", { type: "checkin" }, { room: "presence" });

  return ok({
    message: "Checked in successfully",
    session: {
      _id: activitySession._id,
      status: "active",
      inOffice,
      startTime: now,
    },
    todayMinutes,
    locationFlagged: initialFlagged,
    flagReason: initialFlagReason ?? null,
  });
}

// ─── Check-out ────────────────────────────────────────────────────
async function handleCheckOut(userId: string) {
  const activeSession = await ActivitySession.findOne({
    user: userId,
    status: "active",
  });

  if (!activeSession) {
    return badRequest("No active session found.");
  }

  const tz = await loadTz();
  const now = new Date();
  await closeSession(activeSession, now, tz);

  const durationMinutes = activeSession.durationMinutes;
  emitSocket("presence", { type: "checkout" }, { room: "presence" });
  return ok({ message: "Checked out successfully", duration: durationMinutes });
}

// ─── Monthly stats ────────────────────────────────────────────────
async function updateMonthlyStats(userId: string, date: Date, tz: string) {
  const p = dateParts(date, tz);
  const year = p.year;
  const month = p.month + 1; // 1-indexed

  const monthStart = dateInTz(year, p.month, 1, 0, 0, 0, tz);
  const nextMonthStart = dateInTz(year, p.month + 1, 1, 0, 0, 0, tz);
  const monthEnd = new Date(nextMonthStart.getTime() - 1);

  const records = await DailyAttendance.find({
    user: userId,
    date: { $gte: monthStart, $lte: monthEnd },
  }).lean();

  const presentDays = records.filter((r) => r.isPresent).length;
  const onTimeArrivals = records.filter((r) => r.isOnTime).length;
  const totalWorkingMinutes = records.reduce((s, r) => s + r.totalWorkingMinutes, 0);
  const totalOfficeMinutes = records.reduce((s, r) => s + r.officeMinutes, 0);
  const totalRemoteMinutes = records.reduce((s, r) => s + r.remoteMinutes, 0);

  const daysInMonth = new Date(year, month, 0).getDate();
  const weekdays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, p.month, i + 1);
    return d.getDay() !== 0 && d.getDay() !== 6;
  }).filter(Boolean).length;

  await MonthlyAttendanceStats.findOneAndUpdate(
    { user: userId, year, month },
    {
      $set: {
        presentDays,
        absentDays: Math.max(0, weekdays - presentDays),
        totalWorkingDays: weekdays,
        onTimeArrivals,
        lateArrivals: presentDays - onTimeArrivals,
        onTimePercentage:
          presentDays > 0 ? Math.round((onTimeArrivals / presentDays) * 100) : 0,
        totalWorkingHours: Math.round((totalWorkingMinutes / 60) * 100) / 100,
        totalOfficeHours: Math.round((totalOfficeMinutes / 60) * 100) / 100,
        totalRemoteHours: Math.round((totalRemoteMinutes / 60) * 100) / 100,
        averageDailyHours:
          presentDays > 0
            ? Math.round((totalWorkingMinutes / presentDays / 60) * 100) / 100
            : 0,
        attendancePercentage:
          weekdays > 0 ? Math.round((presentDays / weekdays) * 100) : 0,
      },
    },
    { upsert: true },
  );
}
