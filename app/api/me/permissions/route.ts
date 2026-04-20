import { getVerifiedSession, getSubordinateUserIds } from "@/lib/permissions";
import { PERMISSION_KEYS, type IPermissions } from "@/lib/permissions.shared";
import { unauthorized, ok } from "@/lib/helpers";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const merged: Partial<Record<keyof IPermissions, boolean>> = {};

  if (actor.isSuperAdmin) {
    for (const k of PERMISSION_KEYS) merged[k] = true;
  } else {
    for (const m of actor.memberships) {
      for (const k of PERMISSION_KEYS) {
        if ((m.permissions as unknown as Record<string, boolean>)[k]) merged[k] = true;
      }
    }
  }

  const subordinateIds = actor.isSuperAdmin ? [] : await getSubordinateUserIds(actor.id);

  return ok({
    isSuperAdmin: actor.isSuperAdmin,
    permissions: merged,
    hasSubordinates: actor.isSuperAdmin || subordinateIds.length > 0,
    subordinateIds,
  });
}
