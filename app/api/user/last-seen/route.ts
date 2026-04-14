import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { getVerifiedSession } from "@/lib/permissions";
import { unauthorized, ok, badRequest } from "@/lib/helpers";
import { NextRequest } from "next/server";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  const user = await User.findById(actor.id).select("lastSeenLogId lastSeenLogIds").lean();
  const raw = user?.lastSeenLogIds;
  const entityMap: Record<string, string> =
    raw instanceof Map
      ? Object.fromEntries(raw)
      : typeof raw === "object" && raw !== null
        ? (raw as Record<string, string>)
        : {};

  return ok({
    lastSeenLogId: user?.lastSeenLogId ?? null,
    lastSeenLogIds: entityMap,
  });
}

export async function PUT(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return badRequest("Invalid JSON body"); }

  const { lastSeenLogId, entity } = body as { lastSeenLogId?: string; entity?: string };
  if (!lastSeenLogId || typeof lastSeenLogId !== "string") {
    return badRequest("lastSeenLogId required");
  }

  await connectDB();

  if (entity && typeof entity === "string") {
    await User.updateOne(
      { _id: actor.id },
      { $set: { [`lastSeenLogIds.${entity}`]: lastSeenLogId } },
    );
  } else {
    await User.updateOne(
      { _id: actor.id },
      { lastSeenLogId, lastSeenLogIds: {} },
    );
  }

  return ok({ ok: true });
}
