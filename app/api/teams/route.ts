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

  const actorDeptIds = [...new Set(actor.memberships.map((m) => m.departmentId))];
  const actorTeamIds = actor.memberships.filter((m) => m.teamId).map((m) => m.teamId!);
  const primaryDeptId = actor.memberships[0]?.departmentId;

  if (isSuperAdmin(actor)) {
    // sees all
  } else if (isManager(actor)) {
    if (actorDeptIds.length > 0) {
      filter.$or = [
        { department: { $in: actorDeptIds } },
        { departments: { $in: actorDeptIds } },
      ];
    } else if (primaryDeptId) {
      filter.$or = [
        { department: primaryDeptId },
        { departments: primaryDeptId },
      ];
    } else {
      filter._id = { $in: actorTeamIds };
    }
  } else if (isTeamLead(actor)) {
    filter._id = { $in: actorTeamIds };
  } else {
    return ok([]);
  }

  const teams = await Team.find(filter)
    .populate("department", "title slug")
    .populate("departments", "title slug")
    .populate("lead", "about.firstName about.lastName email")
    .sort({ createdAt: -1 })
    .lean();

  const teamIds = teams.map((t) => t._id.toString());
  const memberCounts = await User.aggregate([
    { $match: { isActive: true, isSuperAdmin: { $ne: true }, teams: { $in: teams.map((t) => t._id) } } },
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

  if (!body.name?.trim()) return badRequest("Team name is required");

  const deptIds: string[] = body.departments?.length
    ? body.departments
    : body.department
      ? [body.department]
      : [];

  if (deptIds.length === 0) return badRequest("At least one department is required");

  for (const dId of deptIds) {
    const dept = await Department.findById(dId).lean();
    if (!dept) return badRequest(`Department ${dId} not found`);
  }

  if (isManager(actor) && !isSuperAdmin(actor)) {
    const managedDeptIds = [...new Set(actor.memberships.map((m) => m.departmentId))];
    const actorPrimaryDept = actor.memberships[0]?.departmentId;
    for (const dId of deptIds) {
      const canCreateInDept = managedDeptIds.includes(dId) || actorPrimaryDept === dId;
      if (!canCreateInDept) {
        return badRequest("Managers can only create teams in their managed departments");
      }
    }
  }

  if (body.lead) {
    const leadUser = await User.findById(body.lead).select("isSuperAdmin").lean();
    if (!leadUser) return badRequest("Lead user not found");
    if (leadUser.isSuperAdmin === true) return badRequest("Superadmin cannot be a team lead");
  }

  const team = await Team.create({
    name: body.name.trim(),
    departments: deptIds,
    department: deptIds[0],
    lead: body.lead || undefined,
    description: body.description ?? "",
    isActive: true,
    createdBy: actor.id,
  });

  const populated = await Team.findById(team._id)
    .populate("department", "title slug")
    .populate("departments", "title slug")
    .populate("lead", "about.firstName about.lastName email")
    .lean();

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "created team",
    entity: "team",
    entityId: team._id.toString(),
    details: body.name.trim(),
    targetTeamIds: [team._id.toString()],
    targetDepartmentId: deptIds[0],
    targetUserIds: body.lead ? [body.lead] : [],
    visibility: "targeted",
  });

  return ok(populated);
}
