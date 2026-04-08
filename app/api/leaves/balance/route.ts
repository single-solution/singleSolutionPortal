import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import LeaveBalance from "@/lib/models/LeaveBalance";
import Membership from "@/lib/models/Membership";
import { getVerifiedSession, hasPermission } from "@/lib/permissions";
import { badRequest, forbidden, unauthorized, isValidId } from "@/lib/helpers";

async function ensureLeaveBalance(userId: mongoose.Types.ObjectId, year: number) {
  const doc = await LeaveBalance.findOneAndUpdate(
    { user: userId, year },
    { $setOnInsert: { user: userId, year } },
    { upsert: true, new: true },
  );
  return doc!;
}

async function canViewBalance(actor: { id: string; isSuperAdmin: boolean }, targetUserId: string): Promise<boolean> {
  if (actor.isSuperAdmin) return true;
  if (targetUserId === actor.id) return true;
  const reports = await Membership.find({ reportsTo: actor.id, isActive: true }).distinct("user");
  return reports.some((id) => id.toString() === targetUserId);
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

  if (!(await canViewBalance(actor, targetUserId))) {
    return forbidden("You can only view leave balance for yourself or your direct reports.");
  }

  const bal = await ensureLeaveBalance(new mongoose.Types.ObjectId(targetUserId), year);

  return NextResponse.json({
    _id: bal._id,
    user: bal.user,
    year: bal.year,
    annual: bal.annual,
    sick: bal.sick,
    casual: bal.casual,
    used: bal.used,
    remaining: {
      annual: Math.max(0, bal.annual - bal.used.annual),
      sick: Math.max(0, bal.sick - bal.used.sick),
      casual: Math.max(0, bal.casual - bal.used.casual),
    },
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

  const annual = body.annual != null ? Number(body.annual) : undefined;
  const sick = body.sick != null ? Number(body.sick) : undefined;
  const casual = body.casual != null ? Number(body.casual) : undefined;

  if (
    (annual != null && (Number.isNaN(annual) || annual < 0)) ||
    (sick != null && (Number.isNaN(sick) || sick < 0)) ||
    (casual != null && (Number.isNaN(casual) || casual < 0))
  ) {
    return badRequest("Allocations must be non-negative numbers");
  }

  await connectDB();

  const oid = new mongoose.Types.ObjectId(userId);
  const update: Record<string, number> = {};
  if (annual != null) update.annual = annual;
  if (sick != null) update.sick = sick;
  if (casual != null) update.casual = casual;

  if (Object.keys(update).length === 0) {
    return badRequest("Provide at least one of annual, sick, casual");
  }

  const bal = await LeaveBalance.findOneAndUpdate(
    { user: oid, year },
    { $set: update, $setOnInsert: { user: oid, year } },
    { upsert: true, new: true },
  );

  return NextResponse.json(bal);
}
