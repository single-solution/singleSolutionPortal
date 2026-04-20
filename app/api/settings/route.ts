import { connectDB } from "@/lib/db";
import SystemSettings from "@/lib/models/SystemSettings";
import { unauthorized, forbidden, ok, badRequest } from "@/lib/helpers";
import { getVerifiedSession, hasPermission } from "@/lib/permissions";
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

  const canView = hasPermission(actor, "settings_view")
    || hasPermission(actor, "settings_manageCompany")
    || hasPermission(actor, "settings_manageOffice")
    || hasPermission(actor, "settings_toggleLiveUpdates")
    || hasPermission(actor, "settings_sendTestEmail");
  if (!canView) return forbidden();

  await connectDB();
  const settings = await getOrCreateSettings();
  return ok(settings);
}

export async function PUT(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const canCompany = hasPermission(actor, "settings_manageCompany");
  const canOffice = hasPermission(actor, "settings_manageOffice");
  const canLive = hasPermission(actor, "settings_toggleLiveUpdates");
  if (!canCompany && !canOffice && !canLive) return forbidden();

  await connectDB();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return badRequest("Invalid JSON body"); }

  const update: Record<string, unknown> = { updatedBy: actor.id };

  if (canOffice && body.office) {
    if (body.office.latitude !== undefined) update["office.latitude"] = body.office.latitude;
    if (body.office.longitude !== undefined) update["office.longitude"] = body.office.longitude;
    if (body.office.radiusMeters !== undefined) update["office.radiusMeters"] = body.office.radiusMeters;
  }

  if (canCompany && body.company) {
    if (body.company.name !== undefined) update["company.name"] = body.company.name;
    if (body.company.timezone !== undefined) update["company.timezone"] = body.company.timezone;
  }

  if (canLive && body.liveUpdates !== undefined) update.liveUpdates = !!body.liveUpdates;

  const settings = await SystemSettings.findOneAndUpdate(
    { key: "global" },
    { $set: update },
    { new: true, upsert: true },
  ).lean();

  const changed = Object.keys(update).filter((k) => k !== "updatedBy").join(", ");
  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "updated system settings",
    entity: "settings",
    details: changed,
    visibility: "self",
  });

  return ok(settings);
}
