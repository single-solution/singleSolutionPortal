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
  if (!hasPermission(actor, "employees_view")) return ok([]);

  await connectDB();

  const filter: Record<string, unknown> = { isSuperAdmin: { $ne: true } };

  if (isSuperAdmin(actor)) {
    // SuperAdmin sees all
  } else {
    filter.isActive = true;
    const subordinateIds = await getSubordinateUserIds(actor.id);
    if (subordinateIds.length === 0) {
      filter._id = actor.id;
    } else {
      filter._id = { $in: [actor.id, ...subordinateIds] };
    }
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
