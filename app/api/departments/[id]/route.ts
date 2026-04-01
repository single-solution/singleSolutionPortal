import { connectDB } from "@/lib/db";
import Department from "@/lib/models/Department";
import User from "@/lib/models/User";
import { getSession, unauthorized, forbidden, notFound, ok, badRequest, isValidId } from "@/lib/helpers";
import { logActivity } from "@/lib/activityLogger";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "superadmin") return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();
  const body = await req.json();

  if (body.managerId) {
    const mgr = await User.findById(body.managerId).select("userRole").lean();
    if (mgr?.userRole === "superadmin") return badRequest("Superadmin cannot be set as department manager");
  }

  const update: Record<string, unknown> = { updatedBy: session.user.id };
  if (body.title?.trim()) update.title = body.title.trim();
  if (body.description !== undefined) update.description = body.description;
  if (body.managerId !== undefined) update.manager = body.managerId || null;
  if (body.parentId !== undefined) update.parentDepartment = body.parentId || null;
  if (body.isActive !== undefined) update.isActive = body.isActive;

  const dept = await Department.findByIdAndUpdate(id, { $set: update }, { new: true })
    .populate("manager", "about.firstName about.lastName email")
    .populate("parentDepartment", "title slug")
    .lean();

  if (!dept) return notFound("Department not found");

  logActivity({
    userEmail: session.user.email!,
    userName: `${session.user.firstName} ${session.user.lastName}`.trim(),
    userRole: session.user.role ?? "superadmin",
    action: "updated department",
    entity: "department",
    entityId: id,
    details: (dept as Record<string, unknown> & { title?: string }).title ?? "",
    targetDepartmentId: id,
    targetUserIds: body.managerId ? [body.managerId] : [],
  });

  return ok(dept);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "superadmin") return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const dept = await Department.findByIdAndUpdate(id, { isActive: false }, { new: true }).lean();
  if (!dept) return notFound("Department not found");

  logActivity({
    userEmail: session.user.email!,
    userName: `${session.user.firstName} ${session.user.lastName}`.trim(),
    userRole: session.user.role ?? "superadmin",
    action: "deleted department",
    entity: "department",
    entityId: id,
    targetDepartmentId: id,
  });

  return ok({ message: "Department deactivated" });
}
