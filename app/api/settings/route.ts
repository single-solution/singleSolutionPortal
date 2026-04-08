import { connectDB } from "@/lib/db";
import SystemSettings from "@/lib/models/SystemSettings";
import { unauthorized, forbidden, ok } from "@/lib/helpers";
import { getVerifiedSession, canManageSettings } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

async function getOrCreateSettings() {
  let settings = await SystemSettings.findOne({ key: "global" }).lean();
  if (!settings) {
    settings = await SystemSettings.create({ key: "global" });
    settings = settings.toObject();
  }
  return settings;
}

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();
  const settings = await getOrCreateSettings();
  return ok(settings);
}

export async function PUT(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!canManageSettings(actor)) return forbidden();

  await connectDB();
  const body = await req.json();

  const update: Record<string, unknown> = { updatedBy: actor.id };

  if (body.office) {
    if (body.office.latitude !== undefined) update["office.latitude"] = body.office.latitude;
    if (body.office.longitude !== undefined) update["office.longitude"] = body.office.longitude;
    if (body.office.radiusMeters !== undefined) update["office.radiusMeters"] = body.office.radiusMeters;
  }

  if (body.shiftDefaults) {
    if (body.shiftDefaults.start !== undefined) update["shiftDefaults.start"] = body.shiftDefaults.start;
    if (body.shiftDefaults.end !== undefined) update["shiftDefaults.end"] = body.shiftDefaults.end;
    if (body.shiftDefaults.breakMinutes !== undefined) update["shiftDefaults.breakMinutes"] = body.shiftDefaults.breakMinutes;
    if (body.shiftDefaults.graceMinutes !== undefined) update["shiftDefaults.graceMinutes"] = body.shiftDefaults.graceMinutes;
  }

  if (body.company) {
    if (body.company.name !== undefined) update["company.name"] = body.company.name;
    if (body.company.timezone !== undefined) update["company.timezone"] = body.company.timezone;
  }

  const settings = await SystemSettings.findOneAndUpdate(
    { key: "global" },
    { $set: update },
    { new: true, upsert: true },
  ).lean();

  const changed = Object.keys(update).filter((k) => k !== "updatedBy").join(", ");
  logActivity({
    userEmail: actor.email,
    userName: "",
    userRole: actor.isSuperAdmin ? "superadmin" : "employee",
    action: "updated system settings",
    entity: "settings",
    details: changed,
    visibility: "self",
  });

  return ok(settings);
}
