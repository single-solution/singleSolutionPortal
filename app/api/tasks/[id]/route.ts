import { connectDB } from "@/lib/db";
import ActivityTask from "@/lib/models/ActivityTask";
import { getSession, unauthorized, forbidden, notFound, ok, badRequest } from "@/lib/helpers";
import { logActivity } from "@/lib/activityLogger";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  await connectDB();
  const { id } = await params;
  const body = await req.json();

  const task = await ActivityTask.findById(id);
  if (!task) return notFound("Task not found");

  const isAdmin = session.user.role === "superadmin" || session.user.role === "manager";
  const isOwner = task.assignedTo.toString() === session.user.id;
  if (!isAdmin && !isOwner) return forbidden();

  const validStatuses = ["pending", "in-progress", "completed", "cancelled"];
  const validPriorities = ["low", "medium", "high", "urgent"];

  if (body.status !== undefined && !validStatuses.includes(body.status)) {
    return badRequest(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
  }
  if (body.priority !== undefined && !validPriorities.includes(body.priority)) {
    return badRequest(`Invalid priority. Must be one of: ${validPriorities.join(", ")}`);
  }

  if (!isAdmin && !isOwner) {
    const ownerAllowed = ["status"];
    const attempted = Object.keys(body);
    const forbidden_keys = attempted.filter((k) => !ownerAllowed.includes(k));
    if (forbidden_keys.length > 0) {
      return badRequest(`Assignees can only update: ${ownerAllowed.join(", ")}`);
    }
  }

  if (body.title !== undefined) task.title = body.title;
  if (body.description !== undefined) task.description = body.description;
  if (body.priority !== undefined) task.priority = body.priority;
  if (body.status !== undefined) task.status = body.status;
  if (body.deadline !== undefined) task.deadline = body.deadline;
  if (isAdmin && body.assignedTo) {
    const { default: UserModel } = await import("@/lib/models/User");
    const target = await UserModel.findById(body.assignedTo).select("userRole").lean();
    if (target?.userRole === "superadmin") return badRequest("Cannot assign tasks to superadmin");
    task.assignedTo = body.assignedTo;
  }
  task.updatedBy = session.user.id as unknown as typeof task.updatedBy;

  await task.save();

  const populated = await ActivityTask.findById(task._id)
    .populate("assignedTo", "about.firstName about.lastName email userRole")
    .lean();

  const changes = Object.keys(body).filter((k) => k !== "assignedTo").join(", ");
  logActivity({
    userEmail: session.user.email!,
    userName: `${session.user.firstName} ${session.user.lastName}`.trim(),
    action: `updated task${body.status ? ` → ${body.status}` : ""}`,
    entity: "task",
    entityId: id,
    details: changes ? `Changed: ${changes}` : task.title,
  });

  return ok(populated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "superadmin" && session.user.role !== "manager") return forbidden();

  await connectDB();
  const { id } = await params;

  const task = await ActivityTask.findById(id);
  if (!task) return notFound("Task not found");

  task.isActive = false;
  await task.save();

  logActivity({
    userEmail: session.user.email!,
    userName: `${session.user.firstName} ${session.user.lastName}`.trim(),
    action: "deleted task",
    entity: "task",
    entityId: id,
    details: task.title,
  });

  return ok({ message: "Task deleted" });
}
