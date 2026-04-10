import { connectDB } from "@/lib/db";
import ActivityLog from "@/lib/models/ActivityLog";
import { unauthorized, ok } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin, hasPermission, getSubordinateUserIds, getHierarchyDepartmentIds } from "@/lib/permissions";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

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

  const hasLogsPerm = hasPermission(actor, "activityLogs_view");

  if (!hasLogsPerm) {
    const logs = await ActivityLog.find({
      $or: [{ targetUserIds: actor.id }, { userEmail: actor.email }],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return ok({ logs });
  }

  const subordinateIds = await getSubordinateUserIds(actor.id);
  const hierarchyDeptIds = await getHierarchyDepartmentIds(actor.id);

  const scopedUserIds = [actor.id, ...subordinateIds];

  const conditions: Record<string, unknown>[] = [
    { targetUserIds: { $in: scopedUserIds } },
    { userEmail: actor.email },
  ];

  if (hierarchyDeptIds.length > 0) {
    conditions.push({ targetDepartmentId: { $in: hierarchyDeptIds } });
  }

  const logs = await ActivityLog.find({ $or: conditions })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return ok({ logs });
}
