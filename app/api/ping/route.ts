import { getVerifiedSession, isSuperAdmin, getSubordinateUserIds } from "@/lib/permissions";
import { unauthorized, badRequest, forbidden, ok, isValidId } from "@/lib/helpers";
import Ping from "@/lib/models/Ping";
import User from "@/lib/models/User";
import { emitSocket } from "@/lib/socket";

export async function GET(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "true";

  const filter: Record<string, unknown> = { to: actor.id };
  if (unreadOnly) filter.read = false;

  const pings = await Ping.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("from", "about.firstName about.lastName")
    .lean();

  const unreadCount = unreadOnly
    ? pings.length
    : await Ping.countDocuments({ to: actor.id, read: false });

  return ok({ pings, unreadCount });
}

export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body?.to) return badRequest("Missing 'to' field");

  const toId = String(body.to);
  if (toId === actor.id) return badRequest("Cannot ping yourself");

  const message = typeof body.message === "string" ? body.message.slice(0, 280) : "";

  const target = await User.findById(toId).select("_id").lean();
  if (!target) return badRequest("User not found");

  if (!isSuperAdmin(actor)) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    if (!subordinateIds.includes(toId)) {
      return forbidden("Can only ping employees within your hierarchy");
    }
  }

  const ping = await Ping.create({ from: actor.id, to: toId, message });

  emitSocket("ping", { from: actor.id, message }, { userId: toId });

  return ok({ _id: ping._id, message: "Ping sent" });
}

export async function PATCH(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return badRequest("Invalid body");

  if (body.all === true) {
    await Ping.updateMany({ to: actor.id, read: false }, { $set: { read: true } });
  } else if (Array.isArray(body.ids) && body.ids.length > 0) {
    if (body.ids.some((id: string) => !isValidId(id))) return badRequest("ids contains invalid IDs");
    await Ping.updateMany(
      { _id: { $in: body.ids }, to: actor.id },
      { $set: { read: true } },
    );
  } else {
    return badRequest("Provide 'ids' array or 'all: true'");
  }

  return ok({ success: true });
}
