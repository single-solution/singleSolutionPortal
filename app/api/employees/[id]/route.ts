import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { getSession, unauthorized, forbidden, badRequest, notFound, ok } from "@/lib/helpers";
import { logActivity } from "@/lib/activityLogger";
import bcrypt from "bcryptjs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  await connectDB();
  const { id } = await params;
  const role = session.user.role;

  if (role !== "superadmin" && role !== "manager" && session.user.id !== id) {
    return forbidden();
  }

  const user = await User.findById(id)
    .select("-password")
    .populate("department", "title slug")
    .lean();

  if (!user) return notFound("Employee not found");

  if (role === "manager" && session.user.id !== id) {
    const me = await User.findById(session.user.id).select("department").lean();
    if (me?.department?.toString() !== (user as Record<string, unknown>).department?.toString()) {
      return forbidden();
    }
  }

  return ok(user);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  const { id } = await params;
  const isSelf = session.user.id === id;
  if (!isSelf && session.user.role !== "superadmin") return forbidden();

  await connectDB();
  const body = await req.json();

  const update: Record<string, unknown> = { updatedBy: session.user.id };

  if (body.firstName !== undefined) update["about.firstName"] = body.firstName;
  if (body.lastName !== undefined) update["about.lastName"] = body.lastName;
  if (body.phone !== undefined) update["about.phone"] = body.phone;

  if (session.user.role === "superadmin") {
    if (body.userRole) update.userRole = body.userRole;
    if (body.department !== undefined) update.department = body.department || null;
    if (body.isActive !== undefined) update.isActive = body.isActive;
    if (body.workShift) update.workShift = body.workShift;

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
  }

  if (body.password) {
    update.password = await bcrypt.hash(body.password, 12);
  }

  const user = await User.findByIdAndUpdate(id, { $set: update }, { new: true })
    .select("-password")
    .populate("department", "title slug")
    .lean();

  if (!user) return notFound("Employee not found");

  logActivity({
    userEmail: session.user.email!,
    userName: `${session.user.firstName} ${session.user.lastName}`.trim(),
    action: "updated employee",
    entity: "employee",
    entityId: id,
    details: `${(user as Record<string, unknown> & { about?: { firstName?: string; lastName?: string } }).about?.firstName ?? ""} ${(user as Record<string, unknown> & { about?: { firstName?: string; lastName?: string } }).about?.lastName ?? ""}`.trim(),
  });

  return ok(user);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "superadmin") return forbidden();

  await connectDB();
  const { id } = await params;

  if (session.user.id === id) return badRequest("Cannot delete yourself");

  const user = await User.findByIdAndUpdate(id, { isActive: false }, { new: true }).select("-password").lean();
  if (!user) return notFound("Employee not found");

  logActivity({
    userEmail: session.user.email!,
    userName: `${session.user.firstName} ${session.user.lastName}`.trim(),
    action: "deactivated employee",
    entity: "employee",
    entityId: id,
  });

  return ok({ message: "Employee deactivated" });
}
