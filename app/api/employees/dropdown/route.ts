import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { unauthorized, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  hasPermission,
  getSubordinateUserIds,
} from "@/lib/permissions";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

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

  return ok(users);
}
