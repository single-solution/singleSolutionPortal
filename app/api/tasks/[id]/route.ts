import { connectDB } from "@/lib/db";
import ActivityTask from "@/lib/models/ActivityTask";
import "@/lib/models/Campaign";
import User from "@/lib/models/User";
import { unauthorized, forbidden, notFound, ok, badRequest, isValidId } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  hasPermission,
  canManageTasks,
  getSubordinateUserIds,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();
  const body = await req.json();

  const task = await ActivityTask.findById(id);
  if (!task) return notFound("Task not found");

  const isOwner = task.assignedTo.toString() === actor.id;
  const isPrivileged = isSuperAdmin(actor) || hasPermission(actor, "tasks_edit");
  if (!isPrivileged && !isOwner) return forbidden();

  const validStatuses = ["pending", "in-progress", "completed", "cancelled"];
  const validPriorities = ["low", "medium", "high", "urgent"];

  if (body.status !== undefined && !validStatuses.includes(body.status)) {
    return badRequest(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
  }
  if (body.priority !== undefined && !validPriorities.includes(body.priority)) {
    return badRequest(`Invalid priority. Must be one of: ${validPriorities.join(", ")}`);
  }

  if (isOwner && !isPrivileged) {
    const ownerAllowed = ["status"];
    const attempted = Object.keys(body);
    const disallowed = attempted.filter((k) => !ownerAllowed.includes(k));
    if (disallowed.length > 0) {
      return badRequest(`Assignees can only update: ${ownerAllowed.join(", ")}`);
    }
  }

  if (isPrivileged) {
    if (body.title !== undefined) task.title = body.title;
    if (body.description !== undefined) task.description = body.description;
    if (body.priority !== undefined) task.priority = body.priority;
    if (body.deadline !== undefined) task.deadline = body.deadline;
    if (body.campaign !== undefined) task.campaign = body.campaign || undefined;
    if (body.assignedTo) {
      const target = await User.findById(body.assignedTo).select("isSuperAdmin").lean();
      if (target?.isSuperAdmin === true) return badRequest("Cannot assign tasks to superadmin");

      if (!isSuperAdmin(actor)) {
        const subordinateIds = await getSubordinateUserIds(actor.id);
        if (!subordinateIds.includes(body.assignedTo)) {
          return badRequest("Can only assign tasks to employees within your hierarchy");
        }
      }
      task.assignedTo = body.assignedTo;
    }
  }
  if (body.status !== undefined) task.status = body.status;
  task.updatedBy = actor.id as unknown as typeof task.updatedBy;

  await task.save();

  const populated = await ActivityTask.findById(task._id)
    .populate("assignedTo", "about.firstName about.lastName email")
    .populate("campaign", "name status")
    .lean();

  const changes = Object.keys(body).filter((k) => k !== "assignedTo").join(", ");
  const assigneeIdStr = task.assignedTo.toString();
  logActivity({
    userEmail: actor.email,
    userName: "",
    action: `updated task${body.status ? ` → ${body.status}` : ""}`,
    entity: "task",
    entityId: id,
    details: changes ? `Changed: ${changes}` : task.title,
    targetUserIds: assigneeIdStr !== actor.id ? [assigneeIdStr] : [],
    visibility: "targeted",
  });

  return ok(populated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!canManageTasks(actor)) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const task = await ActivityTask.findById(id);
  if (!task) return notFound("Task not found");

  if (!isSuperAdmin(actor)) {
    const assigneeId = task.assignedTo.toString();
    const subordinateIds = await getSubordinateUserIds(actor.id);
    if (!subordinateIds.includes(assigneeId)) {
      return forbidden("Can only delete tasks assigned to employees within your hierarchy");
    }
  }

  const taskTitle = task.title;
  const assigneeIdStr = task.assignedTo.toString();
  await task.deleteOne();

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "deleted task",
    entity: "task",
    entityId: id,
    details: taskTitle,
    targetUserIds: assigneeIdStr ? [assigneeIdStr] : [],
    visibility: "targeted",
  });

  return ok({ message: "Task deleted" });
}
