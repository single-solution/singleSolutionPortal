import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import Department from "@/lib/models/Department";
import Team from "@/lib/models/Team";
import { unauthorized, forbidden, badRequest, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  isManager,
  isTeamLead,
  isEmployee,
  getTeamMemberIds,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";
import bcrypt from "bcryptjs";
import { sendWelcomeEmail } from "@/lib/mail";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  let filter: Record<string, unknown> = { isActive: true, userRole: { $ne: "superadmin" } };

  if (isManager(actor)) {
    if (actor.crossDepartmentAccess) {
      // manager with cross-dept access sees all employees
    } else if (actor.department) {
      filter.department = actor.department;
    } else {
      filter._id = actor.id;
    }
  } else if (isTeamLead(actor)) {
    const memberIds = await getTeamMemberIds(actor.leadOfTeams);
    if (memberIds.length > 0) {
      filter._id = { $in: memberIds };
    } else {
      filter._id = actor.id;
    }
  } else if (isEmployee(actor)) {
    filter._id = actor.id;
  }

  const users = await User.find(filter)
    .select("-password")
    .populate("department", "title slug")
    .populate("teams", "name slug department")
    .sort({ createdAt: -1 })
    .lean();

  void Department;
  void Team;

  return ok(users);
}

export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!isSuperAdmin(actor)) return forbidden();

  await connectDB();

  const body = await req.json();
  const { email, username, password, firstName, lastName, userRole, department, workShift, teams } = body;

  if (!email || !username || !password || !firstName || !userRole) {
    return badRequest("Missing required fields: email, username, password, firstName, userRole");
  }

  if (userRole === "superadmin") return badRequest("Cannot create superadmin accounts");

  if (typeof password !== "string" || password.length < 8) {
    return badRequest("Password must be at least 8 characters");
  }

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
    teams: teams ?? [],
    workShift: workShift ?? {
      type: "fullTime",
      shift: { start: "10:00", end: "19:00" },
      workingDays: ["mon", "tue", "wed", "thu", "fri"],
      breakTime: 60,
    },
    isActive: true,
    isVerified: true,
    createdBy: actor.id,
  });

  const populated = await User.findById(user._id)
    .select("-password")
    .populate("department", "title slug")
    .populate("teams", "name slug department")
    .lean();

  const roleLabels: Record<string, string> = { superadmin: "Super Admin", manager: "Manager", teamLead: "Team Lead", businessDeveloper: "Business Developer", developer: "Developer" };
  sendWelcomeEmail(email, firstName, roleLabels[userRole] ?? userRole, password).catch(() => {});

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "created employee",
    entity: "employee",
    entityId: user._id.toString(),
    details: `${firstName} ${lastName ?? ""} (${email})`.trim(),
  });

  return ok(populated);
}
