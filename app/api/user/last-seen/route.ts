import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { getVerifiedSession } from "@/lib/permissions";
import { unauthorized, ok, badRequest } from "@/lib/helpers";
import { NextRequest } from "next/server";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  const user = await User.findById(actor.id).select("lastSeenLogId").lean();
  return ok({ lastSeenLogId: user?.lastSeenLogId ?? null });
}

export async function PUT(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return badRequest("Invalid JSON body"); }
  const { lastSeenLogId } = body as { lastSeenLogId?: string };
  if (!lastSeenLogId || typeof lastSeenLogId !== "string") {
    return badRequest("lastSeenLogId required");
  }

  await connectDB();

  await User.updateOne({ _id: actor.id }, { lastSeenLogId });
  return ok({ ok: true });
}
