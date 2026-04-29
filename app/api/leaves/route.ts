import { NextRequest } from "next/server";
import mongoose from "mongoose";
import Leave, { type LeaveType } from "@/lib/models/Leave";
import "@/lib/models/User";
import { getVerifiedSession, isSuperAdmin, hasPermission, getSubordinateUserIds } from "@/lib/permissions";
import { badRequest, forbidden, unauthorized, ok, created, parseBody } from "@/lib/helpers";
import { LEAVE_TYPES, ensureLeaveBalance, countBusinessDays } from "@/lib/leaveHelpers";

function isDateBeforeToday(date: Date): boolean {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const s = new Date(date);
  s.setHours(0, 0, 0, 0);
  return s < t;
}

async function pendingDaysTotal(userId: string, year: number): Promise<number> {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  const leaves = await Leave.find({
    user: userId,
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

  const url = new URL(req.url);
  const userIdParam = url.searchParams.get("userId");
  const status = url.searchParams.get("status");
  const yearParam = url.searchParams.get("year");
  const monthParam = url.searchParams.get("month");

  const hasTeamPerm = hasPermission(actor, "leaves_viewTeam") || hasPermission(actor, "employees_viewLeaves");

  if (userIdParam && userIdParam !== actor.id) {
    if (!hasTeamPerm) return forbidden("You can only view your own leaves.");
  }

  const subordinateIds = isSuperAdmin(actor) ? null : await getSubordinateUserIds(actor.id);
  const accessibleIds = isSuperAdmin(actor) ? null : new Set<string>([actor.id, ...(subordinateIds ?? [])]);

  if (userIdParam && accessibleIds && !accessibleIds.has(userIdParam)) {
    return forbidden("You can only view leaves for yourself or employees in your hierarchy.");
  }

  const filter: Record<string, unknown> = {};

  if (!isSuperAdmin(actor)) {
    if (userIdParam) {
      filter.user = new mongoose.Types.ObjectId(userIdParam);
    } else if (hasTeamPerm) {
      filter.user = { $in: [...accessibleIds!].map((id) => new mongoose.Types.ObjectId(id)) };
    } else {
      filter.user = new mongoose.Types.ObjectId(actor.id);
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

  return ok(leaves);
}

export async function POST(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const body = await parseBody(req);
  if (body instanceof Response) return body;

  const type = (typeof body.type === "string" && LEAVE_TYPES.includes(body.type as LeaveType))
    ? body.type as LeaveType
    : "leave";
  const isHalfDay = body.isHalfDay === true;
  const startDateRaw = body.startDate ?? body.date;
  const endDateRaw = body.endDate ?? body.date;
  const reason = typeof body.reason === "string" ? body.reason : "";
  const targetUserId = typeof body.userId === "string" ? body.userId : actor.id;

  if (isSuperAdmin(actor) && targetUserId === actor.id) {
    return forbidden("SuperAdmin is exempt from leave tracking.");
  }

  if (!startDateRaw) {
    return badRequest("date (or startDate) is required");
  }

  const startDate = new Date(startDateRaw as string);
  const endDate = new Date((endDateRaw ?? startDateRaw) as string);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return badRequest("Invalid dates");
  }
  if (endDate < startDate) {
    return badRequest("endDate must be on or after startDate");
  }

  let days: number;
  if (isHalfDay) {
    days = 0.5;
  } else {
    days = await countBusinessDays(startDate, endDate);
    if (days < 0.5) {
      return badRequest("Leave must include at least one business day");
    }
  }

  if (targetUserId !== actor.id && !isSuperAdmin(actor)) {
    if (!hasPermission(actor, "leaves_submitOnBehalf")) {
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
  const year = startDate.getFullYear();
  const balance = await ensureLeaveBalance(leaveUserId, year);
  const total = balance.total ?? (balance.annual + balance.sick + balance.casual);
  const used = balance.totalUsed ?? (balance.used.annual + balance.used.sick + balance.used.casual);
  const pendingExtra = await pendingDaysTotal(targetUserId, year);
  const remaining = total - used - pendingExtra;
  if (remaining < days) {
    return badRequest(`Insufficient leave balance (${remaining} remaining, ${days} requested).`);
  }

  const leave = await Leave.create({
    user: leaveUserId,
    type,
    status: "pending",
    startDate,
    endDate,
    days,
    isHalfDay,
    reason,
    createdBy: new mongoose.Types.ObjectId(actor.id),
    isPastCorrection,
  });

  const populated = await Leave.findById(leave._id)
    .populate("user", "about email username")
    .populate("reviewedBy", "about email username")
    .lean();

  return created(populated);
}
