import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getVerifiedSession, hasPermission } from "@/lib/permissions";
import PayrollConfig from "@/lib/models/PayrollConfig";

const ALLOWED_FIELDS = [
  "workingDaysPerMonth",
  "lateThresholdMinutes",
  "latePenaltyPerIncident",
  "absencePenaltyPerDay",
  "overtimeRateMultiplier",
  "currency",
  "payDay",
] as const;

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "payroll_viewTeam")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await connectDB();

  let doc = await PayrollConfig.findOne().lean();
  if (!doc) {
    const created = await PayrollConfig.create({});
    doc = created.toObject();
  }

  return NextResponse.json(doc);
}

export async function PUT(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "settings_manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await connectDB();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const $set: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (!(key in body) || body[key] === undefined) continue;
    if (key === "currency") {
      if (typeof body[key] !== "string") {
        return NextResponse.json({ error: "currency must be a string" }, { status: 400 });
      }
      $set[key] = body[key];
      continue;
    }
    const n = Number(body[key]);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: `Invalid number for ${key}` }, { status: 400 });
    }
    if (key === "payDay" && (n < 1 || n > 28)) {
      return NextResponse.json({ error: "payDay must be between 1 and 28" }, { status: 400 });
    }
    $set[key] = n;
  }

  if (Object.keys($set).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await PayrollConfig.findOneAndUpdate({}, { $set }, { new: true, upsert: true, setDefaultsOnInsert: true });

  return NextResponse.json(updated?.toObject?.() ?? updated);
}
