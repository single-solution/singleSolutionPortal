import { connectDB } from "@/lib/db";
import ActivityTask from "@/lib/models/ActivityTask";
import Campaign from "@/lib/models/Campaign";
import User from "@/lib/models/User";
import { unauthorized, forbidden, badRequest, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  hasPermission,
  canManageTasks,
  getSubordinateUserIds,
  getCampaignScopeFilter,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  const filter: Record<string, unknown> = { isActive: true, parentTask: null };

  if (isSuperAdmin(actor)) {
    // SuperAdmin sees all tasks
  } else if (hasPermission(actor, "tasks_view")) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    filter.assignedTo = { $in: [actor.id, ...subordinateIds] };
  } else {
    filter.assignedTo = actor.id;
  }

  const tasks = await ActivityTask.find(filter)
    .populate("assignedTo", "about.firstName about.lastName email")
    .populate("campaign", "name status")
    .populate("createdBy", "about.firstName about.lastName email")
    .sort({ order: 1, createdAt: -1 })
    .lean();

  return ok(tasks);
}

export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!canManageTasks(actor)) return forbidden();

  await connectDB();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return badRequest("Invalid JSON body"); }

  if (!body.title?.trim() || !body.assignedTo) {
    return badRequest("Title and assignedTo are required");
  }

  const assignee = await User.findById(body.assignedTo).select("isSuperAdmin").lean();
  if (!assignee) return badRequest("Assignee not found");
  if (assignee.isSuperAdmin === true) return badRequest("Cannot assign tasks to superadmin");

  if (!isSuperAdmin(actor)) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    if (!subordinateIds.includes(body.assignedTo)) {
      return badRequest("Can only assign tasks to employees within your hierarchy");
    }
  }

  let campaignId = body.campaign || undefined;
  if (campaignId && !isSuperAdmin(actor)) {
    const scopeFilter = await getCampaignScopeFilter(actor);
    const campaignDoc = await Campaign.findOne({ _id: campaignId, ...scopeFilter }).select("_id").lean();
    if (!campaignDoc) return badRequest("Campaign not found or outside your hierarchy");
  }

  let parentTaskId = body.parentTask || undefined;
  if (parentTaskId) {
    const parent = await ActivityTask.findById(parentTaskId).select("parentTask").lean();
    if (!parent) return badRequest("Parent task not found");
    if (parent.parentTask) return badRequest("Only one level of subtask nesting is allowed");
  }

  let recurrence: Record<string, unknown> | undefined;
  if (body.recurrence && body.recurrence.frequency) {
    const validFreqs = ["daily", "weekly", "biweekly", "monthly", "custom"];
    if (!validFreqs.includes(body.recurrence.frequency)) {
      return badRequest("Invalid recurrence frequency");
    }
    recurrence = { frequency: body.recurrence.frequency };
    if (body.recurrence.frequency === "custom" && Array.isArray(body.recurrence.days)) {
      recurrence.days = body.recurrence.days.filter((d: number) => d >= 0 && d <= 6);
    }
    if (body.recurrence.time) recurrence.time = body.recurrence.time;
  }

  const task = await ActivityTask.create({
    title: body.title.trim(),
    description: body.description ?? "",
    assignedTo: body.assignedTo,
    campaign: campaignId,
    parentTask: parentTaskId,
    order: typeof body.order === "number" ? body.order : 0,
    recurrence,
    deadline: body.deadline || undefined,
    priority: body.priority ?? "medium",
    status: body.status ?? "pending",
    isActive: true,
    createdBy: actor.id,
  });

  const populated = await ActivityTask.findById(task._id)
    .populate("assignedTo", "about.firstName about.lastName email")
    .populate("campaign", "name status")
    .lean();

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "created task",
    entity: "task",
    entityId: task._id.toString(),
    details: body.title.trim(),
    targetUserIds: [body.assignedTo],
    targetDepartmentId: undefined,
    visibility: "targeted",
  });

  return ok(populated);
}
