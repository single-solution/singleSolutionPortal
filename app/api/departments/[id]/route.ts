import { connectDB } from "@/lib/db";
import Department from "@/lib/models/Department";
import { getSession, unauthorized, forbidden, notFound, ok } from "@/lib/helpers";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "superadmin") return forbidden();

  await connectDB();
  const { id } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = { updatedBy: session.user.id };
  if (body.title?.trim()) update.title = body.title.trim();
  if (body.description !== undefined) update.description = body.description;
  if (body.managerId !== undefined) update.manager = body.managerId || null;
  if (body.isActive !== undefined) update.isActive = body.isActive;

  const dept = await Department.findByIdAndUpdate(id, { $set: update }, { new: true })
    .populate("manager", "about.firstName about.lastName email")
    .lean();

  if (!dept) return notFound("Department not found");
  return ok(dept);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "superadmin") return forbidden();

  await connectDB();
  const { id } = await params;

  const dept = await Department.findByIdAndUpdate(id, { isActive: false }, { new: true }).lean();
  if (!dept) return notFound("Department not found");

  return ok({ message: "Department deactivated" });
}
