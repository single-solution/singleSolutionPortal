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
} from "@/lib/permissions";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  let filter: Record<string, unknown> = {
    userRole: { $ne: "superadmin" },
  };

  if (!isSuperAdmin(actor)) filter.isActive = true;

  if (isManager(actor)) {
    if (!actor.crossDepartmentAccess) {
      if (actor.managedDepartments.length > 0) {
        filter.department = { $in: actor.managedDepartments };
      } else if (actor.department) {
        filter.department = actor.department;
      }
    }
  } else if (isTeamLead(actor)) {
    const memberIds = await getTeamMemberIds(actor.leadOfTeams);
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
