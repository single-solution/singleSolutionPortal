import { connectDB } from "@/lib/db";
import ActivityLog from "@/lib/models/ActivityLog";
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
  const isPrivileged =
    isSuperAdmin(actor) || hasPermission(actor, "activityLogs_view") || hasPermission(actor, "tasks_view");

  if (!isPrivileged && !isOwner) return forbidden();

  if (!isSuperAdmin(actor) && !isOwner && !hasPermission(actor, "activityLogs_view")) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    const hasAccess = assigneeIds.some((aid: string) => subordinateIds.includes(aid));
    if (!hasAccess) return forbidden();
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "7"), 30);

  const logs = await ActivityLog.find({ entity: "task", entityId: id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return ok({ logs });
}
