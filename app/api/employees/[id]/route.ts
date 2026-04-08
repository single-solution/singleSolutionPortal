import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import Team from "@/lib/models/Team";
import Department from "@/lib/models/Department";
import { unauthorized, forbidden, badRequest, notFound, ok, isValidId } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  isManager,
  isTeamLead,
  canViewEmployee,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";
import bcrypt from "bcryptjs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();
  void Team;

  const user = await User.findById(id)
    .select("-password")
    .populate("department", "title slug")
    .populate("teams", "name slug department")
    .populate("reportsTo", "about.firstName about.lastName email")
    .lean();

  if (!user) return notFound("Employee not found");

  const targetDept = user.department
    ? (typeof user.department === "object" && "_id" in user.department ? (user.department as { _id: { toString(): string } })._id.toString() : user.department.toString())
    : null;

  const targetTeams = ((user as Record<string, unknown>).teams as { _id?: { toString(): string } }[] | undefined)?.map((t) => (t._id ? t._id.toString() : String(t))) ?? [];

  if (!canViewEmployee(actor, id, targetDept, targetTeams)) return forbidden();

  return ok(user);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  if (actor.id === id) return forbidden("Use the Profile page to edit your own details");

  if (!isSuperAdmin(actor) && !isManager(actor) && !isTeamLead(actor)) return forbidden();

  await connectDB();

  // Protect superadmin accounts — only another superadmin can edit them
  const target = await User.findById(id).select("isSuperAdmin").lean();
  if (target?.isSuperAdmin && !actor.isSuperAdmin) return forbidden("Cannot modify a superadmin account");

  const body = await req.json();

  // Never allow setting isSuperAdmin through the API
  delete body.isSuperAdmin;

  const update: Record<string, unknown> = { updatedBy: actor.id };

  if (isSuperAdmin(actor)) {
    if (body.fullName !== undefined) {
      const parts = body.fullName.trim().split(/\s+/);
      update["about.firstName"] = parts[0] || "";
      update["about.lastName"] = parts.slice(1).join(" ");
    }
    if (body.phone !== undefined) update["about.phone"] = body.phone;

    if (body.department !== undefined) update.department = body.department || null;
    if (body.reportsTo !== undefined) update.reportsTo = body.reportsTo || null;
    if (body.teams !== undefined) update.teams = body.teams ?? [];
    if (body.isActive !== undefined) update.isActive = body.isActive;
    if (body.workShift) update.workShift = body.workShift;
    if (typeof body.crossDepartmentAccess === "boolean") update.crossDepartmentAccess = body.crossDepartmentAccess;
    if (typeof body.teamStatsVisible === "boolean") update.teamStatsVisible = body.teamStatsVisible;

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
  } else if (isManager(actor)) {
    if (body.workShift) update.workShift = body.workShift;
    if (body.teams !== undefined) update.teams = body.teams ?? [];
  } else if (isTeamLead(actor)) {
    if (body.workShift) update.workShift = body.workShift;
  }

  if (isSuperAdmin(actor) && Array.isArray(body.managedDepartments)) {
    await Department.updateMany({ manager: id }, { $unset: { manager: 1 } });
    if (body.managedDepartments.length > 0) {
      await Department.updateMany(
        { _id: { $in: body.managedDepartments } },
        { $set: { manager: id } },
      );
    }
  }

  const user = await User.findByIdAndUpdate(id, { $set: update }, { new: true })
    .select("-password")
    .populate("department", "title slug")
    .populate("teams", "name slug department")
    .populate("reportsTo", "about.firstName about.lastName email")
    .lean();

  if (!user) return notFound("Employee not found");

  const empDept = (user as Record<string, unknown>).department;
  const empDeptId = empDept && typeof empDept === "object" && "_id" in empDept ? (empDept as { _id: { toString(): string } })._id.toString() : empDept?.toString();
  const empTeamIds = ((user as Record<string, unknown>).teams as { _id?: { toString(): string } }[] | undefined)?.map((t) => t._id?.toString() ?? String(t)) ?? [];

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "updated employee",
    entity: "employee",
    entityId: id,
    details: `${(user as Record<string, unknown> & { about?: { firstName?: string; lastName?: string } }).about?.firstName ?? ""} ${(user as Record<string, unknown> & { about?: { firstName?: string; lastName?: string } }).about?.lastName ?? ""}`.trim(),
    targetUserIds: [id],
    targetDepartmentId: empDeptId || undefined,
    targetTeamIds: empTeamIds,
    visibility: "targeted",
  });

  return ok(user);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!isSuperAdmin(actor)) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  if (actor.id === id) return badRequest("Cannot delete yourself");

  const target = await User.findById(id).select("isSuperAdmin department teams").lean();
  if (!target) return notFound("Employee not found");
  if (target.isSuperAdmin) return badRequest("Cannot delete superadmin");

  const user = await User.findByIdAndUpdate(id, { isActive: false }, { new: true }).select("-password").lean();
  if (!user) return notFound("Employee not found");

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "deactivated employee",
    entity: "employee",
    entityId: id,
    targetUserIds: [],
    targetDepartmentId: target?.department?.toString() || undefined,
    targetTeamIds: (target?.teams as { toString(): string }[] | undefined)?.map((t) => t.toString()) ?? [],
    visibility: "targeted",
  });

  return ok({ message: "Employee deactivated" });
}
