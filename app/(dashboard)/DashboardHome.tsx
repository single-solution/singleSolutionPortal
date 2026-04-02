"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useEventStream } from "@/lib/useEventStream";
import Link from "next/link";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
} from "framer-motion";
import {
  cardHover,
  cardVariants,
  slideFromLeft,
  slideFromRight,
  slideUpItem,
  staggerContainer,
  staggerContainerFast,
  fadeInItem,
} from "@/lib/motion";
import type { UserRole } from "@/lib/models/User";

/* ──────────────────────── TYPES ──────────────────────── */

interface User {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  username: string;
}

interface ApiEmployee {
  _id: string;
  email: string;
  username: string;
  about: { firstName: string; lastName: string };
  userRole: string;
  isActive: boolean;
  department?: { _id: string; title: string; slug?: string };
  teams?: { _id: string; name: string }[];
  workShift?: {
    type: string;
    shift: { start: string; end: string };
    workingDays: string[];
    breakTime: number;
  };
}

interface ApiTeam {
  _id: string;
  name: string;
  department?: { _id: string; title: string };
  lead?: { _id: string; about: { firstName: string; lastName: string }; email: string; userRole: string };
  memberCount: number;
  description?: string;
}

interface ApiTask {
  _id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  deadline?: string;
  assignedTo?: { _id?: string; about?: { firstName: string; lastName: string }; email?: string };
}

interface ApiDepartment {
  _id: string;
  title: string;
  slug?: string;
  employeeCount: number;
}


interface PersonalAttendance {
  todayMinutes: number;
  todaySessions: number;
  officeMinutes: number;
  remoteMinutes: number;
  isOnTime: boolean;
  lateBy: number;
  firstEntry: string | null;
  monthlyAvgHours: number;
  monthlyOnTimePct: number;
  avgInTime: string;
  avgOutTime: string;
}

type PresenceStatus = "office" | "remote" | "late" | "overtime" | "absent";

interface PresenceEmployee {
  _id: string;
  firstName: string;
  lastName: string;
  designation: string;
  department: string;
  status: PresenceStatus;
  todayMinutes: number;
  lateBy: number;
  isActive: boolean;
  teamIds?: string[];
}

interface ApiCampaign {
  _id: string;
  name: string;
  status: "active" | "paused" | "completed" | "cancelled";
  startDate?: string;
  endDate?: string;
  tags: {
    employees: { _id: string; about: { firstName: string; lastName: string } }[];
    departments: { _id: string; title: string }[];
    teams: { _id: string; name: string }[];
  };
}

interface TrendDay {
  date: string;
  label: string;
  count: number;
}

interface WeeklyDay {
  date: string;
  totalMinutes: number;
  officeMinutes: number;
  remoteMinutes: number;
  isPresent: boolean;
  isOnTime: boolean;
  lateBy: number;
}

interface FullMonthlyStats {
  presentDays: number;
  totalWorkingDays: number;
  totalWorkingHours: number;
  onTimePercentage: number;
  averageDailyHours: number;
  totalOfficeHours: number;
  totalRemoteHours: number;
}

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  profileImage?: string;
  department?: string;
  designation: string;
  workShift?: { type: string; start: string; end: string; breakTime: number };
}

/* ──────────────────────── CONSTANTS ──────────────────────── */

const STATUS_COLORS: Record<PresenceStatus, string> = {
  office: "#10b981",
  remote: "#007aff",
  late: "#f59e0b",
  overtime: "#8b5cf6",
  absent: "#f43f5e",
};

const STATUS_LABELS: Record<PresenceStatus, string> = {
  office: "In Office",
  remote: "Remote",
  late: "Late",
  overtime: "Overtime",
  absent: "Absent",
};

const ROLE_DESIGNATION: Record<string, string> = {
  superadmin: "System Administrator",
  manager: "Team Manager",
  teamLead: "Team Lead",
  businessDeveloper: "Business Developer",
  developer: "Software Developer",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "var(--primary)",
  medium: "var(--amber)",
  high: "var(--rose)",
  urgent: "#ef4444",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const STATUS_ORDER: PresenceStatus[] = ["office", "remote", "late", "overtime", "absent"];

/* ──────────────────────── HELPERS ──────────────────────── */

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase() || "?";
}

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatClock(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatClockDate(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function getStatusCounts(emps: PresenceEmployee[]) {
  const counts: Record<PresenceStatus, number> & { total: number } = {
    office: 0, remote: 0, late: 0, overtime: 0, absent: 0, total: emps.length,
  };
  for (const e of emps) counts[e.status]++;
  return counts;
}


/* ──────────────────────── SHARED COMPONENTS ──────────────────────── */

function LivePulse() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ background: "#ECFDF5" }}>
      <span className="relative inline-flex h-2 w-2 rounded-full live-dot" style={{ background: "#10b981" }} />
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#10b981" }}>Live</span>
    </span>
  );
}

function AnimatedNumber({ value, prefix = "" }: { value: number; prefix?: string }) {
  const mountedRef = useRef(false);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      const duration = 600;
      const start = Date.now();
      const step = () => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(value * eased);
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    } else {
      setDisplay(value);
    }
  }, [value]);
  return <>{prefix}{Math.round(display)}</>;
}


/* ──────────────────────── SUPERADMIN OVERVIEW ──────────────────────── */

function SuperAdminOverview({
  user,
  presenceEmps,
  presenceLoading,
  tasks,
  departments,
  employees,
}: {
  user: User;
  presenceEmps: PresenceEmployee[];
  presenceLoading: boolean;
  tasks: ApiTask[];
  departments: ApiDepartment[];
  employees: ApiEmployee[];
}) {
  const counts = useMemo(() => getStatusCounts(presenceEmps), [presenceEmps]);
  const totalEmp = counts.total;
  const inOffice = counts.office;
  const lateToday = counts.late;
  const absentToday = counts.absent;

  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);
  const totalDeptEmployees = useMemo(() => departments.reduce((s, d) => s + d.employeeCount, 0), [departments]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const timeKey = `${now.getHours()}-${now.getMinutes()}`;

  return (
    <div className="flex flex-col gap-4">
      <motion.div className="flex items-center justify-between gap-3 mb-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--fg)" }}>{getGreeting()}, {user.firstName}</h1>
          <p key={timeKey} className="text-[12px]" style={{ color: "var(--fg-secondary)" }}>{pendingTasks.length} tasks pending · {formatClockDate(now)}, {formatClock(now)}</p>
        </div>
        <LivePulse />
      </motion.div>

      <div className="card-static flex items-center divide-x divide-[var(--border)] overflow-hidden">
        {[
          { label: "Total", value: totalEmp, color: "var(--fg)" },
          { label: "Office", value: inOffice, color: "#10b981" },
          { label: "Remote", value: counts.remote, color: "#007aff" },
          { label: "Late", value: lateToday, color: "#f59e0b" },
          { label: "Overtime", value: counts.overtime, color: "#8b5cf6" },
          { label: "Absent", value: absentToday, color: "#f43f5e" },
        ].map((s) => (
          <div key={s.label} className="flex-1 px-3 py-2 text-center">
            <p className="text-[20px] font-bold tabular-nums" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] font-medium" style={{ color: "var(--fg-secondary)" }}>{s.label}</p>
          </div>
        ))}
      </div>

      <motion.section className="card-static overflow-hidden" variants={slideUpItem} initial="hidden" animate="visible">
        <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <span className="relative inline-flex h-2 w-2 rounded-full live-dot" style={{ background: "var(--teal)" }} />
            <h2 className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>Live Presence</h2>
            <span className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{presenceEmps.length} employees</span>
          </div>
        </div>
        {presenceLoading ? (
          <div className="p-3 space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="shimmer h-8 rounded" />)}</div>
        ) : presenceEmps.length === 0 ? (
          <p className="text-[11px] py-6 text-center" style={{ color: "var(--fg-tertiary)" }}>No employees found</p>
        ) : (
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="px-3 py-2 text-[10px] font-medium uppercase" style={{ color: "var(--fg-tertiary)" }}>Name</th>
                  <th className="px-3 py-2 text-[10px] font-medium uppercase hidden sm:table-cell" style={{ color: "var(--fg-tertiary)" }}>Department</th>
                  <th className="px-3 py-2 text-[10px] font-medium uppercase" style={{ color: "var(--fg-tertiary)" }}>Status</th>
                  <th className="px-3 py-2 text-[10px] font-medium uppercase text-right" style={{ color: "var(--fg-tertiary)" }}>Hours</th>
                  <th className="px-3 py-2 text-[10px] font-medium uppercase text-right hidden md:table-cell" style={{ color: "var(--fg-tertiary)" }}>Late by</th>
                </tr>
              </thead>
              <tbody>
                {presenceEmps.map((emp) => (
                  <tr key={emp._id} className="border-b hover:bg-[var(--hover-bg)] transition-colors" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2">
                      <span className="font-medium" style={{ color: "var(--fg)" }}>{emp.firstName} {emp.lastName}</span>
                      <span className="text-[10px] ml-1 hidden lg:inline" style={{ color: "var(--fg-tertiary)" }}>{emp.designation}</span>
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell" style={{ color: "var(--fg-secondary)" }}>{emp.department}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: `color-mix(in srgb, ${STATUS_COLORS[emp.status]} 15%, transparent)`, color: STATUS_COLORS[emp.status] }}>{STATUS_LABELS[emp.status]}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: "var(--fg)" }}>{formatMinutes(emp.todayMinutes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums hidden md:table-cell" style={{ color: emp.lateBy > 0 ? "var(--amber)" : "var(--fg-tertiary)" }}>{emp.lateBy > 0 ? `+${formatMinutes(emp.lateBy)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <div className="card-static p-3">
          <h3 className="text-[12px] font-semibold mb-2" style={{ color: "var(--fg)" }}>Attendance</h3>
          <div className="space-y-1.5">
            {STATUS_ORDER.map((status) => {
              const pct = totalEmp > 0 ? Math.round((counts[status] / totalEmp) * 100) : 0;
              return (
                <div key={status} className="flex items-center gap-2 text-[11px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
                  <span className="flex-1" style={{ color: "var(--fg)" }}>{STATUS_LABELS[status]}</span>
                  <span className="tabular-nums font-semibold" style={{ color: "var(--fg)" }}>{counts[status]}</span>
                  <span className="w-8 text-right tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {departments.length > 0 && (
          <div className="card-static p-3">
            <h3 className="text-[12px] font-semibold mb-2" style={{ color: "var(--fg)" }}>Departments</h3>
            <div className="space-y-1.5">
              {departments.map((dept) => (
                <div key={dept._id} className="flex items-center gap-2 text-[11px]">
                  <span className="flex-1 truncate font-medium" style={{ color: "var(--fg)" }}>{dept.title}</span>
                  <span className="tabular-nums" style={{ color: "var(--fg-secondary)" }}>{dept.employeeCount}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card-static p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>Pending Tasks</h3>
            {pendingTasks.length > 0 && (
              <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: "var(--rose)" }}>{pendingTasks.length}</span>
            )}
          </div>
          {pendingTasks.length > 0 ? (
            <div className="space-y-1.5">
              {pendingTasks.slice(0, 6).map((task) => (
                <div key={task._id} className="flex items-start gap-2 text-[11px]">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)" }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" style={{ color: "var(--fg)" }}>{task.title}</p>
                    <p className="text-[10px] truncate" style={{ color: "var(--fg-tertiary)" }}>
                      {task.assignedTo?.about ? `${task.assignedTo.about.firstName} ${task.assignedTo.about.lastName}` : "Unassigned"}
                      {task.deadline ? ` · ${new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                    </p>
                  </div>
                </div>
              ))}
              <Link href="/tasks">
                <span className="text-[11px] font-semibold" style={{ color: "var(--primary)" }}>View all →</span>
              </Link>
            </div>
          ) : (
            <p className="text-[11px] py-3 text-center" style={{ color: "var(--fg-tertiary)" }}>All caught up!</p>
          )}
        </div>
      </div>

    </div>
  );
}



/* ──────────────────────── SELF ASSESSMENT (shared) ──────────────────────── */


/* ──────────────────────── MANAGER / TEAM LEAD OVERVIEW ──────────────────────── */

type PresenceFilter = "all" | "office" | "remote" | "late" | "absent";
const PRESENCE_FILTER_ORDER: PresenceFilter[] = ["all", "office", "remote", "late", "absent"];
const PRESENCE_FILTER_LABELS: Record<PresenceFilter, string> = { all: "All", office: "Office", remote: "Remote", late: "Late", absent: "Absent" };

function matchPresenceFilter(status: PresenceStatus, f: PresenceFilter): boolean {
  if (f === "all") return true;
  if (f === "office") return status === "office" || status === "overtime";
  return status === f;
}

function ManagerOverview({
  user,
  presenceEmps,
  presenceLoading,
  tasks,
  personalAttendance,
  campaigns,
  attendanceTrend,
  teams,
}: {
  user: User;
  presenceEmps: PresenceEmployee[];
  presenceLoading: boolean;
  tasks: ApiTask[];
  personalAttendance: PersonalAttendance | null;
  campaigns: ApiCampaign[];
  attendanceTrend: TrendDay[];
  teams: ApiTeam[];
}) {
  const isManager = user.role === "manager";
  const counts = useMemo(() => getStatusCounts(presenceEmps), [presenceEmps]);
  const totalEmp = counts.total;
  const presentToday = totalEmp - counts.absent;
  const onTimePct = totalEmp > 0 ? Math.round(((totalEmp - counts.late - counts.absent) / totalEmp) * 100) : 0;

  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);
  const inProgressTasks = useMemo(() => tasks.filter((t) => t.status === "inProgress"), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((t) => t.status === "completed"), [tasks]);

  const lateArrivals = useMemo(
    () => presenceEmps.filter((e) => e.status === "late").sort((a, b) => b.lateBy - a.lateBy),
    [presenceEmps],
  );

  const topWorkers = useMemo(
    () => [...presenceEmps].filter((e) => e.todayMinutes > 0).sort((a, b) => b.todayMinutes - a.todayMinutes).slice(0, 5),
    [presenceEmps],
  );

  const officeCount = counts.office + counts.overtime;
  const remoteCount = counts.remote;
  const totalOnline = officeCount + remoteCount;

  const activeCampaigns = useMemo(() => campaigns.filter((c) => c.status === "active"), [campaigns]);

  const trendMax = useMemo(() => Math.max(...attendanceTrend.map((d) => d.count), 1), [attendanceTrend]);

  /* ── Team breakdown: group presence employees by team ── */
  const teamBreakdown = useMemo(() => {
    if (teams.length === 0) return [];
    return teams.map((team) => {
      const members = presenceEmps.filter((e) => e.teamIds?.includes(team._id));
      const present = members.filter((m) => m.status !== "absent").length;
      const late = members.filter((m) => m.status === "late").length;
      const totalMins = members.reduce((s, m) => s + m.todayMinutes, 0);
      return { team, members, present, absent: members.length - present, late, totalMins };
    });
  }, [teams, presenceEmps]);

  const unassignedMembers = useMemo(() => {
    if (teams.length === 0) return [];
    const allTeamIds = new Set(teams.map((t) => t._id));
    return presenceEmps.filter((e) => !e.teamIds || e.teamIds.length === 0 || !e.teamIds.some((id) => allTeamIds.has(id)));
  }, [teams, presenceEmps]);

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>("all");
  const filteredPresence = useMemo(() => {
    let list = presenceEmps;
    if (selectedTeamId) {
      list = list.filter((e) => e.teamIds?.includes(selectedTeamId));
    }
    return list.filter((e) => matchPresenceFilter(e.status, presenceFilter));
  }, [presenceEmps, presenceFilter, selectedTeamId]);

  const pa = personalAttendance;
  const myTodayHours = pa ? pa.todayMinutes / 60 : 0;

  const CAMPAIGN_STATUS_COLORS: Record<string, string> = { active: "var(--teal)", paused: "var(--amber)", completed: "var(--primary)", cancelled: "var(--rose)" };

  return (
    <div className="flex flex-col gap-4">
      <motion.div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--fg)" }}>{getGreeting()}, {user.firstName}</h1>
          <p className="text-[12px]" style={{ color: "var(--fg-secondary)" }}>{pendingTasks.length} tasks pending</p>
        </div>
        {pa && (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-md px-2 py-1" style={{ background: "var(--bg-grouped)", border: "1px solid var(--border)" }}>
              <span className="font-bold tabular-nums" style={{ color: "var(--fg)" }}>{myTodayHours >= 1 ? myTodayHours.toFixed(1) + "h" : pa.todayMinutes + "m"}</span>
              <span style={{ color: "var(--fg-tertiary)" }}> today</span>
            </span>
            <span className="rounded-md px-2 py-1" style={{ background: "var(--bg-grouped)", border: "1px solid var(--border)", color: pa.isOnTime ? "var(--teal)" : "var(--amber)" }}>
              {pa.isOnTime ? "On time" : formatMinutes(pa.lateBy) + " late"}
            </span>
            <span className="rounded-md px-2 py-1" style={{ background: "var(--bg-grouped)", border: "1px solid var(--border)" }}>
              <span className="font-bold tabular-nums" style={{ color: "var(--fg)" }}>{pa.todaySessions}</span>
              <span style={{ color: "var(--fg-tertiary)" }}> sessions</span>
            </span>
            {pa.firstEntry && (
              <span className="rounded-md px-2 py-1" style={{ background: "var(--bg-grouped)", border: "1px solid var(--border)" }}>
                <span style={{ color: "var(--fg-tertiary)" }}>In: </span>
                <span className="font-bold tabular-nums" style={{ color: "var(--fg)" }}>{pa.firstEntry}</span>
              </span>
            )}
          </div>
        )}
      </motion.div>

      <div className="card-static flex items-center divide-x divide-[var(--border)] overflow-hidden">
        {[
          { label: isManager ? "Department" : "My Team", value: totalEmp, color: "var(--fg)" },
          { label: "Present", value: presentToday, color: "#10b981" },
          { label: "Late", value: counts.late, color: "#f59e0b" },
          { label: "Absent", value: counts.absent, color: "#f43f5e" },
          { label: "On-Time", value: onTimePct + "%", color: "var(--teal)" },
        ].map((s) => (
          <div key={s.label} className="flex-1 px-3 py-2 text-center">
            <p className="text-[18px] font-bold tabular-nums" style={{ color: typeof s.color === "string" ? s.color : "var(--fg)" }}>{s.value}</p>
            <p className="text-[10px] font-medium" style={{ color: "var(--fg-secondary)" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Team Breakdown (manager sees all teams, team lead sees own) ── */}
      {teamBreakdown.length > 0 && (
        <div className="card-static overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
            <h3 className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>{isManager ? "Teams" : "My Teams"}</h3>
            {selectedTeamId && (
              <button type="button" onClick={() => setSelectedTeamId(null)} className="text-[10px] font-semibold" style={{ color: "var(--primary)" }}>Show All</button>
            )}
          </div>
          <div className="divide-y divide-[var(--border)]">
            {teamBreakdown.map((tb) => {
              const isSelected = selectedTeamId === tb.team._id;
              return (
                <button key={tb.team._id} type="button" onClick={() => setSelectedTeamId(isSelected ? null : tb.team._id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[var(--hover-bg)] transition-colors ${isSelected ? "bg-[var(--primary-light)]" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold truncate" style={{ color: "var(--fg)" }}>{tb.team.name}</p>
                    {tb.team.lead && <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>Lead: {tb.team.lead.about.firstName} {tb.team.lead.about.lastName}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-[10px] tabular-nums">
                    <span style={{ color: "#10b981" }}>{tb.present} in</span>
                    <span style={{ color: "#f43f5e" }}>{tb.absent} out</span>
                    {tb.late > 0 && <span style={{ color: "#f59e0b" }}>{tb.late} late</span>}
                    <span style={{ color: "var(--fg-tertiary)" }}>{tb.members.length} total</span>
                  </div>
                </button>
              );
            })}
            {unassignedMembers.length > 0 && isManager && (
              <div className="flex items-center gap-3 px-3 py-2 text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                <span>Unassigned: {unassignedMembers.length}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live Presence with filter toggles + team filter + fixed height scroll */}
      <motion.section className="card relative overflow-hidden" variants={slideUpItem} initial="hidden" animate="visible">
        <div className="flex flex-col gap-3 border-b p-3 sm:p-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full live-dot" style={{ background: "var(--teal)" }} />
              <h2 className="text-headline" style={{ color: "var(--fg)" }}>Live Presence</h2>
              <span className="text-caption ml-1">{filteredPresence.length} of {totalEmp}</span>
              {selectedTeamId && (
                <span className="text-[10px] rounded-full px-2 py-0.5 font-semibold" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>
                  {teams.find((t) => t._id === selectedTeamId)?.name ?? "Team"}
                </span>
              )}
            </div>
            <LayoutGroup id="mgr-presence-filter">
              <div className="relative flex flex-wrap gap-1 rounded-xl p-1" style={{ background: "var(--bg-grouped)" }}>
                {PRESENCE_FILTER_ORDER.map((f) => {
                  const active = presenceFilter === f;
                  return (
                    <button key={f} type="button" onClick={() => setPresenceFilter(f)} className="relative z-10 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors" style={{ color: active ? "var(--fg)" : "var(--fg-secondary)" }}>
                      {active && <motion.span layoutId="mgr-presence-active" className="absolute inset-0 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }} transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
                      <span className="relative">{PRESENCE_FILTER_LABELS[f]}</span>
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>
          </div>
        </div>
        <div className="p-3">
          {presenceLoading ? (
            <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="shimmer h-8 rounded" />)}</div>
          ) : filteredPresence.length > 0 ? (
            <div className="max-h-[350px] overflow-y-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <th className="px-3 py-2 text-[10px] font-medium uppercase" style={{ color: "var(--fg-tertiary)" }}>Name</th>
                    <th className="px-3 py-2 text-[10px] font-medium uppercase hidden sm:table-cell" style={{ color: "var(--fg-tertiary)" }}>Department</th>
                    <th className="px-3 py-2 text-[10px] font-medium uppercase" style={{ color: "var(--fg-tertiary)" }}>Status</th>
                    <th className="px-3 py-2 text-[10px] font-medium uppercase text-right" style={{ color: "var(--fg-tertiary)" }}>Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPresence.map((emp) => (
                    <tr key={emp._id} className="border-b hover:bg-[var(--hover-bg)] transition-colors" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-1.5">
                        <span className="font-medium" style={{ color: "var(--fg)" }}>{emp.firstName} {emp.lastName}</span>
                      </td>
                      <td className="px-3 py-1.5 hidden sm:table-cell text-[11px]" style={{ color: "var(--fg-secondary)" }}>{emp.department}</td>
                      <td className="px-3 py-1.5">
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: `color-mix(in srgb, ${STATUS_COLORS[emp.status]} 15%, transparent)`, color: STATUS_COLORS[emp.status] }}>{STATUS_LABELS[emp.status]}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium" style={{ color: "var(--fg)" }}>{formatMinutes(emp.todayMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-callout" style={{ color: "var(--fg-tertiary)" }}>No members match this filter</p>
          )}
        </div>
      </motion.section>

      {/* Late arrivals, attendance trend, task status, office/remote — compact */}
      <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <motion.section className="card-static p-2 sm:p-3" variants={fadeInItem} initial="hidden" animate="visible">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>Late Arrivals</h3>
            <span className="text-[10px] font-semibold tabular-nums" style={{ color: "var(--amber)" }}>{lateArrivals.length}</span>
          </div>
          {lateArrivals.length > 0 ? (
            <div className="space-y-1">
              {lateArrivals.slice(0, 5).map((emp) => (
                <div key={emp._id} className="flex items-center gap-2 text-[11px] px-2 py-1 rounded" style={{ background: "var(--bg-grouped)" }}>
                  <span className="font-medium flex-1 truncate" style={{ color: "var(--fg)" }}>{emp.firstName} {emp.lastName}</span>
                  <span className="tabular-nums font-bold" style={{ color: "var(--amber)" }}>+{formatMinutes(emp.lateBy)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] py-2 text-center" style={{ color: "var(--fg-tertiary)" }}>No late arrivals</p>
          )}
        </motion.section>

        <motion.section className="card-static p-2 sm:p-3" variants={fadeInItem} initial="hidden" animate="visible">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>Team Attendance</h3>
            <span className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>5 days</span>
          </div>
          {attendanceTrend.length > 0 ? (
            <div className="flex h-28 items-end justify-between gap-1.5 px-0.5">
              {attendanceTrend.map((d, i) => (
                <div key={d.date} className="flex min-h-0 flex-1 flex-col items-center gap-1">
                  <div className="relative flex h-20 w-full items-end justify-center">
                    <motion.div
                      className="w-[50%] max-w-[32px] rounded-t-md"
                      style={{ background: "linear-gradient(180deg, var(--primary), var(--cyan))" }}
                      initial={{ height: "0%" }}
                      animate={{ height: `${(d.count / trendMax) * 100}%` }}
                      transition={{ duration: 0.5, delay: 0.06 * i, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                  <span className="text-[10px] font-medium" style={{ color: "var(--fg-secondary)" }}>{d.label}</span>
                  <span className="text-[10px] tabular-nums font-semibold" style={{ color: "var(--fg)" }}>{d.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] py-2 text-center" style={{ color: "var(--fg-tertiary)" }}>No trend data yet</p>
          )}
        </motion.section>

        <motion.section className="card-static p-2 sm:p-3" variants={fadeInItem} initial="hidden" animate="visible">
          <h3 className="text-[12px] font-semibold mb-2" style={{ color: "var(--fg)" }}>Task Status</h3>
          <div className="card-static flex items-center divide-x divide-[var(--border)] overflow-hidden rounded-lg">
            {[
              { label: "Total", value: tasks.length, color: "var(--fg)" },
              { label: "Pending", value: pendingTasks.length, color: "var(--amber)" },
              { label: "In Progress", value: inProgressTasks.length, color: "var(--primary)" },
              { label: "Completed", value: completedTasks.length, color: "var(--teal)" },
            ].map((item) => (
              <div key={item.label} className="min-w-0 flex-1 px-1.5 py-2 text-center">
                <p className="text-[15px] font-bold tabular-nums leading-tight" style={{ color: item.color }}>
                  <AnimatedNumber value={item.value} />
                </p>
                <p className="text-[9px] font-medium leading-tight mt-0.5" style={{ color: "var(--fg-secondary)" }}>{item.label}</p>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section className="card-static p-2 sm:p-3" variants={fadeInItem} initial="hidden" animate="visible">
          <h3 className="text-[12px] font-semibold mb-2" style={{ color: "var(--fg)" }}>Office vs Remote</h3>
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
            <span className="font-semibold" style={{ color: "var(--fg)" }}>Office: {officeCount}</span>
            {" "}({totalOnline > 0 ? Math.round((officeCount / totalOnline) * 100) : 0}%)
            <span style={{ color: "var(--fg-tertiary)" }}> · </span>
            <span className="font-semibold" style={{ color: "var(--fg)" }}>Remote: {remoteCount}</span>
            {" "}({totalOnline > 0 ? Math.round((remoteCount / totalOnline) * 100) : 0}%)
          </p>
        </motion.section>
      </div>

      {/* Top Workers + Active Campaigns */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <motion.section className="card p-3" variants={fadeInItem} initial="hidden" animate="visible">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>Top Workers</h3>
            <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>Today</span>
          </div>
          {topWorkers.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {topWorkers.map((emp, i) => (
                <div key={emp._id} className="flex items-center gap-2 text-[11px]">
                  <span className="w-4 text-center font-bold" style={{ color: i < 3 ? "var(--amber)" : "var(--fg-tertiary)" }}>{i + 1}</span>
                  <span className="font-medium flex-1 truncate" style={{ color: "var(--fg)" }}>{emp.firstName} {emp.lastName}</span>
                  <span className="tabular-nums font-bold" style={{ color: "var(--fg)" }}>{formatMinutes(emp.todayMinutes)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No activity yet today</p>
          )}
        </motion.section>

        <motion.section className="card p-3" variants={fadeInItem} initial="hidden" animate="visible">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-headline" style={{ color: "var(--fg)" }}>Active Campaigns</h3>
              <p className="text-caption mt-0.5">{activeCampaigns.length} running · {campaigns.length} total</p>
            </div>
            <Link href="/campaigns">
              <motion.span className="text-caption font-semibold" style={{ color: "var(--primary)" }} whileHover={{ scale: 1.05 }}>View All</motion.span>
            </Link>
          </div>
          {activeCampaigns.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {activeCampaigns.slice(0, 5).map((camp, ci) => {
                const tagCount = camp.tags.employees.length + camp.tags.departments.length + camp.tags.teams.length;
                return (
                  <motion.li key={camp._id} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.08 * ci }} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--bg-grouped)" }}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${CAMPAIGN_STATUS_COLORS[camp.status]} 15%, transparent)` }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={CAMPAIGN_STATUS_COLORS[camp.status]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-callout font-semibold truncate" style={{ color: "var(--fg)" }}>{camp.name}</p>
                      <div className="mt-0.5 flex flex-wrap gap-1.5">
                        {camp.tags.departments.slice(0, 2).map((d) => (
                          <span key={d._id} className="text-[10px] rounded-md px-1.5 py-0.5" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>{d.title}</span>
                        ))}
                        {camp.tags.teams.slice(0, 2).map((t) => (
                          <span key={t._id} className="text-[10px] rounded-md px-1.5 py-0.5" style={{ background: "rgba(48,209,88,0.12)", color: "var(--teal)" }}>{t.name}</span>
                        ))}
                        {tagCount > 4 && <span className="text-[10px] rounded-md px-1.5 py-0.5" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>+{tagCount - 4}</span>}
                      </div>
                    </div>
                    <span className="badge text-[10px]" style={{ background: `color-mix(in srgb, ${CAMPAIGN_STATUS_COLORS[camp.status]} 12%, transparent)`, color: CAMPAIGN_STATUS_COLORS[camp.status] }}>{camp.status}</span>
                  </motion.li>
                );
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-callout" style={{ color: "var(--fg-tertiary)" }}>No active campaigns</p>
          )}
        </motion.section>
      </div>

      <motion.section className="card-static overflow-hidden p-2 sm:p-3" variants={slideUpItem} initial="hidden" animate="visible">
        <div className="mb-2 flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>Checklist</h2>
          {pendingTasks.length > 0 && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: "var(--rose)" }}>
              {pendingTasks.length} pending
            </span>
          )}
        </div>
        {pendingTasks.length > 0 ? (
          <div className="flex flex-col gap-2">
            {pendingTasks.slice(0, 5).map((task, ti) => (
              <motion.div key={task._id} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 + ti * 0.06 }} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-[var(--hover-bg)]">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: "var(--bg-grouped)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    {task.priority === "urgent" ? (
                      <><path d="M12 2v10l4 2" /><circle cx="12" cy="12" r="10" /></>
                    ) : task.priority === "high" ? (
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                    ) : (
                      <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>
                    )}
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold leading-snug line-clamp-1" style={{ color: "var(--fg)" }}>{task.title}</p>
                  <p className="text-[10px] leading-snug line-clamp-1 mt-0.5" style={{ color: "var(--fg-secondary)" }}>
                    {task.assignedTo?.about ? `${task.assignedTo.about.firstName} ${task.assignedTo.about.lastName} · ` : ""}{task.deadline ? new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No deadline"} · {PRIORITY_LABELS[task.priority] ?? task.priority}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="py-3 text-center text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No pending tasks — you&apos;re all caught up!</p>
        )}
        {pendingTasks.length > 0 && (
          <Link href="/tasks">
            <motion.button type="button" className="mt-2 w-full text-center text-[11px] font-semibold" style={{ color: "var(--primary)" }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              View all tasks →
            </motion.button>
          </Link>
        )}
      </motion.section>
    </div>
  );
}

/* ──────────────────────── OTHER ROLES OVERVIEW ──────────────────────── */

function OtherRoleOverview({ user, tasks, personalAttendance, weeklyRecords, monthlyStats: ms, userProfile }: { user: User; tasks: ApiTask[]; personalAttendance: PersonalAttendance | null; weeklyRecords: WeeklyDay[]; monthlyStats: FullMonthlyStats | null; userProfile: UserProfile | null }) {
  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);
  const inProgressTasks = useMemo(() => tasks.filter((t) => t.status === "inProgress"), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((t) => t.status === "completed"), [tasks]);
  const pa = personalAttendance;
  const todayHours = pa ? pa.todayMinutes / 60 : 0;
  const profileName = userProfile?.firstName ?? user.firstName;
  const profileLast = userProfile?.lastName ?? user.lastName;
  const designation = userProfile?.designation ?? ROLE_DESIGNATION[user.role] ?? user.role;
  const dept = userProfile?.department;
  const shiftTarget = userProfile?.workShift ? (() => { const [sh, sm] = userProfile.workShift!.start.split(":").map(Number); const [eh, em] = userProfile.workShift!.end.split(":").map(Number); return Math.max(eh * 60 + em - (sh * 60 + sm) - (userProfile.workShift!.breakTime ?? 60), 1); })() : 480;
  const shiftPct = pa ? Math.min(100, Math.round((pa.todayMinutes / shiftTarget) * 100)) : 0;
  const monthlyOfficePct = ms && (ms.totalOfficeHours + ms.totalRemoteHours > 0) ? (ms.totalOfficeHours / (ms.totalOfficeHours + ms.totalRemoteHours)) * 100 : 0;
  const monthlyRemotePct = 100 - monthlyOfficePct;

  const isLive = pa && (pa.todaySessions > 0 || pa.todayMinutes > 0);
  const statusColor = isLive ? (pa!.isOnTime ? "#10b981" : "#f59e0b") : "#f43f5e";
  const statusLabel = isLive ? (pa!.isOnTime ? "On Time" : "Late") : "Absent";

  const timelineEvents = useMemo(() => {
    const evs: { key: string; dot: string; time: string; label: string }[] = [];
    if (pa?.firstEntry) evs.push({ key: "login", dot: statusColor, time: pa.firstEntry, label: `Checked in at ${pa.firstEntry}` });
    if (pa && pa.todaySessions > 1) evs.push({ key: "sessions", dot: "var(--amber)", time: `${pa.todaySessions} sessions`, label: `${pa.todaySessions} sessions today (${formatMinutes(pa.officeMinutes)} office, ${formatMinutes(pa.remoteMinutes)} remote)` });
    if (pa && pa.todayMinutes > 0) evs.push({ key: "active", dot: "var(--teal)", time: "Now", label: `Active now · ${formatMinutes(pa.todayMinutes)} logged` });
    if (evs.length === 0) evs.push({ key: "empty", dot: "var(--fg-tertiary)", time: "—", label: "No activity yet today" });
    return evs;
  }, [pa, statusColor]);

  return (
    <motion.div className="flex flex-col gap-2" variants={staggerContainer} initial="hidden" animate="visible">
      <motion.div className="flex items-center justify-between gap-3 mb-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--fg)" }}>{getGreeting()}, {profileName}</h1>
          <p className="text-[12px]" style={{ color: "var(--fg-secondary)" }}>{designation} · {pendingTasks.length} tasks pending</p>
        </div>
        <LivePulse />
      </motion.div>

      <div className="card-static flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="flex items-center gap-2 mr-2">
          {userProfile?.profileImage ? (
            <img src={userProfile.profileImage} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>{initials(profileName, profileLast)}</div>
          )}
          <div>
            <p className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>{profileName} {profileLast}</p>
            <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{dept ?? designation}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-md px-2 py-1 font-semibold" style={{ background: `${statusColor}1a`, color: statusColor }}>{statusLabel}</span>
          {pa?.firstEntry && (
            <span className="rounded-md px-2 py-1" style={{ background: "var(--bg-grouped)", border: "1px solid var(--border)" }}>
              <span style={{ color: "var(--fg-tertiary)" }}>In: </span><span className="font-bold tabular-nums" style={{ color: "var(--fg)" }}>{pa.firstEntry}</span>
            </span>
          )}
          <span className="rounded-md px-2 py-1" style={{ background: "var(--bg-grouped)", border: "1px solid var(--border)" }}>
            <span className="font-bold tabular-nums" style={{ color: "var(--fg)" }}>{pa ? (todayHours >= 1 ? todayHours.toFixed(1) + "h" : pa.todayMinutes + "m") : "—"}</span>
            <span style={{ color: "var(--fg-tertiary)" }}> logged</span>
          </span>
          {pa && (
            <>
              <span className="rounded-md px-2 py-1" style={{ background: "var(--bg-grouped)", border: "1px solid var(--border)" }}>
                <span className="tabular-nums" style={{ color: "var(--fg-secondary)" }}>{formatMinutes(pa.officeMinutes)} office · {formatMinutes(pa.remoteMinutes)} remote</span>
              </span>
              <span className="rounded-md px-2 py-1" style={{ background: "var(--bg-grouped)", border: "1px solid var(--border)" }}>
                <span className="tabular-nums" style={{ color: "var(--fg-secondary)" }}>{shiftPct}% shift</span>
              </span>
            </>
          )}
        </div>
      </div>

      <div className="card-static flex items-center divide-x divide-[var(--border)] overflow-hidden">
        {[
          { label: "Total", value: tasks.length, color: "var(--fg)" },
          { label: "Pending", value: pendingTasks.length, color: "var(--amber)" },
          { label: "Active", value: inProgressTasks.length, color: "var(--primary)" },
          { label: "Done", value: completedTasks.length, color: "var(--teal)" },
        ].map((s) => (
          <div key={s.label} className="flex-1 px-3 py-2 text-center">
            <p className="text-[18px] font-bold tabular-nums" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] font-medium" style={{ color: "var(--fg-secondary)" }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="card-static flex flex-col p-3">
            <h3 className="text-[12px] font-semibold mb-2" style={{ color: "var(--fg)" }}>Today&apos;s Activity</h3>
            <ul className="relative flex flex-col gap-0 pl-3">
              <span className="absolute bottom-0.5 left-[5px] top-0.5 w-px" style={{ background: "var(--border-strong)" }} aria-hidden />
              {timelineEvents.map((ev, i) => (
                <motion.li key={ev.key} initial={{ x: -8, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 + i * 0.07 }} className="relative flex gap-2 pb-3 last:pb-0">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ev.dot, boxShadow: "0 0 0 2px var(--bg)" }} />
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{ev.time}</span>
                    <p className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--fg)" }}>{ev.label}</p>
                  </div>
                </motion.li>
              ))}
            </ul>
          </motion.section>

          <div className="card-static p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>My Tasks</h3>
              {pendingTasks.length > 0 && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: "var(--rose)" }}>{pendingTasks.length}</span>}
            </div>
            {pendingTasks.length > 0 ? (
              <div className="space-y-1.5">
                {pendingTasks.slice(0, 6).map((task) => (
                  <div key={task._id} className="flex items-start gap-2 text-[11px]">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)" }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium" style={{ color: "var(--fg)" }}>{task.title}</p>
                      <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{task.deadline ? new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No deadline"} · {PRIORITY_LABELS[task.priority] ?? task.priority}</p>
                    </div>
                  </div>
                ))}
                <Link href="/tasks"><span className="text-[11px] font-semibold" style={{ color: "var(--primary)" }}>View all →</span></Link>
              </div>
            ) : (
              <p className="text-[11px] py-2 text-center" style={{ color: "var(--fg-tertiary)" }}>All caught up!</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {weeklyRecords.length > 0 && (
            <div className="card-static p-3">
              <h3 className="text-[12px] font-semibold mb-2" style={{ color: "var(--fg)" }}>This Week</h3>
              <div className="space-y-1">
                {weeklyRecords.map((day) => {
                  const d = new Date(day.date + "T12:00:00");
                  const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
                  const isToday = day.date === new Date().toISOString().slice(0, 10);
                  return (
                    <div key={day.date} className={`flex items-center gap-2 text-[11px] px-2 py-1 rounded ${isToday ? "bg-[var(--primary-light)]" : ""}`}>
                      <span className="w-8 font-medium" style={{ color: isToday ? "var(--primary)" : "var(--fg-secondary)" }}>{dayName}</span>
                      <span className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (day.totalMinutes / 480) * 100)}%`, background: !day.isPresent ? "var(--rose)" : !day.isOnTime ? "var(--amber)" : "var(--teal)" }} />
                      </span>
                      <span className="w-10 text-right tabular-nums font-medium" style={{ color: "var(--fg)" }}>{formatMinutes(day.totalMinutes)}</span>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: !day.isPresent ? "#f43f5e" : !day.isOnTime ? "#f59e0b" : "#10b981" }} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {ms && (
            <div className="card-static p-3">
              <h3 className="text-[12px] font-semibold mb-2" style={{ color: "var(--fg)" }}>Monthly Summary</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                <div className="flex justify-between"><span style={{ color: "var(--fg-secondary)" }}>Present</span><span className="font-bold tabular-nums" style={{ color: "var(--fg)" }}>{ms.presentDays}/{ms.totalWorkingDays} days</span></div>
                <div className="flex justify-between"><span style={{ color: "var(--fg-secondary)" }}>On-time</span><span className="font-bold tabular-nums" style={{ color: "var(--primary)" }}>{ms.onTimePercentage}%</span></div>
                <div className="flex justify-between"><span style={{ color: "var(--fg-secondary)" }}>Avg/day</span><span className="font-bold tabular-nums" style={{ color: "var(--fg)" }}>{ms.averageDailyHours.toFixed(1)}h</span></div>
                <div className="flex justify-between"><span style={{ color: "var(--fg-secondary)" }}>Total hours</span><span className="font-bold tabular-nums" style={{ color: "var(--fg)" }}>{ms.totalWorkingHours.toFixed(0)}h</span></div>
                <div className="flex justify-between"><span style={{ color: "var(--fg-secondary)" }}>Office</span><span className="tabular-nums" style={{ color: "var(--fg)" }}>{ms.totalOfficeHours.toFixed(0)}h ({monthlyOfficePct.toFixed(0)}%)</span></div>
                <div className="flex justify-between"><span style={{ color: "var(--fg-secondary)" }}>Remote</span><span className="tabular-nums" style={{ color: "var(--fg)" }}>{ms.totalRemoteHours.toFixed(0)}h ({monthlyRemotePct.toFixed(0)}%)</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ──────────────────────── MAIN EXPORT ──────────────────────── */

export default function DashboardHome({ user }: { user: User }) {
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [departments, setDepartments] = useState<ApiDepartment[]>([]);
  const [loading, setLoading] = useState(true);

  const [realPresence, setRealPresence] = useState<PresenceEmployee[] | null>(null);
  const [personalAttendance, setPersonalAttendance] = useState<PersonalAttendance | null>(null);
  const [campaigns, setCampaigns] = useState<ApiCampaign[]>([]);
  const [attendanceTrend, setAttendanceTrend] = useState<TrendDay[]>([]);
  const [teams, setTeams] = useState<ApiTeam[]>([]);
  const [weeklyRecords, setWeeklyRecords] = useState<WeeklyDay[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<FullMonthlyStats | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const isSuperAdmin = user.role === "superadmin";
  const isAdminRole = isSuperAdmin || user.role === "manager" || user.role === "teamLead";
  const initialDone = useRef(false);

  /* ── Helper: parse presence array ── */
  const parsePresence = useCallback((raw: unknown) => {
    if (!Array.isArray(raw)) return;
    setRealPresence(
      (raw as Array<{ _id: string; firstName: string; lastName: string; userRole: string; department: string; status: string; todayMinutes: number; lateBy: number; isActive: boolean; teamIds?: string[] }>).map((p) => ({
        _id: p._id,
        firstName: p.firstName,
        lastName: p.lastName,
        designation: ROLE_DESIGNATION[p.userRole] ?? p.userRole,
        department: p.department,
        status: p.status as PresenceStatus,
        todayMinutes: p.todayMinutes,
        lateBy: p.lateBy ?? 0,
        isActive: p.isActive,
        teamIds: p.teamIds ?? [],
      })),
    );
  }, []);

  /* ── Helper: fetch today's attendance detail (lightweight, for presence updates) ── */
  const fetchTodayDetail = useCallback(async () => {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const dailyRes = await fetch(`/api/attendance?type=detail&date=${todayStr}`).then((r) => r.ok ? r.json() : null);
      if (dailyRes) {
        setPersonalAttendance((prev) => {
          const base = prev ?? { todayMinutes: 0, todaySessions: 0, officeMinutes: 0, remoteMinutes: 0, isOnTime: true, lateBy: 0, firstEntry: null, monthlyAvgHours: 0, monthlyOnTimePct: 0, avgInTime: "", avgOutTime: "" };
          return {
            ...base,
            todayMinutes: dailyRes.totalWorkingMinutes ?? 0,
            todaySessions: dailyRes.activitySessions?.length ?? 0,
            officeMinutes: dailyRes.officeMinutes ?? 0,
            remoteMinutes: dailyRes.remoteMinutes ?? 0,
            isOnTime: dailyRes.isOnTime ?? true,
            lateBy: dailyRes.lateBy ?? 0,
            firstEntry: dailyRes.firstOfficeEntry ? new Date(dailyRes.firstOfficeEntry).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null,
          };
        });
      }
    } catch { /* optional */ }
  }, []);

  /* ── FAST POLL: presence + today's detail ── */
  const fetchLive = useCallback(async () => {
    try {
      if (isAdminRole) {
        const presRes = await fetch("/api/attendance/presence").then((r) => r.ok ? r.json() : []);
        parsePresence(presRes);
      }
      if (!isSuperAdmin) await fetchTodayDetail();
    } catch { /* silent */ }
  }, [isAdminRole, isSuperAdmin, parsePresence, fetchTodayDetail]);

  /* ── Helper: fetch all personal data (monthly + weekly + profile) in one pass ── */
  const fetchPersonalData = useCallback(async () => {
    if (isSuperAdmin) return;
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const todayStr = now.toISOString().slice(0, 10);

      const [dailyDetailRes, weeklyRes, monthlyRes, profileRes] = await Promise.all([
        fetch(`/api/attendance?type=detail&date=${todayStr}`).then((r) => r.ok ? r.json() : null),
        fetch(`/api/attendance?type=daily&year=${year}&month=${month}`).then((r) => r.ok ? r.json() : []),
        fetch(`/api/attendance?type=monthly&year=${year}&month=${month}`).then((r) => r.ok ? r.json() : null),
        fetch("/api/profile").then((r) => r.ok ? r.json() : null),
      ]);

      if (dailyDetailRes) {
        setPersonalAttendance({
          todayMinutes: dailyDetailRes.totalWorkingMinutes ?? 0,
          todaySessions: dailyDetailRes.activitySessions?.length ?? 0,
          officeMinutes: dailyDetailRes.officeMinutes ?? 0,
          remoteMinutes: dailyDetailRes.remoteMinutes ?? 0,
          isOnTime: dailyDetailRes.isOnTime ?? true,
          lateBy: dailyDetailRes.lateBy ?? 0,
          firstEntry: dailyDetailRes.firstOfficeEntry ? new Date(dailyDetailRes.firstOfficeEntry).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null,
          monthlyAvgHours: monthlyRes?.averageDailyHours ?? 0,
          monthlyOnTimePct: monthlyRes?.onTimePercentage ?? 0,
          avgInTime: monthlyRes?.averageOfficeInTime ?? "",
          avgOutTime: monthlyRes?.averageOfficeOutTime ?? "",
        });
      } else if (monthlyRes) {
        setPersonalAttendance((prev) => {
          const base = prev ?? { todayMinutes: 0, todaySessions: 0, officeMinutes: 0, remoteMinutes: 0, isOnTime: true, lateBy: 0, firstEntry: null, monthlyAvgHours: 0, monthlyOnTimePct: 0, avgInTime: "", avgOutTime: "" };
          return {
            ...base,
            monthlyAvgHours: monthlyRes.averageDailyHours ?? 0,
            monthlyOnTimePct: monthlyRes.onTimePercentage ?? 0,
            avgInTime: monthlyRes.averageOfficeInTime ?? "",
            avgOutTime: monthlyRes.averageOfficeOutTime ?? "",
          };
        });
      }

      if (Array.isArray(weeklyRes)) {
        const last7 = (weeklyRes as Array<{ date: string; totalWorkingMinutes?: number; officeMinutes?: number; remoteMinutes?: number; isPresent?: boolean; isOnTime?: boolean; lateBy?: number }>)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 7)
          .reverse()
          .map((d) => ({
            date: d.date,
            totalMinutes: d.totalWorkingMinutes ?? 0,
            officeMinutes: d.officeMinutes ?? 0,
            remoteMinutes: d.remoteMinutes ?? 0,
            isPresent: d.isPresent ?? false,
            isOnTime: d.isOnTime ?? true,
            lateBy: d.lateBy ?? 0,
          }));
        setWeeklyRecords(last7);
      }

      if (monthlyRes) {
        const ms = monthlyRes as Record<string, unknown>;
        setMonthlyStats({
          presentDays: (ms.presentDays as number) ?? 0,
          totalWorkingDays: (ms.totalWorkingDays as number) ?? 0,
          totalWorkingHours: (ms.totalWorkingHours as number) ?? 0,
          onTimePercentage: (ms.onTimePercentage as number) ?? 0,
          averageDailyHours: (ms.averageDailyHours as number) ?? 0,
          totalOfficeHours: (ms.totalOfficeHours as number) ?? 0,
          totalRemoteHours: (ms.totalRemoteHours as number) ?? 0,
        });
      }

      if (profileRes) {
        const p = profileRes as Record<string, unknown>;
        const about = p.about as Record<string, unknown> | undefined;
        const dept = p.department as { title?: string } | undefined;
        const shift = p.workShift as { type?: string; shift?: { start?: string; end?: string }; breakTime?: number } | undefined;
        setUserProfile({
          firstName: (about?.firstName as string) ?? user.firstName,
          lastName: (about?.lastName as string) ?? user.lastName,
          email: (p.email as string) ?? user.email,
          username: (p.username as string) ?? user.username,
          profileImage: (about?.profileImage as string) || undefined,
          department: dept?.title ?? undefined,
          designation: ROLE_DESIGNATION[user.role] ?? user.role,
          workShift: shift?.shift ? { type: shift.type ?? "fullTime", start: shift.shift.start ?? "09:00", end: shift.shift.end ?? "18:00", breakTime: shift.breakTime ?? 60 } : undefined,
        });
      }
    } catch { /* optional data */ }
  }, [isSuperAdmin, user]);

  /* ── SLOW POLL: full data set ── */
  const fetchFull = useCallback(async () => {
    try {
      const fetches: Promise<unknown>[] = [
        fetch("/api/employees").then((r) => r.ok ? r.json() : []),
        fetch("/api/tasks").then((r) => r.ok ? r.json() : []),
        isSuperAdmin ? fetch("/api/departments").then((r) => r.ok ? r.json() : []) : Promise.resolve([]),
      ];
      if (isAdminRole) {
        fetches.push(fetch("/api/campaigns").then((r) => r.ok ? r.json() : []));
        fetches.push(fetch("/api/attendance/trend").then((r) => r.ok ? r.json() : []));
        fetches.push(fetch("/api/teams").then((r) => r.ok ? r.json() : []));
      }
      const [empRes, taskRes, deptRes, campaignRes, trendRes, teamsRes] = await Promise.all(fetches);

      setEmployees(Array.isArray(empRes) ? empRes as ApiEmployee[] : []);
      setTasks(Array.isArray(taskRes) ? taskRes as ApiTask[] : []);
      setDepartments(Array.isArray(deptRes) ? deptRes as ApiDepartment[] : []);
      if (Array.isArray(campaignRes)) setCampaigns(campaignRes as ApiCampaign[]);
      if (Array.isArray(trendRes)) setAttendanceTrend(trendRes as TrendDay[]);
      if (Array.isArray(teamsRes)) setTeams(teamsRes as ApiTeam[]);

      if (!isSuperAdmin) await fetchPersonalData();
    } catch (err) { console.error("Dashboard fetch error:", err); }
  }, [isSuperAdmin, isAdminRole, fetchPersonalData]);

  /* ── Initial load ── */
  useEffect(() => {
    Promise.all([fetchFull(), fetchLive()]).finally(() => {
      setLoading(false);
      initialDone.current = true;
    });
  }, [fetchFull, fetchLive]);

  /* ── Event-driven updates via SSE (replaces polling) ── */
  useEventStream(
    useMemo(
      () => ({
        presence: () => { if (initialDone.current) fetchLive(); },
        employees: () => { if (initialDone.current) fetchFull(); },
        tasks: () => { if (initialDone.current) fetchFull(); },
        departments: () => { if (initialDone.current) fetchFull(); },
        teams: () => { if (initialDone.current) fetchFull(); },
        campaigns: () => { if (initialDone.current) fetchFull(); },
        settings: () => { if (initialDone.current) fetchFull(); },
      }),
      [fetchLive, fetchFull],
    ),
    !loading,
  );

  const presenceLoading = realPresence === null && isAdminRole;
  const presenceEmps = useMemo(() => {
    if (realPresence) return realPresence;
    return employees.map((e) => ({
      _id: e._id,
      firstName: e.about?.firstName ?? "",
      lastName: e.about?.lastName ?? "",
      designation: ROLE_DESIGNATION[e.userRole] ?? e.userRole,
      department: (e.department as { title?: string })?.title ?? "Unassigned",
      status: "absent" as PresenceStatus,
      todayMinutes: 0,
      lateBy: 0,
      isActive: true,
      teamIds: e.teams?.map((t) => t._id) ?? [],
    }));
  }, [realPresence, employees]);

  if (user.role === "superadmin") {
    return (
      <SuperAdminOverview
        user={user}
        presenceEmps={presenceEmps}
        presenceLoading={presenceLoading}
        tasks={tasks}
        departments={departments}
        employees={employees}
      />
    );
  }

  if (user.role === "manager" || user.role === "teamLead") {
    return (
      <ManagerOverview
        user={user}
        presenceEmps={presenceEmps}
        presenceLoading={presenceLoading}
        tasks={tasks}
        personalAttendance={personalAttendance}
        campaigns={campaigns}
        attendanceTrend={attendanceTrend}
        teams={teams}
      />
    );
  }

  return <OtherRoleOverview user={user} tasks={tasks} personalAttendance={personalAttendance} weeklyRecords={weeklyRecords} monthlyStats={monthlyStats} userProfile={userProfile} />;
}
