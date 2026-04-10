import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getVerifiedSession, hasPermission } from "@/lib/permissions";
import PayrollConfig, { type ILatePenaltyTier } from "@/lib/models/PayrollConfig";

const SCALAR_FIELDS = [
  "absencePenaltyPerDay",
  "overtimeRateMultiplier",
  "payDay",
] as const;

function validateTiers(tiers: unknown): tiers is ILatePenaltyTier[] {
  if (!Array.isArray(tiers) || tiers.length === 0) return false;
  return tiers.every(
    (t) =>
      typeof t === "object" &&
      t !== null &&
      Number.isFinite(t.minutes) &&
      Number.isFinite(t.penaltyPercent) &&
      t.minutes >= 0 &&
      t.penaltyPercent >= 0,
  );
}

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
  if (!hasPermission(actor, "payroll_manageSalary")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await connectDB();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const $set: Record<string, unknown> = {};

  for (const key of SCALAR_FIELDS) {
    if (!(key in body) || body[key] === undefined) continue;
    const n = Number(body[key]);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: `Invalid number for ${key}` }, { status: 400 });
    }
    if (key === "payDay" && (n < 1 || n > 28)) {
      return NextResponse.json({ error: "payDay must be between 1 and 28" }, { status: 400 });
    }
    $set[key] = n;
  }

  if ("latePenaltyTiers" in body && body.latePenaltyTiers !== undefined) {
    if (!validateTiers(body.latePenaltyTiers)) {
      return NextResponse.json(
        { error: "latePenaltyTiers must be a non-empty array of { minutes, penaltyPercent }" },
        { status: 400 },
      );
    }
    $set.latePenaltyTiers = body.latePenaltyTiers;
  }

  if (Object.keys($set).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await PayrollConfig.findOneAndUpdate({}, { $set }, { new: true, upsert: true, setDefaultsOnInsert: true });

  return NextResponse.json(updated?.toObject?.() ?? updated);
}
