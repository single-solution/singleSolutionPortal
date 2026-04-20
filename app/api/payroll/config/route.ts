import { connectDB } from "@/lib/db";
import { getVerifiedSession, hasPermission } from "@/lib/permissions";
import PayrollConfig, { type ILatePenaltyTier } from "@/lib/models/PayrollConfig";
import { unauthorized, forbidden, badRequest, ok } from "@/lib/helpers";

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
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "payroll_viewTeam") && !hasPermission(actor, "payroll_manageSalary")) return forbidden();

  await connectDB();

  let doc = await PayrollConfig.findOne().lean();
  if (!doc) {
    const created = await PayrollConfig.create({});
    doc = created.toObject();
  }

  return ok(doc);
}

export async function PUT(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "payroll_manageSalary")) return forbidden();

  await connectDB();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const $set: Record<string, unknown> = {};

  for (const key of SCALAR_FIELDS) {
    if (!(key in body) || body[key] === undefined) continue;
    const n = Number(body[key]);
    if (!Number.isFinite(n)) {
      return badRequest(`Invalid number for ${key}`);
    }
    if (key === "payDay" && (n < 1 || n > 28)) {
      return badRequest("payDay must be between 1 and 28");
    }
    $set[key] = n;
  }

  if ("latePenaltyTiers" in body && body.latePenaltyTiers !== undefined) {
    if (!validateTiers(body.latePenaltyTiers)) {
      return badRequest("latePenaltyTiers must be a non-empty array of { minutes, penaltyPercent }");
    }
    $set.latePenaltyTiers = body.latePenaltyTiers;
  }

  if (Object.keys($set).length === 0) {
    return badRequest("No valid fields to update");
  }

  const updated = await PayrollConfig.findOneAndUpdate({}, { $set }, { new: true, upsert: true, setDefaultsOnInsert: true });

  return ok(updated?.toObject?.() ?? updated);
}
