import { connectDB } from "@/lib/db";
import ActivityTask from "@/lib/models/ActivityTask";
import TaskStatusLog from "@/lib/models/TaskStatusLog";
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

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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

  const assigneeIds: string[] = (task.assignedTo ?? []).map((a: unknown) => String(a));
  const isOwner = assigneeIds.includes(actor.id);
  const isPrivileged = isSuperAdmin(actor) || hasPermission(actor, "tasks_edit");
  if (!isPrivileged && !isOwner) return forbidden();

  if (isPrivileged && !isSuperAdmin(actor) && !isOwner) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    const hasAccess = assigneeIds.some((aid: string) => subordinateIds.includes(aid));
    if (!hasAccess) {
      return forbidden("Can only edit tasks assigned to employees within your hierarchy");
    }
  }

  const validStatuses = ["pending", "inProgress", "completed"];

  if (body.status !== undefined && !validStatuses.includes(body.status)) {
    return badRequest(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
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
      const newIds: string[] = Array.isArray(body.assignedTo) ? body.assignedTo : [body.assignedTo];
      const targets = await User.find({ _id: { $in: newIds } }).select("isSuperAdmin").lean();
      if (targets.some((t) => t.isSuperAdmin === true)) return badRequest("Cannot assign tasks to superadmin");

      if (!isSuperAdmin(actor)) {
        const subordinateIds = await getSubordinateUserIds(actor.id);
        for (const nid of newIds) {
          if (!subordinateIds.includes(nid)) {
            return badRequest("Can only assign tasks to employees within your hierarchy");
          }
        }
      }
      task.assignedTo = newIds as unknown as typeof task.assignedTo;

      if (!task.recurrence) {
        const existingMap = new Map(task.userStatuses.map((us: { user: unknown; status: string; updatedAt: Date }) => [String(us.user), us]));
        const now = new Date();
        task.userStatuses = newIds.map((uid) => {
          const existing = existingMap.get(uid);
          return existing ?? { user: uid, status: "pending", updatedAt: now } as typeof task.userStatuses[0];
        });
      }
    }
    if (typeof body.order === "number") task.order = body.order;
    if (typeof body.isActive === "boolean" && body.isActive !== task.isActive) {
      task.isActive = body.isActive;
      const today = todayKey();
      const now = new Date();
      const evType = body.isActive ? "taskEnabled" : "taskDisabled";
      const evStatus = body.isActive ? "enabled" : "disabled";
      for (const aid of assigneeIds) {
        TaskStatusLog.create({
          task: id, campaign: task.campaign ?? null, employee: aid,
          status: evStatus, eventType: evType, date: today,
          changedAt: now, changedBy: actor.id,
          note: body.isActive ? "Task re-enabled" : "Task disabled",
        }).catch(() => {});
      }
      if (!body.isActive) {
        ActivityTask.updateMany({ parentTask: id, isActive: true }, { isActive: false }).catch(() => {});
      }
    } else if (typeof body.isActive === "boolean") {
      task.isActive = body.isActive;
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

  if (body.status !== undefined && !task.recurrence) {
    const targetUserId = body.userId && isPrivileged ? body.userId : actor.id;
    const now = new Date();
    const today = todayKey();

    const us = task.userStatuses.find((s: { user: unknown }) => String(s.user) === targetUserId);
    if (us) {
      us.status = body.status;
      us.updatedAt = now;
    } else {
      task.userStatuses.push({ user: targetUserId, status: body.status, updatedAt: now } as typeof task.userStatuses[0]);
    }

    TaskStatusLog.create({
      task: id,
      campaign: task.campaign ?? null,
      employee: targetUserId,
      status: body.status,
      eventType: "statusChange",
      date: today,
      changedAt: now,
      changedBy: actor.id,
    }).catch(() => {});
  } else if (body.status !== undefined) {
    task.status = body.status;
  }

  task.updatedBy = actor.id as unknown as typeof task.updatedBy;
  await task.save();

  const populated = await ActivityTask.findById(task._id)
    .populate("assignedTo", "about.firstName about.lastName email")
    .populate("userStatuses.user", "about.firstName about.lastName email")
    .populate("campaign", "name status")
    .lean();

  const changes = Object.keys(body).filter((k) => k !== "assignedTo").join(", ");
  logActivity({
    userEmail: actor.email,
    userName: "",
    action: `updated task${body.status ? ` → ${body.status}` : ""}`,
    entity: "task",
    entityId: id,
    details: changes ? `Changed: ${changes}` : task.title,
    targetUserIds: assigneeIds.filter((aid: string) => aid !== actor.id),
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
    const delIds: string[] = (task.assignedTo ?? []).map((a: unknown) => String(a));
    const subordinateIds = await getSubordinateUserIds(actor.id);
    if (!delIds.some((aid: string) => subordinateIds.includes(aid))) {
      return forbidden("Can only delete tasks assigned to employees within your hierarchy");
    }
  }

  const taskTitle = task.title;
  const delTargets: string[] = (task.assignedTo ?? []).map((a: unknown) => String(a));
  await task.deleteOne();

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "deleted task",
    entity: "task",
    entityId: id,
    details: taskTitle,
    targetUserIds: delTargets.filter((aid: string) => aid !== actor.id),
    visibility: "targeted",
  });

  return ok({ message: "Task deleted" });
}
