import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import ActivityLog from "@/lib/models/ActivityLog";
import bcrypt from "bcryptjs";
import { getVerifiedSession } from "@/lib/permissions";
import { unauthorized, ok, notFound, badRequest } from "@/lib/helpers";

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const EMAIL_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  const user = await User.findById(actor.id)
    .select("-password")
    .populate("department", "title slug")
    .lean();

  if (!user) return notFound("User not found");
  return ok(user);
}

export async function PUT(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();
  const body = await req.json();

  const update: Record<string, unknown> = {};
  if (body.fullName !== undefined) {
    const parts = String(body.fullName).trim().split(/\s+/);
    update["about.firstName"] = parts[0] || "";
    update["about.lastName"] = parts.slice(1).join(" ");
  }
  if (body.phone !== undefined) update["about.phone"] = body.phone;

  let oldEmail: string | null = null;
  if (typeof body.email === "string" && body.email.trim()) {
    const trimmed = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return badRequest("Invalid email format");
    }

    const currentUser = await User.findById(actor.id).select("+password lastEmailChange email username");
    if (!currentUser) return notFound("User not found");

    if (trimmed === currentUser.email) {
      // No change
    } else {
      if (!body.currentPassword) return badRequest("Current password is required to change email");
      const valid = await bcrypt.compare(body.currentPassword, currentUser.password);
      if (!valid) return badRequest("Current password is incorrect");

      const lastChange = currentUser.lastEmailChange as Date | undefined;
      if (lastChange && Date.now() - new Date(lastChange).getTime() < EMAIL_CHANGE_COOLDOWN_MS) {
        const hoursLeft = Math.ceil((EMAIL_CHANGE_COOLDOWN_MS - (Date.now() - new Date(lastChange).getTime())) / 3600000);
        return badRequest(`Email can only be changed once every 24 hours. Try again in ~${hoursLeft}h.`);
      }

      const existing = await User.findOne({ email: trimmed, _id: { $ne: actor.id } });
      if (existing) return badRequest("That email is already in use");

      oldEmail = currentUser.email;
      const newUsername = trimmed.split("@")[0];
      const usernameConflict = await User.findOne({ username: newUsername, _id: { $ne: actor.id } });
      update.email = trimmed;
      update.username = usernameConflict ? `${newUsername}-${Date.now().toString(36).slice(-4)}` : newUsername;
      update.lastEmailChange = new Date();
    }
  }

  if (typeof body.showCoordinates === "boolean") {
    update["preferences.showCoordinates"] = body.showCoordinates;
  }

  if (body.profileImage !== undefined) {
    if (body.profileImage && typeof body.profileImage === "string") {
      if (!body.profileImage.startsWith("data:image/")) {
        return badRequest("Invalid image format. Must be a base64 data URL.");
      }
      const sizeBytes = Math.ceil((body.profileImage.length * 3) / 4);
      if (sizeBytes > MAX_IMAGE_SIZE) {
        return badRequest("Image too large. Max 2MB.");
      }
      update["about.profileImage"] = body.profileImage;
    } else {
      update["about.profileImage"] = "";
    }
  }

  const user = await User.findByIdAndUpdate(actor.id, { $set: update }, { new: true })
    .select("-password")
    .populate("department", "title slug")
    .lean();

  if (!user) return notFound("User not found");

  if (oldEmail && update.email) {
    await ActivityLog.updateMany(
      { userEmail: oldEmail },
      { $set: { userEmail: update.email as string, userName: update.username as string } },
    );
  }

  return ok(user);
}
