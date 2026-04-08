import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { unauthorized, forbidden, badRequest, notFound, ok } from "@/lib/helpers";
import { getVerifiedSession, hasPermission } from "@/lib/permissions";
import { sendMail, getBaseUrl } from "@/lib/mail";
import { logActivity } from "@/lib/activityLogger";
import { isValidId } from "@/lib/helpers";
import crypto from "crypto";

function buildSetPasswordHtml(name: string, resetUrl: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 0;">
      <div style="background: linear-gradient(135deg, #0071e3, #0055cc); padding: 32px 24px; border-radius: 20px 20px 0 0; text-align: center;">
        <p style="font-size: 48px; margin: 0; line-height: 1;">🔐</p>
        <h1 style="color: white; font-size: 24px; font-weight: 900; margin: 12px 0 4px; letter-spacing: -0.02em;">Set Your Password</h1>
        <p style="color: rgba(255,255,255,0.85); font-size: 14px; margin: 0;">Single Solution Sync</p>
      </div>
      <div style="background: #f8fafc; padding: 28px 24px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">
        <p style="color: #475569; font-size: 15px; margin: 0 0 4px; font-weight: 500; text-align: center;">
          Hi <strong style="color: #1e293b;">${name}</strong>, your account is ready.
        </p>
        <p style="color: #475569; font-size: 15px; margin: 0 0 20px; text-align: center;">
          Click below to set your password and get started.
        </p>
        <div style="text-align: center;">
          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #0071e3, #0055cc); color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 15px;">Set Password →</a>
        </div>
        <p style="color: #94a3b8; font-size: 12px; margin: 16px 0 0; text-align: center;">This link expires in 24 hours.</p>
      </div>
      <div style="background: #f1f5f9; padding: 20px 24px; border-radius: 0 0 20px 20px; text-align: center; border: 1px solid #e2e8f0; border-top: none;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">This invite was sent from Single Solution Sync.</p>
      </div>
    </div>
  `;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "employees_resendInvite")) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid employee ID");

  await connectDB();

  const user = await User.findById(id);
  if (!user) return notFound("Employee not found");
  if (user.isVerified) return badRequest("Employee already verified");

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  user.resetToken = hashedToken;
  user.resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();

  const resetUrl = `${getBaseUrl()}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;
  const name = user.about?.firstName || user.username || "there";
  const html = buildSetPasswordHtml(name, resetUrl);

  const emailSent = await sendMail(user.email, "Set Your Password — Single Solution Sync", html);

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "resent invite",
    entity: "employee",
    entityId: id,
    details: `Resent invite to ${user.email}`,
    targetUserIds: [id],
    visibility: "self",
  });

  return ok({ sent: emailSent, link: resetUrl });
}
