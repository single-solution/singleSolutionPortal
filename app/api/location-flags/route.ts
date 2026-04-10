import { connectDB } from "@/lib/db";
import LocationFlagEvent from "@/lib/models/LocationFlagEvent";
import "@/lib/models/User";
import {
  getVerifiedSession,
  isSuperAdmin,
  hasPermission,
  getSubordinateUserIds,
} from "@/lib/permissions";
import { unauthorized, forbidden, ok, badRequest } from "@/lib/helpers";

export async function GET(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const skip = parseInt(searchParams.get("skip") ?? "0", 10);

  const hasTeamPerm = hasPermission(actor, "attendance_viewTeam");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};

  if (isSuperAdmin(actor)) {
    if (userId) filter.user = userId;
  } else if (hasTeamPerm) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    const visibleIds = [actor.id, ...subordinateIds];
    if (userId) {
      if (!visibleIds.includes(userId)) return ok({ flags: [], total: 0 });
      filter.user = userId;
    } else {
      filter.user = { $in: visibleIds };
    }
  } else {
    filter.user = actor.id;
  }

  const [flags, total] = await Promise.all([
    LocationFlagEvent.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "about email username")
      .populate("acknowledgedBy", "about email")
      .lean(),
    LocationFlagEvent.countDocuments(filter),
  ]);

  return ok({ flags, total });
}

export async function PATCH(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  if (!hasPermission(actor, "attendance_edit")) {
    return forbidden();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return badRequest("Invalid JSON body"); }
  const { flagId } = body as { flagId?: string };

  if (!flagId) return ok({ acknowledged: false });

  await connectDB();

  const flag = await LocationFlagEvent.findById(flagId).select("user").lean();
  if (!flag) return ok({ acknowledged: false });

  if (!isSuperAdmin(actor)) {
    const flagUserId = flag.user?.toString();
    if (!flagUserId) return ok({ acknowledged: false });
    const subordinateIds = await getSubordinateUserIds(actor.id);
    if (!subordinateIds.includes(flagUserId)) {
      return forbidden("Can only acknowledge flags for employees in your hierarchy");
    }
  }

  await LocationFlagEvent.findByIdAndUpdate(flagId, {
    acknowledged: true,
    acknowledgedBy: actor.id,
    acknowledgedAt: new Date(),
  });

  return ok({ acknowledged: true });
}
