import { connectDB } from "@/lib/db";
import ActivityLog from "@/lib/models/ActivityLog";
import { unauthorized, ok } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin, hasPermission, getSubordinateUserIds, getHierarchyDepartmentIds } from "@/lib/permissions";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "activityLogs_view")) return ok({ logs: [] });

  await connectDB();

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 50);

  if (isSuperAdmin(actor)) {
    const logs = await ActivityLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return ok({ logs });
  }

  const subordinateIds = await getSubordinateUserIds(actor.id);
  const hierarchyDeptIds = await getHierarchyDepartmentIds(actor.id);

  const conditions: Record<string, unknown>[] = [
    { visibility: "all" },
    { targetUserIds: actor.id },
    { userEmail: actor.email },
  ];

  if (subordinateIds.length > 0) {
    conditions.push({ targetUserIds: { $in: subordinateIds } });
  }
  if (hierarchyDeptIds.length > 0) {
    conditions.push({ targetDepartmentId: { $in: hierarchyDeptIds } });
  }

  const logs = await ActivityLog.find({ $or: conditions })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return ok({ logs });
}
