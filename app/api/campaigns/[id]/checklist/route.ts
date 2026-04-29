import ActivityTask from "@/lib/models/ActivityTask";
import ChecklistLog from "@/lib/models/ChecklistLog";
import TaskStatusLog from "@/lib/models/TaskStatusLog";
import { unauthorized, badRequest, notFound, ok, isValidId, forbidden, parseBody } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin } from "@/lib/permissions";
import { todayKey } from "@/lib/campaignHelpers";

/** POST — toggle a recurring task's completion for today */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id: campaignId } = await params;
  if (!isValidId(campaignId)) return badRequest("Invalid campaign ID");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = await parseBody(req);
  if (body instanceof Response) return body;

  const { taskId, note } = body;
  if (!taskId || !isValidId(taskId)) return badRequest("taskId is required");

  const task = await ActivityTask.findOne({ _id: taskId, campaign: campaignId, isActive: true }).lean();
  if (!task) return notFound("Recurring task not found in this campaign");
  if (!task.recurrence) return badRequest("Task is not recurring");

  const assigneeIds = (Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo]).map((a: unknown) => String(a));
  const isAssigned = assigneeIds.includes(actor.id);
  if (!isAssigned && !isSuperAdmin(actor)) {
    return forbidden("You can only complete tasks assigned to you");
  }

  const today = todayKey();
  const now = new Date();
  const existing = await ChecklistLog.findOne({ task: taskId, employee: actor.id, date: today });

  if (existing) {
    await existing.deleteOne();
    TaskStatusLog.create({
      task: taskId, campaign: campaignId, employee: actor.id,
      status: "undone", eventType: "checklistUndo", date: today,
      changedAt: now, changedBy: actor.id,
      note: typeof note === "string" ? note.trim() : "Checklist undone",
    }).catch(() => {});
    if (task.parentTask) {
      await ChecklistLog.deleteOne({ task: task.parentTask, employee: actor.id, date: today });
      TaskStatusLog.create({
        task: task.parentTask, campaign: campaignId, employee: actor.id,
        status: "undone", eventType: "checklistUndo", date: today,
        changedAt: now, changedBy: actor.id, note: "Parent auto-undone: subtask undone",
      }).catch(() => {});
    }
    return ok({ done: false, taskId, date: today });
  }

  await ChecklistLog.create({
    task: taskId,
    employee: actor.id,
    date: today,
    note: typeof note === "string" ? note.trim() : "",
  });
  TaskStatusLog.create({
    task: taskId, campaign: campaignId, employee: actor.id,
    status: "completed", eventType: "checklistComplete", date: today,
    changedAt: now, changedBy: actor.id,
    note: typeof note === "string" ? note.trim() : "",
  }).catch(() => {});

  if (task.parentTask) {
    const siblings = await ActivityTask.find({ parentTask: task.parentTask, isActive: true, recurrence: { $exists: true, $ne: null } }).select("_id").lean();
    const siblingIds = siblings.map((s) => s._id.toString());
    const doneLogs = await ChecklistLog.find({ task: { $in: siblingIds }, employee: actor.id, date: today }).select("task").lean();
    const doneSet = new Set(doneLogs.map((l) => l.task.toString()));
    const allSiblingsDone = siblingIds.every((sid) => doneSet.has(sid));
    if (allSiblingsDone) {
      const parentAlready = await ChecklistLog.findOne({ task: task.parentTask, employee: actor.id, date: today });
      if (!parentAlready) {
        await ChecklistLog.create({ task: task.parentTask, employee: actor.id, date: today, note: "Auto-completed: all subtasks done" });
        TaskStatusLog.create({
          task: task.parentTask, campaign: campaignId, employee: actor.id,
          status: "completed", eventType: "checklistComplete", date: today,
          changedAt: now, changedBy: actor.id, note: "Auto-completed: all subtasks done",
        }).catch(() => {});
      }
    }
  }

  return ok({ done: true, taskId, date: today });
}
