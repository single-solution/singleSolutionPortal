import { connectDB } from "@/lib/db";
import ActivityTask from "@/lib/models/ActivityTask";
import ChecklistLog from "@/lib/models/ChecklistLog";
import { unauthorized, badRequest, notFound, ok, isValidId, forbidden } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin } from "@/lib/permissions";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** POST — toggle a recurring task's completion for today */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id: campaignId } = await params;
  if (!isValidId(campaignId)) return badRequest("Invalid campaign ID");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return badRequest("Invalid JSON body"); }

  const { taskId, note } = body;
  if (!taskId || !isValidId(taskId)) return badRequest("taskId is required");

  await connectDB();

  const task = await ActivityTask.findOne({ _id: taskId, campaign: campaignId, isActive: true }).lean();
  if (!task) return notFound("Recurring task not found in this campaign");
  if (!task.recurrence) return badRequest("Task is not recurring");

  const assigneeIds = (Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo]).map((a: unknown) => String(a));
  const isAssigned = assigneeIds.includes(actor.id);
  if (!isAssigned && !isSuperAdmin(actor)) {
    return forbidden("You can only complete tasks assigned to you");
  }

  const today = todayKey();
  const existing = await ChecklistLog.findOne({ task: taskId, employee: actor.id, date: today });

  if (existing) {
    await existing.deleteOne();
    if (task.parentTask) {
      await ChecklistLog.deleteOne({ task: task.parentTask, employee: actor.id, date: today });
    }
    return ok({ done: false, taskId, date: today });
  }

  await ChecklistLog.create({
    task: taskId,
    employee: actor.id,
    date: today,
    note: typeof note === "string" ? note.trim() : "",
  });

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
      }
    }
  }

  return ok({ done: true, taskId, date: today });
}
