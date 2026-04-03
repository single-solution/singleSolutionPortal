import { connectDB } from "@/lib/db";
import { getVerifiedSession } from "@/lib/permissions";
import { unauthorized, badRequest, ok } from "@/lib/helpers";
import Ping from "@/lib/models/Ping";
import User from "@/lib/models/User";
import { emitSocket } from "@/lib/socket";

/**
 * GET — fetch pings for the logged-in user (inbox)
 * Query: ?unread=true to filter unread only
 */
export async function GET(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "true";

  const filter: Record<string, unknown> = { to: actor.id };
  if (unreadOnly) filter.read = false;

  const pings = await Ping.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("from", "about.firstName about.lastName userRole")
    .lean();

  const unreadCount = unreadOnly
    ? pings.length
    : await Ping.countDocuments({ to: actor.id, read: false });

  return ok({ pings, unreadCount });
}

/**
 * POST — send a ping to someone in your hierarchy pool.
 * Body: { to: string (userId), message?: string }
 *
 * Pool rules:
 *  - SuperAdmin can ping anyone
 *  - Manager can ping anyone in their department
 *  - TeamLead can ping their team members + their reportsTo
 *  - Employee can ping their reportsTo (manager/lead) + same-team members
 */
export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  const body = await req.json().catch(() => null);
  if (!body?.to) return badRequest("Missing 'to' field");

  const toId = String(body.to);
  if (toId === actor.id) return badRequest("Cannot ping yourself");

  const message = typeof body.message === "string" ? body.message.slice(0, 280) : "";

  const target = await User.findById(toId).select("_id userRole department teams reportsTo").lean();
  if (!target) return badRequest("User not found");

  const actorFull = await User.findById(actor.id).select("userRole department teams reportsTo").lean();
  if (!actorFull) return unauthorized();

  const allowed = await isInPool(actorFull, target);
  if (!allowed) return badRequest("Target is not in your hierarchy pool");

  const ping = await Ping.create({ from: actor.id, to: toId, message });

  emitSocket("ping", { from: actor.id, message }, { userId: toId });

  return ok({ _id: ping._id, message: "Ping sent" });
}

/**
 * PATCH — mark pings as read.
 * Body: { ids: string[] } or { all: true }
 */
export async function PATCH(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  const body = await req.json().catch(() => null);
  if (!body) return badRequest("Invalid body");

  if (body.all === true) {
    await Ping.updateMany({ to: actor.id, read: false }, { $set: { read: true } });
  } else if (Array.isArray(body.ids) && body.ids.length > 0) {
    await Ping.updateMany(
      { _id: { $in: body.ids }, to: actor.id },
      { $set: { read: true } },
    );
  } else {
    return badRequest("Provide 'ids' array or 'all: true'");
  }

  return ok({ success: true });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function isInPool(actor: any, target: any): Promise<boolean> {
  const actorRole = actor.userRole;

  if (actorRole === "superadmin") return true;

  const actorDept = actor.department ? String(actor.department) : null;
  const targetDept = target.department ? String(target.department) : null;
  const actorTeams = (actor.teams ?? []).map(String);
  const targetTeams = (target.teams ?? []).map(String);
  const actorReportsTo = actor.reportsTo ? String(actor.reportsTo) : null;
  const targetId = String(target._id);

  if (actorRole === "manager") {
    return actorDept !== null && actorDept === targetDept;
  }

  if (actorRole === "teamLead") {
    if (actorReportsTo === targetId) return true;
    const sharedTeam = actorTeams.some((t: string) => targetTeams.includes(t));
    return sharedTeam;
  }

  if (actorReportsTo === targetId) return true;

  const sharedTeam = actorTeams.some((t: string) => targetTeams.includes(t));
  return sharedTeam;
}
