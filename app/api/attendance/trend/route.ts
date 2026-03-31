import { connectDB } from "@/lib/db";
import DailyAttendance from "@/lib/models/DailyAttendance";
import User from "@/lib/models/User";
import { unauthorized, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  isAdmin,
  canViewTeamStats,
  isManager,
  isTeamLead,
  isEmployee,
  getTeamMemberIds,
} from "@/lib/permissions";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  if (!isAdmin(actor) && !canViewTeamStats(actor)) {
    return ok([]);
  }

  await connectDB();

  let empFilter: Record<string, unknown> = { isActive: true, userRole: { $ne: "superadmin" } };
  if (isManager(actor) && !actor.crossDepartmentAccess && actor.department) {
    empFilter.department = actor.department;
  } else if (isTeamLead(actor)) {
    const memberIds = await getTeamMemberIds(actor.leadOfTeams);
    if (memberIds.length > 0) {
      empFilter._id = { $in: memberIds };
    } else {
      return ok([]);
    }
  } else if (isEmployee(actor) && actor.teamStatsVisible && actor.department) {
    empFilter.department = actor.department;
  }

  const employees = await User.find(empFilter).select("_id").lean();
  const empIds = employees.map((e) => e._id.toString());

  const today = startOfDay(new Date());
  const dates: Date[] = [];
  let cursor = new Date(today);
  cursor.setDate(cursor.getDate() - 1);
  let found = 0;
  while (found < 5 && cursor.getTime() > today.getTime() - 30 * 86_400_000) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      dates.unshift(new Date(cursor));
      found++;
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  if (dates.length === 0) return ok([]);

  const records = await DailyAttendance.find({
    user: { $in: empIds },
    date: { $gte: dates[0], $lte: dates[dates.length - 1] },
    isPresent: true,
  })
    .select("date")
    .lean();

  const dayMap = new Map<string, number>();
  for (const r of records) {
    const key = startOfDay(new Date(r.date)).toISOString().slice(0, 10);
    dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
  }

  const trend = dates.map((d) => {
    const key = d.toISOString().slice(0, 10);
    const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
    return { date: key, label: dayName, count: dayMap.get(key) ?? 0 };
  });

  return ok(trend);
}
