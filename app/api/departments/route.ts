import { connectDB } from "@/lib/db";
import Department from "@/lib/models/Department";
import User from "@/lib/models/User";
import Membership from "@/lib/models/Membership";
import { unauthorized, forbidden, badRequest, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  hasPermission,
  isSuperAdmin,
  getHierarchyDepartmentIds,
  getSubordinateUserIds,
  invalidateHierarchyCache,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "departments_view") && !hasPermission(actor, "organization_view")) return ok([]);

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
  if (!hasPermission(actor, "departments_create")) return forbidden();

  await connectDB();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return badRequest("Invalid JSON body"); }

  if (!body.title?.trim()) return badRequest("Department title is required");

  if (body.managerId) {
    const mgr = await User.findById(body.managerId).select("isSuperAdmin").lean();
    if (mgr?.isSuperAdmin === true) return badRequest("Superadmin cannot be set as department manager");
    if (!isSuperAdmin(actor)) {
      const subordinateIds = await getSubordinateUserIds(actor.id);
      if (!subordinateIds.includes(body.managerId) && body.managerId !== actor.id) {
        return badRequest("Manager must be within your hierarchy");
      }
    }
  }

  if (body.parentId && !isSuperAdmin(actor)) {
    const hierarchyDeptIds = await getHierarchyDepartmentIds(actor.id);
    if (!hierarchyDeptIds.includes(body.parentId)) {
      return badRequest("Parent department must be within your hierarchy");
    }
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

  invalidateHierarchyCache();
  return ok(populated);
}
