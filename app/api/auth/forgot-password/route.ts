import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { NextRequest, NextResponse } from "next/server";
import { isResetBlocked, recordResetAttempt } from "@/lib/rateLimit";
import { sendResetEmail, getBaseUrl } from "@/lib/mail";
import { generateHashedToken, RESET_TOKEN_EXPIRY_MS } from "@/lib/tokenHelpers";

export async function POST(request: NextRequest) {
  if (isResetBlocked(request.headers)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }
  recordResetAttempt(request.headers);

  await connectDB();
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const { email } = body;

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const user = await User.findOne({ email: email.trim().toLowerCase(), isActive: true });

  if (!user) {
    return NextResponse.json({
      success: true,
      message: "If an account with that email exists, a reset link has been sent.",
    });
  }

  const { rawToken, hashedToken } = generateHashedToken();

  user.resetToken = hashedToken;
  user.resetTokenExpiry = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
  await user.save();

  const resetUrl = `${getBaseUrl()}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;
  const emailSent = await sendResetEmail(user.email, resetUrl);

  if (!emailSent && process.env.NODE_ENV === "development") {
    console.log(`\n[PASSWORD RESET] Link: ${resetUrl}\n`);
  }

  return NextResponse.json({
    success: true,
    message: "If an account with that email exists, a reset link has been sent.",
  });
}
