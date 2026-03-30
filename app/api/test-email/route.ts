import { getSession, unauthorized, forbidden } from "@/lib/helpers";
import { sendMail, buildInviteHtml, buildResetHtml, buildAlertHtml } from "@/lib/mail";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "superadmin") return forbidden();

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "invite";
  const to = url.searchParams.get("email") ?? session.user.email;

  let subject = "";
  let html = "";

  switch (type) {
    case "invite":
      subject = "🧪 TEST — Welcome Email";
      html = buildInviteHtml("Test Admin", true);
      break;
    case "reset":
      subject = "🧪 TEST — Password Reset";
      html = buildResetHtml(true);
      break;
    case "alert":
      subject = "🧪 TEST — Attendance Alert";
      html = buildAlertHtml("This is a test attendance notification.", true);
      break;
    default:
      return NextResponse.json({ error: "Invalid type. Use invite, reset, or alert." }, { status: 400 });
  }

  const sent = await sendMail(to, subject, html);

  return NextResponse.json({
    success: sent,
    message: sent ? `Test email (${type}) sent to ${to}` : "Email not sent. Check SMTP configuration.",
    to,
    type,
  });
}
