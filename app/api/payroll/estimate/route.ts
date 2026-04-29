import { NextRequest } from "next/server";
import { getVerifiedSession, isSuperAdmin, hasPermission, getSubordinateUserIds } from "@/lib/permissions";
import User, { resolveWeeklySchedule } from "@/lib/models/User";
import { roundMoney, dayExpectedMinutes, DAY_OF_WEEK } from "@/lib/payrollMath";
import DailyAttendance from "@/lib/models/DailyAttendance";
import Leave from "@/lib/models/Leave";
import Payslip from "@/lib/models/Payslip";
import PayrollConfig, { type ILatePenaltyTier } from "@/lib/models/PayrollConfig";
import Holiday from "@/lib/models/Holiday";
import {
  countHolidayDaysInMonth,
  holidayKeysInMonth,
  leaveWorkingDayKeys,
  monthUtcBounds,
  utcDateKey,
  workingDayKeysInMonth,
} from "@/lib/payrollUtils";
import { unauthorized, badRequest, forbidden, isValidId, ok } from "@/lib/helpers";


export async function GET(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const url = new URL(req.url);
  const userIdParam = url.searchParams.get("userId");
  const monthParam = url.searchParams.get("month");
  const yearParam = url.searchParams.get("year");

  const now = new Date();
  const month = monthParam ? Number(monthParam) : now.getMonth() + 1;
  const year = yearParam ? Number(yearParam) : now.getFullYear();

  if (!Number.isInteger(month) || month < 1 || month > 12) return badRequest("Invalid month");
  if (!Number.isInteger(year) || year < 1970) return badRequest("Invalid year");

  const targetUserId = userIdParam ?? actor.id;
  if (!isValidId(targetUserId)) return badRequest("Invalid userId");

  const isSelf = targetUserId === actor.id;

  if (isSuperAdmin(actor) && isSelf) {
    return ok({ exempt: true, message: "SuperAdmin is exempt from payroll tracking." });
  }

  if (!isSelf) {
    if (!hasPermission(actor, "payroll_viewTeam") && !hasPermission(actor, "employees_viewPayroll")) return forbidden();
    if (!isSuperAdmin(actor)) {
      const subs = await getSubordinateUserIds(actor.id);
      if (!subs.includes(targetUserId)) return forbidden();
    }
  }

  const emp = await User.findById(targetUserId).select("salary weeklySchedule about.firstName about.lastName email").lean();
  if (!emp) return badRequest("Employee not found");

  let config = await PayrollConfig.findOne().lean();
  if (!config) {
    const created = await PayrollConfig.create({});
    config = created.toObject();
  }

  const baseSalary = typeof emp.salary === "number" && Number.isFinite(emp.salary) ? emp.salary : 0;
  const absencePenaltyPct = config.absencePenaltyPerDay ?? 100;
  const otMult = config.overtimeRateMultiplier ?? 1.5;
  const latePenaltyTiers: ILatePenaltyTier[] = Array.isArray(config.latePenaltyTiers) && config.latePenaltyTiers.length > 0
    ? [...config.latePenaltyTiers].sort((a, b) => b.minutes - a.minutes)
    : [
        { minutes: 60, penaltyPercent: 100 },
        { minutes: 30, penaltyPercent: 50 },
        { minutes: 15, penaltyPercent: 0 },
      ];

  const holidayRows = await Holiday.find({ $or: [{ year }, { isRecurring: true }] }).lean();
  const holidayKeys = holidayKeysInMonth(year, month, holidayRows);
  const workingKeys = workingDayKeysInMonth(year, month, holidayKeys);
  const workingDays = workingKeys.size;
  const holidaysCount = countHolidayDaysInMonth(year, month, holidayRows);

  const { start: monthStart, end: monthEnd } = monthUtcBounds(month, year);

  const [attendanceRows, leaveRows] = await Promise.all([
    DailyAttendance.find({
      user: targetUserId,
      date: { $gte: monthStart, $lte: monthEnd },
    }).lean(),
    Leave.find({
      user: targetUserId,
      status: "approved",
      startDate: { $lte: monthEnd },
      endDate: { $gte: monthStart },
    }).select("startDate endDate").lean(),
  ]);

  const wantDetail = url.searchParams.get("detail") === "true";

  const presentKeys = new Set<string>();
  let lateDays = 0;
  let overtimeMinutesTotal = 0;
  let tieredLatePenaltyTotal = 0;
  const schedule = resolveWeeklySchedule(emp as unknown as Record<string, unknown>);
  const dailyRate = workingDays > 0 ? baseSalary / workingDays : 0;

  const attByKey = new Map<string, typeof attendanceRows[number]>();
  for (const row of attendanceRows) {
    const d = new Date(row.date as Date);
    const key = utcDateKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    attByKey.set(key, row);
    if (!workingKeys.has(key)) continue;
    if (row.isPresent) {
      presentKeys.add(key);
      const lateMinutes = Math.max(Number(row.lateToOfficeBy) || 0, Number(row.lateBy) || 0);
      if (lateMinutes > 0) {
        const matchingTier = latePenaltyTiers.find((t) => lateMinutes >= t.minutes);
        if (matchingTier && matchingTier.penaltyPercent > 0) {
          lateDays += 1;
          tieredLatePenaltyTotal += dailyRate * (matchingTier.penaltyPercent / 100);
        }
      }
      const dayKey = DAY_OF_WEEK[d.getUTCDay()];
      const expectedMin = dayExpectedMinutes(schedule[dayKey]);
      const tw = Number(row.totalWorkingMinutes) || 0;
      overtimeMinutesTotal += Math.max(0, tw - expectedMin);
    }
  }

  const leaveKeys = leaveWorkingDayKeys(year, month, workingKeys, leaveRows);
  const presentDays = presentKeys.size;
  const leaveDays = leaveKeys.size;
  let absentDays = 0;
  for (const k of workingKeys) {
    if (!presentKeys.has(k) && !leaveKeys.has(k)) absentDays += 1;
  }

  const overtimeHours = overtimeMinutesTotal / 60;
  const hourlyRate = dailyRate > 0 ? dailyRate / 8 : 0;
  const overtimePay = overtimeHours * hourlyRate * otMult;

  const absenceDeduction = roundMoney(absentDays * dailyRate * (absencePenaltyPct / 100));
  const lateDeduction = roundMoney(tieredLatePenaltyTotal);
  const totalDeductions = roundMoney(absenceDeduction + lateDeduction);

  const grossPay = roundMoney(baseSalary + overtimePay);
  const netPay = roundMoney(grossPay - totalDeductions);

  const ytdSlips = await Payslip.find({
    user: targetUserId,
    year,
    status: { $in: ["finalized", "paid"] },
  }).select("month grossPay totalDeductions netPay").lean();

  const ytd = {
    earned: ytdSlips.reduce((s, p) => s + p.grossPay, 0),
    deductions: ytdSlips.reduce((s, p) => s + p.totalDeductions, 0),
    netPay: ytdSlips.reduce((s, p) => s + p.netPay, 0),
    months: ytdSlips.length,
  };

  let dailyBreakdown: unknown[] | undefined;
  if (wantDetail) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();
    dailyBreakdown = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(Date.UTC(year, month - 1, d, 12));
      const dow = dateObj.getUTCDay();
      const key = utcDateKey(year, month - 1, d);
      const isWeekend = dow === 0 || dow === 6;
      const isHoliday = holidayKeys.has(key);
      const isLeave = leaveKeys.has(key);
      const isWorkDay = workingKeys.has(key);
      const isFuture = dateObj > today;
      const att = attByKey.get(key);

      let status: string;
      if (isWeekend) status = "weekend";
      else if (isHoliday) status = "holiday";
      else if (isLeave) status = "leave";
      else if (isFuture) status = "future";
      else if (att?.isPresent) status = att.isOnTime ? "present" : "late";
      else if (isWorkDay && !isFuture) status = "absent";
      else status = "off";

      const workingMinutes = att?.isPresent ? (Number(att.totalWorkingMinutes) || 0) : 0;
      const officeMinutes = att?.isPresent ? (Number((att as Record<string, unknown>).officeMinutes) || 0) : 0;
      const remoteMinutes = att?.isPresent ? (Number((att as Record<string, unknown>).remoteMinutes) || 0) : 0;
      const lateMinutes = att?.isPresent ? Math.max(Number(att.lateToOfficeBy) || 0, Number(att.lateBy) || 0) : 0;

      let dayDeduction = 0;
      if (status === "absent" && isWorkDay) {
        dayDeduction = roundMoney(dailyRate * (absencePenaltyPct / 100));
      } else if (status === "late" && lateMinutes > 0) {
        const tier = latePenaltyTiers.find((t) => lateMinutes >= t.minutes);
        if (tier && tier.penaltyPercent > 0) {
          dayDeduction = roundMoney(dailyRate * (tier.penaltyPercent / 100));
        }
      }

      const dayOfWeekName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow];

      dailyBreakdown.push({
        day: d,
        dayOfWeek: dayOfWeekName,
        date: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        status,
        workingMinutes,
        officeMinutes,
        remoteMinutes,
        lateMinutes,
        deduction: dayDeduction,
        firstStart: att?.firstOfficeEntry ?? null,
        lastEnd: att?.lastOfficeExit ?? null,
      });
    }
  }

  const result: Record<string, unknown> = {
    month,
    year,
    baseSalary,
    workingDays,
    presentDays,
    absentDays,
    lateDays,
    holidays: holidaysCount,
    leaveDays,
    overtimeHours: roundMoney(overtimeHours, 4),
    grossPay,
    totalDeductions,
    netPay,
    deductions: [
      ...(absenceDeduction > 0 ? [{ label: "Absence penalty", amount: absenceDeduction }] : []),
      ...(lateDeduction > 0 ? [{ label: "Late arrival penalty", amount: lateDeduction }] : []),
    ],
    ytd,
  };
  if (dailyBreakdown) result.dailyBreakdown = dailyBreakdown;

  return ok(result);
}
