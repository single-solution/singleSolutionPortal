import { ORG_CANVAS_ID } from "@/lib/constants";
import User from "@/lib/models/User";
import Membership from "@/lib/models/Membership";
import Department from "@/lib/models/Department";
import FlowLayout from "@/lib/models/FlowLayout";
import { unauthorized, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  hasPermission,
  getSubordinateUserIds,
} from "@/lib/permissions";
import { inheritDepartments } from "@/lib/departmentInheritance";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const hasViewPerm = hasPermission(actor, "employees_view");
  const filter: Record<string, unknown> = { isSuperAdmin: { $ne: true } };

  if (isSuperAdmin(actor)) {
    // SuperAdmin sees all
  } else if (hasViewPerm) {
    filter.isActive = true;
    const subordinateIds = await getSubordinateUserIds(actor.id);
    filter._id = { $in: [actor.id, ...subordinateIds] };
  } else {
    filter.isActive = true;
    filter._id = actor.id;
  }

  const canSeeSalary = hasPermission(actor, "payroll_manageSalary");
  const selectFields = canSeeSalary
    ? "_id email about.firstName about.lastName salary"
    : "_id email about.firstName about.lastName";

  const users = await User.find(filter)
    .select(selectFields)
    .sort({ "about.firstName": 1 })
    .lean();

  const userIds = users.map((u) => u._id);
  const [memberships, departments, flowLayout] = await Promise.all([
    Membership.find({ user: { $in: userIds }, isActive: true })
      .select("user department")
      .lean(),
    Department.find({ isActive: true }).select("_id title").lean(),
    FlowLayout.findOne({ canvasId: ORG_CANVAS_ID }).lean(),
  ]);

  const deptMap = new Map(departments.map((d) => [String(d._id), d.title]));
  const userDeptMap = new Map<string, { id: string; title: string }>();
  for (const m of memberships) {
    const uid = String(m.user);
    if (!userDeptMap.has(uid)) {
      const deptTitle = deptMap.get(String(m.department));
      if (deptTitle) userDeptMap.set(uid, { id: String(m.department), title: deptTitle });
    }
  }

  const empIdStrs = userIds.map(String);
  const inheritMap = new Map<string, { deptId: string; deptName: string }>();
  for (const [uid, dept] of userDeptMap) {
    inheritMap.set(uid, { deptId: dept.id, deptName: dept.title });
  }
  const links = ((flowLayout as { links?: { source: string; target: string; sourceHandle: string; targetHandle: string }[] })?.links ?? []);
  inheritDepartments(empIdStrs, inheritMap, links);

  const enriched = users.map((u) => {
    const uid = String(u._id);
    const dept = inheritMap.get(uid);
    return {
      ...u,
      department: dept ? { id: dept.deptId, title: dept.deptName } : null,
    };
  });

  return ok(enriched);
}
