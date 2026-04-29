import User from "@/lib/models/User";
import { getVerifiedSession } from "@/lib/permissions";
import { unauthorized, ok, badRequest, parseBody } from "@/lib/helpers";
import { NextRequest } from "next/server";

const VALID_ENTITIES = new Set([
  "employee", "task", "campaign", "department",
  "designation", "attendance", "leave", "membership",
  "settings", "security",
]);

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

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
  const body: any = await parseBody(req);
  if (body instanceof Response) return body;

  const { lastSeenLogId, entity } = body as { lastSeenLogId?: string; entity?: string };
  if (!lastSeenLogId || typeof lastSeenLogId !== "string") {
    return badRequest("lastSeenLogId required");
  }

  if (entity && typeof entity === "string") {
    if (!VALID_ENTITIES.has(entity)) return badRequest("Invalid entity");
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
