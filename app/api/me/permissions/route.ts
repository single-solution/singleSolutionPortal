import { NextResponse } from "next/server";
import { getVerifiedSession, getSubordinateUserIds } from "@/lib/permissions";
import { PERMISSION_KEYS, type IPermissions } from "@/lib/permissions.shared";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  return NextResponse.json({
    isSuperAdmin: actor.isSuperAdmin,
    permissions: merged,
    hasSubordinates: actor.isSuperAdmin || subordinateIds.length > 0,
  });
}
