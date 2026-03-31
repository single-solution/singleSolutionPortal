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
    .select("about userRole department teams")
    .populate("department", "title")
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

    return {
      _id: id,
      firstName: emp.about.firstName,
      lastName: emp.about.lastName,
      userRole: emp.userRole,
      department: (emp.department as { title?: string })?.title ?? "Unassigned",
      status,
      todayMinutes,
      lateBy: daily?.lateBy ?? 0,
      isActive: true,
      teamIds: Array.isArray(emp.teams) ? emp.teams.map((t: unknown) => String(t)) : [],
    };
  });

  return ok(presence);
}
