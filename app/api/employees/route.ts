import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import Department from "@/lib/models/Department";
import { unauthorized, forbidden, badRequest, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  hasPermission,
  getSubordinateUserIds,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendMail, getBaseUrl } from "@/lib/mail";

export async function GET(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const url = new URL(req.url);
  const includeSelf = url.searchParams.get("includeSelf") === "true";

  await connectDB();

  const filter: Record<string, unknown> = { isSuperAdmin: { $ne: true } };
  if (!includeSelf) filter._id = { $ne: actor.id };
  if (!isSuperAdmin(actor)) filter.isActive = true;

  if (isSuperAdmin(actor)) {
    // SuperAdmin sees all employees
  } else {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    const visibleIds = includeSelf ? [actor.id, ...subordinateIds] : subordinateIds;
    if (visibleIds.length === 0) return ok([]);
    filter._id = { $in: visibleIds };
  }

  const users = await User.find(filter)
    .select("-password")
    .sort({ createdAt: -1 })
    .lean();

  return ok(users);
}

export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "employees_create")) return forbidden();

  await connectDB();

  const body = await req.json();
  const { email, fullName, weeklySchedule, graceMinutes, shiftType } = body;

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

  const tempPassword = crypto.randomUUID() + "Aa1!";
  const hashed = await bcrypt.hash(tempPassword, 12);

  const user = await User.create({
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
  });

  if (Array.isArray(body.managedDepartments)) {
    await Department.updateMany({ manager: user._id }, { $unset: { manager: 1 } });
    if (body.managedDepartments.length > 0) {
      await Department.updateMany(
        { _id: { $in: body.managedDepartments } },
        { $set: { manager: user._id } },
      );
    }
  }

  const populated = await User.findById(user._id)
    .select("-password")
    .lean();

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  await User.findByIdAndUpdate(user._id, {
    resetToken: hashedToken,
    resetTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const resetUrl = `${getBaseUrl()}/reset-password?token=${rawToken}&email=${encodeURIComponent(trimmedEmail)}`;
  const inviteHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:500px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#0071e3,#0055cc);padding:32px 24px;border-radius:20px 20px 0 0;text-align:center;">
        <p style="font-size:48px;margin:0;line-height:1;">🎉</p>
        <h1 style="color:white;font-size:24px;font-weight:900;margin:12px 0 4px;letter-spacing:-0.02em;">Welcome to the Team!</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">Single Solution Sync</p>
      </div>
      <div style="background:#f8fafc;padding:28px 24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
        <p style="color:#475569;font-size:15px;margin:0 0 4px;font-weight:500;text-align:center;">Hi <strong style="color:#1e293b;">${firstName}</strong>, your account has been created.</p>
        <p style="color:#475569;font-size:14px;margin:0 0 16px;text-align:center;">Click below to set your password and get started.</p>
        <div style="text-align:center;"><a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#0071e3,#0055cc);color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">Set Password →</a></div>
        <p style="color:#94a3b8;font-size:12px;margin:16px 0 0;text-align:center;">This link expires in 24 hours.</p>
      </div>
      <div style="background:#f1f5f9;padding:20px 24px;border-radius:0 0 20px 20px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
        <p style="color:#94a3b8;font-size:12px;margin:0;">This is an automated message from your team's presence system.</p>
      </div>
    </div>`;
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
