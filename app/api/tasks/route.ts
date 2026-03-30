import { connectDB } from "@/lib/db";
import ActivityTask from "@/lib/models/ActivityTask";
import User from "@/lib/models/User";
import { getSession, unauthorized, forbidden, badRequest, ok } from "@/lib/helpers";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  await connectDB();

  const role = session.user.role;
  let filter: Record<string, unknown> = { isActive: true };

  if (role === "manager") {
    const me = await User.findById(session.user.id).select("department").lean();
    if (me?.department) {
      const teamIds = await User.find({ department: me.department, isActive: true }).distinct("_id");
      filter.assignedTo = { $in: teamIds };
    } else {
      filter.assignedTo = session.user.id;
    }
  } else if (role !== "superadmin") {
    filter.assignedTo = session.user.id;
  }

  const tasks = await ActivityTask.find(filter)
    .populate("assignedTo", "about.firstName about.lastName email userRole department")
    .sort({ createdAt: -1 })
    .lean();

  return ok(tasks);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "superadmin" && session.user.role !== "manager") return forbidden();

  await connectDB();
  const body = await req.json();

  if (!body.title?.trim() || !body.assignedTo) {
    return badRequest("Title and assignedTo are required");
  }

  const task = await ActivityTask.create({
    title: body.title.trim(),
    description: body.description ?? "",
    assignedTo: body.assignedTo,
    deadline: body.deadline || undefined,
    priority: body.priority ?? "medium",
    status: body.status ?? "pending",
    isActive: true,
    createdBy: session.user.id,
  });

  const populated = await ActivityTask.findById(task._id)
    .populate("assignedTo", "about.firstName about.lastName email userRole")
    .lean();

  return ok(populated);
}
