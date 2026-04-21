import { connectDB } from "@/lib/db";
import Department from "@/lib/models/Department";
import User from "@/lib/models/User";
import Membership from "@/lib/models/Membership";
import FlowLayout from "@/lib/models/FlowLayout";
import { unauthorized, forbidden, notFound, ok, badRequest, isValidId } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  hasPermission,
  getHierarchyDepartmentIds,
  getSubordinateUserIds,
  invalidateHierarchyCache,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "departments_edit")) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  if (!isSuperAdmin(actor)) {
    const hierarchyDeptIds = await getHierarchyDepartmentIds(actor.id);
    if (!hierarchyDeptIds.includes(id)) return forbidden("Can only edit departments within your hierarchy");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return badRequest("Invalid JSON body"); }

  if (body.managerId) {
    if (!isValidId(body.managerId)) return badRequest("Invalid managerId");
    const mgr = await User.findById(body.managerId).select("isSuperAdmin").lean();
    if (mgr?.isSuperAdmin === true) return badRequest("Superadmin cannot be set as department manager");
    if (!isSuperAdmin(actor)) {
      const subordinateIds = await getSubordinateUserIds(actor.id);
      if (!subordinateIds.includes(body.managerId) && body.managerId !== actor.id) {
        return badRequest("Manager must be within your hierarchy");
      }
    }
  }

  if (body.parentId !== undefined && body.parentId) {
    if (!isValidId(body.parentId)) return badRequest("Invalid parentId");
    if (body.parentId === id) return badRequest("A department cannot be its own parent");
    if (!isSuperAdmin(actor)) {
      const hierarchyDeptIds = await getHierarchyDepartmentIds(actor.id);
      if (!hierarchyDeptIds.includes(body.parentId)) {
        return badRequest("Parent department must be within your hierarchy");
      }
    }
    let cur = body.parentId;
    const seen = new Set<string>([id]);
    while (cur) {
      if (seen.has(cur)) return badRequest("Circular department hierarchy detected");
      seen.add(cur);
      const parent = await Department.findById(cur).select("parentDepartment").lean();
      cur = parent?.parentDepartment?.toString() ?? null;
    }
  }

  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    return badRequest("isActive must be a boolean");
  }

  const update: Record<string, unknown> = { updatedBy: actor.id };
  if (body.title?.trim()) update.title = body.title.trim();
  if (body.description !== undefined) update.description = body.description;
  if (body.managerId !== undefined) update.manager = body.managerId || null;
  if (body.parentId !== undefined) update.parentDepartment = body.parentId || null;
  if (typeof body.isActive === "boolean") update.isActive = body.isActive;

  const dept = await Department.findByIdAndUpdate(id, { $set: update }, { new: true })
    .populate("manager", "about.firstName about.lastName email")
    .populate("parentDepartment", "title slug")
    .lean();

  if (!dept) return notFound("Department not found");

  let cascadeCount = 0;
  if (body.isActive === false) {
    const result = await Membership.updateMany(
      { department: id },
      { $set: { isActive: false }, $addToSet: { deactivatedBy: "department" } },
    );
    cascadeCount = result.modifiedCount;
  } else if (body.isActive === true) {
    await Membership.updateMany(
      { department: id, deactivatedBy: "department" },
      { $pull: { deactivatedBy: "department" } },
    );
    const result = await Membership.updateMany(
      { department: id, isActive: false, deactivatedBy: { $size: 0 } },
      { $set: { isActive: true } },
    );
    cascadeCount = result.modifiedCount;
  }

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: body.isActive === false ? "deactivated department" : body.isActive === true ? "activated department" : "updated department",
    entity: "department",
    entityId: id,
    details: (dept as Record<string, unknown> & { title?: string }).title ?? "",
    targetDepartmentId: id,
    targetUserIds: body.managerId ? [body.managerId] : [],
    visibility: "targeted",
  });

  invalidateHierarchyCache();
  return ok({ ...dept, cascadeCount });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "departments_delete")) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  if (!isSuperAdmin(actor)) {
    const hierarchyDeptIds = await getHierarchyDepartmentIds(actor.id);
    if (!hierarchyDeptIds.includes(id)) return forbidden("Can only delete departments within your hierarchy");
  }

  const dept = await Department.findById(id).lean();
  if (!dept) return notFound("Department not found");

  const deptKey = `dept-${id}`;
  await Promise.all([
    Membership.deleteMany({ department: id }),
    Department.updateMany({ parentDepartment: id }, { $unset: { parentDepartment: 1 } }),
    FlowLayout.updateMany(
      { canvasId: "org" },
      {
        $pull: { links: { $or: [{ source: deptKey }, { target: deptKey }] } },
        $unset: { [`positions.${deptKey}`]: 1 },
      },
    ),
  ]);
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

  invalidateHierarchyCache();
  return ok({ message: "Department deleted" });
}
