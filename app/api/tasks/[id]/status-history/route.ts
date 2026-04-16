import { connectDB } from "@/lib/db";
import TaskStatusLog from "@/lib/models/TaskStatusLog";
import ActivityTask from "@/lib/models/ActivityTask";
import { unauthorized, forbidden, notFound, ok, badRequest, isValidId } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  hasPermission,
  getSubordinateUserIds,
} from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid task ID");

  await connectDB();

  const task = await ActivityTask.findById(id).select("assignedTo").lean();
  if (!task) return notFound("Task not found");

  const assigneeIds: string[] = (task.assignedTo ?? []).map((a: unknown) => String(a));
  const isOwner = assigneeIds.includes(actor.id);
  const isPrivileged = isSuperAdmin(actor) || hasPermission(actor, "tasks_view");

  if (!isPrivileged && !isOwner) return forbidden();

  if (!isSuperAdmin(actor) && !isOwner) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    const hasAccess = assigneeIds.some((aid: string) => subordinateIds.includes(aid));
    if (!hasAccess) return forbidden();
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = { task: id };

  if (userId) {
    if (!isPrivileged && userId !== actor.id) return forbidden();
    filter.employee = userId;
  } else if (!isPrivileged) {
    filter.employee = actor.id;
  }

  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }

  const logs = await TaskStatusLog.find(filter)
    .populate("employee", "about.firstName about.lastName email")
    .populate("changedBy", "about.firstName about.lastName email")
    .sort({ date: -1, changedAt: -1 })
    .limit(200)
    .lean();

  return ok(logs);
}
