import User from "@/lib/models/User";
import { unauthorized, forbidden, badRequest, notFound, ok, isValidId } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin, hasPermission, getSubordinateUserIds } from "@/lib/permissions";
import { sendMail, getBaseUrl, buildSetPasswordHtml } from "@/lib/mail";
import { logActivity } from "@/lib/activityLogger";
import { generateHashedToken, INVITE_TOKEN_EXPIRY_MS } from "@/lib/tokenHelpers";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "employees_resendInvite")) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid employee ID");

  if (!isSuperAdmin(actor)) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    if (!subordinateIds.includes(id)) return forbidden("Can only resend invites to employees within your hierarchy");
  }

  const user = await User.findById(id);
  if (!user) return notFound("Employee not found");
  if (user.isVerified) return badRequest("Employee already verified");

  const { rawToken, hashedToken } = generateHashedToken();

  user.resetToken = hashedToken;
  user.resetTokenExpiry = new Date(Date.now() + INVITE_TOKEN_EXPIRY_MS);
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

  return ok({ sent: emailSent });
}
