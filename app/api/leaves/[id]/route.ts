import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import Leave from "@/lib/models/Leave";
import LeaveBalance from "@/lib/models/LeaveBalance";
import "@/lib/models/User";
import type { LeaveStatus, LeaveType } from "@/lib/models/Leave";
import { getVerifiedSession, isSuperAdmin, hasPermission, getSubordinateUserIds } from "@/lib/permissions";
import { badRequest, forbidden, notFound, unauthorized, isValidId } from "@/lib/helpers";

const BALANCE_TYPES = new Set<LeaveType>(["annual", "sick", "casual"]);

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

async function isInActorHierarchy(actor: Awaited<ReturnType<typeof getVerifiedSession>>, targetUserId: string): Promise<boolean> {
  if (!actor) return false;
  if (actor.isSuperAdmin) return true;
  if (targetUserId === actor.id) return true;
  const subordinateIds = await getSubordinateUserIds(actor.id);
  return subordinateIds.includes(targetUserId);
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteCtx) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await context.params;
  if (!isValidId(id)) return notFound();

  await connectDB();

  const leave = await Leave.findById(id)
    .populate("user", "about email username")
    .populate("reviewedBy", "about email username")
    .lean();

  if (!leave) return notFound();

  const leaveUserId = leave.user && typeof leave.user === "object" && "_id" in leave.user
    ? String((leave.user as { _id: unknown })._id)
    : String(leave.user);

  if (!(await isInActorHierarchy(actor, leaveUserId))) {
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

  if (!(await isInActorHierarchy(actor, leaveUserId))) {
    return forbidden();
  }

  const prev = leave.status;

  if (nextStatus === "cancelled") {
    const isOwner = leaveUserId === actor.id;
    if (prev === "pending") {
      if (!isSuperAdmin(actor) && !isOwner) {
        return forbidden("Only the requester can cancel a pending leave.");
      }
    } else if (prev === "approved") {
      if (!isSuperAdmin(actor)) {
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
      .populate("user", "about email username")
      .populate("reviewedBy", "about email username")
      .lean();
    return NextResponse.json(populated);
  }

  if (nextStatus === "approved" || nextStatus === "rejected") {
    if (!hasPermission(actor, "leaves_approve")) {
      return forbidden("You don't have permission to approve or reject leaves.");
    }
  }

  if (nextStatus === "approved") {
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
      .populate("user", "about email username")
      .populate("reviewedBy", "about email username")
      .lean();
    return NextResponse.json(populated);
  }

  if (nextStatus === "rejected") {
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
      .populate("user", "about email username")
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

  if (!hasPermission(actor, "leaves_editPast")) {
    return forbidden("You don't have permission to delete leave records.");
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
