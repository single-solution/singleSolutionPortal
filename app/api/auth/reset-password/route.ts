import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { isResetBlocked, recordResetAttempt } from "@/lib/rateLimit";
import { hashToken } from "@/lib/tokenHelpers";

export async function POST(request: NextRequest) {
  if (isResetBlocked(request.headers)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }
  recordResetAttempt(request.headers);

  await connectDB();
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  const { token, email, newPassword } = body;

  if (!token || !email || !newPassword) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const hashedToken = hashToken(token);

  const user = await User.findOne({
    email: email.trim().toLowerCase(),
    resetToken: hashedToken,
    resetTokenExpiry: { $gt: new Date() },
  });

  if (!user) {
    return NextResponse.json(
      { error: "Invalid or expired reset link. Please request a new one." },
      { status: 400 },
    );
  }

  user.password = await bcrypt.hash(newPassword, 12);
  user.resetToken = undefined;
  user.resetTokenExpiry = undefined;
  if (!user.isVerified) user.isVerified = true;
  await user.save();

  return NextResponse.json({
    success: true,
    message: "Password has been reset. You can now sign in.",
  });
}
