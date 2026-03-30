import { connectDB } from "@/lib/db";
import ActivitySession from "@/lib/models/ActivitySession";
import DailyAttendance from "@/lib/models/DailyAttendance";
import MonthlyAttendanceStats from "@/lib/models/MonthlyAttendanceStats";
import User from "@/lib/models/User";
import { getSession, unauthorized, badRequest, ok } from "@/lib/helpers";
import { isInOffice } from "@/lib/geo";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  await connectDB();

  const url = new URL(req.url);
  const targetUserId = url.searchParams.get("userId") ?? session.user.id;

  if (session.user.role !== "superadmin" && session.user.role !== "manager" && targetUserId !== session.user.id) {
    return ok({ activeSession: null });
  }

  const today = startOfDay(new Date());

  const activeSession = await ActivitySession.findOne({
    user: targetUserId,
    sessionDate: today,
    status: "active",
  }).lean();

  let todayMinutes = 0;
  const daily = await DailyAttendance.findOne({ user: targetUserId, date: today }).lean();
  if (daily) todayMinutes = daily.totalWorkingMinutes ?? 0;

  return ok({ activeSession, todayMinutes });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  await connectDB();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    const text = await req.text();
    try { body = JSON.parse(text); } catch { body = { action: "checkout" }; }
  }
  const action = body.action as string;

  if (action === "checkin") {
    return handleCheckIn(session.user.id, body);
  } else if (action === "checkout") {
    return handleCheckOut(session.user.id);
  }

  return badRequest("Invalid action. Use 'checkin' or 'checkout'.");
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  await connectDB();
  const body = await req.json();
  const { latitude, longitude } = body as { latitude?: number; longitude?: number };
  if (latitude == null || longitude == null) return badRequest("Missing coordinates");

  const today = startOfDay(new Date());
  const active = await ActivitySession.findOne({
    user: session.user.id,
    sessionDate: today,
    status: "active",
  });
  if (!active) return ok({ updated: false });

  const now = new Date();
  const wasInOffice = active.location?.inOffice ?? false;
  const nowInOffice = await isInOffice(latitude, longitude);

  active.location.latitude = latitude;
  active.location.longitude = longitude;
  active.location.inOffice = nowInOffice;
  active.lastActivity = now;

  if (wasInOffice && !nowInOffice) {
    const lastSeg = active.officeSegments?.[active.officeSegments.length - 1];
    if (lastSeg && !lastSeg.exitTime) {
      lastSeg.exitTime = now;
      lastSeg.durationMinutes = Math.floor((now.getTime() - lastSeg.entryTime.getTime()) / 60000);
    }
  } else if (!wasInOffice && nowInOffice) {
    active.officeSegments.push({ entryTime: now, durationMinutes: 0 });
  }

  await active.save();
  return ok({ updated: true, inOffice: nowInOffice, transitioned: wasInOffice !== nowInOffice });
}

async function handleCheckIn(
  userId: string,
  body: { latitude?: number; longitude?: number; platform?: string; userAgent?: string; deviceId?: string },
) {
  const now = new Date();
  const today = startOfDay(now);

  const existing = await ActivitySession.findOneAndUpdate(
    { user: userId, sessionDate: today, status: "active" },
    { $set: { lastActivity: now } },
    { new: true },
  );

  if (existing) {
    return badRequest("Already checked in. Please check out first.");
  }

  const inOffice = await isInOffice(body.latitude, body.longitude);

  const todaySessions = await ActivitySession.countDocuments({
    user: userId,
    sessionDate: today,
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
    },
    sessionTime: { start: now },
    lastActivity: now,
    status: "active",
    sessionDate: today,
    durationMinutes: 0,
    officeSegments: inOffice ? [{ entryTime: now, durationMinutes: 0 }] : [],
    isFirstOfficeEntry: todaySessions === 0 && inOffice,
    isLastOfficeExit: false,
  });

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

  return ok({
    message: "Checked in successfully",
    session: {
      _id: activitySession._id,
      status: "active",
      inOffice,
      startTime: now,
    },
  });
}

async function handleCheckOut(userId: string) {
  const now = new Date();
  const today = startOfDay(now);

  const activeSession = await ActivitySession.findOne({
    user: userId,
    sessionDate: today,
    status: "active",
  });

  if (!activeSession) {
    return badRequest("No active session found. Please check in first.");
  }

  const startTime = activeSession.sessionTime.start;
  const durationMinutes = Math.floor((now.getTime() - startTime.getTime()) / 60000);

  activeSession.sessionTime.end = now;
  activeSession.status = "disconnected";
  activeSession.durationMinutes = durationMinutes;

  if (activeSession.location.inOffice && activeSession.officeSegments.length > 0) {
    const lastSeg = activeSession.officeSegments[activeSession.officeSegments.length - 1];
    if (!lastSeg.exitTime) {
      lastSeg.exitTime = now;
      lastSeg.durationMinutes = Math.floor((now.getTime() - lastSeg.entryTime.getTime()) / 60000);
    }
  }

  await activeSession.save();

  const daily = await DailyAttendance.findOne({ user: userId, date: today });
  if (daily) {
    const allSessions = await ActivitySession.find({ user: userId, sessionDate: today }).lean();

    let totalWorkingMinutes = 0;
    let officeMinutes = 0;

    for (const s of allSessions) {
      totalWorkingMinutes += s.durationMinutes;
      for (const seg of s.officeSegments) {
        officeMinutes += seg.durationMinutes;
      }
    }

    daily.totalWorkingMinutes = totalWorkingMinutes;
    daily.officeMinutes = officeMinutes;
    daily.remoteMinutes = totalWorkingMinutes - officeMinutes;
    daily.lastOfficeExit = activeSession.location.inOffice ? now : daily.lastOfficeExit;
    await daily.save();

    await updateMonthlyStats(userId, now);
  }

  return ok({
    message: "Checked out successfully",
    duration: durationMinutes,
  });
}

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
        onTimePercentage: presentDays > 0 ? Math.round((onTimeArrivals / presentDays) * 100) : 0,
        totalWorkingHours: Math.round((totalWorkingMinutes / 60) * 100) / 100,
        totalOfficeHours: Math.round((totalOfficeMinutes / 60) * 100) / 100,
        totalRemoteHours: Math.round((totalRemoteMinutes / 60) * 100) / 100,
        averageDailyHours: presentDays > 0 ? Math.round((totalWorkingMinutes / presentDays / 60) * 100) / 100 : 0,
        attendancePercentage: weekdays > 0 ? Math.round((presentDays / weekdays) * 100) : 0,
      },
    },
    { upsert: true },
  );
}
