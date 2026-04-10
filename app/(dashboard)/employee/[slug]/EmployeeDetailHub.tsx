"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@/lib/useQuery";
import { staggerContainerFast, cardVariants, ease } from "@/lib/motion";
import {
  ALL_WEEKDAYS,
  WEEKDAY_LABELS,
  getTodaySchedule,
  resolveWeeklySchedule,
  type WeeklySchedule,
} from "@/lib/schedule";

type TabId = "overview" | "attendance" | "profile" | "activity" | "leaves" | "payroll";

interface EmployeeDoc {
  _id: string;
  email: string;
  username: string;
  isSuperAdmin?: boolean;
  about?: { firstName?: string; lastName?: string; phone?: string; profileImage?: string };
  department?: { _id?: string; title?: string } | null;
  weeklySchedule?: WeeklySchedule;
  shiftType?: string;
  graceMinutes?: number;
  isActive?: boolean;
  createdAt?: string;
}

interface SessionApi {
  activeSession?: {
    status?: string;
    sessionTime?: { start?: string };
    location?: { inOffice?: boolean };
  } | null;
  todayMinutes?: number;
  isStale?: boolean;
  locationFlagged?: boolean;
  flagReason?: string | null;
}

interface MembershipRow {
  _id: string;
  isActive?: boolean;
  department?: { title?: string };
  designation?: { name?: string; color?: string };
}

interface DailyRow {
  date: string;
  isPresent?: boolean;
  isOnTime?: boolean;
  lateBy?: number;
  totalWorkingMinutes?: number;
}

interface MonthlyStats {
  presentDays?: number;
  totalWorkingDays?: number;
  onTimePercentage?: number;
  totalWorkingHours?: number;
  averageDailyHours?: number;
  totalOfficeHours?: number;
  totalRemoteHours?: number;
}

interface TaskRow {
  _id: string;
  title: string;
  priority: string;
  status: string;
  deadline?: string;
  createdAt?: string;
  assignedTo?: { _id?: string } | string;
}

interface ActivityLogRow {
  _id: string;
  userEmail: string;
  userName: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  targetUserIds?: string[];
  createdAt: string;
}

interface CampaignRow {
  _id: string;
  name?: string;
  status?: string;
  isActive?: boolean;
  tags?: {
    employees?: ({ _id?: string } | string)[];
  };
}

const SHIFT_LABELS: Record<string, string> = {
  fullTime: "Full Time",
  partTime: "Part Time",
  contract: "Contract",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "var(--primary)",
  medium: "var(--amber)",
  high: "var(--rose)",
  urgent: "#ef4444",
};

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "attendance", label: "Attendance" },
  { id: "profile", label: "Profile" },
  { id: "activity", label: "Activity" },
  { id: "leaves", label: "Leaves" },
  { id: "payroll", label: "Payroll" },
];

const TZ = "Asia/Karachi";

function todayStrKarachi() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function empId(employee: EmployeeDoc) {
  return String(employee._id);
}

function assigneeId(t: TaskRow): string | undefined {
  if (typeof t.assignedTo === "object" && t.assignedTo?._id) return String(t.assignedTo._id);
  if (typeof t.assignedTo === "string") return t.assignedTo;
  return undefined;
}

function recordDateKey(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

function primaryDesignation(memberships: MembershipRow[] | null, isSuperAdmin?: boolean): string {
  if (isSuperAdmin) return "System Administrator";
  if (memberships?.length) {
    const withDes = memberships.find((m) => m.designation?.name);
    if (withDes?.designation?.name) return withDes.designation.name;
  }
  return "Employee";
}

function calendarCells(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const cells: { day: number | null }[] = [];
  for (let i = 0; i < startPad; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push({ day: null });
  return cells;
}

export default function EmployeeDetailHub({
  routeSlug,
  employee,
}: {
  routeSlug: string;
  employee: EmployeeDoc;
}) {
  const { data: session } = useSession();
  const id = empId(employee);
  const isOwnProfile = session?.user?.id === id;
  const { can: canPerm, isSuperAdmin: viewerIsSuperAdmin } = usePermissions();
  const targetIsSuperAdmin = employee.isSuperAdmin === true;
  const canEditProfile = isOwnProfile || (canPerm("employees_edit") && (!targetIsSuperAdmin || viewerIsSuperAdmin));
  const firstName = employee.about?.firstName ?? "Employee";
  const lastName = employee.about?.lastName ?? "";
  const displaySlug = employee.username || id.slice(-6);

  const [tab, setTab] = useState<TabId>("overview");
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);

  const canViewOther = isOwnProfile || canPerm("employees_view");
  const sessionUrl = canViewOther ? `/api/attendance/session?userId=${encodeURIComponent(id)}` : null;
  const membershipsUrl = canViewOther ? `/api/memberships?userId=${encodeURIComponent(id)}` : null;
  const canViewAttendance = isOwnProfile || canPerm("attendance_viewTeam");
  const dailyUrl = canViewAttendance ? `/api/attendance?type=daily&year=${calYear}&month=${calMonth}&userId=${encodeURIComponent(id)}` : null;
  const monthlyUrl = canViewAttendance ? `/api/attendance?type=monthly&year=${calYear}&month=${calMonth}&userId=${encodeURIComponent(id)}` : null;
  const tasksUrl = (isOwnProfile || canPerm("tasks_view")) ? "/api/tasks" : null;
  const campaignsUrl = (isOwnProfile || canPerm("campaigns_view")) ? "/api/campaigns" : null;
  const logsUrl = canPerm("activityLogs_view") ? "/api/activity-logs?limit=40" : null;

  const { data: sessionState, loading: sessionLoading } = useQuery<SessionApi>(sessionUrl);
  const { data: memberships, loading: memLoading } = useQuery<MembershipRow[]>(membershipsUrl);
  const { data: dailyRaw, loading: dailyLoading } = useQuery<DailyRow[]>(dailyUrl, undefined, {
    enabled: tab === "attendance",
  });
  const { data: monthlyRaw, loading: monthlyLoading } = useQuery<MonthlyStats | null>(monthlyUrl, undefined, {
    enabled: tab === "attendance",
  });
  const { data: tasksRaw, loading: tasksLoading } = useQuery<TaskRow[]>(tasksUrl, undefined, {
    enabled: !!tasksUrl && (tab === "overview" || tab === "activity"),
  });
  const { data: campaignsRaw, loading: campLoading } = useQuery<CampaignRow[]>(campaignsUrl, undefined, {
    enabled: !!campaignsUrl && tab === "overview",
  });
  const { data: logsPayload, loading: logsLoading } = useQuery<{ logs: ActivityLogRow[] }>(logsUrl, undefined, {
    enabled: !!logsUrl && tab === "activity",
  });

  const designation = useMemo(() => primaryDesignation(memberships ?? null, employee.isSuperAdmin), [memberships, employee.isSuperAdmin]);

  const dailyList = Array.isArray(dailyRaw) ? dailyRaw : [];
  const dailyByKey = useMemo(() => {
    const m = new Map<string, DailyRow>();
    for (const r of dailyList) {
      m.set(recordDateKey(r.date), r);
    }
    return m;
  }, [dailyList]);

  const empTasks = useMemo(() => {
    const list = Array.isArray(tasksRaw) ? tasksRaw : [];
    return list.filter((t) => assigneeId(t) === id);
  }, [tasksRaw, id]);

  const activeTasksCount = useMemo(
    () => empTasks.filter((t) => t.status === "pending" || t.status === "inProgress").length,
    [empTasks],
  );

  const campaignCount = useMemo(() => {
    const list = Array.isArray(campaignsRaw) ? campaignsRaw : [];
    return list.filter((c) => {
      const emps = c.tags?.employees ?? [];
      return emps.some((e) => String(typeof e === "object" && e && "_id" in e ? e._id : e) === id);
    }).length;
  }, [campaignsRaw, id]);

  const filteredLogs = useMemo(() => {
    const logs = logsPayload?.logs ?? [];
    return logs.filter((log) => {
      if (log.userEmail === employee.email) return true;
      if (log.entity === "employee" && log.entityId === id) return true;
      if (Array.isArray(log.targetUserIds) && log.targetUserIds.includes(id)) return true;
      return false;
    });
  }, [logsPayload, employee.email, id]);

  const todayMinutes = sessionState?.todayMinutes ?? 0;
  const hasActive = !!sessionState?.activeSession && sessionState.activeSession.status === "active";
  const inOffice = sessionState?.activeSession?.location?.inOffice ?? false;
  const isViewerSelf = session?.user?.id === id;

  const statusLabel = !employee.isActive
    ? "Inactive"
    : hasActive
      ? "Active session"
      : todayMinutes > 0
        ? "Checked in"
        : "Off shift";
  const statusColor =
    !employee.isActive ? "var(--fg-tertiary)" : hasActive ? "var(--green)" : todayMinutes > 0 ? "var(--primary)" : "var(--fg-secondary)";

  const empRec = employee as unknown as Record<string, unknown>;
  const weeklyResolved = resolveWeeklySchedule(empRec);
  const todaySchedule = getTodaySchedule(empRec, TZ);
  const shiftTypeKey = employee.shiftType ?? "";

  const cells = calendarCells(calYear, calMonth);
  const monthLabel = new Date(calYear, calMonth - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const ms = monthlyRaw;
  const monthlyOfficePct =
    ms && (ms.totalOfficeHours ?? 0) + (ms.totalRemoteHours ?? 0) > 0
      ? ((ms.totalOfficeHours ?? 0) / ((ms.totalOfficeHours ?? 0) + (ms.totalRemoteHours ?? 0))) * 100
      : 0;

  return (
    <div className="relative min-h-full w-full overflow-x-hidden animate-reveal">
      <motion.div
        className="relative z-10 mx-auto max-w-5xl space-y-6 pb-10"
        variants={staggerContainerFast}
        initial="hidden"
        animate="visible"
      >
        <motion.header variants={cardVariants} custom={0} className="card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
              {employee.about?.profileImage ? (
                <img
                  src={employee.about.profileImage}
                  alt=""
                  className="mx-auto h-20 w-20 shrink-0 rounded-full object-cover shadow-lg sm:mx-0 sm:h-24 sm:w-24"
                />
              ) : (
                <div
                  className="mx-auto flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-xl font-semibold text-white shadow-lg sm:mx-0 sm:h-24 sm:w-24 sm:text-2xl"
                  style={{ background: "linear-gradient(135deg, var(--primary), var(--cyan))" }}
                >
                  {initials(firstName, lastName)}
                </div>
              )}
              <div className="min-w-0 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center gap-2 text-caption sm:justify-start">
                  <Link href="/employees" className="font-semibold hover:underline" style={{ color: "var(--primary)" }}>
                    Employees
                  </Link>
                  <span style={{ color: "var(--fg-tertiary)" }}>/</span>
                  <span style={{ color: "var(--fg-secondary)" }}>@{displaySlug}</span>
                  {isViewerSelf && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>
                      You
                    </span>
                  )}
                </div>
                <h1 className="mt-1 text-title" style={{ color: "var(--fg)" }}>
                  {firstName} {lastName}
                </h1>
                <p className="text-callout mt-0.5" style={{ color: "var(--fg-secondary)" }}>
                  {designation}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <span
                    className="badge inline-flex items-center gap-1.5"
                    style={{
                      background: `color-mix(in srgb, ${statusColor} 9%, transparent)`,
                      color: statusColor,
                      border: `1px solid color-mix(in srgb, ${statusColor} 35%, transparent)`,
                    }}
                  >
                    {hasActive && (
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ background: statusColor }} />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} />
                      </span>
                    )}
                    {statusLabel}
                  </span>
                  {employee.department?.title && (
                    <span className="badge" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>
                      {employee.department.title}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {canEditProfile && (
            <Link href={`/employee/${routeSlug}/edit`} className="shrink-0 self-center sm:self-start">
              <motion.button
                type="button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="btn btn-sm"
                style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}
              >
                Edit profile
              </motion.button>
            </Link>
            )}
          </div>
        </motion.header>

        <motion.nav
          variants={cardVariants}
          custom={1}
          className="flex flex-wrap gap-2 border-b pb-3"
          style={{ borderColor: "var(--border)" }}
          aria-label="Employee sections"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors"
                style={{
                  background: active ? "var(--primary)" : "var(--bg-grouped)",
                  color: active ? "#fff" : "var(--fg-secondary)",
                  boxShadow: active ? "var(--shadow-sm)" : "none",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </motion.nav>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease }}
          >
            {tab === "overview" && (
              <motion.div variants={staggerContainerFast} initial="hidden" animate="visible" className="space-y-4">
                <motion.section variants={cardVariants} custom={0} className="card-static p-5 sm:p-6">
                  <h2 className="text-section-header mb-4">Today&apos;s attendance</h2>
                  {sessionLoading ? (
                    <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>
                      Loading session…
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="card-static rounded-xl p-4">
                        <p className="text-caption">Minutes logged</p>
                        <p className="text-title mt-1 tabular-nums" style={{ color: "var(--fg)" }}>
                          {formatMinutes(todayMinutes)}
                        </p>
                      </div>
                      <div className="card-static rounded-xl p-4">
                        <p className="text-caption">Session</p>
                        <p className="text-callout mt-1 font-semibold" style={{ color: "var(--fg)" }}>
                          {hasActive ? (inOffice ? "In office" : "Remote") : "No active session"}
                        </p>
                        {sessionState?.isStale && hasActive && (
                          <p className="text-caption mt-1" style={{ color: "var(--amber)" }}>
                            Stale heartbeat — may need refresh
                          </p>
                        )}
                      </div>
                      <div className="card-static rounded-xl p-4">
                        <p className="text-caption">Location</p>
                        <p className="text-callout mt-1 font-semibold" style={{ color: "var(--fg)" }}>
                          {sessionState?.locationFlagged ? "Flagged" : "OK"}
                        </p>
                        {sessionState?.flagReason && (
                          <p className="text-caption mt-1 line-clamp-2" style={{ color: "var(--rose)" }}>
                            {sessionState.flagReason}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </motion.section>

                <motion.section variants={cardVariants} custom={1} className="card-static p-5 sm:p-6">
                  <h2 className="text-section-header mb-4">Workload</h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="card-static rounded-xl p-4">
                      <p className="text-caption">Active tasks</p>
                      <p className="text-title mt-1 tabular-nums" style={{ color: "var(--fg)" }}>
                        {tasksLoading ? "…" : activeTasksCount}
                      </p>
                      <p className="text-caption mt-1" style={{ color: "var(--fg-tertiary)" }}>
                        Pending + in progress assigned to this employee
                      </p>
                    </div>
                    <div className="card-static rounded-xl p-4">
                      <p className="text-caption">Campaign involvement</p>
                      <p className="text-title mt-1 tabular-nums" style={{ color: "var(--fg)" }}>
                        {campLoading ? "…" : campaignCount}
                      </p>
                      <p className="text-caption mt-1" style={{ color: "var(--fg-tertiary)" }}>
                        Campaigns tagging this employee
                      </p>
                    </div>
                  </div>
                </motion.section>

                <motion.section variants={cardVariants} custom={2} className="card-static p-5 sm:p-6">
                  <h2 className="text-section-header mb-4">Memberships</h2>
                  {memLoading ? (
                    <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>
                      Loading…
                    </p>
                  ) : !memberships?.length ? (
                    <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>
                      No membership records yet.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {memberships.map((m) => (
                        <li
                          key={m._id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <div>
                            <p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>
                              {m.department?.title ?? "Department"}
                            </p>
                            <p className="text-caption mt-0.5" style={{ color: "var(--fg-secondary)" }}>
                              {m.designation?.name ?? "—"}
                            </p>
                          </div>
                          {m.isActive === false && (
                            <span className="badge text-[10px]" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
                              Inactive
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.section>
              </motion.div>
            )}

            {tab === "attendance" && (
              <div className="space-y-4">
                <section className="card-static p-5 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-section-header">{monthLabel}</h2>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ background: "var(--bg-grouped)", color: "var(--fg)" }}
                        onClick={() => {
                          if (calMonth === 1) {
                            setCalMonth(12);
                            setCalYear((y) => y - 1);
                          } else setCalMonth((m) => m - 1);
                        }}
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ background: "var(--bg-grouped)", color: "var(--fg)" }}
                        onClick={() => {
                          if (calMonth === 12) {
                            setCalMonth(1);
                            setCalYear((y) => y + 1);
                          } else setCalMonth((m) => m + 1);
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                  {dailyLoading ? (
                    <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>
                      Loading calendar…
                    </p>
                  ) : (
                    <>
                      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-tertiary)" }}>
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                          <div key={d}>{d}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {cells.map((c, idx) => {
                          if (c.day === null) {
                            return <div key={`e-${idx}`} className="aspect-square rounded-lg" style={{ background: "transparent" }} />;
                          }
                          const key = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
                          const rec = dailyByKey.get(key);
                          const dot =
                            !rec || !rec.isPresent ? "#f43f5e" : !rec.isOnTime || (rec.lateBy ?? 0) > 0 ? "var(--amber)" : "var(--green)";
                          const isToday = key === todayStrKarachi();
                          return (
                            <div
                              key={key}
                              className="flex aspect-square flex-col items-center justify-center rounded-xl border text-xs font-medium tabular-nums"
                              style={{
                                borderColor: isToday ? "var(--primary)" : "var(--border)",
                                background: "var(--bg-grouped)",
                                color: "var(--fg)",
                                boxShadow: isToday ? "0 0 0 1px color-mix(in srgb, var(--primary) 40%, transparent)" : undefined,
                              }}
                            >
                              <span>{c.day}</span>
                              <span className="mt-1 h-2 w-2 rounded-full" style={{ backgroundColor: dot }} title={rec ? "Recorded" : "No record"} />
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </section>

                <section className="card-static p-5 sm:p-6">
                  <h2 className="text-section-header mb-4">Monthly stats</h2>
                  {monthlyLoading ? (
                    <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>
                      Loading stats…
                    </p>
                  ) : !ms ? (
                    <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>
                      No aggregated stats for this month yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <div className="card-static rounded-xl p-4">
                        <p className="text-caption">Present / working days</p>
                        <p className="text-title mt-1" style={{ color: "var(--fg)" }}>
                          {ms.presentDays ?? 0}
                          <span style={{ color: "var(--fg-tertiary)" }}> / </span>
                          {ms.totalWorkingDays ?? 0}
                        </p>
                      </div>
                      <div className="card-static rounded-xl p-4">
                        <p className="text-caption">On-time</p>
                        <p className="text-title mt-1" style={{ color: "var(--primary)" }}>
                          {ms.onTimePercentage ?? 0}%
                        </p>
                      </div>
                      <div className="card-static rounded-xl p-4">
                        <p className="text-caption">Avg. daily hours</p>
                        <p className="text-title mt-1" style={{ color: "var(--fg)" }}>
                          {ms.averageDailyHours ?? 0}h
                        </p>
                      </div>
                      <div className="card-static rounded-xl p-4">
                        <p className="text-caption">Total hours</p>
                        <p className="text-title mt-1" style={{ color: "var(--fg)" }}>
                          {ms.totalWorkingHours ?? 0}h
                        </p>
                      </div>
                    </div>
                  )}
                  {ms && (
                    <div className="mt-6 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-caption" style={{ color: "var(--fg-secondary)" }}>
                          Office vs remote
                        </span>
                        <span className="text-caption tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                          {ms.totalOfficeHours ?? 0}h · {ms.totalRemoteHours ?? 0}h
                        </span>
                      </div>
                      <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                        <motion.div
                          className="h-full"
                          style={{ background: "var(--teal)" }}
                          initial={{ width: 0 }}
                          animate={{ width: `${monthlyOfficePct}%` }}
                          transition={{ duration: 0.6, ease }}
                        />
                        <motion.div
                          className="h-full"
                          style={{ background: "var(--primary)" }}
                          initial={{ width: 0 }}
                          animate={{ width: `${100 - monthlyOfficePct}%` }}
                          transition={{ duration: 0.6, delay: 0.05, ease }}
                        />
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}

            {tab === "profile" && (
              <section className="card-static space-y-6 p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-section-header">Profile</h2>
                  {canEditProfile && <Link href={`/employee/${routeSlug}/edit`}>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className="btn btn-sm"
                      style={{ background: "var(--primary)", color: "#fff" }}
                    >
                      Edit
                    </motion.button>
                  </Link>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                    <h3 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                      Personal
                    </h3>
                    <dl className="space-y-2 text-[13px]">
                      <div className="flex justify-between gap-2">
                        <dt style={{ color: "var(--fg-tertiary)" }}>Name</dt>
                        <dd className="font-medium text-right" style={{ color: "var(--fg)" }}>
                          {firstName} {lastName}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt style={{ color: "var(--fg-tertiary)" }}>Email</dt>
                        <dd className="truncate font-medium text-right" style={{ color: "var(--fg)" }}>
                          {employee.email}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt style={{ color: "var(--fg-tertiary)" }}>Phone</dt>
                        <dd className="font-medium text-right" style={{ color: "var(--fg)" }}>
                          {employee.about?.phone || "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt style={{ color: "var(--fg-tertiary)" }}>Username</dt>
                        <dd className="font-medium text-right" style={{ color: "var(--fg)" }}>
                          @{employee.username}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                    <h3 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                      Organization
                    </h3>
                    <dl className="space-y-2 text-[13px]">
                      <div className="flex justify-between gap-2">
                        <dt style={{ color: "var(--fg-tertiary)" }}>Department</dt>
                        <dd className="font-medium text-right" style={{ color: "var(--fg)" }}>
                          {employee.department?.title ?? "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt style={{ color: "var(--fg-tertiary)" }}>Role</dt>
                        <dd className="font-medium text-right" style={{ color: "var(--fg)" }}>
                          {designation}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                    Shift
                  </h3>
                  <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
                    <div className="flex justify-between gap-2 sm:block">
                      <dt style={{ color: "var(--fg-tertiary)" }}>Today</dt>
                      <dd className="font-medium sm:mt-1" style={{ color: "var(--fg)" }}>
                        {todaySchedule.isWorking
                          ? `${todaySchedule.start} – ${todaySchedule.end}`
                          : "Off"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2 sm:block">
                      <dt style={{ color: "var(--fg-tertiary)" }}>Break</dt>
                      <dd className="font-medium sm:mt-1" style={{ color: "var(--fg)" }}>
                        {todaySchedule.isWorking ? `${todaySchedule.breakMinutes} min` : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2 sm:block">
                      <dt style={{ color: "var(--fg-tertiary)" }}>Type</dt>
                      <dd className="font-medium sm:mt-1" style={{ color: "var(--fg)" }}>
                        {(SHIFT_LABELS[shiftTypeKey] ?? shiftTypeKey) || "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2 sm:block sm:col-span-2">
                      <dt style={{ color: "var(--fg-tertiary)" }}>Working days</dt>
                      <dd className="font-medium sm:mt-1" style={{ color: "var(--fg)" }}>
                        {ALL_WEEKDAYS.filter((d) => weeklyResolved[d].isWorking)
                          .map((d) => WEEKDAY_LABELS[d])
                          .join(", ") || "—"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4 space-y-1.5 border-t pt-3 text-[12px]" style={{ borderColor: "var(--border)" }}>
                    <p
                      className="text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: "var(--fg-tertiary)" }}
                    >
                      Weekly schedule
                    </p>
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {ALL_WEEKDAYS.map((d) => {
                        const day = weeklyResolved[d];
                        return (
                          <li key={d} className="flex justify-between gap-2 tabular-nums">
                            <span style={{ color: "var(--fg-tertiary)" }}>{WEEKDAY_LABELS[d]}</span>
                            <span className="font-medium" style={{ color: "var(--fg)" }}>
                              {day.isWorking
                                ? `${day.start}–${day.end} · ${day.breakMinutes}m break`
                                : "Off"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </section>
            )}

            {tab === "activity" && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <section className="card-static p-5 sm:p-6">
                  <h2 className="text-section-header mb-4">Recent activity</h2>
                  {logsLoading ? (
                    <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>
                      Loading…
                    </p>
                  ) : filteredLogs.length === 0 ? (
                    <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>
                      No log entries matched this employee in your visible feed.
                    </p>
                  ) : (
                    <ul className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                      {filteredLogs.map((log) => (
                        <li
                          key={log._id}
                          className="rounded-xl border px-3 py-2.5 text-[13px]"
                          style={{ borderColor: "var(--border)", background: "var(--bg-grouped)" }}
                        >
                          <p className="font-medium" style={{ color: "var(--fg)" }}>
                            {log.action}
                          </p>
                          <p className="text-caption mt-0.5" style={{ color: "var(--fg-tertiary)" }}>
                            {log.entity}
                            {log.details ? ` · ${log.details.slice(0, 80)}${log.details.length > 80 ? "…" : ""}` : ""}
                          </p>
                          <p className="text-caption mt-1 tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                            {new Date(log.createdAt).toLocaleString()}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className="card p-4 sm:p-5">
                  <h2 className="text-headline mb-3" style={{ color: "var(--fg)" }}>
                    Tasks
                  </h2>
                  {tasksLoading ? (
                    <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>
                      Loading…
                    </p>
                  ) : empTasks.length === 0 ? (
                    <p className="text-caption py-4 text-center" style={{ color: "var(--fg-tertiary)" }}>
                      No tasks assigned
                    </p>
                  ) : (
                    <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
                      {empTasks.map((task, ti) => {
                        const pc = PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)";
                        const statusColor2 =
                          task.status === "inProgress" ? "var(--primary)" : task.status === "completed" ? "var(--green)" : "var(--amber)";
                        const statusLbl =
                          task.status === "inProgress" ? "In Progress" : task.status === "completed" ? "Done" : "Pending";
                        return (
                          <motion.li
                            key={task._id}
                            initial={{ y: 8, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: ti * 0.04, ease }}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                            style={{ background: "var(--bg-grouped)" }}
                          >
                            <div
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                              style={{ background: `color-mix(in srgb, ${pc} 15%, transparent)` }}
                            >
                              <span className="h-2 w-2 rounded-full" style={{ background: pc }} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-callout font-semibold truncate" style={{ color: "var(--fg)" }}>
                                {task.title}
                              </p>
                              <div className="mt-0.5 flex flex-wrap gap-2 text-caption">
                                <span
                                  className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                  style={{
                                    background: `color-mix(in srgb, ${statusColor2} 12%, transparent)`,
                                    color: statusColor2,
                                  }}
                                >
                                  {statusLbl}
                                </span>
                                {task.deadline && (
                                  <span className="tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                                    Due {new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </motion.li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>
            )}

            {tab === "leaves" && (
              <section
                className="card-static flex min-h-[200px] flex-col items-center justify-center p-10 text-center"
                style={{ color: "var(--fg-secondary)" }}
              >
                <p className="text-headline font-semibold" style={{ color: "var(--fg)" }}>
                  Coming soon
                </p>
                <p className="text-caption mt-2 max-w-sm">Leave balances, requests, and approvals will appear here.</p>
              </section>
            )}

            {tab === "payroll" && (
              <section
                className="card-static flex min-h-[200px] flex-col items-center justify-center p-10 text-center"
                style={{ color: "var(--fg-secondary)" }}
              >
                <p className="text-headline font-semibold" style={{ color: "var(--fg)" }}>
                  Coming soon
                </p>
                <p className="text-caption mt-2 max-w-sm">Payroll summaries and exports will be available in a future release.</p>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
