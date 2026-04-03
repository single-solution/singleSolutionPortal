import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { unauthorized, badRequest, ok } from "@/lib/helpers";
import { getVerifiedSession } from "@/lib/permissions";

export async function GET(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username")?.toLowerCase();
  if (!username) return badRequest("username is required");

  await connectDB();
  const user = await User.findOne({ username }).select("_id").lean();
  if (!user) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  return ok({ _id: user._id.toString() });
}
