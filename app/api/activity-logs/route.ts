import { connectDB } from "@/lib/db";
import ActivityLog from "@/lib/models/ActivityLog";
import { unauthorized, ok } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin, isManager, isTeamLead } from "@/lib/permissions";
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

  if (isManager(actor) && actor.department) {
    conditions.push({ targetDepartmentId: actor.department });
  }

  if (isTeamLead(actor) && actor.leadOfTeams.length > 0) {
    conditions.push({ targetTeamIds: { $in: actor.leadOfTeams } });
  }

  if (isManager(actor)) {
    const mgrTeams = [...new Set([...actor.teams, ...actor.leadOfTeams])];
    if (mgrTeams.length > 0) {
      conditions.push({ targetTeamIds: { $in: mgrTeams } });
    }
  }

  const logs = await ActivityLog.find({ $or: conditions })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return ok({ logs });
}
