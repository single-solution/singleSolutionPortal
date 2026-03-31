import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import bcrypt from "bcryptjs";
import { getVerifiedSession } from "@/lib/permissions";
import { unauthorized, badRequest, ok } from "@/lib/helpers";

export async function PUT(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();
  const body = await req.json();

  if (!body.currentPassword || !body.newPassword) {
    return badRequest("Current and new password are required");
  }

  if (body.newPassword.length < 8) return badRequest("New password must be at least 8 characters");

  const user = await User.findById(actor.id).select("+password");
  if (!user) return badRequest("User not found");

  const valid = await bcrypt.compare(body.currentPassword, user.password);
  if (!valid) return badRequest("Current password is incorrect");

  user.password = await bcrypt.hash(body.newPassword, 12);
  await user.save();

  return ok({ message: "Password updated" });
}
