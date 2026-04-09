import { connectDB } from "@/lib/db";
import ActivitySession from "@/lib/models/ActivitySession";
import DailyAttendance from "@/lib/models/DailyAttendance";
import FlowLayout from "@/lib/models/FlowLayout";
import SystemSettings from "@/lib/models/SystemSettings";
import User, { resolveWeeklySchedule, type Weekday } from "@/lib/models/User";
import { unauthorized, ok } from "@/lib/helpers";
import { getVerifiedSession } from "@/lib/permissions";
import { startOfDay } from "@/lib/dayBoundary";
import { resolveTimezone } from "@/lib/tz";

/**
 * GET /api/attendance/presence/manager
 * Returns the live presence status of the logged-in user's direct manager
 * (determined via the org chart hierarchy in FlowLayout).
 */
export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  const layout = await FlowLayout.findOne({ canvasId: "org" }).lean();
  const empLinks = (layout?.links ?? []) as {
    source: string; target: string;
    sourceHandle: string; targetHandle: string;
  }[];

  const selfNode = `emp-${actor.id}`;
  let managerId: string | null = null;
  for (const link of empLinks) {
    if (link.target === selfNode && link.sourceHandle === "bottom" && link.targetHandle === "top") {
      managerId = link.source.startsWith("emp-") ? link.source.slice(4) : null;
      break;
    }
    if (link.source === selfNode && link.sourceHandle === "top" && link.targetHandle === "bottom") {
      managerId = link.target.startsWith("emp-") ? link.target.slice(4) : null;
      break;
    }
  }

  if (!managerId) return ok(null);

  const manager = await User.findById(managerId)
    .select("about email department weeklySchedule")
    .populate("department", "title")
    .lean();

  if (!manager) return ok(null);

  const settings = await SystemSettings.findOne({ key: "global" }).select("company.timezone").lean();
  const tz = resolveTimezone((settings?.company as { timezone?: string })?.timezone ?? "asia-karachi");
  const today = startOfDay(new Date(), tz);
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
      if (todayMinutes > 9 * 60) status = "overtime";
      isLive = true;
    } else {
      const staleElapsed = active.lastActivity && active.sessionTime?.start
        ? Math.floor((new Date(active.lastActivity).getTime() - new Date(active.sessionTime.start).getTime()) / 60000)
        : 0;
      todayMinutes = (daily?.totalWorkingMinutes ?? 0) + staleElapsed;
      if (daily?.isPresent) {
        const wasRemote = (daily.remoteMinutes ?? 0) > (daily.officeMinutes ?? 0);
        status = wasRemote ? "remote" : "office";
        if (todayMinutes > 9 * 60) status = "overtime";
      }
    }
  } else if (daily?.isPresent) {
    todayMinutes = daily.totalWorkingMinutes;
    const wasRemote = (daily.remoteMinutes ?? 0) > (daily.officeMinutes ?? 0);
    status = wasRemote ? "remote" : "office";
    if (todayMinutes > 9 * 60) status = "overtime";
  }

  const lastSession = await ActivitySession.findOne(
    { user: managerId, sessionDate: today, "sessionTime.end": { $exists: true, $ne: null } },
    { "sessionTime.end": 1 },
    { sort: { "sessionTime.end": -1 } },
  ).lean();

  const lastExit =
    (daily?.lastSessionEnd ? new Date(daily.lastSessionEnd as unknown as string).toISOString() : null)
    ?? (lastSession?.sessionTime?.end ? new Date(lastSession.sessionTime.end).toISOString() : null)
    ?? (daily?.lastOfficeExit ? new Date(daily.lastOfficeExit as unknown as string).toISOString() : null);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const m = manager as any;

  return ok({
    _id: managerId,
    firstName: manager.about.firstName,
    lastName: manager.about.lastName,
    email: m.email ?? "",
    department: (manager.department as { title?: string })?.title ?? "Unassigned",
    status,
    todayMinutes,
    officeMinutes: daily?.officeMinutes ?? 0,
    remoteMinutes: daily?.remoteMinutes ?? 0,
    firstEntry: daily?.firstOfficeEntry ? new Date(daily.firstOfficeEntry as unknown as string).toISOString() : null,
    lastExit,
    shiftStart: (() => { const dayMap: Weekday[] = ["sun","mon","tue","wed","thu","fri","sat"]; const localNow = new Date(new Date().toLocaleString("en-US", { timeZone: tz.replace(/-/g, "/") })); const s = resolveWeeklySchedule(manager as unknown as Record<string, unknown>); return s[dayMap[localNow.getDay()]].start; })(),
    shiftEnd: (() => { const dayMap: Weekday[] = ["sun","mon","tue","wed","thu","fri","sat"]; const localNow = new Date(new Date().toLocaleString("en-US", { timeZone: tz.replace(/-/g, "/") })); const s = resolveWeeklySchedule(manager as unknown as Record<string, unknown>); return s[dayMap[localNow.getDay()]].end; })(),
    isLive,
  });
}
