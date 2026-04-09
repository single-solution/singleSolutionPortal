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
  getDepartmentScope,
  getTeamScope,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  let deptFilter: Record<string, unknown> = {};

  const primaryDeptId =
    actor.memberships.find((m) => m.isPrimary)?.departmentId ?? actor.memberships[0]?.departmentId;

  if (isSuperAdmin(actor)) {
    // sees all (including inactive)
  } else if (isManager(actor)) {
    deptFilter.isActive = true;
    if (!actor.isSuperAdmin) {
      const scopedDepts = [...new Set(getDepartmentScope(actor, "departments_view"))];
      if (scopedDepts.length > 0) {
        deptFilter._id = { $in: scopedDepts };
      } else {
        const deptIds = [...new Set(actor.memberships.map((m) => m.departmentId).filter(Boolean))];
        if (deptIds.length > 0) {
          deptFilter._id = { $in: deptIds };
        }
      }
      // no else — managers with no explicit scope see all departments
    }
  } else if (isTeamLead(actor)) {
    deptFilter.isActive = true;
    const leadTeamIds = [...new Set(getTeamScope(actor, "teams_view"))];
    if (leadTeamIds.length > 0) {
      const teams = await Team.find({ _id: { $in: leadTeamIds }, isActive: true }).select("department").lean();
      const deptIds = [...new Set(teams.map((t) => t.department.toString()).filter(Boolean))];
      if (primaryDeptId && !deptIds.includes(primaryDeptId)) deptIds.push(primaryDeptId);
      deptFilter._id = { $in: deptIds };
    } else if (primaryDeptId) {
      deptFilter._id = primaryDeptId;
    } else {
      return ok([]);
    }
  } else {
    deptFilter.isActive = true;
    if (primaryDeptId) {
      deptFilter._id = primaryDeptId;
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
      { $match: { isActive: true, department: { $ne: null }, isSuperAdmin: { $ne: true } } },
      { $group: { _id: "$department", count: { $sum: 1 } } },
    ]),
    Team.aggregate([
      { $match: { isActive: true } },
      { $project: { allDepts: { $concatArrays: [{ $ifNull: ["$departments", []] }, { $cond: [{ $ifNull: ["$department", false] }, ["$department"], []] }] } } },
      { $unwind: "$allDepts" },
      { $group: { _id: "$allDepts", count: { $sum: 1 } } },
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
    const mgr = await User.findById(body.managerId).select("isSuperAdmin").lean();
    if (mgr?.isSuperAdmin === true) return badRequest("Superadmin cannot be set as department manager");
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
