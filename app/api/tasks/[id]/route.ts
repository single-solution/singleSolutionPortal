import { connectDB } from "@/lib/db";
import ActivityTask from "@/lib/models/ActivityTask";
import Campaign from "@/lib/models/Campaign";
import User from "@/lib/models/User";
import { unauthorized, forbidden, notFound, ok, badRequest, isValidId } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  hasPermission,
  getSubordinateUserIds,
  getCampaignScopeFilter,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return badRequest("Invalid JSON body"); }

  const task = await ActivityTask.findById(id);
  if (!task) return notFound("Task not found");

  const assigneeId = task.assignedTo.toString();
  const isOwner = assigneeId === actor.id;
  const isPrivileged = isSuperAdmin(actor) || hasPermission(actor, "tasks_edit");
  if (!isPrivileged && !isOwner) return forbidden();

  if (isPrivileged && !isSuperAdmin(actor) && !isOwner) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    if (!subordinateIds.includes(assigneeId)) {
      return forbidden("Can only edit tasks assigned to employees within your hierarchy");
    }
  }

  const validStatuses = ["pending", "inProgress", "completed"];
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
    if (body.campaign !== undefined) {
      if (body.campaign) {
        if (!isSuperAdmin(actor)) {
          const scopeFilter = await getCampaignScopeFilter(actor);
          const campaignDoc = await Campaign.findOne({ _id: body.campaign, ...scopeFilter }).select("_id").lean();
          if (!campaignDoc) return badRequest("Campaign not found or outside your hierarchy");
        }
        task.campaign = body.campaign;
      } else {
        task.campaign = undefined;
      }
    }
    if (body.assignedTo) {
      if (!isSuperAdmin(actor) && !hasPermission(actor, "tasks_reassign")) {
        return forbidden("You don't have permission to reassign tasks");
      }
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
    if (body.recurrence !== undefined) {
      if (body.recurrence === null) {
        task.recurrence = undefined;
      } else if (body.recurrence.frequency) {
        const validFreqs = ["weekly", "monthly"];
        if (validFreqs.includes(body.recurrence.frequency) && Array.isArray(body.recurrence.days) && body.recurrence.days.length > 0) {
          const maxVal = body.recurrence.frequency === "weekly" ? 6 : 31;
          const minVal = body.recurrence.frequency === "weekly" ? 0 : 1;
          const days = body.recurrence.days.filter((d: number) => typeof d === "number" && d >= minVal && d <= maxVal);
          if (days.length > 0) {
            task.recurrence = { frequency: body.recurrence.frequency, days } as typeof task.recurrence;
          }
        }
      }
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
  if (!hasPermission(actor, "tasks_delete")) return forbidden();

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
