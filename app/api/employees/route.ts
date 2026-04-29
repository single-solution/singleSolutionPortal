import User from "@/lib/models/User";
import Department from "@/lib/models/Department";
import Membership from "@/lib/models/Membership";
import { unauthorized, forbidden, badRequest, ok, parseBody } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  hasPermission,
  getSubordinateUserIds,
  getHierarchyDepartmentIds,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";
import { getUserFields } from "@/lib/userFields";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { generateHashedToken, INVITE_TOKEN_EXPIRY_MS } from "@/lib/tokenHelpers";
import { sendMail, getBaseUrl, buildSetPasswordHtml } from "@/lib/mail";

export async function GET(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const hasViewPerm = hasPermission(actor, "employees_view");

  const url = new URL(req.url);
  const includeSelf = url.searchParams.get("includeSelf") === "true";

  const filter: Record<string, unknown> = { isSuperAdmin: { $ne: true } };
  if (!includeSelf) filter._id = { $ne: actor.id };
  if (!isSuperAdmin(actor)) filter.isActive = true;

  if (isSuperAdmin(actor)) {
    // SuperAdmin sees all employees
  } else if (hasViewPerm) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    const visibleIds = includeSelf ? [actor.id, ...subordinateIds] : subordinateIds;
    if (visibleIds.length === 0) return ok([]);
    filter._id = { $in: visibleIds };
  } else {
    filter._id = actor.id;
  }

  const hasPayrollAccess = hasPermission(actor, "payroll_manageSalary");
  const users = await User.find(filter)
    .select(getUserFields(hasPayrollAccess))
    .sort({ createdAt: -1 })
    .lean();

  const userIds = users.map((u) => u._id);
  const allMemberships = await Membership.find({ user: { $in: userIds }, isActive: true })
    .populate("designation", "name color")
    .populate({ path: "department", select: "title parentDepartment", populate: { path: "parentDepartment", select: "title" } })
    .lean();

  const membershipsByUser = new Map<string, typeof allMemberships>();
  for (const m of allMemberships) {
    const uid = m.user.toString();
    if (!membershipsByUser.has(uid)) membershipsByUser.set(uid, []);
    membershipsByUser.get(uid)!.push(m);
  }

  const enriched = users.map((u) => ({
    ...u,
    memberships: (membershipsByUser.get(u._id.toString()) ?? []).map((m) => ({
      _id: m._id,
      designation: m.designation,
      department: m.department,
      direction: m.direction,
    })),
  }));

  return ok(enriched);
}

export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "employees_create")) return forbidden();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = await parseBody(req);
  if (body instanceof Response) return body;
  const { email, fullName, weeklySchedule, graceMinutes, shiftType, salary } = body;

  if (!email || !fullName) {
    return badRequest("Missing required fields: email, fullName");
  }

  const trimmedEmail = email.toLowerCase().trim();
  const username = trimmedEmail.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "");

  const existing = await User.findOne({ $or: [{ email: trimmedEmail }, { username }] });
  if (existing) return badRequest("Email or username already exists");

  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ");

  const tempPassword = randomUUID() + "Aa1!";
  const hashed = await bcrypt.hash(tempPassword, 12);

  const createPayload: Record<string, unknown> = {
    email: trimmedEmail,
    username,
    password: hashed,
    about: { firstName, lastName },
    weeklySchedule: weeklySchedule ?? undefined,
    graceMinutes: typeof graceMinutes === "number" ? graceMinutes : undefined,
    shiftType: shiftType ?? undefined,
    isActive: true,
    isVerified: false,
    createdBy: actor.id,
  };

  if (typeof salary === "number" && Number.isFinite(salary) && hasPermission(actor, "payroll_manageSalary")) {
    createPayload.salary = salary;
  }

  const user = await User.create(createPayload);

  if (Array.isArray(body.managedDepartments)) {
    let allowedDeptIds: string[] = body.managedDepartments;
    if (!isSuperAdmin(actor) && allowedDeptIds.length > 0) {
      const hierarchyDeptIds = await getHierarchyDepartmentIds(actor.id);
      const hierarchySet = new Set(hierarchyDeptIds);
      allowedDeptIds = allowedDeptIds.filter((d: string) => hierarchySet.has(d));
    }
    await Department.updateMany({ manager: user._id }, { $unset: { manager: 1 } });
    if (allowedDeptIds.length > 0) {
      await Department.updateMany(
        { _id: { $in: allowedDeptIds } },
        { $set: { manager: user._id } },
      );
    }
  }

  const populated = await User.findById(user._id)
    .select(getUserFields(hasPermission(actor, "payroll_manageSalary")))
    .lean();

  const { rawToken, hashedToken } = generateHashedToken();
  await User.findByIdAndUpdate(user._id, {
    resetToken: hashedToken,
    resetTokenExpiry: new Date(Date.now() + INVITE_TOKEN_EXPIRY_MS),
  });

  const resetUrl = `${getBaseUrl()}/reset-password?token=${rawToken}&email=${encodeURIComponent(trimmedEmail)}`;
  const inviteHtml = buildSetPasswordHtml(firstName, resetUrl, true);
  sendMail(trimmedEmail, "Welcome to Single Solution Sync — Set Your Password", inviteHtml).catch(() => {});

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "created employee",
    entity: "employee",
    entityId: user._id.toString(),
    details: `${fullName.trim()} (${trimmedEmail})`,
    targetUserIds: [user._id.toString()],
    visibility: "targeted",
  });

  return ok(populated);
}
