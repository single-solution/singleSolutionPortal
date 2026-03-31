import { connectDB } from "@/lib/db";
import DailyAttendance from "@/lib/models/DailyAttendance";
import ActivitySession from "@/lib/models/ActivitySession";
import MonthlyAttendanceStats from "@/lib/models/MonthlyAttendanceStats";
import User from "@/lib/models/User";
import { unauthorized, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  canViewAttendance,
  canViewTeamStats,
  isSuperAdmin,
  isManager,
  isTeamLead,
  isEmployee,
  getTeamMemberIds,
} from "@/lib/permissions";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "daily";
  const year = parseInt(url.searchParams.get("year") ?? String(new Date().getFullYear()));
  const month = parseInt(url.searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const userId = url.searchParams.get("userId") ?? actor.id;

  if (type === "team") {
    if (!canViewTeamStats(actor)) return ok([]);

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
      .select("about userRole department")
      .populate("department", "title")
      .sort({ "about.firstName": 1 })
      .lean();

    const team = employees.map((emp) => ({
      _id: emp._id.toString(),
      name: `${emp.about.firstName} ${emp.about.lastName ?? ""}`.trim(),
      role: emp.userRole,
      department: (emp.department as { title?: string })?.title ?? "Unassigned",
    }));

    return ok(team);
  }

  let targetDept: string | null | undefined = undefined;
  let targetTeams: string[] | undefined = undefined;
  if (userId !== actor.id && !isSuperAdmin(actor)) {
    const target = await User.findById(userId).select("department teams").lean();
    targetDept = target?.department?.toString();
    targetTeams = (target?.teams as { toString(): string }[] | undefined)?.map((t) => t.toString());
  }

  if (!canViewAttendance(actor, userId, targetDept, targetTeams)) return ok([]);

  if (type === "monthly") {
    const stats = await MonthlyAttendanceStats.findOne({
      user: userId,
      year,
      month,
    }).lean();

    return ok(stats ?? null);
  }

  if (type === "detail") {
    const dateStr = url.searchParams.get("date");
    if (!dateStr) return ok(null);

    const target = new Date(dateStr);
    const start = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const end = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59, 999);

    const daily = await DailyAttendance.findOne({
      user: userId,
      date: { $gte: start, $lte: end },
    }).lean();

    if (!daily) return ok(null);

    void ActivitySession;

    const populated = await DailyAttendance.findById(daily._id)
      .populate("activitySessions")
      .lean();

    return ok(populated);
  }

  if (type === "daily") {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const records = await DailyAttendance.find({
      user: userId,
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ date: -1 })
      .lean();

    return ok(records);
  }

  return ok([]);
}
