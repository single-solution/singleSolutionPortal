import { connectDB } from "@/lib/db";
import ActivitySession from "@/lib/models/ActivitySession";
import DailyAttendance from "@/lib/models/DailyAttendance";
import SystemSettings from "@/lib/models/SystemSettings";
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
import { startOfDay } from "@/lib/dayBoundary";
import { resolveTimezone } from "@/lib/tz";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  if (!isAdmin(actor) && !canViewTeamStats(actor)) {
    return ok([]);
  }

  await connectDB();

  const settings = await SystemSettings.findOne({ key: "global" }).select("company.timezone").lean();
  const tz = resolveTimezone((settings?.company as { timezone?: string })?.timezone ?? "asia-karachi");
  const today = startOfDay(new Date(), tz);

  let empFilter: Record<string, unknown> = { isActive: true, userRole: { $ne: "superadmin" } };
  if (isManager(actor) && !actor.crossDepartmentAccess) {
    if (actor.managedDepartments.length > 0) {
      empFilter.department = { $in: actor.managedDepartments };
    } else if (actor.department) {
      empFilter.department = actor.department;
    }
  } else if (isTeamLead(actor)) {
    const orClauses: Record<string, unknown>[] = [{ reportsTo: actor.id }];
    const memberIds = await getTeamMemberIds(actor.leadOfTeams);
    if (memberIds.length > 0) {
      orClauses.push({ _id: { $in: memberIds } });
    }
    empFilter.$or = orClauses;
  } else if (isEmployee(actor) && actor.teamStatsVisible && actor.department) {
    empFilter.department = actor.department;
  }

  const employees = await User.find(empFilter)
    .select("about email username userRole department teams workShift reportsTo")
    .populate("department", "title")
    .populate("reportsTo", "about.firstName about.lastName")
    .lean();

  const activeSessions = await ActivitySession.find({
    sessionDate: today,
    status: "active",
  }).lean();

  const dailyRecords = await DailyAttendance.find({
    date: today,
  }).lean();

  const STALE_MS = 3 * 60 * 1000;
  const nowMs = Date.now();

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
      userRole: emp.userRole,
      department: (emp.department as { title?: string })?.title ?? "Unassigned",
      reportsTo: rt,
      reportsToId: rtId,
      status,
      todayMinutes,
      officeMinutes: daily?.officeMinutes ?? 0,
      remoteMinutes: daily?.remoteMinutes ?? 0,
      lateBy: daily?.lateBy ?? 0,
      breakMinutes: daily?.breakMinutes ?? 0,
      firstEntry: daily?.firstOfficeEntry ? new Date(daily.firstOfficeEntry as unknown as string).toISOString() : null,
      lastExit: staleLastActivity
        ?? (daily?.lastSessionEnd ? new Date(daily.lastSessionEnd as unknown as string).toISOString() : null)
        ?? (daily?.lastOfficeExit ? new Date(daily.lastOfficeExit as unknown as string).toISOString() : null),
      shiftStart: e.workShift?.shift?.start ?? "10:00",
      shiftEnd: e.workShift?.shift?.end ?? "19:00",
      shiftBreakTime: e.workShift?.breakTime ?? 60,
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
