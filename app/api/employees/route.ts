import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import Department from "@/lib/models/Department";
import { getSession, unauthorized, forbidden, badRequest, ok } from "@/lib/helpers";
import { logActivity } from "@/lib/activityLogger";
import bcrypt from "bcryptjs";
import { sendWelcomeEmail } from "@/lib/mail";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  await connectDB();

  const role = session.user.role;
  let filter: Record<string, unknown> = { isActive: true, userRole: { $ne: "superadmin" } };

  if (role === "manager") {
    const me = await User.findById(session.user.id).select("department");
    if (me?.department) filter.department = me.department;
  } else if (role !== "superadmin") {
    filter._id = session.user.id;
  }

  const users = await User.find(filter)
    .select("-password")
    .populate("department", "title slug")
    .sort({ createdAt: -1 })
    .lean();

  // suppress TS unused warning
  void Department;

  return ok(users);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "superadmin") return forbidden();

  await connectDB();

  const body = await req.json();
  const { email, username, password, firstName, lastName, userRole, department, workShift } = body;

  if (!email || !username || !password || !firstName || !userRole) {
    return badRequest("Missing required fields: email, username, password, firstName, userRole");
  }

  if (userRole === "superadmin") return badRequest("Cannot create superadmin accounts");


  const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }] });
  if (existing) return badRequest("Email or username already exists");

  const hashed = await bcrypt.hash(password, 12);

  const user = await User.create({
    email: email.toLowerCase().trim(),
    username: username.toLowerCase().trim(),
    password: hashed,
    about: { firstName, lastName: lastName ?? "" },
    userRole,
    department: department || undefined,
    workShift: workShift ?? {
      type: "fullTime",
      shift: { start: "10:00", end: "19:00" },
      workingDays: ["mon", "tue", "wed", "thu", "fri"],
      breakTime: 60,
    },
    isActive: true,
    isVerified: true,
    createdBy: session.user.id,
  });

  const populated = await User.findById(user._id)
    .select("-password")
    .populate("department", "title slug")
    .lean();

  const roleLabels: Record<string, string> = { superadmin: "Super Admin", manager: "Manager", businessDeveloper: "Business Developer", developer: "Developer" };
  sendWelcomeEmail(email, firstName, roleLabels[userRole] ?? userRole, password).catch(() => {});

  logActivity({
    userEmail: session.user.email!,
    userName: `${session.user.firstName} ${session.user.lastName}`.trim(),
    action: "created employee",
    entity: "employee",
    entityId: user._id.toString(),
    details: `${firstName} ${lastName ?? ""} (${email})`.trim(),
  });

  return ok(populated);
}
