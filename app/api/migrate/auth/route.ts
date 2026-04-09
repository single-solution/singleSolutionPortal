import { ok, unauthorized, forbidden } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin } from "@/lib/permissions";

export async function POST() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!isSuperAdmin(actor)) return forbidden();

  return ok({ success: true, message: "Legacy migration has been completed. No further action needed." });
}
