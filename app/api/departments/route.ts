import { connectDB } from "@/lib/db";
import Department from "@/lib/models/Department";
import User from "@/lib/models/User";
import Team from "@/lib/models/Team";
import { unauthorized, forbidden, badRequest, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  canManageDepartments,
  isSuperAdmin,
  isManager,
  isTeamLead,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  let deptFilter: Record<string, unknown> = { isActive: true };

  if (isSuperAdmin(actor)) {
    // sees all
  } else if (isManager(actor)) {
    if (!actor.crossDepartmentAccess) {
      if (actor.managedDepartments.length > 0) {
        deptFilter._id = { $in: actor.managedDepartments };
      } else if (actor.department) {
        deptFilter._id = actor.department;
      } else {
        return ok([]);
      }
    }
  } else if (isTeamLead(actor)) {
    if (actor.leadOfTeams.length > 0) {
      const teams = await Team.find({ _id: { $in: actor.leadOfTeams }, isActive: true }).select("department").lean();
      const deptIds = [...new Set(teams.map((t) => t.department.toString()).filter(Boolean))];
      if (actor.department && !deptIds.includes(actor.department)) deptIds.push(actor.department);
      deptFilter._id = { $in: deptIds };
    } else if (actor.department) {
      deptFilter._id = actor.department;
    } else {
      return ok([]);
    }
  } else {
    if (actor.department) {
      deptFilter._id = actor.department;
    } else {
      return ok([]);
    }
  }

  const [departments, empCounts, teamCounts] = await Promise.all([
    Department.find(deptFilter)
      .populate("manager", "about.firstName about.lastName email")
      .populate("parentDepartment", "title slug")
      .sort({ createdAt: -1 })
      .lean(),
    User.aggregate([
      { $match: { isActive: true, department: { $ne: null }, userRole: { $ne: "superadmin" } } },
      { $group: { _id: "$department", count: { $sum: 1 } } },
    ]),
    Team.aggregate([
      { $match: { isActive: true, department: { $ne: null } } },
      { $group: { _id: "$department", count: { $sum: 1 } } },
    ]),
  ]);

  const empMap = new Map(empCounts.map((c) => [c._id.toString(), c.count]));
  const teamMap = new Map(teamCounts.map((c) => [c._id.toString(), c.count]));

  const result = departments.map((d) => ({
    ...d,
    employeeCount: empMap.get(d._id.toString()) ?? 0,
    teamCount: teamMap.get(d._id.toString()) ?? 0,
  }));

  return ok(result);
}

export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!canManageDepartments(actor)) return forbidden();

  await connectDB();
  const body = await req.json();

  if (!body.title?.trim()) return badRequest("Department title is required");

  if (body.managerId) {
    const mgr = await User.findById(body.managerId).select("userRole").lean();
    if (mgr?.userRole === "superadmin") return badRequest("Superadmin cannot be set as department manager");
  }

  const dept = await Department.create({
    title: body.title.trim(),
    description: body.description ?? "",
    manager: body.managerId || undefined,
    parentDepartment: body.parentId || undefined,
    isActive: true,
    createdBy: actor.id,
  });

  const populated = await Department.findById(dept._id)
    .populate("manager", "about.firstName about.lastName email")
    .populate("parentDepartment", "title slug")
    .lean();

  logActivity({
    userEmail: actor.email,
    userName: "",
    userRole: actor.role,
    action: "created department",
    entity: "department",
    entityId: dept._id.toString(),
    details: body.title.trim(),
    targetDepartmentId: dept._id.toString(),
    targetUserIds: body.managerId ? [body.managerId] : [],
    visibility: "targeted",
  });

  return ok(populated);
}
