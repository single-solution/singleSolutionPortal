import { connectDB } from "@/lib/db";
import LocationFlagEvent from "@/lib/models/LocationFlagEvent";
import { getVerifiedSession, isAdmin, isManager, isTeamLead, getTeamMemberIds } from "@/lib/permissions";
import { unauthorized, ok } from "@/lib/helpers";
import User from "@/lib/models/User";

export async function GET(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  if (!isAdmin(actor) && !isManager(actor) && !isTeamLead(actor)) {
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
  } else if (!isAdmin(actor)) {
    let visibleUserIds: string[] = [];

    if (isManager(actor) && !actor.crossDepartmentAccess) {
      const deptFilter: Record<string, unknown> = { isActive: true, userRole: { $ne: "superadmin" } };
      if (actor.managedDepartments.length > 0) {
        deptFilter.department = { $in: actor.managedDepartments };
      } else if (actor.department) {
        deptFilter.department = actor.department;
      }
      const users = await User.find(deptFilter).select("_id").lean();
      visibleUserIds = users.map((u) => u._id.toString());
    } else if (isTeamLead(actor)) {
      const reportees = await User.find({ reportsTo: actor.id, isActive: true }).select("_id").lean();
      const memberIds = await getTeamMemberIds(actor.leadOfTeams);
      const idSet = new Set([...reportees.map((r) => r._id.toString()), ...memberIds]);
      visibleUserIds = Array.from(idSet);
    }

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
      .populate("user", "about email username userRole")
      .populate("acknowledgedBy", "about email")
      .lean(),
    LocationFlagEvent.countDocuments(filter),
  ]);

  return ok({ flags, total });
}

export async function PATCH(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  if (!isAdmin(actor) && !isManager(actor) && !isTeamLead(actor)) {
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
