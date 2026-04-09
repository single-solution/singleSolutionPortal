import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import Leave from "@/lib/models/Leave";
import LeaveBalance from "@/lib/models/LeaveBalance";
import Holiday from "@/lib/models/Holiday";
import "@/lib/models/User";
import type { LeaveType } from "@/lib/models/Leave";
import { getVerifiedSession, isSuperAdmin, hasPermission, getSubordinateUserIds } from "@/lib/permissions";
import { badRequest, forbidden, unauthorized } from "@/lib/helpers";

const LEAVE_TYPES: LeaveType[] = [
  "annual",
  "sick",
  "casual",
  "unpaid",
  "maternity",
  "paternity",
  "bereavement",
  "other",
];

const BALANCE_TYPES = new Set<LeaveType>(["annual", "sick", "casual"]);

export async function countBusinessDays(start: Date, end: Date): Promise<number> {
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  if (e < s) return 0;

  const years = new Set<number>();
  const tmp = new Date(s);
  while (tmp <= e) {
    years.add(tmp.getFullYear());
    tmp.setDate(tmp.getDate() + 1);
  }

  const yearFilters = [...years].map((y) => ({ year: y }));
  const holidays = await Holiday.find({
    $or: [...yearFilters, { isRecurring: true }],
  }).lean();

  const holidayDateKeys = new Set<string>();
  for (const y of years) {
    for (const h of holidays) {
      const hd = new Date(h.date);
      const hm = hd.getUTCMonth();
      const hday = hd.getUTCDate();
      if (h.isRecurring || h.year === y) {
        holidayDateKeys.add(`${y}-${hm}-${hday}`);
      }
    }
  }

  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      const key = `${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`;
      if (!holidayDateKeys.has(key)) count += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function isDateBeforeToday(date: Date): boolean {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const s = new Date(date);
  s.setHours(0, 0, 0, 0);
  return s < t;
}

async function ensureLeaveBalance(userId: mongoose.Types.ObjectId, year: number) {
  const doc = await LeaveBalance.findOneAndUpdate(
    { user: userId, year },
    { $setOnInsert: { user: userId, year } },
    { upsert: true, new: true },
  );
  return doc!;
}

async function pendingDaysForType(userId: string, type: LeaveType, year: number): Promise<number> {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  const leaves = await Leave.find({
    user: userId,
    type,
    status: "pending",
    startDate: { $lte: yearEnd },
    endDate: { $gte: yearStart },
  })
    .select("days")
    .lean();
  return leaves.reduce((sum, l) => sum + (l.days ?? 0), 0);
}

function overlapYearFilter(year: number): { startDate: { $lte: Date }; endDate: { $gte: Date } } {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  return { startDate: { $lte: yearEnd }, endDate: { $gte: yearStart } };
}

function overlapMonthFilter(year: number, month: number): { startDate: { $lte: Date }; endDate: { $gte: Date } } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { startDate: { $lte: end }, endDate: { $gte: start } };
}

export async function GET(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  const url = new URL(req.url);
  const userIdParam = url.searchParams.get("userId");
  const status = url.searchParams.get("status");
  const yearParam = url.searchParams.get("year");
  const monthParam = url.searchParams.get("month");

  const subordinateIds = isSuperAdmin(actor) ? null : await getSubordinateUserIds(actor.id);
  const accessibleIds = isSuperAdmin(actor) ? null : new Set<string>([actor.id, ...(subordinateIds ?? [])]);

  if (userIdParam && accessibleIds && !accessibleIds.has(userIdParam)) {
    return forbidden("You can only view leaves for yourself or employees in your hierarchy.");
  }

  const filter: Record<string, unknown> = {};

  if (!isSuperAdmin(actor)) {
    if (userIdParam) {
      filter.user = new mongoose.Types.ObjectId(userIdParam);
    } else {
      filter.user = { $in: [...accessibleIds!].map((id) => new mongoose.Types.ObjectId(id)) };
    }
  } else if (userIdParam) {
    filter.user = new mongoose.Types.ObjectId(userIdParam);
  }

  if (status && ["pending", "approved", "rejected", "cancelled"].includes(status)) {
    filter.status = status;
  }

  const now = new Date();

  if (monthParam != null) {
    const month = parseInt(monthParam, 10);
    if (Number.isNaN(month) || month < 1 || month > 12) {
      return badRequest("Invalid month");
    }
    const y = yearParam != null ? parseInt(yearParam, 10) : now.getFullYear();
    if (yearParam != null && Number.isNaN(y)) {
      return badRequest("Invalid year");
    }
    Object.assign(filter, overlapMonthFilter(y, month));
  } else if (yearParam != null) {
    const y = parseInt(yearParam, 10);
    if (Number.isNaN(y)) {
      return badRequest("Invalid year");
    }
    Object.assign(filter, overlapYearFilter(y));
  }

  const leaves = await Leave.find(filter)
    .populate("user", "about email username")
    .populate("reviewedBy", "about email username")
    .sort({ startDate: -1 })
    .lean();

  return NextResponse.json(leaves);
}

export async function POST(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const type = body.type as string;
  const startDateRaw = body.startDate;
  const endDateRaw = body.endDate;
  const reason = typeof body.reason === "string" ? body.reason : "";
  const targetUserId = typeof body.userId === "string" ? body.userId : actor.id;

  if (!LEAVE_TYPES.includes(type as LeaveType)) {
    return badRequest("Invalid leave type");
  }

  if (!startDateRaw || !endDateRaw) {
    return badRequest("startDate and endDate are required");
  }

  const startDate = new Date(startDateRaw as string);
  const endDate = new Date(endDateRaw as string);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return badRequest("Invalid dates");
  }
  if (endDate < startDate) {
    return badRequest("endDate must be on or after startDate");
  }

  const days = await countBusinessDays(startDate, endDate);
  if (days < 0.5) {
    return badRequest("Leave must include at least one business day");
  }

  if (targetUserId !== actor.id && !isSuperAdmin(actor)) {
    if (!hasPermission(actor, "leaves_approve")) {
      return forbidden("You can only create leave requests for yourself.");
    }
    const subordinateIds = await getSubordinateUserIds(actor.id);
    if (!subordinateIds.includes(targetUserId)) {
      return forbidden("You can only create leave on behalf of employees in your hierarchy.");
    }
  }

  const past = isDateBeforeToday(startDate);
  let isPastCorrection = false;
  if (past) {
    if (!isSuperAdmin(actor) && !hasPermission(actor, "leaves_approve")) {
      return forbidden("Past-dated leave requests require leave approval permission.");
    }
    isPastCorrection = true;
  }

  const leaveUserId = new mongoose.Types.ObjectId(targetUserId);

  if (BALANCE_TYPES.has(type as LeaveType)) {
    const year = startDate.getFullYear();
    const balance = await ensureLeaveBalance(leaveUserId, year);
    const t = type as "annual" | "sick" | "casual";
    const allocated = balance[t];
    const used = balance.used[t];
    const pendingExtra = await pendingDaysForType(targetUserId, t, year);
    const remaining = allocated - used - pendingExtra;
    if (remaining < days) {
      return NextResponse.json(
        { error: `Insufficient ${t} leave balance for this request.` },
        { status: 400 },
      );
    }
  }

  const leave = await Leave.create({
    user: leaveUserId,
    type: type as LeaveType,
    status: "pending",
    startDate,
    endDate,
    days,
    reason,
    isPastCorrection,
  });

  const populated = await Leave.findById(leave._id)
    .populate("user", "about email username")
    .populate("reviewedBy", "about email username")
    .lean();

  return NextResponse.json(populated, { status: 201 });
}
