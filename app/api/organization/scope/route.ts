import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import FlowLayout from "@/lib/models/FlowLayout";
import {
  getVerifiedSession,
  getSubordinateUserIds,
} from "@/lib/permissions";

/**
 * Returns the set of user IDs a non-SuperAdmin is allowed to see on the
 * organization chart: themselves + transitive subordinates + direct managers
 * (1 step up only).
 */
export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (actor.isSuperAdmin) {
    return NextResponse.json({ subordinateIds: [], managerIds: [], all: true });
  }

  await connectDB();
  const subordinateIds = await getSubordinateUserIds(actor.id);

  const layout = await FlowLayout.findOne({ canvasId: "org" }).lean();
  const links = (layout?.links ?? []) as {
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
  }[];

  const selfNode = `emp-${actor.id}`;
  const managerIds: string[] = [];

  for (const link of links) {
    let mgrNode: string | null = null;
    if (link.target === selfNode && link.sourceHandle === "bottom" && link.targetHandle === "top") {
      mgrNode = link.source;
    } else if (link.source === selfNode && link.sourceHandle === "top" && link.targetHandle === "bottom") {
      mgrNode = link.target;
    }
    if (mgrNode?.startsWith("emp-")) {
      managerIds.push(mgrNode.slice(4));
    }
  }

  return NextResponse.json({ subordinateIds, managerIds });
}
