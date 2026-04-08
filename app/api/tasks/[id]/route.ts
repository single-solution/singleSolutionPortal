import { connectDB } from "@/lib/db";
import ActivityTask from "@/lib/models/ActivityTask";
import User from "@/lib/models/User";
import { unauthorized, forbidden, notFound, ok, badRequest, isValidId } from "@/lib/helpers";
import {
  getVerifiedSession,
  isAdmin,
  isManager,
  isTeamLead,
  canManageTasks,
  canAssignTaskTo,
  getTeamMemberIds,
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
      const target = await User.findById(body.assignedTo).select("userRole department teams").lean();
      if (target?.userRole === "superadmin") return badRequest("Cannot assign tasks to superadmin");

      const targetTeams = (target?.teams as { toString(): string }[] | undefined)?.map((t) => t.toString()) ?? [];

      if (isManager(actor) && !canAssignTaskTo(actor, target?.department?.toString(), targetTeams)) {
        return badRequest("Can only assign tasks to employees in your department");
      }
      if (isTeamLead(actor)) {
        const leadTeamIds = actor.memberships.filter((m) => m.teamId).map((m) => m.teamId!);
        const memberIds = await getTeamMemberIds(leadTeamIds);
        if (!memberIds.includes(body.assignedTo) && body.assignedTo !== actor.id) {
          return badRequest("Can only assign tasks to your team members");
        }
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
  const assigneeIdStr = task.assignedTo.toString();
  logActivity({
    userEmail: actor.email,
    userName: "",
    userRole: actor.isSuperAdmin ? "superadmin" : "employee",
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

  const task = await ActivityTask.findById(id).populate("assignedTo", "department teams");
  if (!task) return notFound("Task not found");

  if (isManager(actor)) {
    const assigneeDept = (task.assignedTo as unknown as { department?: { toString(): string } })?.department;
    if (!canAssignTaskTo(actor, assigneeDept?.toString())) {
      return forbidden();
    }
  }

  if (isTeamLead(actor)) {
    const leadTeamIds = actor.memberships.filter((m) => m.teamId).map((m) => m.teamId!);
    const memberIds = await getTeamMemberIds(leadTeamIds);
    const assigneeId = (task.assignedTo as unknown as { _id?: { toString(): string } })?._id?.toString() ?? task.assignedTo.toString();
    if (!memberIds.includes(assigneeId) && assigneeId !== actor.id) {
      return forbidden();
    }
  }

  task.isActive = false;
  await task.save();

  const delAssigneeId = (task.assignedTo as unknown as { _id?: { toString(): string } })?._id?.toString() ?? task.assignedTo?.toString() ?? "";
  logActivity({
    userEmail: actor.email,
    userName: "",
    userRole: actor.isSuperAdmin ? "superadmin" : "employee",
    action: "deleted task",
    entity: "task",
    entityId: id,
    details: task.title,
    targetUserIds: delAssigneeId ? [delAssigneeId] : [],
    visibility: "targeted",
  });

  return ok({ message: "Task deleted" });
}
