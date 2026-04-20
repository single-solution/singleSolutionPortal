import { connectDB } from "@/lib/db";
import ActivitySession from "@/lib/models/ActivitySession";
import DailyAttendance from "@/lib/models/DailyAttendance";
import Membership from "@/lib/models/Membership";
import FlowLayout from "@/lib/models/FlowLayout";
import SystemSettings from "@/lib/models/SystemSettings";
import User, { resolveWeeklySchedule, type Weekday } from "@/lib/models/User";
import { unauthorized, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  hasPermission,
  getSubordinateUserIds,
} from "@/lib/permissions";
import { startOfDay } from "@/lib/dayBoundary";
import { resolveTimezone } from "@/lib/tz";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();

  const settings = await SystemSettings.findOne({ key: "global" }).select("company.timezone").lean();
  const tz = resolveTimezone((settings?.company as { timezone?: string })?.timezone ?? "asia-karachi");
  const today = startOfDay(new Date(), tz);

  const hasTeamPerm = hasPermission(actor, "attendance_viewTeam") || hasPermission(actor, "employees_viewAttendance");
  const subordinateIds = actor.isSuperAdmin ? [] : await getSubordinateUserIds(actor.id);

  let teamUserIds = subordinateIds;
  if (!actor.isSuperAdmin && hasTeamPerm && subordinateIds.length === 0) {
    const myMemberships = await Membership.find({ user: actor.id, isActive: { $ne: false } })
      .select("department").lean();
    const myDeptIds = myMemberships.map((m) => m.department?.toString()).filter(Boolean);
    if (myDeptIds.length > 0) {
      const coMembers = await Membership.find({
        department: { $in: myDeptIds },
        user: { $ne: actor.id },
        isActive: { $ne: false },
      }).select("user").lean();
      teamUserIds = [...new Set(coMembers.map((m) => m.user?.toString()).filter(Boolean) as string[])];
    }
  }

  let empFilter: Record<string, unknown> = { isActive: true, isSuperAdmin: { $ne: true } };
  if (actor.isSuperAdmin) {
    // superadmin sees all non–super-admin employees
  } else if (hasTeamPerm || teamUserIds.length > 0) {
    empFilter._id = { $in: [actor.id, ...teamUserIds] };
  } else {
    empFilter._id = actor.id;
  }

  const employees = await User.find(empFilter)
    .select("about email username weeklySchedule")
    .lean();

  const dayMap: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const localNow = new Date(new Date().toLocaleString("en-US", { timeZone: tz.replace(/-/g, "/") }));
  const todayDayKey = dayMap[localNow.getDay()];

  const empIds = employees.map((e) => e._id);

  const [activeSessions, dailyRecords, sessionAgg, memberships, flowLayout] = await Promise.all([
    ActivitySession.find({
      user: { $in: empIds },
      sessionDate: today,
      status: "active",
    }).sort({ lastActivity: 1 }).lean(),
    DailyAttendance.find({
      user: { $in: empIds },
      date: today,
    }).lean(),
    ActivitySession.aggregate([
      { $match: { user: { $in: empIds }, sessionDate: today } },
      { $group: {
        _id: "$user",
        firstStart: { $min: "$sessionTime.start" },
        lastEnd: { $max: { $ifNull: ["$sessionTime.end", "$lastActivity"] } },
      }},
    ]),
    Membership.find({ user: { $in: empIds }, isActive: true })
      .populate("designation", "name color")
      .populate({ path: "department", select: "title parentDepartment", populate: { path: "parentDepartment", select: "title" } })
      .lean(),
    FlowLayout.findOne({ canvasId: "org" }).lean(),
  ]);

  /* ── Build per-employee maps for membership data ── */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membershipsByUser = new Map<string, any[]>();
  for (const m of memberships) {
    const uid = m.user.toString();
    if (!membershipsByUser.has(uid)) membershipsByUser.set(uid, []);
    membershipsByUser.get(uid)!.push(m);
  }

  const empLinks = ((flowLayout as { links?: { source: string; target: string; sourceHandle: string; targetHandle: string }[] })?.links ?? []);
  const empNameMap = new Map(employees.map((e) => [e._id.toString(), `${e.about.firstName} ${e.about.lastName}`.trim()]));
  const reportsToMap = new Map<string, string>();
  for (const link of empLinks) {
    if (link.source.startsWith("emp-") && link.target.startsWith("emp-") && link.sourceHandle === "bottom" && link.targetHandle === "top") {
      const subordinateId = link.target.slice(4);
      const managerId = link.source.slice(4);
      const managerName = empNameMap.get(managerId);
      if (managerName) reportsToMap.set(subordinateId, managerName);
    }
    if (link.source.startsWith("emp-") && link.target.startsWith("emp-") && link.sourceHandle === "top" && link.targetHandle === "bottom") {
      const subordinateId = link.source.slice(4);
      const managerId = link.target.slice(4);
      const managerName = empNameMap.get(managerId);
      if (managerName) reportsToMap.set(subordinateId, managerName);
    }
  }

  const STALE_MS = 3 * 60 * 1000;
  const nowMs = Date.now();
  const firstStartMap = new Map(sessionAgg.map((r) => [r._id.toString(), r.firstStart as Date]));
  const lastEndMap = new Map(sessionAgg.map((r) => [r._id.toString(), r.lastEnd as Date]));

  const activeMap = new Map(activeSessions.map((s) => [s.user.toString(), s]));
  const dailyMap = new Map(dailyRecords.map((r) => [r.user.toString(), r]));

  const scheduleMap = new Map(employees.map((emp) => {
    const s = resolveWeeklySchedule(emp as unknown as Record<string, unknown>);
    const day = s[todayDayKey];
    return [emp._id.toString(), day] as const;
  }));

  const presence = employees.map((emp) => {
    const id = emp._id.toString();
    const active = activeMap.get(id);
    const daily = dailyMap.get(id);

    let status: string = "absent";
    let todayMinutes = daily?.totalWorkingMinutes ?? 0;
    let isLive = false;

    if (active) {
      status = active.location.inOffice ? "office" : "remote";
      const lastMs = active.lastActivity ? new Date(active.lastActivity).getTime() : 0;
      isLive = (nowMs - lastMs) <= STALE_MS;
      const elapsed = Math.floor((nowMs - active.sessionTime.start.getTime()) / 60000);
      todayMinutes = (daily?.totalWorkingMinutes ?? 0) + elapsed;
    } else if (daily?.isPresent) {
      status = (daily.remoteMinutes ?? 0) > (daily.officeMinutes ?? 0) ? "remote" : "office";
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const e = emp as any;

    const userMemberships = membershipsByUser.get(id) ?? [];
    const primaryMembership = userMemberships[0];
    const desName = primaryMembership?.designation?.name ?? "";
    const deptObj = primaryMembership?.department as { _id?: unknown; title?: string; parentDepartment?: { title?: string } } | undefined;
    const deptTitle = deptObj?.title ?? "";
    const deptId = deptObj?._id?.toString() ?? null;
    const parentDeptTitle = deptObj?.parentDepartment?.title ?? "";

    return {
      _id: id,
      username: e.username ?? "",
      firstName: emp.about.firstName,
      lastName: emp.about.lastName,
      email: e.email ?? "",
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
      lastExit: (active?.lastActivity ? new Date(active.lastActivity).toISOString() : null)
        ?? (daily?.lastSessionEnd ? new Date(daily.lastSessionEnd as unknown as string).toISOString() : null)
        ?? (lastEndMap.get(id) ? new Date(lastEndMap.get(id)!).toISOString() : null)
        ?? (daily?.lastOfficeExit ? new Date(daily.lastOfficeExit as unknown as string).toISOString() : null),
      shiftStart: scheduleMap.get(id)?.start ?? "10:00",
      shiftEnd: scheduleMap.get(id)?.end ?? "19:00",
      shiftBreakTime: scheduleMap.get(id)?.breakMinutes ?? 60,
      isLive,
      locationFlagged: active?.location?.locationFlagged ?? false,
      flagReason: active?.location?.flagReason ?? null,
      flagCoords: active?.location?.latitude != null && active?.location?.longitude != null
        ? { lat: active.location.latitude, lng: active.location.longitude }
        : null,
      isActive: true,
      designation: desName,
      department: deptTitle,
      departmentId: deptId,
      parentDepartment: parentDeptTitle,
      reportsTo: reportsToMap.get(id) ?? null,
    };
  });

  return ok(presence);
}
