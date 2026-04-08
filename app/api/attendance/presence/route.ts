import { connectDB } from "@/lib/db";
import ActivitySession from "@/lib/models/ActivitySession";
import DailyAttendance from "@/lib/models/DailyAttendance";
import SystemSettings from "@/lib/models/SystemSettings";
import User, { resolveWeeklySchedule, type Weekday } from "@/lib/models/User";
import { unauthorized, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  isAdmin,
  hasPermission,
  getTeamMemberIds,
} from "@/lib/permissions";
import { startOfDay } from "@/lib/dayBoundary";
import { resolveTimezone } from "@/lib/tz";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  if (!isAdmin(actor) && !hasPermission(actor, "attendance_viewTeam")) {
    return ok([]);
  }

  await connectDB();

  const settings = await SystemSettings.findOne({ key: "global" }).select("company.timezone").lean();
  const tz = resolveTimezone((settings?.company as { timezone?: string })?.timezone ?? "asia-karachi");
  const today = startOfDay(new Date(), tz);

  let empFilter: Record<string, unknown> = { isActive: true, isSuperAdmin: { $ne: true } };
  if (actor.isSuperAdmin) {
    // no extra filter — all non–super-admin employees
  } else if (isAdmin(actor)) {
    const deptIds = [...new Set(actor.memberships.map((m) => m.departmentId))];
    const teamIds = actor.memberships.filter((m) => m.teamId).map((m) => m.teamId!);
    const memberIds = teamIds.length > 0 ? await getTeamMemberIds(teamIds) : [];
    const orClauses: Record<string, unknown>[] = [
      { _id: actor.id },
      { reportsTo: actor.id },
    ];
    if (deptIds.length > 0) orClauses.push({ department: { $in: deptIds } });
    if (memberIds.length > 0) orClauses.push({ _id: { $in: memberIds } });
    empFilter.$or = orClauses;
  } else if (hasPermission(actor, "attendance_viewTeam")) {
    const deptIds = [...new Set(actor.memberships.map((m) => m.departmentId))];
    if (deptIds.length > 0) {
      empFilter.department = { $in: deptIds };
    } else {
      empFilter._id = actor.id;
    }
  }

  const employees = await User.find(empFilter)
    .select("about email username department teams weeklySchedule reportsTo")
    .populate("department", "title")
    .populate("reportsTo", "about.firstName about.lastName")
    .lean();

  const dayMap: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const localNow = new Date(new Date().toLocaleString("en-US", { timeZone: tz.replace(/-/g, "/") }));
  const todayDayKey = dayMap[localNow.getDay()];

  const activeSessions = await ActivitySession.find({
    sessionDate: today,
    status: "active",
  }).sort({ lastActivity: 1 }).lean();

  const dailyRecords = await DailyAttendance.find({
    date: today,
  }).lean();

  const STALE_MS = 3 * 60 * 1000;
  const nowMs = Date.now();

  const sessionAgg = await ActivitySession.aggregate([
    { $match: { sessionDate: today } },
    { $group: {
      _id: "$user",
      firstStart: { $min: "$sessionTime.start" },
      lastEnd: { $max: { $ifNull: ["$sessionTime.end", "$lastActivity"] } },
    }},
  ]);
  const firstStartMap = new Map(sessionAgg.map((r) => [r._id.toString(), r.firstStart as Date]));
  const lastEndMap = new Map(sessionAgg.map((r) => [r._id.toString(), r.lastEnd as Date]));

  const activeMap = new Map(activeSessions.map((s) => [s.user.toString(), s]));
  const dailyMap = new Map(dailyRecords.map((r) => [r.user.toString(), r]));

  const presence = employees.map((emp) => {
    const id = emp._id.toString();
    const active = activeMap.get(id);
    const daily = dailyMap.get(id);

    let status: string = "absent";
    let todayMinutes = 0;
    let isLive = false;
    let staleLastActivity: string | null = null;

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
        staleLastActivity = active.lastActivity ? new Date(active.lastActivity).toISOString() : null;
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

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const e = emp as any;
    const rtObj = e.reportsTo;
    const rt = rtObj?.about
      ? `${rtObj.about.firstName ?? ""} ${rtObj.about.lastName ?? ""}`.trim() || null
      : null;
    const rtId = rtObj?._id ? String(rtObj._id) : null;

    return {
      _id: id,
      username: e.username ?? "",
      firstName: emp.about.firstName,
      lastName: emp.about.lastName,
      email: e.email ?? "",
      department: (emp.department as { title?: string })?.title ?? "Unassigned",
      departmentId: (emp.department as { _id?: unknown })?._id ? String((emp.department as { _id: unknown })._id) : null,
      reportsTo: rt,
      reportsToId: rtId,
      status,
      todayMinutes,
      officeMinutes: daily?.officeMinutes ?? 0,
      remoteMinutes: daily?.remoteMinutes ?? 0,
      lateBy: daily?.lateBy ?? 0,
      isLateToOffice: daily?.isLateToOffice ?? false,
      lateToOfficeBy: daily?.lateToOfficeBy ?? 0,
      breakMinutes: daily?.breakMinutes ?? 0,
      sessionCount: daily?.activitySessions?.length ?? (active ? 1 : 0),
      firstEntry: (() => {
        const fs = firstStartMap.get(id);
        if (fs) return new Date(fs).toISOString();
        if (active) return new Date(active.sessionTime.start).toISOString();
        return null;
      })(),
      firstOfficeEntry: daily?.firstOfficeEntry ? new Date(daily.firstOfficeEntry as unknown as string).toISOString() : null,
      lastOfficeExit: daily?.lastOfficeExit ? new Date(daily.lastOfficeExit as unknown as string).toISOString() : null,
      lastExit: staleLastActivity
        ?? (daily?.lastSessionEnd ? new Date(daily.lastSessionEnd as unknown as string).toISOString() : null)
        ?? (lastEndMap.get(id) ? new Date(lastEndMap.get(id)!).toISOString() : null)
        ?? (daily?.lastOfficeExit ? new Date(daily.lastOfficeExit as unknown as string).toISOString() : null),
      shiftStart: (() => { const s = resolveWeeklySchedule(emp as unknown as Record<string, unknown>); return s[todayDayKey].start; })(),
      shiftEnd: (() => { const s = resolveWeeklySchedule(emp as unknown as Record<string, unknown>); return s[todayDayKey].end; })(),
      shiftBreakTime: (() => { const s = resolveWeeklySchedule(emp as unknown as Record<string, unknown>); return s[todayDayKey].breakMinutes; })(),
      isLive,
      locationFlagged: active?.location?.locationFlagged ?? false,
      flagReason: active?.location?.flagReason ?? null,
      flagCoords: active?.location?.latitude != null && active?.location?.longitude != null
        ? { lat: active.location.latitude, lng: active.location.longitude }
        : null,
      isActive: true,
      teamIds: Array.isArray(emp.teams) ? emp.teams.map((t: unknown) => String(t)) : [],
    };
  });

  return ok(presence);
}
