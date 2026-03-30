import { connectDB } from "@/lib/db";
import DailyAttendance from "@/lib/models/DailyAttendance";
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
  const userId = url.searchParams.get("userId") ?? session.user.id;
  const year = parseInt(url.searchParams.get("year") ?? new Date().getFullYear().toString());
  const month = parseInt(url.searchParams.get("month") ?? (new Date().getMonth() + 1).toString());

  if (session.user.role !== "superadmin" && session.user.role !== "manager" && userId !== session.user.id) {
    return ok([]);
  }

  void User;

  if (type === "monthly") {
    const stats = await MonthlyAttendanceStats.findOne({ user: userId, year, month }).lean();
    return ok(stats || {
      presentDays: 0,
      absentDays: 0,
      totalWorkingDays: 0,
      onTimeArrivals: 0,
      lateArrivals: 0,
      averageDailyHours: 0,
      totalWorkingHours: 0,
      totalOfficeHours: 0,
      totalRemoteHours: 0,
      attendancePercentage: 0,
      onTimePercentage: 0,
    });
  }

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const records = await DailyAttendance.find({
    user: userId,
    date: { $gte: startDate, $lte: endDate },
  })
    .sort({ date: -1 })
    .lean();

  return ok(records);
}
