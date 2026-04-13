import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getVerifiedSession, isSuperAdmin, hasPermission, getSubordinateUserIds } from "@/lib/permissions";
import User, { resolveWeeklySchedule, type Weekday, type DaySchedule } from "@/lib/models/User";
import Membership from "@/lib/models/Membership";
import Department from "@/lib/models/Department";
import DailyAttendance from "@/lib/models/DailyAttendance";
import Leave from "@/lib/models/Leave";
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
import { unauthorized, forbidden, badRequest } from "@/lib/helpers";

function roundMoney(n: number, dec = 2): number {
  const p = 10 ** dec;
  return Math.round(n * p) / p;
}

function dayExpectedMinutes(day: DaySchedule): number {
  if (!day.isWorking) return 0;
  const [sh, sm] = day.start.split(":").map(Number);
  const [eh, em] = day.end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm) - day.breakMinutes);
}

const DOW: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export async function GET(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "payroll_viewTeam")) return forbidden();

  const url = new URL(req.url);
  const now = new Date();
  const month = Number(url.searchParams.get("month") ?? now.getMonth() + 1);
  const year = Number(url.searchParams.get("year") ?? now.getFullYear());
  if (!Number.isInteger(month) || month < 1 || month > 12) return badRequest("Invalid month");
  if (!Number.isInteger(year) || year < 1970) return badRequest("Invalid year");

  await connectDB();

  const targetIds = isSuperAdmin(actor)
    ? (await User.find({ isActive: true, isSuperAdmin: { $ne: true } }).select("_id").lean()).map((u) => String(u._id))
    : await getSubordinateUserIds(actor.id);

  if (!targetIds.length) return NextResponse.json([]);

  const employees = await User.find({ _id: { $in: targetIds }, isActive: true })
    .select("about email salary weeklySchedule")
    .lean();

  const [memberships, departments] = await Promise.all([
    Membership.find({ user: { $in: targetIds }, isActive: true }).select("user department").lean(),
    Department.find({ isActive: true }).select("_id title").lean(),
  ]);
  const deptMap = new Map(departments.map((d) => [String(d._id), d.title]));
  const userDeptMap = new Map<string, string>();
  for (const m of memberships) {
    const uid = String(m.user);
    if (!userDeptMap.has(uid)) {
      const t = deptMap.get(String(m.department));
      if (t) userDeptMap.set(uid, t);
    }
  }

  let config = await PayrollConfig.findOne().lean();
  if (!config) config = (await PayrollConfig.create({})).toObject();

  const absencePenaltyPct = config.absencePenaltyPerDay ?? 100;
  const otMult = config.overtimeRateMultiplier ?? 1.5;
  const latePenaltyTiers: ILatePenaltyTier[] = Array.isArray(config.latePenaltyTiers) && config.latePenaltyTiers.length > 0
    ? [...config.latePenaltyTiers].sort((a, b) => b.minutes - a.minutes)
    : [{ minutes: 60, penaltyPercent: 100 }, { minutes: 30, penaltyPercent: 50 }, { minutes: 15, penaltyPercent: 0 }];

  const holidayRows = await Holiday.find({ $or: [{ year }, { isRecurring: true }] }).lean();
  const holidayKeys = holidayKeysInMonth(year, month, holidayRows);
  const workingKeys = workingDayKeysInMonth(year, month, holidayKeys);
  const workingDays = workingKeys.size;
  const holidays = countHolidayDaysInMonth(year, month, holidayRows);
  const { start: monthStart, end: monthEnd } = monthUtcBounds(month, year);

  const [allAttendance, allLeaves] = await Promise.all([
    DailyAttendance.find({ user: { $in: targetIds }, date: { $gte: monthStart, $lte: monthEnd } }).lean(),
    Leave.find({ user: { $in: targetIds }, status: "approved", startDate: { $lte: monthEnd }, endDate: { $gte: monthStart } }).select("user startDate endDate").lean(),
  ]);

  const attByUser = new Map<string, typeof allAttendance>();
  for (const r of allAttendance) {
    const uid = String(r.user);
    if (!attByUser.has(uid)) attByUser.set(uid, []);
    attByUser.get(uid)!.push(r);
  }
  const leavesByUser = new Map<string, typeof allLeaves>();
  for (const l of allLeaves) {
    const uid = String(l.user);
    if (!leavesByUser.has(uid)) leavesByUser.set(uid, []);
    leavesByUser.get(uid)!.push(l);
  }

  const result = employees.map((emp) => {
    const uid = String(emp._id);
    const baseSalary = typeof emp.salary === "number" && Number.isFinite(emp.salary) ? emp.salary : 0;
    const dailyRate = workingDays > 0 ? baseSalary / workingDays : 0;
    const schedule = resolveWeeklySchedule(emp as unknown as Record<string, unknown>);

    const rows = attByUser.get(uid) ?? [];
    const presentKeys = new Set<string>();
    let lateDays = 0;
    let overtimeMin = 0;
    let latePenalty = 0;

    for (const row of rows) {
      const d = new Date(row.date as Date);
      const key = utcDateKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      if (!workingKeys.has(key)) continue;
      if (row.isPresent) {
        presentKeys.add(key);
        const late = Math.max(Number(row.lateToOfficeBy) || 0, Number(row.lateBy) || 0);
        if (late > 0) {
          const tier = latePenaltyTiers.find((t) => late >= t.minutes);
          if (tier && tier.penaltyPercent > 0) {
            lateDays++;
            latePenalty += dailyRate * (tier.penaltyPercent / 100);
          }
        }
        const dayKey = DOW[d.getUTCDay()];
        const expected = dayExpectedMinutes(schedule[dayKey]);
        overtimeMin += Math.max(0, (Number(row.totalWorkingMinutes) || 0) - expected);
      }
    }

    const leaveKeys = leaveWorkingDayKeys(year, month, workingKeys, leavesByUser.get(uid) ?? []);
    const presentDays = presentKeys.size;
    const leaveDays = leaveKeys.size;
    let absentDays = 0;
    for (const k of workingKeys) { if (!presentKeys.has(k) && !leaveKeys.has(k)) absentDays++; }

    const overtimeHours = roundMoney(overtimeMin / 60, 1);
    const hourlyRate = dailyRate > 0 ? dailyRate / 8 : 0;
    const overtimePay = (overtimeMin / 60) * hourlyRate * otMult;
    const absenceDed = roundMoney(absentDays * dailyRate * (absencePenaltyPct / 100));
    const lateDed = roundMoney(latePenalty);
    const totalDeductions = roundMoney(absenceDed + lateDed);
    const grossPay = roundMoney(baseSalary + overtimePay);
    const netPay = roundMoney(grossPay - totalDeductions);

    const name = `${emp.about?.firstName ?? ""} ${emp.about?.lastName ?? ""}`.trim() || emp.email || "—";
    const attendancePct = workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 0;

    return {
      _id: uid,
      name,
      email: emp.email,
      department: userDeptMap.get(uid) ?? null,
      salary: baseSalary,
      workingDays,
      presentDays,
      absentDays,
      lateDays,
      leaveDays,
      holidays,
      overtimeHours,
      attendancePct,
      grossPay,
      absenceDeduction: absenceDed,
      lateDeduction: lateDed,
      totalDeductions,
      netPay,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    month,
    year,
    generatedAt: new Date().toISOString(),
    totalEmployees: result.length,
    totalNetPay: roundMoney(result.reduce((s, r) => s + r.netPay, 0)),
    totalGrossPay: roundMoney(result.reduce((s, r) => s + r.grossPay, 0)),
    totalDeductions: roundMoney(result.reduce((s, r) => s + r.totalDeductions, 0)),
    workingDays,
    holidays,
    employees: result,
  });
}
