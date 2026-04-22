import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import AttendanceCorrection from "@/lib/models/AttendanceCorrection";
import ActivitySession from "@/lib/models/ActivitySession";
import DailyAttendance from "@/lib/models/DailyAttendance";
import User from "@/lib/models/User";
import { getVerifiedSession, hasPermission, getSubordinateUserIds } from "@/lib/permissions";
import { unauthorized, badRequest, ok, forbidden, unprocessable } from "@/lib/helpers";
import { emitSocket } from "@/lib/socket";
import { logActivity } from "@/lib/activityLogger";
import { startOfDay } from "@/lib/dayBoundary";
import { getTz } from "@/lib/tz";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  await connectDB();

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const userId = url.searchParams.get("userId");

  const filter: Record<string, unknown> = {};

  if (userId) {
    if (userId !== actor.id && !actor.isSuperAdmin) {
      if (!hasPermission(actor, "attendance_viewTeam")) return forbidden("Not authorized");
      const subs = await getSubordinateUserIds(actor.id);
      if (!subs.includes(userId)) return forbidden("Not authorized");
    }
    filter.user = userId;
  } else if (!actor.isSuperAdmin && !hasPermission(actor, "attendance_viewTeam")) {
    filter.user = actor.id;
  }

  if (status) filter.status = status;

  const corrections = await AttendanceCorrection.find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("user", "about email")
    .populate("reviewedBy", "about email")
    .lean();

  return ok(corrections);
}

export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  await connectDB();

  let body: {
    date?: string;
    type?: string;
    requestedStart?: string;
    requestedEnd?: string;
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return unprocessable("Invalid JSON body");
  }

  if (!body.date || !body.type || !body.reason) {
    return badRequest("date, type, and reason are required");
  }

  const validTypes = ["missed_checkin", "missed_checkout", "wrong_time", "other"];
  if (!validTypes.includes(body.type)) {
    return badRequest(`type must be one of: ${validTypes.join(", ")}`);
  }

  const correction = await AttendanceCorrection.create({
    user: actor.id,
    date: new Date(body.date),
    type: body.type,
    requestedStart: body.requestedStart ? new Date(body.requestedStart) : undefined,
    requestedEnd: body.requestedEnd ? new Date(body.requestedEnd) : undefined,
    reason: body.reason,
  });

  const employee = await User.findById(actor.id).select("about email").lean();
  const empName = `${employee?.about?.firstName ?? ""} ${employee?.about?.lastName ?? ""}`.trim() || employee?.email;
  await logActivity({
    userEmail: employee?.email ?? "",
    userName: empName ?? "",
    action: `requested attendance correction (${body.type})`,
    entity: "attendance",
    entityId: correction._id.toString(),
    details: JSON.stringify({ date: body.date, type: body.type, reason: body.reason }),
    visibility: "targeted",
    targetUserIds: [],
  });

  return ok(correction);
}

export async function PATCH(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!actor.isSuperAdmin && !hasPermission(actor, "attendance_edit")) {
    return forbidden("You do not have permission to review corrections");
  }
  await connectDB();

  let body: { correctionId?: string; action?: string; reviewNote?: string };
  try {
    body = await req.json();
  } catch {
    return unprocessable("Invalid JSON body");
  }

  if (!body.correctionId || !body.action) {
    return badRequest("correctionId and action are required");
  }
  if (!["approve", "reject"].includes(body.action)) {
    return badRequest("action must be 'approve' or 'reject'");
  }

  const correction = await AttendanceCorrection.findById(body.correctionId);
  if (!correction) return badRequest("Correction not found");
  if (correction.status !== "pending") return badRequest("Correction already reviewed");

  correction.status = body.action === "approve" ? "approved" : "rejected";
  correction.reviewedBy = new mongoose.Types.ObjectId(actor.id);
  correction.reviewedAt = new Date();
  correction.reviewNote = body.reviewNote ?? "";

  if (body.action === "approve" && (correction.requestedStart || correction.requestedEnd)) {
    const tz = await getTz();
    const corrDate = startOfDay(correction.date, tz);

    if (correction.requestedStart && correction.requestedEnd) {
      const dur = Math.max(0, Math.floor(
        (new Date(correction.requestedEnd).getTime() - new Date(correction.requestedStart).getTime()) / 60000,
      ));

      const session = await ActivitySession.create({
        session: randomUUID(),
        user: correction.user,
        platform: "correction",
        sessionTime: { start: correction.requestedStart, end: correction.requestedEnd },
        lastActivity: correction.requestedEnd,
        status: "disconnected",
        sessionDate: corrDate,
        durationMinutes: dur,
        officeSegments: [],
        location: { inOffice: false },
      });

      await DailyAttendance.findOneAndUpdate(
        { user: correction.user, date: corrDate },
        {
          $push: { activitySessions: session._id },
          $set: { isPresent: true },
        },
        { upsert: true },
      );

      correction.appliedToDaily = (await DailyAttendance.findOne({ user: correction.user, date: corrDate }))
        ?._id;

      const { recomputeDailyForUser } = await import("./recompute");
      await recomputeDailyForUser(String(correction.user), corrDate, tz);
    }
  }

  await correction.save();

  const employee = await User.findById(correction.user).select("about email").lean();
  const empName = `${employee?.about?.firstName ?? ""} ${employee?.about?.lastName ?? ""}`.trim() || employee?.email;
  await logActivity({
    userEmail: actor.email ?? "",
    userName: actor.email,
    action: `${body.action}d attendance correction for ${empName}`,
    entity: "attendance",
    entityId: correction._id.toString(),
    details: JSON.stringify({ date: correction.date, type: correction.type, reviewNote: body.reviewNote }),
    visibility: "targeted",
    targetUserIds: [String(correction.user)],
  });

  emitSocket("presence", { type: "update" }, { room: "presence" });

  return ok(correction);
}
