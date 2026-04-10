import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import LeaveBalance from "@/lib/models/LeaveBalance";
import { getVerifiedSession, isSuperAdmin, hasPermission, getSubordinateUserIds } from "@/lib/permissions";
import { badRequest, forbidden, unauthorized, isValidId } from "@/lib/helpers";

async function ensureLeaveBalance(userId: mongoose.Types.ObjectId, year: number) {
  const doc = await LeaveBalance.findOneAndUpdate(
    { user: userId, year },
    { $setOnInsert: { user: userId, year } },
    { upsert: true, new: true },
  );
  return doc!;
}

export async function GET(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const url = new URL(req.url);
  const userIdParam = url.searchParams.get("userId");
  const yearParam = url.searchParams.get("year");
  const now = new Date();
  const year = yearParam != null ? parseInt(yearParam, 10) : now.getFullYear();
  if (Number.isNaN(year)) {
    return badRequest("Invalid year");
  }

  const targetUserId = userIdParam ?? actor.id;
  if (!isValidId(targetUserId)) {
    return badRequest("Invalid userId");
  }

  await connectDB();

  if (targetUserId !== actor.id) {
    if (!hasPermission(actor, "leaves_viewTeam")) {
      return forbidden("You don't have permission to view others' leave balances.");
    }
    if (!isSuperAdmin(actor)) {
      const subordinateIds = await getSubordinateUserIds(actor.id);
      if (!subordinateIds.includes(targetUserId)) {
        return forbidden("You can only view leave balance for yourself or employees in your hierarchy.");
      }
    }
  }

  const bal = await ensureLeaveBalance(new mongoose.Types.ObjectId(targetUserId), year);

  const total = bal.total ?? (bal.annual + bal.sick + bal.casual);
  const used = bal.totalUsed ?? (bal.used.annual + bal.used.sick + bal.used.casual);
  const remaining = Math.max(0, total - used);

  return NextResponse.json({
    _id: bal._id,
    user: bal.user,
    year: bal.year,
    total,
    used,
    remaining,
    createdAt: bal.createdAt,
    updatedAt: bal.updatedAt,
  });
}

export async function PUT(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  if (!hasPermission(actor, "leaves_manageBulk")) {
    return forbidden("You don't have permission to update leave allocations.");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  const year = typeof body.year === "number" ? body.year : parseInt(String(body.year ?? ""), 10);
  if (!isValidId(userId) || Number.isNaN(year)) {
    return badRequest("userId and year are required");
  }

  const total = body.total != null ? Number(body.total) : undefined;
  if (total != null && (Number.isNaN(total) || total < 0)) {
    return badRequest("total must be a non-negative number");
  }

  await connectDB();

  if (!isSuperAdmin(actor)) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    if (!subordinateIds.includes(userId)) {
      return forbidden("Can only update leave allocations for employees in your hierarchy.");
    }
  }

  const oid = new mongoose.Types.ObjectId(userId);
  const update: Record<string, number> = {};
  if (total != null) update.total = total;

  if (Object.keys(update).length === 0) {
    return badRequest("Provide total allocation");
  }

  const bal = await LeaveBalance.findOneAndUpdate(
    { user: oid, year },
    { $set: update, $setOnInsert: { user: oid, year } },
    { upsert: true, new: true },
  );

  const totalVal = bal.total ?? (bal.annual + bal.sick + bal.casual);
  const usedVal = bal.totalUsed ?? (bal.used.annual + bal.used.sick + bal.used.casual);

  return NextResponse.json({
    _id: bal._id,
    user: bal.user,
    year: bal.year,
    total: totalVal,
    used: usedVal,
    remaining: Math.max(0, totalVal - usedVal),
  });
}
