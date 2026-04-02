import { connectDB } from "@/lib/db";
import ActivitySession from "@/lib/models/ActivitySession";
import DailyAttendance from "@/lib/models/DailyAttendance";
import MonthlyAttendanceStats from "@/lib/models/MonthlyAttendanceStats";
import User from "@/lib/models/User";
import { getVerifiedSession } from "@/lib/permissions";
import { unauthorized, badRequest, ok } from "@/lib/helpers";
import { isInOffice, validateLocation } from "@/lib/geo";
import { notifyChange } from "@/lib/eventBus";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const STALE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ─── GET: session state ────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  if (actor.role === "superadmin") {
    return ok({ activeSession: null, todayMinutes: 0, isStale: false });
  }

  await connectDB();

  const url = new URL(req.url);
  const targetUserId = url.searchParams.get("userId") ?? actor.id;

  if (targetUserId !== actor.id) {
    if (actor.role === "manager") {
      const target = await User.findById(targetUserId).select("department").lean();
      if (
        !actor.department ||
        !target?.department ||
        actor.department !== target.department.toString()
      ) {
        return ok({ activeSession: null });
      }
    } else if (actor.role === "teamLead") {
      const target = await User.findById(targetUserId).select("teams").lean();
      const targetTeams = (target?.teams as { toString(): string }[] | undefined)?.map((t) => t.toString()) ?? [];
      const hasOverlap = targetTeams.some((t) => actor.leadOfTeams.includes(t));
      if (!hasOverlap) {
        return ok({ activeSession: null });
      }
    } else {
      return ok({ activeSession: null });
    }
  }

  const now = new Date();
  const today = startOfDay(now);

  const activeSession = await ActivitySession.findOne({
    user: targetUserId,
    status: "active",
  }).lean();

  let isStale = false;
  if (activeSession) {
    const isPreviousDay = !isSameDay(activeSession.sessionDate, now);
    isStale =
      isPreviousDay ||
      now.getTime() - new Date(activeSession.lastActivity).getTime() > STALE_THRESHOLD_MS;
  }

  let todayMinutes = 0;
  const daily = await DailyAttendance.findOne({ user: targetUserId, date: today }).lean();
  if (daily) todayMinutes = daily.totalWorkingMinutes ?? 0;

  return ok({
    activeSession,
    todayMinutes,
    isStale,
    locationFlagged: activeSession?.location?.locationFlagged ?? false,
    flagReason: activeSession?.location?.flagReason ?? null,
  });
}

// ─── POST: check-in / check-out ───────────────────────────────────
export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (actor.role === "superadmin") return ok({ message: "Superadmin is exempt from attendance tracking" });

  await connectDB();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    const text = await req.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = { action: "checkout" };
    }
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
  if (actor.role === "superadmin") return ok({ status: "exempt" });

  await connectDB();

  let body: { latitude?: number; longitude?: number; accuracy?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { latitude, longitude, accuracy } = body;

  const now = new Date();

  const active = await ActivitySession.findOne({
    user: actor.id,
    status: "active",
  });

  if (!active) {
    return ok({ updated: false, sessionClosed: true });
  }

  if (!isSameDay(active.sessionDate, now)) {
    return ok({ updated: false, sessionClosed: true, dayChanged: true });
  }

  active.lastActivity = now;

  if (latitude != null && longitude != null) {
    const prevLat = active.location?.latitude;
    const prevLng = active.location?.longitude;
    const prevTime = active.lastActivity ? new Date(active.lastActivity) : undefined;

    // Track consecutive identical coordinates
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
      active.location.locationFlagged = true;
      active.location.flagReason = validation.reasons.join("; ");
      active.location.flaggedAt = now;
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

    await active.save();
    if (wasInOffice !== nowInOffice) notifyChange("presence");
    return ok({
      updated: true,
      inOffice: nowInOffice,
      transitioned: wasInOffice !== nowInOffice,
      locationFlagged: active.location.locationFlagged ?? false,
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

// ─── Close a session and recompute daily/monthly ──────────────────
async function closeSession(
  activeSession: InstanceType<typeof ActivitySession>,
  endTime: Date,
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

  const sessionDate = startOfDay(activeSession.sessionDate);
  await recomputeDaily(String(activeSession.user), sessionDate, endTime);
}

// ─── Recompute daily totals by summing all sessions ───────────────
async function recomputeDaily(userId: string, sessionDate: Date, now: Date) {
  const allSessions = await ActivitySession.find({
    user: userId,
    sessionDate,
  }).lean();

  let totalWorkingMinutes = 0;
  let officeMinutes = 0;
  let firstOfficeEntry: Date | null = null;
  let lastOfficeExit: Date | null = null;

  for (const s of allSessions) {
    totalWorkingMinutes += s.durationMinutes ?? 0;
    for (const seg of s.officeSegments ?? []) {
      officeMinutes += seg.durationMinutes ?? 0;
    }
    if (s.location?.inOffice) {
      const sStart = s.sessionTime.start;
      const sEnd = s.sessionTime.end;
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
      },
    },
    { upsert: true },
  );

  await updateMonthlyStats(userId, sessionDate);
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
  const now = new Date();
  const today = startOfDay(now);

  const existing = await ActivitySession.findOne({
    user: userId,
    status: "active",
  });

  if (existing) {
    const isPreviousDay = !isSameDay(existing.sessionDate, now);
    const isStale =
      now.getTime() - new Date(existing.lastActivity).getTime() > STALE_THRESHOLD_MS;

    if (!isPreviousDay && !isStale) {
      return badRequest("Session active on another device. Please wait or close that session.");
    }

    const closeTime = new Date(existing.lastActivity);
    await closeSession(existing, closeTime);
  }

  const inOffice = await isInOffice(body.latitude, body.longitude);

  // Validate initial location for spoofing
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

  // Race condition guard: if two tabs created sessions simultaneously, keep oldest
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

  let daily = await DailyAttendance.findOne({ user: userId, date: today });
  if (!daily) {
    const user = await User.findById(userId).select("workShift").lean();
    const shiftStart = user?.workShift?.shift?.start ?? "10:00";
    const [sh, sm] = shiftStart.split(":").map(Number);
    const graceMinutes = 30;
    const shiftStartDate = new Date(today);
    shiftStartDate.setHours(sh, sm + graceMinutes, 0, 0);
    const isLate = now > shiftStartDate;

    daily = await DailyAttendance.create({
      user: userId,
      date: today,
      firstOfficeEntry: inOffice ? now : undefined,
      isPresent: true,
      isOnTime: !isLate,
      lateBy: isLate ? Math.floor((now.getTime() - shiftStartDate.getTime()) / 60000) : 0,
      activitySessions: [activitySession._id],
    });
  } else {
    daily.isPresent = true;
    daily.activitySessions.push(activitySession._id);
    if (inOffice && !daily.firstOfficeEntry) {
      daily.firstOfficeEntry = now;
    }
    await daily.save();
  }

  let todayMinutes = 0;
  const freshDaily = await DailyAttendance.findOne({ user: userId, date: today }).lean();
  if (freshDaily) todayMinutes = freshDaily.totalWorkingMinutes ?? 0;

  notifyChange("presence");

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

  const now = new Date();
  await closeSession(activeSession, now);

  const durationMinutes = activeSession.durationMinutes;
  notifyChange("presence");
  return ok({ message: "Checked out successfully", duration: durationMinutes });
}

// ─── Monthly stats ────────────────────────────────────────────────
async function updateMonthlyStats(userId: string, date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const records = await DailyAttendance.find({
    user: userId,
    date: { $gte: startDate, $lte: endDate },
  }).lean();

  const presentDays = records.filter((r) => r.isPresent).length;
  const onTimeArrivals = records.filter((r) => r.isOnTime).length;
  const totalWorkingMinutes = records.reduce((s, r) => s + r.totalWorkingMinutes, 0);
  const totalOfficeMinutes = records.reduce((s, r) => s + r.officeMinutes, 0);
  const totalRemoteMinutes = records.reduce((s, r) => s + r.remoteMinutes, 0);

  const daysInMonth = new Date(year, month, 0).getDate();
  const weekdays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month - 1, i + 1);
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
