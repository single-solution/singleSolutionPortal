import { connectDB } from "@/lib/db";
import DailyAttendance from "@/lib/models/DailyAttendance";
import ActivitySession from "@/lib/models/ActivitySession";
import MonthlyAttendanceStats from "@/lib/models/MonthlyAttendanceStats";
import User from "@/lib/models/User";
import { getSession, unauthorized, ok } from "@/lib/helpers";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  await connectDB();

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "daily";
  const year = parseInt(url.searchParams.get("year") ?? String(new Date().getFullYear()));
  const month = parseInt(url.searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const userId = url.searchParams.get("userId") ?? session.user.id;

  const isAdmin = session.user.role === "superadmin" || session.user.role === "manager";

  if (!isAdmin && userId !== session.user.id) {
    return ok([]);
  }

  if (type === "team" && isAdmin) {
    let empFilter: Record<string, unknown> = { isActive: true, userRole: { $ne: "superadmin" } };
    if (session.user.role === "manager") {
      const me = await User.findById(session.user.id).select("department").lean();
      if (me?.department) empFilter.department = me.department;
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
