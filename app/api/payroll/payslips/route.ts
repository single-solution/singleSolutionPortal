import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { getVerifiedSession, isSuperAdmin, hasPermission, getSubordinateUserIds } from "@/lib/permissions";
import Payslip from "@/lib/models/Payslip";
import "@/lib/models/User";
import { isValidId } from "@/lib/helpers";

export async function GET(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const sp = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};

  if (hasPermission(actor, "payroll_viewTeam")) {
    const userId = sp.get("userId");
    if (userId) {
      if (!isValidId(userId)) return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
      if (!isSuperAdmin(actor)) {
        const subordinateIds = await getSubordinateUserIds(actor.id);
        if (!subordinateIds.includes(userId)) {
          filter.user = new mongoose.Types.ObjectId(actor.id);
        } else {
          filter.user = new mongoose.Types.ObjectId(userId);
        }
      } else {
        filter.user = new mongoose.Types.ObjectId(userId);
      }
    } else if (!isSuperAdmin(actor)) {
      const subordinateIds = await getSubordinateUserIds(actor.id);
      filter.user = { $in: [actor.id, ...subordinateIds].map((id) => new mongoose.Types.ObjectId(id)) };
    }
  } else {
    filter.user = new mongoose.Types.ObjectId(actor.id);
  }

  const month = sp.get("month");
  if (month !== null && month !== "") {
    const m = Number(month);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      return NextResponse.json({ error: "Invalid month" }, { status: 400 });
    }
    filter.month = m;
  }

  const year = sp.get("year");
  if (year !== null && year !== "") {
    const y = Number(year);
    if (!Number.isInteger(y)) return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    filter.year = y;
  }

  const status = sp.get("status");
  if (status !== null && status !== "") {
    if (!["draft", "finalized", "paid"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    filter.status = status;
  }

  const rows = await Payslip.find(filter)
    .populate("user", "about.firstName about.lastName email username")
    .populate("finalizedBy", "about.firstName about.lastName email username")
    .sort({ year: -1, month: -1, createdAt: -1 })
    .lean();

  return NextResponse.json(rows);
}

export async function PUT(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "payroll_finalizeSlips")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id || !isValidId(body.id)) {
    return NextResponse.json({ error: "Valid id is required" }, { status: 400 });
  }

  if (body.status !== "finalized" && body.status !== "paid") {
    return NextResponse.json({ error: "status must be finalized or paid" }, { status: 400 });
  }

  await connectDB();

  const payslip = await Payslip.findById(body.id);
  if (!payslip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isSuperAdmin(actor)) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    if (!subordinateIds.includes(payslip.user.toString())) {
      return NextResponse.json({ error: "Forbidden — not in your hierarchy" }, { status: 403 });
    }
  }

  if (payslip.status === "paid") {
    return NextResponse.json({ error: "Payslip is already paid" }, { status: 400 });
  }

  const $set: Record<string, unknown> = { status: body.status };

  if (body.status === "finalized") {
    $set.finalizedBy = new mongoose.Types.ObjectId(actor.id);
  }

  if (body.status === "paid") {
    $set.paidAt = new Date();
    if (!payslip.finalizedBy) {
      $set.finalizedBy = new mongoose.Types.ObjectId(actor.id);
    }
  }

  payslip.set($set);
  await payslip.save();

  const updated = await Payslip.findById(payslip._id)
    .populate("user", "about.firstName about.lastName email username")
    .populate("finalizedBy", "about.firstName about.lastName email username")
    .lean();

  return NextResponse.json(updated);
}
