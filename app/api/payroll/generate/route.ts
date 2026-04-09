import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getVerifiedSession, isSuperAdmin, hasPermission, getSubordinateUserIds } from "@/lib/permissions";
import User, { resolveWeeklySchedule, type Weekday, type DaySchedule } from "@/lib/models/User";
import DailyAttendance from "@/lib/models/DailyAttendance";
import Leave from "@/lib/models/Leave";
import Payslip from "@/lib/models/Payslip";
import PayrollConfig from "@/lib/models/PayrollConfig";
import Holiday from "@/lib/models/Holiday";
import {
  countHolidayDaysInMonth,
  holidayKeysInMonth,
  leaveWorkingDayKeys,
  monthUtcBounds,
  utcDateKey,
  workingDayKeysInMonth,
} from "@/lib/payrollUtils";

function roundMoney(n: number, dec = 2): number {
  const p = 10 ** dec;
  return Math.round(n * p) / p;
}

function dayExpectedMinutes(day: DaySchedule): number {
  if (!day.isWorking) return 0;
  const [sh, sm] = day.start.split(":").map(Number);
  const [eh, em] = day.end.split(":").map(Number);
  const gross = (eh * 60 + em) - (sh * 60 + sm);
  return Math.max(0, gross - day.breakMinutes);
}

const DAY_OF_WEEK_MAP: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "payroll_generateSlips")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { month?: number; year?: number; baseSalary?: number; salaries?: Record<string, number> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const month = Number(body.month);
  const year = Number(body.year);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "month must be 1–12" }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 1970) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const defaultBase =
    typeof body.baseSalary === "number" && Number.isFinite(body.baseSalary) ? body.baseSalary : 0;
  const salaryOverrides = body.salaries && typeof body.salaries === "object" ? body.salaries : {};

  await connectDB();

  let config = await PayrollConfig.findOne().lean();
  if (!config) {
    const created = await PayrollConfig.create({});
    config = created.toObject();
  }

  const workingDaysPerMonth = config.workingDaysPerMonth ?? 22;
  const lateThreshold = config.lateThresholdMinutes ?? 30;
  const latePenalty = config.latePenaltyPerIncident ?? 0;
  const absencePenaltyPct = config.absencePenaltyPerDay ?? 100;
  const otMult = config.overtimeRateMultiplier ?? 1.5;

  const holidayRows = await Holiday.find({ $or: [{ year }, { isRecurring: true }] }).lean();
  const holidayKeys = holidayKeysInMonth(year, month, holidayRows);
  const workingKeys = workingDayKeysInMonth(year, month, holidayKeys);
  const workingDays = workingKeys.size;
  const holidaysCount = countHolidayDaysInMonth(year, month, holidayRows);

  const { start: monthStart, end: monthEnd } = monthUtcBounds(month, year);

  const employeeFilter: Record<string, unknown> = { isSuperAdmin: { $ne: true }, isActive: true };
  if (!isSuperAdmin(actor)) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    employeeFilter._id = { $in: subordinateIds };
  }

  const employees = await User.find(employeeFilter)
    .select("salary weeklySchedule")
    .lean();

  const results: { userId: string; ok: boolean; error?: string }[] = [];

  for (const emp of employees) {
    const uid = emp._id.toString();
    const override = salaryOverrides[uid];
    const baseSalary =
      (typeof override === "number" && Number.isFinite(override) ? override : undefined) ??
      (typeof emp.salary === "number" && Number.isFinite(emp.salary) ? emp.salary : undefined) ??
      defaultBase;

    const existing = await Payslip.findOne({ user: emp._id, month, year }).lean();
    if (existing && existing.status !== "draft") {
      results.push({ userId: uid, ok: false, error: "Payslip is finalized or paid; skipped" });
      continue;
    }

    const [attendanceRows, leaveRows] = await Promise.all([
      DailyAttendance.find({
        user: emp._id,
        date: { $gte: monthStart, $lte: monthEnd },
      }).lean(),
      Leave.find({
        user: emp._id,
        status: "approved",
        startDate: { $lte: monthEnd },
        endDate: { $gte: monthStart },
      })
        .select("startDate endDate")
        .lean(),
    ]);

    const presentKeys = new Set<string>();
    let lateDays = 0;
    let overtimeMinutesTotal = 0;
    const schedule = resolveWeeklySchedule(emp as unknown as Record<string, unknown>);

    for (const row of attendanceRows) {
      const d = new Date(row.date as Date);
      const key = utcDateKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      if (!workingKeys.has(key)) continue;
      if (row.isPresent) {
        presentKeys.add(key);
        const lateAmount = Math.max(Number(row.lateToOfficeBy) || 0, Number(row.lateBy) || 0);
        if (lateAmount > lateThreshold) lateDays += 1;
        const dayKey = DAY_OF_WEEK_MAP[d.getUTCDay()];
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

    const dailyRate = workingDaysPerMonth > 0 ? baseSalary / workingDaysPerMonth : 0;
    const overtimeHours = overtimeMinutesTotal / 60;
    const hourlyRate = dailyRate > 0 ? dailyRate / 8 : 0;
    const overtimePay = overtimeHours * hourlyRate * otMult;

    const allowances: { label: string; amount: number }[] = [];
    const absenceDeduction = absentDays * dailyRate * (absencePenaltyPct / 100);
    const lateDeduction = lateDays * latePenalty;
    const deductions: { label: string; amount: number }[] = [];
    const absAmt = roundMoney(absenceDeduction);
    const lateAmt = roundMoney(lateDeduction);
    if (absAmt > 0) deductions.push({ label: "Absence penalty", amount: absAmt });
    if (lateAmt > 0) deductions.push({ label: "Late arrival penalty", amount: lateAmt });
    const totalDeductions = roundMoney(absAmt + lateAmt);

    const grossPay = roundMoney(baseSalary + allowances.reduce((s, a) => s + a.amount, 0) + overtimePay);
    const netPay = roundMoney(grossPay - totalDeductions);

    await Payslip.findOneAndUpdate(
      { user: emp._id, month, year },
      {
        $set: {
          baseSalary,
          workingDays,
          presentDays,
          absentDays,
          lateDays,
          holidays: holidaysCount,
          leaveDays,
          overtimeHours: roundMoney(overtimeHours, 4),
          allowances,
          deductions,
          grossPay,
          totalDeductions,
          netPay,
          status: "draft",
          generatedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    results.push({ userId: uid, ok: true });
  }

  return NextResponse.json({ month, year, results });
}
