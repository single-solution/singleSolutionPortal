import { connectDB } from "@/lib/db";
import ActivitySession from "@/lib/models/ActivitySession";
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

  const today = startOfDay(new Date());

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

  const employees = await User.find(empFilter)
    .select("about email userRole department teams workShift reportsTo")
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

  const activeMap = new Map(activeSessions.map((s) => [s.user.toString(), s]));
  const dailyMap = new Map(dailyRecords.map((r) => [r.user.toString(), r]));

  const presence = employees.map((emp) => {
    const id = emp._id.toString();
    const active = activeMap.get(id);
    const daily = dailyMap.get(id);

    let status: string = "absent";
    let todayMinutes = 0;

    if (active) {
      const elapsed = Math.floor((Date.now() - active.sessionTime.start.getTime()) / 60000);
      todayMinutes = (daily?.totalWorkingMinutes ?? 0) + elapsed;
      status = active.location.inOffice ? "office" : "remote";

      if (daily && !daily.isOnTime) status = "late";
      if (todayMinutes > 9 * 60) status = "overtime";
    } else if (daily?.isPresent) {
      todayMinutes = daily.totalWorkingMinutes;
      status = daily.isOnTime ? "office" : "late";
      if (todayMinutes > 9 * 60) status = "overtime";
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const e = emp as any;
    const rt = e.reportsTo?.about
      ? `${e.reportsTo.about.firstName ?? ""} ${e.reportsTo.about.lastName ?? ""}`.trim() || null
      : null;

    return {
      _id: id,
      firstName: emp.about.firstName,
      lastName: emp.about.lastName,
      email: e.email ?? "",
      userRole: emp.userRole,
      department: (emp.department as { title?: string })?.title ?? "Unassigned",
      reportsTo: rt,
      status,
      todayMinutes,
      officeMinutes: daily?.officeMinutes ?? 0,
      remoteMinutes: daily?.remoteMinutes ?? 0,
      lateBy: daily?.lateBy ?? 0,
      breakMinutes: daily?.breakMinutes ?? 0,
      firstEntry: daily?.firstOfficeEntry ? new Date(daily.firstOfficeEntry as unknown as string).toISOString() : null,
      lastExit: daily?.lastOfficeExit ? new Date(daily.lastOfficeExit as unknown as string).toISOString() : null,
      shiftStart: e.workShift?.shift?.start ?? "10:00",
      shiftEnd: e.workShift?.shift?.end ?? "19:00",
      shiftBreakTime: e.workShift?.breakTime ?? 60,
      isActive: true,
      teamIds: Array.isArray(emp.teams) ? emp.teams.map((t: unknown) => String(t)) : [],
    };
  });

  return ok(presence);
}
