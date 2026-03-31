import { connectDB } from "@/lib/db";
import ActivityTask from "@/lib/models/ActivityTask";
import User from "@/lib/models/User";
import { unauthorized, forbidden, notFound, ok, badRequest, isValidId } from "@/lib/helpers";
import {
  getVerifiedSession,
  isAdmin,
  isManager,
  canManageTasks,
  canAssignTaskTo,
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

  const isPrivileged = isAdmin(actor);
  const isOwner = task.assignedTo.toString() === actor.id;
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
    if (body.assignedTo) {
      const target = await User.findById(body.assignedTo).select("userRole department").lean();
      if (target?.userRole === "superadmin") return badRequest("Cannot assign tasks to superadmin");
      if (isManager(actor) && !canAssignTaskTo(actor, target?.department?.toString())) {
        return badRequest("Can only assign tasks to employees in your department");
      }
      task.assignedTo = body.assignedTo;
    }
  }
  if (body.status !== undefined) task.status = body.status;
  task.updatedBy = actor.id as unknown as typeof task.updatedBy;

  await task.save();

  const populated = await ActivityTask.findById(task._id)
    .populate("assignedTo", "about.firstName about.lastName email userRole")
    .lean();

  const changes = Object.keys(body).filter((k) => k !== "assignedTo").join(", ");
  logActivity({
    userEmail: actor.email,
    userName: "",
    action: `updated task${body.status ? ` → ${body.status}` : ""}`,
    entity: "task",
    entityId: id,
    details: changes ? `Changed: ${changes}` : task.title,
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

  const task = await ActivityTask.findById(id).populate("assignedTo", "department");
  if (!task) return notFound("Task not found");

  if (isManager(actor)) {
    const assigneeDept = (task.assignedTo as unknown as { department?: { toString(): string } })?.department;
    if (!canAssignTaskTo(actor, assigneeDept?.toString())) {
      return forbidden();
    }
  }

  task.isActive = false;
  await task.save();

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "deleted task",
    entity: "task",
    entityId: id,
    details: task.title,
  });

  return ok({ message: "Task deleted" });
}
