import { connectDB } from "@/lib/db";
import LocationFlagEvent from "@/lib/models/LocationFlagEvent";
import { getVerifiedSession, isAdmin, getTeamMemberIds } from "@/lib/permissions";
import { unauthorized, ok } from "@/lib/helpers";
import User from "@/lib/models/User";

export async function GET(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  if (!isAdmin(actor)) {
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
  } else if (!actor.isSuperAdmin) {
    const deptIds = [...new Set(actor.memberships.map((m) => m.departmentId))];
    const teamIds = actor.memberships.filter((m) => m.teamId).map((m) => m.teamId!);
    const memberIds = teamIds.length > 0 ? await getTeamMemberIds(teamIds) : [];
    const orClauses: Record<string, unknown>[] = [{ reportsTo: actor.id }];
    if (deptIds.length > 0) orClauses.push({ department: { $in: deptIds } });
    if (memberIds.length > 0) orClauses.push({ _id: { $in: memberIds } });
    const users = await User.find({
      isActive: true,
      isSuperAdmin: { $ne: true },
      $or: orClauses,
    })
      .select("_id")
      .lean();
    const visibleUserIds = users.map((u) => u._id.toString());

    if (visibleUserIds.length > 0) {
      filter.user = { $in: visibleUserIds };
    } else {
      return ok({ flags: [], total: 0 });
    }
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

  if (!isAdmin(actor)) {
    return unauthorized();
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
