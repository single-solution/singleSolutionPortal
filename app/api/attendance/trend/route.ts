import { connectDB } from "@/lib/db";
import DailyAttendance from "@/lib/models/DailyAttendance";
import SystemSettings from "@/lib/models/SystemSettings";
import User from "@/lib/models/User";
import { unauthorized, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  hasPermission,
  getSubordinateUserIds,
} from "@/lib/permissions";
import { startOfDay } from "@/lib/dayBoundary";
import { resolveTimezone, dateParts } from "@/lib/tz";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  const settings = await SystemSettings.findOne({ key: "global" }).select("company.timezone").lean();
  const tz = resolveTimezone((settings?.company as { timezone?: string })?.timezone ?? "asia-karachi");

  let empFilter: Record<string, unknown> = { isActive: true, isSuperAdmin: { $ne: true } };
  if (actor.isSuperAdmin) {
    // no extra filter
  } else {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    const canViewTeam = hasPermission(actor, "attendance_viewTeam");

    if (!canViewTeam && subordinateIds.length === 0) {
      return ok([]);
    }

    const deptIds = canViewTeam
      ? [...new Set(actor.memberships.map((m) => m.departmentId))]
      : [];

    const orClauses: Record<string, unknown>[] = [
      { _id: actor.id },
      { reportsTo: actor.id },
    ];
    if (deptIds.length > 0) orClauses.push({ department: { $in: deptIds } });
    if (subordinateIds.length > 0) orClauses.push({ _id: { $in: subordinateIds } });
    empFilter.$or = orClauses;
  }

  const employees = await User.find(empFilter).select("_id").lean();
  const empIds = employees.map((e) => e._id.toString());

  const today = startOfDay(new Date(), tz);
  const dates: Date[] = [];
  let cursor = new Date(today);
  cursor.setDate(cursor.getDate() - 1);
  let found = 0;
  while (found < 5 && cursor.getTime() > today.getTime() - 30 * 86_400_000) {
    const p = dateParts(cursor, tz);
    const dow = new Date(p.year, p.month, p.day).getDay();
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
    const key = startOfDay(new Date(r.date), tz).toISOString().slice(0, 10);
    dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
  }

  const trend = dates.map((d) => {
    const key = d.toISOString().slice(0, 10);
    const p = dateParts(d, tz);
    const dayName = new Date(p.year, p.month, p.day).toLocaleDateString("en-US", { weekday: "short" });
    return { date: key, label: dayName, count: dayMap.get(key) ?? 0 };
  });

  return ok(trend);
}
