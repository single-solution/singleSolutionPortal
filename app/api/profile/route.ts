import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { getSession, unauthorized, ok, notFound, badRequest } from "@/lib/helpers";

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

export async function GET() {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  await connectDB();

  const user = await User.findById(session.user.id)
    .select("-password")
    .populate("department", "title slug")
    .lean();

  if (!user) return notFound("User not found");
  return ok(user);
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  await connectDB();
  const body = await req.json();

  const update: Record<string, unknown> = {};
  if (body.firstName !== undefined) update["about.firstName"] = body.firstName;
  if (body.lastName !== undefined) update["about.lastName"] = body.lastName;
  if (body.phone !== undefined) update["about.phone"] = body.phone;

  if (typeof body.email === "string" && body.email.trim()) {
    const trimmed = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return badRequest("Invalid email format");
    }
    const existing = await User.findOne({ email: trimmed, _id: { $ne: session.user.id } });
    if (existing) return badRequest("That email is already in use");
    update.email = trimmed;
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

  const user = await User.findByIdAndUpdate(session.user.id, { $set: update }, { new: true })
    .select("-password")
    .populate("department", "title slug")
    .lean();

  if (!user) return notFound("User not found");
  return ok(user);
}
