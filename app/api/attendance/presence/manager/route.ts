import { connectDB } from "@/lib/db";
import ActivitySession from "@/lib/models/ActivitySession";
import DailyAttendance from "@/lib/models/DailyAttendance";
import User from "@/lib/models/User";
import { unauthorized, ok } from "@/lib/helpers";
import { getVerifiedSession } from "@/lib/permissions";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * GET /api/attendance/presence/manager
 * Returns the live presence status of the logged-in user's reportsTo (manager/lead).
 */
export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  const me = await User.findById(actor.id).select("reportsTo").lean();
  if (!me?.reportsTo) return ok(null);

  const managerId = me.reportsTo.toString();
  const manager = await User.findById(managerId)
    .select("about email userRole department workShift")
    .populate("department", "title")
    .lean();

  if (!manager) return ok(null);

  const today = startOfDay(new Date());
  const nowMs = Date.now();
  const STALE_MS = 3 * 60 * 1000;

  const active = await ActivitySession.findOne({
    user: managerId,
    sessionDate: today,
    status: "active",
  }).lean();

  const daily = await DailyAttendance.findOne({
    user: managerId,
    date: today,
  }).lean();

  let status = "absent";
  let todayMinutes = 0;
  let isLive = false;

  if (active) {
    const lastActivityMs = active.lastActivity ? new Date(active.lastActivity).getTime() : 0;
    const stale = (nowMs - lastActivityMs) > STALE_MS;

    if (!stale) {
      const elapsed = Math.floor((nowMs - active.sessionTime.start.getTime()) / 60000);
      todayMinutes = (daily?.totalWorkingMinutes ?? 0) + elapsed;
      status = active.location.inOffice ? "office" : "remote";
      if (daily && !daily.isOnTime) status = "late";
      if (todayMinutes > 9 * 60) status = "overtime";
      isLive = true;
    } else {
      todayMinutes = daily?.totalWorkingMinutes ?? 0;
      if (daily?.isPresent) {
        const wasRemote = (daily.remoteMinutes ?? 0) > (daily.officeMinutes ?? 0);
        status = wasRemote ? "remote" : "office";
        if (!daily.isOnTime) status = "late";
        if (todayMinutes > 9 * 60) status = "overtime";
      }
    }
  } else if (daily?.isPresent) {
    todayMinutes = daily.totalWorkingMinutes;
    const wasRemote = (daily.remoteMinutes ?? 0) > (daily.officeMinutes ?? 0);
    status = wasRemote ? "remote" : "office";
    if (!daily.isOnTime) status = "late";
    if (todayMinutes > 9 * 60) status = "overtime";
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const m = manager as any;

  return ok({
    _id: managerId,
    firstName: manager.about.firstName,
    lastName: manager.about.lastName,
    email: m.email ?? "",
    userRole: manager.userRole,
    department: (manager.department as { title?: string })?.title ?? "Unassigned",
    status,
    todayMinutes,
    officeMinutes: daily?.officeMinutes ?? 0,
    remoteMinutes: daily?.remoteMinutes ?? 0,
    firstEntry: daily?.firstOfficeEntry ? new Date(daily.firstOfficeEntry as unknown as string).toISOString() : null,
    lastExit: daily?.lastOfficeExit ? new Date(daily.lastOfficeExit as unknown as string).toISOString() : null,
    shiftStart: m.workShift?.shift?.start ?? "10:00",
    shiftEnd: m.workShift?.shift?.end ?? "19:00",
    isLive,
  });
}
