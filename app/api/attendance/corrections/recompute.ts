import ActivitySession from "@/lib/models/ActivitySession";
import DailyAttendance from "@/lib/models/DailyAttendance";
import Holiday from "@/lib/models/Holiday";
import Leave from "@/lib/models/Leave";
import MonthlyAttendanceStats from "@/lib/models/MonthlyAttendanceStats";
import User from "@/lib/models/User";
import { dateParts, dateInTz } from "@/lib/tz";

const JUNK_SESSION_THRESHOLD_S = 30;

function isJunkSession(s: { status?: string; durationMinutes?: number; sessionTime: { start: Date; end?: Date } }): boolean {
  if (s.status === "active") return false;
  if ((s.durationMinutes ?? 0) >= 1) return false;
  const start = new Date(s.sessionTime.start).getTime();
  const end = s.sessionTime.end ? new Date(s.sessionTime.end).getTime() : start;
  return (end - start) / 1000 < JUNK_SESSION_THRESHOLD_S;
}

async function isTodayHoliday(date: Date, tz: string): Promise<boolean> {
  const p = dateParts(date, tz);
  const y = p.year;
  const m = p.month + 1;
  const d = p.day;
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

export async function recomputeDailyForUser(userId: string, sessionDate: Date, tz: string) {
  const allSessions = await ActivitySession.find({
    user: userId,
    sessionDate,
  }).lean();

  let totalWorkingMinutes = 0;
  let officeMinutes = 0;
  let firstOfficeEntry: Date | null = null;
  let lastOfficeExit: Date | null = null;
  let lastSessionEnd: Date | null = null;
  let earliestStart: Date | null = null;

  for (const s of allSessions) {
    if (isJunkSession(s)) continue;
    totalWorkingMinutes += s.durationMinutes ?? 0;
    for (const seg of s.officeSegments ?? []) {
      officeMinutes += seg.durationMinutes ?? 0;
    }
    const sStart = s.sessionTime.start;
    if (!earliestStart || sStart < earliestStart) earliestStart = sStart;
    const sEnd = s.sessionTime.end;
    if (sEnd && (!lastSessionEnd || sEnd > lastSessionEnd)) lastSessionEnd = sEnd;
    if (s.location?.inOffice) {
      if (!firstOfficeEntry || sStart < firstOfficeEntry) firstOfficeEntry = sStart;
      if (sEnd && (!lastOfficeExit || sEnd > lastOfficeExit)) lastOfficeExit = sEnd;
    }
  }

  const remoteMinutes = Math.max(0, totalWorkingMinutes - officeMinutes);

  const BREAK_MIN_MINUTES = 3;
  const validSessions = allSessions
    .filter((s) => !isJunkSession(s) && s.sessionTime.end)
    .sort((a, b) => new Date(a.sessionTime.start).getTime() - new Date(b.sessionTime.start).getTime());
  let breakMinutes = 0;
  for (let i = 1; i < validSessions.length; i++) {
    const prevEnd = new Date(validSessions[i - 1].sessionTime.end!).getTime();
    const curStart = new Date(validSessions[i].sessionTime.start).getTime();
    const gapMinutes = (curStart - prevEnd) / 60000;
    if (gapMinutes >= BREAK_MIN_MINUTES) breakMinutes += Math.floor(gapMinutes);
  }

  let lateFields: Record<string, unknown> = {};
  if (earliestStart && totalWorkingMinutes > 0) {
    const { resolveWeeklySchedule, resolveGraceMinutes } = await import("@/lib/models/User");
    const userData = await User.findById(userId).select("weeklySchedule graceMinutes").lean();
    const schedule = resolveWeeklySchedule((userData ?? {}) as Record<string, unknown>);
    const grace = resolveGraceMinutes((userData ?? {}) as Record<string, unknown>);
    const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
    const tp = dateParts(sessionDate, tz);
    const ep = dateParts(earliestStart, tz);
    const earliestDayOfWeek = new Date(ep.year, ep.month, ep.day).getDay();
    const todayDay = schedule[dayMap[earliestDayOfWeek]];
    const [sh, sm] = todayDay.start.split(":").map(Number);
    const shiftDeadline = dateInTz(tp.year, tp.month, tp.day, sh, sm + grace, 0, tz);
    const isHoliday = await isTodayHoliday(earliestStart, tz);
    const skipLate = isHoliday || !todayDay.isWorking;
    const isLate = skipLate ? false : earliestStart > shiftDeadline;
    const isLateToOffice = skipLate ? false : firstOfficeEntry ? firstOfficeEntry > shiftDeadline : false;

    const [eh, em] = todayDay.end.split(":").map(Number);
    const shiftDurationMinutes = (eh * 60 + em) - (sh * 60 + sm);
    const overtimeMinutes = (!skipLate && totalWorkingMinutes > shiftDurationMinutes)
      ? totalWorkingMinutes - shiftDurationMinutes
      : 0;

    lateFields = {
      isOnTime: !isLate,
      lateBy: isLate ? Math.floor((earliestStart.getTime() - shiftDeadline.getTime()) / 60000) : 0,
      isLateToOffice,
      lateToOfficeBy: isLateToOffice && firstOfficeEntry
        ? Math.floor((firstOfficeEntry.getTime() - shiftDeadline.getTime()) / 60000)
        : 0,
      overtimeMinutes,
    };
  }

  await DailyAttendance.findOneAndUpdate(
    { user: userId, date: sessionDate },
    {
      $set: {
        totalWorkingMinutes,
        officeMinutes,
        remoteMinutes,
        breakMinutes,
        isPresent: totalWorkingMinutes > 0,
        ...lateFields,
        ...(firstOfficeEntry ? { firstOfficeEntry } : {}),
        ...(lastOfficeExit ? { lastOfficeExit } : {}),
        ...(lastSessionEnd ? { lastSessionEnd } : {}),
      },
    },
    { upsert: true },
  );

  const p = dateParts(sessionDate, tz);
  const year = p.year;
  const month = p.month + 1;
  const monthStart = dateInTz(year, p.month, 1, 0, 0, 0, tz);
  const nextMonthStart = dateInTz(year, p.month + 1, 1, 0, 0, 0, tz);
  const monthEnd = new Date(nextMonthStart.getTime() - 1);

  const [records, holidays, userDataFull, approvedLeaves] = await Promise.all([
    DailyAttendance.find({ user: userId, date: { $gte: monthStart, $lte: monthEnd } }).lean(),
    Holiday.find({ $or: [{ year }, { isRecurring: true }] }).lean(),
    User.findById(userId).select("weeklySchedule").lean(),
    Leave.find({ user: userId, status: "approved", startDate: { $lte: monthEnd }, endDate: { $gte: monthStart } }).lean(),
  ]);

  const { resolveWeeklySchedule: rws } = await import("@/lib/models/User");
  const sched = rws((userDataFull ?? {}) as Record<string, unknown>);
  const dMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const holidaySet = new Set<string>();
  for (const h of holidays) {
    const hd = new Date(h.date);
    const hMonth = hd.getUTCMonth() + 1;
    const hDay = hd.getUTCDate();
    if (hMonth === month && (h.isRecurring || h.year === year)) holidaySet.add(`${month}-${hDay}`);
  }
  const daysInMonth = new Date(year, month, 0).getDate();
  let expectedWorkingDays = 0;
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month - 1, i);
    if (!sched[dMap[d.getDay()]].isWorking) continue;
    if (holidaySet.has(`${month}-${i}`)) continue;
    expectedWorkingDays++;
  }

  const leaveDaySet = new Set<string>();
  for (const leave of approvedLeaves) {
    const ls = new Date(Math.max(new Date(leave.startDate).getTime(), monthStart.getTime()));
    const le = new Date(Math.min(new Date(leave.endDate).getTime(), monthEnd.getTime()));
    for (let d = new Date(ls); d <= le; d.setDate(d.getDate() + 1)) {
      const dp = dateParts(d, tz);
      leaveDaySet.add(`${dp.month + 1}-${dp.day}`);
    }
  }
  const approvedLeaveDaysCount = leaveDaySet.size;
  const presentDays = records.filter((r) => r.isPresent).length;
  const onTimeArrivals = records.filter((r) => r.isOnTime).length;
  const twm = records.reduce((s, r) => s + r.totalWorkingMinutes, 0);
  const tom = records.reduce((s, r) => s + r.officeMinutes, 0);
  const trm = records.reduce((s, r) => s + r.remoteMinutes, 0);
  const accountedDays = presentDays + approvedLeaveDaysCount;

  await MonthlyAttendanceStats.findOneAndUpdate(
    { user: userId, year, month },
    {
      $set: {
        presentDays,
        absentDays: Math.max(0, expectedWorkingDays - presentDays - approvedLeaveDaysCount),
        approvedLeaveDays: approvedLeaveDaysCount,
        totalWorkingDays: expectedWorkingDays,
        onTimeArrivals,
        lateArrivals: presentDays - onTimeArrivals,
        onTimePercentage: presentDays > 0 ? Math.round((onTimeArrivals / presentDays) * 100) : 0,
        totalWorkingHours: Math.round((twm / 60) * 100) / 100,
        totalOfficeHours: Math.round((tom / 60) * 100) / 100,
        totalRemoteHours: Math.round((trm / 60) * 100) / 100,
        averageDailyHours: presentDays > 0 ? Math.round((twm / presentDays / 60) * 100) / 100 : 0,
        attendancePercentage: expectedWorkingDays > 0 ? Math.round((accountedDays / expectedWorkingDays) * 100) : 0,
      },
    },
    { upsert: true },
  );
}
