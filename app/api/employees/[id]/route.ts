import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import Department from "@/lib/models/Department";
import Membership from "@/lib/models/Membership";
import { unauthorized, forbidden, badRequest, notFound, ok, isValidId } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  hasPermission,
  getSubordinateUserIds,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";
import bcrypt from "bcryptjs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  if (id !== actor.id) {
    if (!hasPermission(actor, "employees_view")) return forbidden("You don't have permission to view employee profiles");
    if (!isSuperAdmin(actor)) {
      const subordinateIds = await getSubordinateUserIds(actor.id);
      if (!subordinateIds.includes(id)) return forbidden();
    }
  }

  const user = await User.findById(id)
    .select("-password")
    .lean();

  if (!user) return notFound("Employee not found");

  return ok(user);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  if (actor.id === id) return forbidden("Use the Profile page to edit your own details");

  if (!isSuperAdmin(actor) && !hasPermission(actor, "employees_edit")) return forbidden();

  if (!isSuperAdmin(actor)) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    if (!subordinateIds.includes(id)) return forbidden("Can only edit employees within your hierarchy");
  }

  await connectDB();

  const target = await User.findById(id).select("isSuperAdmin").lean();
  if (target?.isSuperAdmin && !actor.isSuperAdmin) return forbidden("Cannot modify a superadmin account");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return badRequest("Invalid JSON body"); }
  delete body.isSuperAdmin;

  const update: Record<string, unknown> = { updatedBy: actor.id };

  if (body.fullName !== undefined) {
    const parts = body.fullName.trim().split(/\s+/);
    update["about.firstName"] = parts[0] || "";
    update["about.lastName"] = parts.slice(1).join(" ");
  }
  if (body.phone !== undefined) update["about.phone"] = body.phone;
  if (body.weeklySchedule) update.weeklySchedule = body.weeklySchedule;
  if (typeof body.graceMinutes === "number") update.graceMinutes = body.graceMinutes;
  if (body.shiftType) update.shiftType = body.shiftType;

  if (typeof body.salary === "number" && Number.isFinite(body.salary) && hasPermission(actor, "payroll_manageSalary")) {
    update.salary = body.salary;
  }

  if (body.isActive !== undefined && (isSuperAdmin(actor) || hasPermission(actor, "employees_toggleStatus"))) {
    update.isActive = body.isActive;
  }

  if (isSuperAdmin(actor)) {
    if (body.email) {
      const dup = await User.findOne({ email: body.email.toLowerCase(), _id: { $ne: id } });
      if (dup) return badRequest("Email already in use");
      update.email = body.email.toLowerCase().trim();
    }
    if (body.username) {
      const dup = await User.findOne({ username: body.username.toLowerCase(), _id: { $ne: id } });
      if (dup) return badRequest("Username already in use");
      update.username = body.username.toLowerCase().trim();
    }
    if (body.password) {
      if (typeof body.password !== "string" || body.password.length < 8) {
        return badRequest("Password must be at least 8 characters");
      }
      update.password = await bcrypt.hash(body.password, 12);
    }

    if (Array.isArray(body.managedDepartments)) {
      await Department.updateMany({ manager: id }, { $unset: { manager: 1 } });
      if (body.managedDepartments.length > 0) {
        await Department.updateMany(
          { _id: { $in: body.managedDepartments } },
          { $set: { manager: id } },
        );
      }
    }
  }

  const user = await User.findByIdAndUpdate(id, { $set: update }, { new: true })
    .select("-password")
    .lean();

  if (!user) return notFound("Employee not found");

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "updated employee",
    entity: "employee",
    entityId: id,
    details: `${(user as Record<string, unknown> & { about?: { firstName?: string; lastName?: string } }).about?.firstName ?? ""} ${(user as Record<string, unknown> & { about?: { firstName?: string; lastName?: string } }).about?.lastName ?? ""}`.trim(),
    targetUserIds: [id],
    visibility: "targeted",
  });

  return ok(user);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "employees_delete")) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  if (actor.id === id) return badRequest("Cannot delete yourself");

  const target = await User.findById(id).select("isSuperAdmin").lean();
  if (!target) return notFound("Employee not found");
  if (target.isSuperAdmin) return badRequest("Cannot delete superadmin");

  if (!isSuperAdmin(actor)) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    if (!subordinateIds.includes(id)) return forbidden("Can only delete employees within your hierarchy");
  }

  await Membership.deleteMany({ user: id });
  await User.findByIdAndDelete(id);

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "deleted employee",
    entity: "employee",
    entityId: id,
    targetUserIds: [],
    visibility: "targeted",
  });

  return ok({ message: "Employee deleted" });
}
