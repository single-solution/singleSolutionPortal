import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { isResetBlocked, recordResetAttempt } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  if (isResetBlocked(request.headers)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }
  recordResetAttempt(request.headers);

  await connectDB();
  const { token, email, newPassword } = await request.json();

  if (!token || !email || !newPassword) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

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
  await user.save();

  return NextResponse.json({
    success: true,
    message: "Password has been reset. You can now sign in.",
  });
}
