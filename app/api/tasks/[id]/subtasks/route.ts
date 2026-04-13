import { connectDB } from "@/lib/db";
import ActivityTask from "@/lib/models/ActivityTask";
import { unauthorized, ok, badRequest, isValidId } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin, hasPermission, getSubordinateUserIds } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const filter: Record<string, unknown> = { parentTask: id, isActive: true };

  if (!isSuperAdmin(actor) && !hasPermission(actor, "tasks_view")) {
    filter.assignedTo = actor.id;
  } else if (!isSuperAdmin(actor)) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    filter.assignedTo = { $in: [actor.id, ...subordinateIds] };
  }

  const subtasks = await ActivityTask.find(filter)
    .populate("assignedTo", "about.firstName about.lastName email")
    .sort({ order: 1, createdAt: 1 })
    .lean();

  return ok(subtasks);
}
