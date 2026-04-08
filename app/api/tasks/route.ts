import { connectDB } from "@/lib/db";
import ActivityTask from "@/lib/models/ActivityTask";
import User from "@/lib/models/User";
import { unauthorized, forbidden, badRequest, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  isManager,
  isTeamLead,
  canManageTasks,
  canAssignTaskTo,
  getTeamMemberIds,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  let filter: Record<string, unknown> = { isActive: true };

  const actorTeamIds = actor.memberships.filter((m) => m.teamId).map((m) => m.teamId!);
  const primaryDeptId = actor.memberships[0]?.departmentId;

  if (isManager(actor)) {
    if (primaryDeptId) {
      const teamIds = await User.find({
        department: primaryDeptId,
        isActive: true,
        isSuperAdmin: { $ne: true },
      }).distinct("_id");
      filter.assignedTo = { $in: teamIds };
    } else {
      filter.assignedTo = actor.id;
    }
  } else if (isTeamLead(actor)) {
    const memberIds = await getTeamMemberIds(actorTeamIds);
    if (memberIds.length > 0) {
      filter.assignedTo = { $in: [...memberIds, actor.id] };
    } else {
      filter.assignedTo = actor.id;
    }
  } else if (!isSuperAdmin(actor)) {
    filter.assignedTo = actor.id;
  }

  const tasks = await ActivityTask.find(filter)
    .populate("assignedTo", "about.firstName about.lastName email department teams")
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
  const body = await req.json();

  if (!body.title?.trim() || !body.assignedTo) {
    return badRequest("Title and assignedTo are required");
  }

  const assignee = await User.findById(body.assignedTo).select("isSuperAdmin department teams").lean();
  if (!assignee) return badRequest("Assignee not found");
  if (assignee.isSuperAdmin === true) return badRequest("Cannot assign tasks to superadmin");

  const assigneeTeams = (assignee.teams as { toString(): string }[] | undefined)?.map((t) => t.toString()) ?? [];

  if (!canAssignTaskTo(actor, assignee.department?.toString(), assigneeTeams)) {
    return badRequest("Can only assign tasks to employees in your department or team");
  }

  const task = await ActivityTask.create({
    title: body.title.trim(),
    description: body.description ?? "",
    assignedTo: body.assignedTo,
    deadline: body.deadline || undefined,
    priority: body.priority ?? "medium",
    status: body.status ?? "pending",
    isActive: true,
    createdBy: actor.id,
  });

  const populated = await ActivityTask.findById(task._id)
    .populate("assignedTo", "about.firstName about.lastName email")
    .lean();

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "created task",
    entity: "task",
    entityId: task._id.toString(),
    details: body.title.trim(),
    targetUserIds: [body.assignedTo],
    targetDepartmentId: assignee.department?.toString() || undefined,
    targetTeamIds: assigneeTeams,
    visibility: "targeted",
  });

  return ok(populated);
}
