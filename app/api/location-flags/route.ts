import { connectDB } from "@/lib/db";
import LocationFlagEvent from "@/lib/models/LocationFlagEvent";
import { getVerifiedSession, isSuperAdmin, hasPermission, getSubordinateUserIds } from "@/lib/permissions";
import { unauthorized, forbidden, ok } from "@/lib/helpers";

export async function GET(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  if (!hasPermission(actor, "attendance_viewTeam")) {
    return ok({ flags: [], total: 0 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const skip = parseInt(searchParams.get("skip") ?? "0", 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};

  if (userId) {
    filter.user = userId;
  } else if (!isSuperAdmin(actor)) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    if (subordinateIds.length === 0) return ok({ flags: [], total: 0 });
    filter.user = { $in: subordinateIds };
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

  const body = await req.json();
  const { flagId } = body as { flagId?: string };

  if (!flagId) return ok({ acknowledged: false });

  await connectDB();

  await LocationFlagEvent.findByIdAndUpdate(flagId, {
    acknowledged: true,
    acknowledgedBy: actor.id,
    acknowledgedAt: new Date(),
  });

  return ok({ acknowledged: true });
}
