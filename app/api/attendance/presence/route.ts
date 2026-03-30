import { connectDB } from "@/lib/db";
import ActivitySession from "@/lib/models/ActivitySession";
import DailyAttendance from "@/lib/models/DailyAttendance";
import User from "@/lib/models/User";
import { getSession, unauthorized, ok } from "@/lib/helpers";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export async function GET() {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  if (session.user.role !== "superadmin" && session.user.role !== "manager") {
    return ok([]);
  }

  await connectDB();

  const today = startOfDay(new Date());

  let empFilter: Record<string, unknown> = { isActive: true };
  if (session.user.role === "manager") {
    const me = await User.findById(session.user.id).select("department").lean();
    if (me?.department) empFilter.department = me.department;
  }

  const employees = await User.find(empFilter)
    .select("about userRole department")
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
      isActive: true,
    };
  });

  return ok(presence);
}
