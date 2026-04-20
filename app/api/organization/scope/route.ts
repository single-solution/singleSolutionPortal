import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import FlowLayout from "@/lib/models/FlowLayout";
import Membership from "@/lib/models/Membership";
import "@/lib/models/Department";
import {
  getVerifiedSession,
  hasPermission,
  getSubordinateUserIds,
} from "@/lib/permissions";

/**
 * Returns the scoped view for a non-SuperAdmin on the organization chart:
 * - subordinateIds: all transitive subordinates
 * - managerIds: direct manager (1 step up)
 * - departmentIds: departments connected via memberships to self + subordinates + manager
 */
export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "organization_view")) {
    return NextResponse.json({ subordinateIds: [], managerIds: [], departmentIds: [] });
  }

  if (actor.isSuperAdmin) {
    return NextResponse.json({ subordinateIds: [], managerIds: [], departmentIds: [], all: true });
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

  const selfDeptIds = (await Membership.find({ user: actor.id, isActive: true }).select("department").lean())
    .map((m) => m.department?.toString())
    .filter(Boolean) as string[];

  if (selfDeptIds.length > 0) {
    const aboveMembers = await Membership.find({
      department: { $in: selfDeptIds },
      direction: "above",
      isActive: true,
      user: { $ne: actor.id },
    }).select("user").lean();
    for (const m of aboveMembers) {
      const uid = m.user.toString();
      if (!managerIds.includes(uid)) managerIds.push(uid);
    }
  }

  const allVisibleUsers = [actor.id, ...subordinateIds, ...managerIds];
  const visibleEmpNodes = new Set(allVisibleUsers.map((id) => `emp-${id}`));

  const departmentIdSet = new Set<string>();

  for (const link of links) {
    const empNode = visibleEmpNodes.has(link.source) ? link.source : visibleEmpNodes.has(link.target) ? link.target : null;
    if (!empNode) continue;
    const otherNode = link.source === empNode ? link.target : link.source;
    if (otherNode.startsWith("dept-")) {
      departmentIdSet.add(otherNode.slice(5));
    }
  }

  const memberships = await Membership.find({
    user: { $in: allVisibleUsers },
    isActive: { $ne: false },
  }).select("department").lean();

  for (const m of memberships) {
    const dId = m.department?.toString();
    if (dId) departmentIdSet.add(dId);
  }

  return NextResponse.json({
    subordinateIds,
    managerIds,
    departmentIds: [...departmentIdSet],
  });
}
