import { connectDB } from "@/lib/db";
import Department from "@/lib/models/Department";
import User from "@/lib/models/User";
import Membership from "@/lib/models/Membership";
import { unauthorized, forbidden, notFound, ok, badRequest, isValidId } from "@/lib/helpers";
import { getVerifiedSession, hasPermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "departments_edit")) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();
  const body = await req.json();

  if (body.managerId) {
    const mgr = await User.findById(body.managerId).select("isSuperAdmin").lean();
    if (mgr?.isSuperAdmin === true) return badRequest("Superadmin cannot be set as department manager");
  }

  const update: Record<string, unknown> = { updatedBy: actor.id };
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
    userEmail: actor.email,
    userName: "",
    action: "updated department",
    entity: "department",
    entityId: id,
    details: (dept as Record<string, unknown> & { title?: string }).title ?? "",
    targetDepartmentId: id,
    targetUserIds: body.managerId ? [body.managerId] : [],
    visibility: "targeted",
  });

  return ok(dept);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "departments_delete")) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const dept = await Department.findById(id).lean();
  if (!dept) return notFound("Department not found");

  await Membership.deleteMany({ department: id });
  await Department.findByIdAndDelete(id);

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "deleted department",
    entity: "department",
    entityId: id,
    targetDepartmentId: id,
    visibility: "targeted",
  });

  return ok({ message: "Department deleted" });
}
