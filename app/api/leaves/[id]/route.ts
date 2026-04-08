import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import Leave from "@/lib/models/Leave";
import LeaveBalance from "@/lib/models/LeaveBalance";
import Membership from "@/lib/models/Membership";
import type { LeaveStatus, LeaveType } from "@/lib/models/Leave";
import { getVerifiedSession, isAdmin } from "@/lib/permissions";
import { badRequest, forbidden, notFound, unauthorized, isValidId } from "@/lib/helpers";

const BALANCE_TYPES = new Set<LeaveType>(["annual", "sick", "casual"]);

async function directReportUserIds(managerId: string): Promise<string[]> {
  const ids = await Membership.find({ reportsTo: managerId, isActive: true }).distinct("user");
  return ids.map((id) => id.toString());
}

async function ensureLeaveBalance(userId: mongoose.Types.ObjectId, year: number) {
  const doc = await LeaveBalance.findOneAndUpdate(
    { user: userId, year },
    { $setOnInsert: { user: userId, year } },
    { upsert: true, new: true },
  );
  return doc!;
}

async function consumeBalance(leave: {
  user: mongoose.Types.ObjectId;
  type: LeaveType;
  startDate: Date;
  days: number;
}) {
  if (!BALANCE_TYPES.has(leave.type)) return;
  const year = new Date(leave.startDate).getFullYear();
  const bal = await ensureLeaveBalance(leave.user, year);
  const key = leave.type as "annual" | "sick" | "casual";
  bal.used[key] += leave.days;
  bal.markModified("used");
  await bal.save();
}

async function releaseBalance(leave: {
  user: mongoose.Types.ObjectId;
  type: LeaveType;
  startDate: Date;
  days: number;
}) {
  if (!BALANCE_TYPES.has(leave.type)) return;
  const year = new Date(leave.startDate).getFullYear();
  const bal = await LeaveBalance.findOne({ user: leave.user, year });
  if (!bal) return;
  const key = leave.type as "annual" | "sick" | "casual";
  bal.used[key] = Math.max(0, bal.used[key] - leave.days);
  bal.markModified("used");
  await bal.save();
}

function canApproveReject(actor: Parameters<typeof isAdmin>[0]): boolean {
  return isAdmin(actor);
}

async function canViewLeave(
  actor: { id: string; isSuperAdmin: boolean },
  leaveUserId: string,
): Promise<boolean> {
  if (actor.isSuperAdmin) return true;
  if (leaveUserId === actor.id) return true;
  const reports = await directReportUserIds(actor.id);
  return reports.includes(leaveUserId);
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteCtx) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await context.params;
  if (!isValidId(id)) return notFound();

  await connectDB();

  const leave = await Leave.findById(id)
    .populate("user", "about email username userRole")
    .populate("reviewedBy", "about email username")
    .lean();

  if (!leave) return notFound();

  const leaveUserId = leave.user && typeof leave.user === "object" && "_id" in leave.user
    ? String((leave.user as { _id: unknown })._id)
    : String(leave.user);

  if (!(await canViewLeave(actor, leaveUserId))) {
    return forbidden();
  }

  return NextResponse.json(leave);
}

export async function PUT(req: NextRequest, context: RouteCtx) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await context.params;
  if (!isValidId(id)) return notFound();

  let body: { status?: string; reviewNote?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const nextStatus = body.status as LeaveStatus | undefined;
  const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote : "";

  if (!nextStatus || !["pending", "approved", "rejected", "cancelled"].includes(nextStatus)) {
    return badRequest("Invalid status");
  }

  await connectDB();

  const leave = await Leave.findById(id);
  if (!leave) return notFound();

  const leaveUserId = leave.user.toString();

  if (!(await canViewLeave(actor, leaveUserId))) {
    return forbidden();
  }

  const prev = leave.status;

  if (nextStatus === "cancelled") {
    const isOwner = leaveUserId === actor.id;
    if (prev === "pending") {
      if (!actor.isSuperAdmin && !isOwner) {
        return forbidden("Only the requester can cancel a pending leave.");
      }
    } else if (prev === "approved") {
      if (!actor.isSuperAdmin) {
        return forbidden("Only a SuperAdmin can cancel an approved leave.");
      }
      await releaseBalance(leave);
    } else {
      return badRequest("This leave cannot be cancelled.");
    }
    leave.status = "cancelled";
    leave.reviewNote = reviewNote;
    await leave.save();
    const populated = await Leave.findById(leave._id)
      .populate("user", "about email username userRole")
      .populate("reviewedBy", "about email username")
      .lean();
    return NextResponse.json(populated);
  }

  if (nextStatus === "approved") {
    if (!canApproveReject(actor)) {
      return forbidden("Only a Manager or SuperAdmin can approve leave.");
    }
    if (prev !== "pending") {
      return badRequest("Only pending requests can be approved.");
    }
    leave.status = "approved";
    leave.reviewedBy = new mongoose.Types.ObjectId(actor.id) as unknown as typeof leave.reviewedBy;
    leave.reviewedAt = new Date();
    leave.reviewNote = reviewNote;
    await leave.save();
    await consumeBalance(leave);
    const populated = await Leave.findById(leave._id)
      .populate("user", "about email username userRole")
      .populate("reviewedBy", "about email username")
      .lean();
    return NextResponse.json(populated);
  }

  if (nextStatus === "rejected") {
    if (!canApproveReject(actor)) {
      return forbidden("Only a Manager or SuperAdmin can reject leave.");
    }
    if (prev !== "pending" && prev !== "approved") {
      return badRequest("Invalid transition to rejected.");
    }
    if (prev === "approved") {
      await releaseBalance(leave);
    }
    leave.status = "rejected";
    leave.reviewedBy = new mongoose.Types.ObjectId(actor.id) as unknown as typeof leave.reviewedBy;
    leave.reviewedAt = new Date();
    leave.reviewNote = reviewNote;
    await leave.save();
    const populated = await Leave.findById(leave._id)
      .populate("user", "about email username userRole")
      .populate("reviewedBy", "about email username")
      .lean();
    return NextResponse.json(populated);
  }

  if (nextStatus === "pending") {
    return badRequest("Cannot set status back to pending.");
  }

  return badRequest("Unsupported status update");
}

export async function DELETE(_req: NextRequest, context: RouteCtx) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  if (!actor.isSuperAdmin) {
    return forbidden("Only a SuperAdmin can delete leave records.");
  }

  const { id } = await context.params;
  if (!isValidId(id)) return notFound();

  await connectDB();

  const leave = await Leave.findById(id);
  if (!leave) return notFound();

  if (leave.status === "approved" && BALANCE_TYPES.has(leave.type)) {
    await releaseBalance(leave);
  }

  await Leave.deleteOne({ _id: id });
  return NextResponse.json({ ok: true });
}
