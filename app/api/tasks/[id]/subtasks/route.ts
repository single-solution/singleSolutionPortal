import { connectDB } from "@/lib/db";
import ActivityTask from "@/lib/models/ActivityTask";
import { unauthorized, forbidden, ok, badRequest, notFound, isValidId } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin, hasPermission, getSubordinateUserIds } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const parent = await ActivityTask.findById(id).select("assignedTo").lean();
  if (!parent) return notFound("Parent task not found");

  if (!isSuperAdmin(actor)) {
    const isAssigned = await ActivityTask.exists({ _id: id, assignedTo: actor.id });
    if (!isAssigned) {
      if (!hasPermission(actor, "tasks_view")) return forbidden();
      const subordinateIds = await getSubordinateUserIds(actor.id);
      const hasAccess = await ActivityTask.exists({ _id: id, assignedTo: { $in: subordinateIds } });
      if (!hasAccess) return forbidden();
    }
  }

  const filter: Record<string, unknown> = { parentTask: id };
  if (!isSuperAdmin(actor) && !hasPermission(actor, "tasks_view")) {
    filter.isActive = true;
  }

  const subtasks = await ActivityTask.find(filter)
    .populate("assignedTo", "about.firstName about.lastName email")
    .populate("userStatuses.user", "about.firstName about.lastName email")
    .populate("createdBy", "about.firstName about.lastName email")
    .sort({ order: 1, createdAt: 1 })
    .lean();

  return ok(subtasks);
}
