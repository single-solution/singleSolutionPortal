import ActivityTask from "@/lib/models/ActivityTask";
import Campaign from "@/lib/models/Campaign";
import User from "@/lib/models/User";
import { unauthorized, forbidden, badRequest, ok, parseBody } from "@/lib/helpers";
import { parseRecurrence } from "@/lib/campaignHelpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  hasPermission,
  getSubordinateUserIds,
  getCampaignScopeFilter,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const filter: Record<string, unknown> = { parentTask: null };

  if (isSuperAdmin(actor)) {
    // SuperAdmin sees all tasks including inactive
  } else if (hasPermission(actor, "tasks_view")) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    filter.assignedTo = { $in: [actor.id, ...subordinateIds] };
  } else {
    filter.assignedTo = actor.id;
    filter.isActive = true;
  }

  const tasks = await ActivityTask.find(filter)
    .populate("assignedTo", "about.firstName about.lastName email")
    .populate("userStatuses.user", "about.firstName about.lastName email")
    .populate("campaign", "name status")
    .populate("createdBy", "about.firstName about.lastName email")
    .sort({ order: 1, createdAt: -1 })
    .lean();

  if (!isSuperAdmin(actor) && !hasPermission(actor, "tasks_view")) {
    for (const t of tasks) {
      if (Array.isArray(t.userStatuses)) {
        t.userStatuses = t.userStatuses.filter(
          (us: { user?: { _id?: string } | string }) => {
            const uid = typeof us.user === "object" && us.user ? (us.user._id?.toString() ?? "") : String(us.user);
            return uid === actor.id;
          },
        );
      }
    }
  }

  return ok(tasks);
}

export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "tasks_create")) return forbidden();

  const body = await parseBody(req);
  if (body instanceof Response) return body;

  if (!body.title?.trim() || !body.assignedTo) {
    return badRequest("Title and assignedTo are required");
  }

  const assignedIds: string[] = Array.isArray(body.assignedTo) ? body.assignedTo : [body.assignedTo];
  if (assignedIds.length === 0) return badRequest("At least one assignee is required");

  const assignees = await User.find({ _id: { $in: assignedIds } }).select("isSuperAdmin").lean();
  if (assignees.length !== assignedIds.length) return badRequest("One or more assignees not found");
  if (assignees.some((a) => a.isSuperAdmin === true)) return badRequest("Cannot assign tasks to superadmin");

  if (!isSuperAdmin(actor)) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    for (const aid of assignedIds) {
      if (!subordinateIds.includes(aid)) {
        return badRequest("Can only assign tasks to employees within your hierarchy");
      }
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

  const recurrence = parseRecurrence(body.recurrence);
  if (body.recurrence?.frequency && !recurrence) {
    return badRequest("Invalid recurrence. Provide valid frequency and days.");
  }

  const initialStatus = body.status ?? "pending";
  const now = new Date();
  const userStatuses = recurrence
    ? []
    : assignedIds.map((uid: string) => ({ user: uid, status: initialStatus, updatedAt: now }));

  const task = await ActivityTask.create({
    title: body.title.trim(),
    description: body.description ?? "",
    assignedTo: assignedIds,
    campaign: campaignId,
    parentTask: parentTaskId,
    order: typeof body.order === "number" ? body.order : 0,
    recurrence,
    deadline: body.deadline || undefined,
    priority: "medium",
    status: initialStatus,
    userStatuses,
    isActive: true,
    createdBy: actor.id,
  });

  const populated = await ActivityTask.findById(task._id)
    .populate("assignedTo", "about.firstName about.lastName email")
    .populate("userStatuses.user", "about.firstName about.lastName email")
    .populate("campaign", "name status")
    .lean();

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "created task",
    entity: "task",
    entityId: task._id.toString(),
    details: body.title.trim(),
    targetUserIds: assignedIds,
    targetDepartmentId: undefined,
    visibility: "targeted",
  });

  return ok(populated);
}
