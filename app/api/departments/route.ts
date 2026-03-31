import { connectDB } from "@/lib/db";
import Department from "@/lib/models/Department";
import User from "@/lib/models/User";
import { getSession, unauthorized, forbidden, badRequest, ok } from "@/lib/helpers";
import { logActivity } from "@/lib/activityLogger";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  await connectDB();

  const departments = await Department.find({ isActive: true })
    .populate("manager", "about.firstName about.lastName email")
    .sort({ createdAt: -1 })
    .lean();

  const counts = await User.aggregate([
    { $match: { isActive: true, department: { $ne: null } } },
    { $group: { _id: "$department", count: { $sum: 1 } } },
  ]);

  const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

  const result = departments.map((d) => ({
    ...d,
    employeeCount: countMap.get(d._id.toString()) ?? 0,
  }));

  return ok(result);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "superadmin") return forbidden();

  await connectDB();
  const body = await req.json();

  if (!body.title?.trim()) return badRequest("Department title is required");

  const dept = await Department.create({
    title: body.title.trim(),
    description: body.description ?? "",
    manager: body.managerId || undefined,
    isActive: true,
    createdBy: session.user.id,
  });

  const populated = await Department.findById(dept._id)
    .populate("manager", "about.firstName about.lastName email")
    .lean();

  logActivity({
    userEmail: session.user.email!,
    userName: `${session.user.firstName} ${session.user.lastName}`.trim(),
    action: "created department",
    entity: "department",
    entityId: dept._id.toString(),
    details: body.title.trim(),
  });

  return ok(populated);
}
