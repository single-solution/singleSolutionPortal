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
    } else if (actor.managedDepartments.length > 0) {
      filter.$or = [
        { department: { $in: actor.managedDepartments } },
        { departments: { $in: actor.managedDepartments } },
      ];
    } else if (actor.department) {
      filter.$or = [
        { department: actor.department },
        { departments: actor.department },
      ];
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
    .populate("departments", "title slug")
    .populate("lead", "about.firstName about.lastName email userRole")
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
    for (const dId of deptIds) {
      const canCreateInDept = actor.managedDepartments.includes(dId) ||
        actor.department === dId;
      if (!canCreateInDept) {
        return badRequest("Managers can only create teams in their managed departments");
      }
    }
  }

  if (body.lead) {
    const leadUser = await User.findById(body.lead).select("userRole").lean();
    if (!leadUser) return badRequest("Lead user not found");
    if (leadUser.userRole === "superadmin") return badRequest("Superadmin cannot be a team lead");
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
    targetDepartmentId: deptIds[0],
    targetUserIds: body.lead ? [body.lead] : [],
    visibility: "targeted",
  });

  return ok(populated);
}
