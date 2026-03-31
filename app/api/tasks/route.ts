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

  if (isManager(actor)) {
    if (actor.department) {
      const teamIds = await User.find({
        department: actor.department,
        isActive: true,
        userRole: { $ne: "superadmin" },
      }).distinct("_id");
      filter.assignedTo = { $in: teamIds };
    } else {
      filter.assignedTo = actor.id;
    }
  } else if (isTeamLead(actor)) {
    const memberIds = await getTeamMemberIds(actor.leadOfTeams);
    if (memberIds.length > 0) {
      filter.assignedTo = { $in: [...memberIds, actor.id] };
    } else {
      filter.assignedTo = actor.id;
    }
  } else if (!isSuperAdmin(actor)) {
    filter.assignedTo = actor.id;
  }

  const tasks = await ActivityTask.find(filter)
    .populate("assignedTo", "about.firstName about.lastName email userRole department teams")
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

  const assignee = await User.findById(body.assignedTo).select("userRole department teams").lean();
  if (!assignee) return badRequest("Assignee not found");
  if (assignee.userRole === "superadmin") return badRequest("Cannot assign tasks to superadmin");

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
    .populate("assignedTo", "about.firstName about.lastName email userRole")
    .lean();

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "created task",
    entity: "task",
    entityId: task._id.toString(),
    details: body.title.trim(),
  });

  return ok(populated);
}
