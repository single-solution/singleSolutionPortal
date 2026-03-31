import { connectDB } from "@/lib/db";
import Team from "@/lib/models/Team";
import User from "@/lib/models/User";
import Department from "@/lib/models/Department";
import { unauthorized, forbidden, badRequest, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  isManager,
  isTeamLead,
  canManageTeams,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();
  void Department;

  let filter: Record<string, unknown> = {};

  if (isSuperAdmin(actor)) {
    // sees all
  } else if (isManager(actor)) {
    if (actor.crossDepartmentAccess) {
      // sees all
    } else if (actor.department) {
      filter.department = actor.department;
    } else {
      filter._id = { $in: actor.leadOfTeams };
    }
  } else if (isTeamLead(actor)) {
    filter._id = { $in: actor.leadOfTeams };
  } else {
    return ok([]);
  }

  const teams = await Team.find(filter)
    .populate("department", "title slug")
    .populate("lead", "about.firstName about.lastName email userRole")
    .sort({ createdAt: -1 })
    .lean();

  const teamIds = teams.map((t) => t._id.toString());
  const memberCounts = await User.aggregate([
    { $match: { isActive: true, userRole: { $ne: "superadmin" }, teams: { $in: teams.map((t) => t._id) } } },
    { $unwind: "$teams" },
    { $group: { _id: "$teams", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(memberCounts.map((m) => [m._id.toString(), m.count]));

  const result = teams.map((t) => ({
    ...t,
    memberCount: countMap.get(t._id.toString()) ?? 0,
  }));

  return ok(result);
}

export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!canManageTeams(actor)) return forbidden();

  await connectDB();
  const body = await req.json();

  if (!body.name?.trim() || !body.department) {
    return badRequest("Team name and department are required");
  }

  const dept = await Department.findById(body.department).lean();
  if (!dept) return badRequest("Department not found");

  if (isManager(actor) && !isSuperAdmin(actor)) {
    if (actor.department !== body.department) {
      return badRequest("Managers can only create teams in their own department");
    }
  }

  if (body.lead) {
    const leadUser = await User.findById(body.lead).select("userRole").lean();
    if (!leadUser) return badRequest("Lead user not found");
    if (leadUser.userRole === "superadmin") return badRequest("Superadmin cannot be a team lead");
  }

  const team = await Team.create({
    name: body.name.trim(),
    department: body.department,
    lead: body.lead || undefined,
    description: body.description ?? "",
    isActive: true,
    createdBy: actor.id,
  });

  const populated = await Team.findById(team._id)
    .populate("department", "title slug")
    .populate("lead", "about.firstName about.lastName email userRole")
    .lean();

  logActivity({
    userEmail: actor.email,
    userName: "",
    userRole: actor.role,
    action: "created team",
    entity: "team",
    entityId: team._id.toString(),
    details: body.name.trim(),
    targetTeamIds: [team._id.toString()],
    targetDepartmentId: body.department,
    targetUserIds: body.lead ? [body.lead, actor.id] : [actor.id],
  });

  return ok(populated);
}
