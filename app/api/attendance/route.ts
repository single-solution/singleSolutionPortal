import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import DailyAttendance from "@/lib/models/DailyAttendance";
import ActivitySession from "@/lib/models/ActivitySession";
import MonthlyAttendanceStats from "@/lib/models/MonthlyAttendanceStats";
import Membership from "@/lib/models/Membership";
import SystemSettings from "@/lib/models/SystemSettings";
import User from "@/lib/models/User";
import { unauthorized, ok } from "@/lib/helpers";
import { startOfDay } from "@/lib/dayBoundary";
import { resolveTimezone, dateInTz } from "@/lib/tz";
import {
  getVerifiedSession,
  hasPermission,
  getSubordinateUserIds,
} from "@/lib/permissions";
import type { VerifiedUser } from "@/lib/permissions";
import { NextRequest } from "next/server";

function buildSubordinateEmployeeFilter(actor: VerifiedUser, subordinateIds: string[]): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    isActive: true,
    isSuperAdmin: { $ne: true },
  };

  if (actor.isSuperAdmin) {
    filter._id = { $ne: actor.id };
    return filter;
  }

  if (subordinateIds.length === 0) {
    filter._id = { $in: [] };
    return filter;
  }

  filter._id = { $in: subordinateIds };
  return filter;
}

export async function GET(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  const settings = await SystemSettings.findOne({ key: "global" }).select("company.timezone").lean();
  const tz = resolveTimezone((settings?.company as { timezone?: string })?.timezone ?? "asia-karachi");

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "daily";
  const year = parseInt(url.searchParams.get("year") ?? String(new Date().getFullYear()));
  const month = parseInt(url.searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const userId = url.searchParams.get("userId") ?? actor.id;

  const subordinateIds = actor.isSuperAdmin ? [] : await getSubordinateUserIds(actor.id);
  const canTeam = actor.isSuperAdmin || hasPermission(actor, "attendance_viewTeam");

  if (type === "team") {
    if (!canTeam) return ok([]);
    const empFilter = buildSubordinateEmployeeFilter(actor, subordinateIds);

    const employees = await User.find(empFilter)
      .select("about")
      .sort({ "about.firstName": 1 })
      .lean();

    const result = employees.map((emp) => ({
      _id: emp._id.toString(),
      name: `${emp.about.firstName} ${emp.about.lastName ?? ""}`.trim(),
    }));

    return ok(result);
  }

  if (type === "team-monthly") {
    if (!canTeam) return ok([]);
    const empFilter = buildSubordinateEmployeeFilter(actor, subordinateIds);

    const employees = await User.find(empFilter)
      .select("about")
      .sort({ "about.firstName": 1 })
      .lean();

    const empIds = employees.map((e) => e._id);
    const stats = await MonthlyAttendanceStats.find({
      user: { $in: empIds },
      year,
      month,
    }).lean();

    const statsMap = new Map<string, typeof stats[0]>();
    for (const s of stats) statsMap.set(s.user.toString(), s);

    const monthStart = dateInTz(year, month - 1, 1, 0, 0, 0, tz);
    const nextMonthStart = dateInTz(year, month, 1, 0, 0, 0, tz);
    const monthEnd = new Date(nextMonthStart.getTime() - 1);

    const dailyCounts = await DailyAttendance.aggregate([
      { $match: { user: { $in: empIds }, date: { $gte: monthStart, $lte: monthEnd } } },
      { $group: { _id: "$user", presentDays: { $sum: { $cond: ["$isPresent", 1, 0] } }, onTimeDays: { $sum: { $cond: ["$isOnTime", 1, 0] } }, totalMinutes: { $sum: "$totalWorkingMinutes" }, lateDays: { $sum: { $cond: [{ $gt: ["$lateBy", 0] }, 1, 0] } }, lateToOfficeDays: { $sum: { $cond: [{ $eq: ["$isLateToOffice", true] }, 1, 0] } } } },
    ]);
    const dailyMap = new Map<string, typeof dailyCounts[0]>();
    for (const d of dailyCounts) dailyMap.set(d._id.toString(), d);

    const memberships = await Membership.find({
      user: { $in: empIds },
      isActive: true,
    }).populate("department", "title").populate("designation", "name").lean();

    const empDeptMap = new Map<string, { deptId: string; deptName: string; role: string }>();
    for (const m of memberships) {
      const uid = m.user.toString();
      if (empDeptMap.has(uid)) continue;
      const dept = m.department as unknown as { _id: mongoose.Types.ObjectId; title?: string } | null;
      const desig = m.designation as unknown as { name?: string } | null;
      empDeptMap.set(uid, {
        deptId: dept?._id?.toString() ?? "",
        deptName: dept?.title ?? "",
        role: desig?.name ?? "",
      });
    }

    const result = employees.map((emp) => {
      const id = emp._id.toString();
      const ms = statsMap.get(id);
      const dc = dailyMap.get(id);
      const dm = empDeptMap.get(id);
      return {
        _id: id,
        name: `${emp.about.firstName} ${emp.about.lastName ?? ""}`.trim(),
        department: dm?.deptName ?? "",
        departmentId: dm?.deptId ?? null,
        role: dm?.role ?? "",
        presentDays: dc?.presentDays ?? ms?.presentDays ?? 0,
        onTimeDays: dc?.onTimeDays ?? ms?.onTimeArrivals ?? 0,
        lateDays: dc?.lateDays ?? ms?.lateArrivals ?? 0,
        lateToOfficeDays: dc?.lateToOfficeDays ?? 0,
        totalMinutes: dc?.totalMinutes ?? Math.round((ms?.totalWorkingHours ?? 0) * 60),
        averageDailyHours: ms?.averageDailyHours ?? 0,
        onTimePercentage: ms?.onTimePercentage ?? 0,
        attendancePercentage: ms?.attendancePercentage ?? 0,
      };
    });

    return ok(result);
  }

  if (type === "team-date") {
    if (!canTeam) return ok([]);
    const dateStr = url.searchParams.get("date");
    if (!dateStr) return ok([]);

    const empFilter = buildSubordinateEmployeeFilter(actor, subordinateIds);

    const employees = await User.find(empFilter)
      .select("about")
      .sort({ "about.firstName": 1 })
      .lean();

    const parts = dateStr.split("-").map(Number);
    const target = dateInTz(parts[0], parts[1] - 1, parts[2], 12, 0, 0, tz);
    const dayStart = startOfDay(target, tz);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const empIds = employees.map((e) => e._id);
    const dailyRecords = await DailyAttendance.find({
      user: { $in: empIds },
      date: { $gte: dayStart, $lte: dayEnd },
    }).lean();

    const dailyMap = new Map<string, (typeof dailyRecords)[0]>();
    for (const d of dailyRecords) dailyMap.set(d.user.toString(), d);

    const sessionAgg = await ActivitySession.aggregate([
      { $match: { user: { $in: empIds }, sessionDate: { $gte: dayStart, $lte: dayEnd } } },
      { $group: {
        _id: "$user",
        firstStart: { $min: "$sessionTime.start" },
        lastEnd: { $max: { $ifNull: ["$sessionTime.end", "$lastActivity"] } },
      }},
    ]);
    const sessMap = new Map<string, { firstStart: Date; lastEnd: Date }>();
    for (const s of sessionAgg) sessMap.set(s._id.toString(), { firstStart: s.firstStart, lastEnd: s.lastEnd });

    const dateMemberships = await Membership.find({
      user: { $in: empIds },
      isActive: true,
    }).populate("department", "title").populate("designation", "name").lean();

    const dateDeptMap = new Map<string, { deptId: string; deptName: string; role: string }>();
    for (const m of dateMemberships) {
      const uid = m.user.toString();
      if (dateDeptMap.has(uid)) continue;
      const dept = m.department as unknown as { _id: mongoose.Types.ObjectId; title?: string } | null;
      const desig = m.designation as unknown as { name?: string } | null;
      dateDeptMap.set(uid, {
        deptId: dept?._id?.toString() ?? "",
        deptName: dept?.title ?? "",
        role: desig?.name ?? "",
      });
    }

    const result = employees.map((emp) => {
      const id = emp._id.toString();
      const rec = dailyMap.get(id);
      const st = sessMap.get(id);
      const dm = dateDeptMap.get(id);
      return {
        _id: id,
        name: `${emp.about.firstName} ${emp.about.lastName ?? ""}`.trim(),
        department: dm?.deptName ?? "",
        departmentId: dm?.deptId ?? null,
        role: dm?.role ?? "",
        isPresent: rec?.isPresent ?? false,
        isOnTime: rec?.isOnTime ?? false,
        totalWorkingMinutes: rec?.totalWorkingMinutes ?? 0,
        officeMinutes: rec?.officeMinutes ?? 0,
        remoteMinutes: rec?.remoteMinutes ?? 0,
        firstOfficeEntry: rec?.firstOfficeEntry ?? null,
        lastOfficeExit: rec?.lastOfficeExit ?? null,
        firstStart: st?.firstStart ?? null,
        lastEnd: st?.lastEnd ?? null,
        lateBy: rec?.lateBy ?? 0,
        isLateToOffice: rec?.isLateToOffice ?? false,
        lateToOfficeBy: rec?.lateToOfficeBy ?? 0,
      };
    });

    return ok(result);
  }

  const isSelf = userId === actor.id;
  const isSubordinate = subordinateIds.includes(userId);
  const allowed = actor.isSuperAdmin || isSelf || isSubordinate;
  if (!allowed) {
    if (type === "detail" || type === "monthly") return ok(null);
    return ok([]);
  }

  if (!isSelf && !isSubordinate && !hasPermission(actor, "attendance_viewTeam")) {
    if (type === "detail" || type === "monthly") return ok(null);
    return ok([]);
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

    // Parse date string at midday in company tz so startOfDay lands correctly
    const parts = dateStr.split("-").map(Number);
    const target = dateInTz(parts[0], parts[1] - 1, parts[2], 12, 0, 0, tz);
    const start = startOfDay(target, tz);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);

    const daily = await DailyAttendance.findOne({
      user: userId,
      date: { $gte: start, $lte: end },
    }).lean();

    if (!daily) {
      const activeOnly = await ActivitySession.findOne({
        user: userId,
        sessionDate: { $gte: start, $lte: end },
        status: "active",
      }).lean();
      if (activeOnly) {
        const elapsed = Math.floor((Date.now() - activeOnly.sessionTime.start.getTime()) / 60000);
        return ok({
          user: userId,
          date: start,
          totalWorkingMinutes: elapsed,
          officeMinutes: activeOnly.location?.inOffice ? elapsed : 0,
          remoteMinutes: activeOnly.location?.inOffice ? 0 : elapsed,
          isPresent: true,
          isOnTime: true,
          lateBy: 0,
          isLateToOffice: false,
          lateToOfficeBy: 0,
          firstOfficeEntry: activeOnly.location?.inOffice ? activeOnly.sessionTime.start : null,
          activitySessions: [activeOnly],
          _synthesized: true,
        });
      }
      return ok(null);
    }

    const populated = await DailyAttendance.findById(daily._id)
      .populate("activitySessions")
      .lean();

    if (populated) {
      const activeSession = await ActivitySession.findOne({
        user: userId,
        sessionDate: { $gte: start, $lte: end },
        status: "active",
      }).lean();
      if (activeSession) {
        const elapsed = Math.floor((Date.now() - activeSession.sessionTime.start.getTime()) / 60000);
        const isInOffice = activeSession.location?.inOffice ?? false;
        (populated as Record<string, unknown>).totalWorkingMinutes = (populated.totalWorkingMinutes ?? 0) + elapsed;
        (populated as Record<string, unknown>).officeMinutes = (populated.officeMinutes ?? 0) + (isInOffice ? elapsed : 0);
        (populated as Record<string, unknown>).remoteMinutes = (populated.remoteMinutes ?? 0) + (isInOffice ? 0 : elapsed);
      }
    }

    return ok(populated);
  }

  if (type === "daily") {
    const monthStart = dateInTz(year, month - 1, 1, 0, 0, 0, tz);
    const nextMonthStart = dateInTz(year, month, 1, 0, 0, 0, tz);
    const monthEnd = new Date(nextMonthStart.getTime() - 1);

    const records = await DailyAttendance.find({
      user: userId,
      date: { $gte: monthStart, $lte: monthEnd },
    })
      .sort({ date: -1 })
      .lean();

    const userOid = new mongoose.Types.ObjectId(userId);
    const sessionAgg = await ActivitySession.aggregate([
      { $match: { user: userOid, sessionDate: { $gte: monthStart, $lte: monthEnd } } },
      { $group: {
        _id: "$sessionDate",
        firstStart: { $min: "$sessionTime.start" },
        lastEnd: { $max: { $ifNull: ["$sessionTime.end", "$lastActivity"] } },
      }},
    ]);
    const sessTimeMap = new Map<number, { firstStart: Date; lastEnd: Date }>();
    for (const s of sessionAgg) sessTimeMap.set(new Date(s._id).getTime(), { firstStart: s.firstStart, lastEnd: s.lastEnd });

    const enriched = records.map((rec) => {
      const st = sessTimeMap.get(new Date(rec.date).getTime());
      return { ...rec, firstStart: st?.firstStart ?? null, lastEnd: st?.lastEnd ?? null };
    });

    return ok(enriched);
  }

  return ok([]);
}
