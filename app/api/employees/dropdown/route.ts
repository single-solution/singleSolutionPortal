import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { unauthorized, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  getSubordinateUserIds,
} from "@/lib/permissions";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

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

  const users = await User.find(filter)
    .select("_id email about.firstName about.lastName")
    .sort({ "about.firstName": 1 })
    .lean();

  return ok(users);
}
