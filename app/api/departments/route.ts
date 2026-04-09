import { connectDB } from "@/lib/db";
import Department from "@/lib/models/Department";
import User from "@/lib/models/User";
import Membership from "@/lib/models/Membership";
import { unauthorized, forbidden, badRequest, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  canManageDepartments,
  isSuperAdmin,
  getHierarchyDepartmentIds,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  let deptFilter: Record<string, unknown> = {};

  if (isSuperAdmin(actor)) {
    // SuperAdmin sees all (including inactive)
  } else {
    deptFilter.isActive = true;
    const visibleDeptIds = await getHierarchyDepartmentIds(actor.id);
    if (visibleDeptIds.length === 0) return ok([]);
    deptFilter._id = { $in: visibleDeptIds };
  }

  const [departments, membershipCounts] = await Promise.all([
    Department.find(deptFilter)
      .populate("manager", "about.firstName about.lastName email")
      .populate("parentDepartment", "title slug")
      .sort({ createdAt: -1 })
      .lean(),
    Membership.aggregate([
      { $match: { isActive: { $ne: false } } },
      { $group: { _id: "$department", count: { $sum: 1 } } },
    ]),
  ]);

  const empMap = new Map(membershipCounts.map((c) => [c._id.toString(), c.count]));

  const result = departments.map((d) => ({
    ...d,
    employeeCount: empMap.get(d._id.toString()) ?? 0,
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
