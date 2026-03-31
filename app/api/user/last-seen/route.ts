import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { getSession, unauthorized, ok, badRequest } from "@/lib/helpers";
import { NextRequest } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  await connectDB();

  const user = await User.findById(session.user.id).select("lastSeenLogId").lean();
  return ok({ lastSeenLogId: user?.lastSeenLogId ?? null });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  const { lastSeenLogId } = await req.json();
  if (!lastSeenLogId || typeof lastSeenLogId !== "string") {
    return badRequest("lastSeenLogId required");
  }

  await connectDB();

  await User.updateOne({ _id: session.user.id }, { lastSeenLogId });
  return ok({ ok: true });
}
