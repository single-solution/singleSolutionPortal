import { getVerifiedSession, getPermissionsPayload } from "@/lib/permissions";
import { unauthorized, ok } from "@/lib/helpers";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const payload = await getPermissionsPayload(actor.id);
  return ok(payload);
}
