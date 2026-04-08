import { connectDB } from "@/lib/db";
import ActivityLog from "@/lib/models/ActivityLog";
import { unauthorized, ok } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin, isAdmin, hasPermission } from "@/lib/permissions";
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

  const conditions: Record<string, unknown>[] = [
    { visibility: "all" },
    { targetUserIds: actor.id },
    { userEmail: actor.email },
  ];

  const deptIds = [...new Set(actor.memberships.map((m) => m.departmentId))];
  const teamIds = [...new Set(actor.memberships.filter((m) => m.teamId).map((m) => m.teamId!))];

  if (isAdmin(actor) && deptIds.length > 0) {
    conditions.push({ targetDepartmentId: { $in: deptIds } });
  }

  if (teamIds.length > 0 && (isAdmin(actor) || hasPermission(actor, "attendance_viewTeam"))) {
    conditions.push({ targetTeamIds: { $in: teamIds } });
  }

  const logs = await ActivityLog.find({ $or: conditions })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return ok({ logs });
}
