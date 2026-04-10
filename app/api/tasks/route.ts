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
  if (!hasPermission(actor, "tasks_view")) return ok([]);

  await connectDB();

  let filter: Record<string, unknown> = { isActive: true };

  if (isSuperAdmin(actor)) {
    // SuperAdmin sees all tasks
  } else {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    filter.assignedTo = { $in: [actor.id, ...subordinateIds] };
  }

  const tasks = await ActivityTask.find(filter)
    .populate("assignedTo", "about.firstName about.lastName email")
    .populate("campaign", "name status")
    .populate("createdBy", "about.firstName about.lastName email")
    .sort({ createdAt: -1 })
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

  const task = await ActivityTask.create({
    title: body.title.trim(),
    description: body.description ?? "",
    assignedTo: body.assignedTo,
    campaign: campaignId,
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
