import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { unauthorized, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  isManager,
  isTeamLead,
  isEmployee,
  getTeamMemberIds,
  getDepartmentScope,
  getTeamScope,
} from "@/lib/permissions";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  let filter: Record<string, unknown> = {
    isSuperAdmin: { $ne: true },
  };

  if (!isSuperAdmin(actor)) filter.isActive = true;

  if (isManager(actor)) {
    if (!actor.isSuperAdmin) {
      const scopedDepts = [...new Set(getDepartmentScope(actor, "employees_view"))];
      if (scopedDepts.length > 0) {
        filter.department = { $in: scopedDepts };
      } else {
        const deptIds = [...new Set(actor.memberships.map((m) => m.departmentId).filter(Boolean))];
        if (deptIds.length > 0) {
          filter.department = { $in: deptIds };
        }
      }
    }
  } else if (isTeamLead(actor)) {
    const memberIds = await getTeamMemberIds([...new Set(getTeamScope(actor, "employees_view"))]);
    filter._id = memberIds.length > 0 ? { $in: memberIds } : actor.id;
  } else if (isEmployee(actor)) {
    filter._id = actor.id;
  }

  const users = await User.find(filter)
    .select("_id email about.firstName about.lastName userRole department teams")
    .populate("department", "title")
    .populate("teams", "name")
    .sort({ "about.firstName": 1 })
    .lean();

  return ok(users);
}
