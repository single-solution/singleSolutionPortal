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

const AVATAR_GRADIENTS = [
  "from-blue-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-purple-500 to-pink-400",
  "from-amber-500 to-orange-400",
  "from-rose-500 to-red-400",
  "from-indigo-500 to-blue-400",
  "from-green-500 to-lime-400",
  "from-fuchsia-500 to-purple-400",
];

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

const STATUS_BADGE_CLASS: Record<PresenceStatus, string> = {
  office: "badge-office",
  remote: "badge-remote",
  late: "badge-late",
  overtime: "badge-overtime",
  absent: "badge-absent",
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

const statIconGradients = [
  "linear-gradient(135deg, var(--primary) 0%, var(--cyan) 100%)",
  "linear-gradient(135deg, var(--teal) 0%, #30d158 100%)",
  "linear-gradient(135deg, var(--amber) 0%, #f59e0b 100%)",
  "linear-gradient(135deg, var(--rose) 0%, #f43f5e 100%)",
];

const blobGradients = [
  "linear-gradient(135deg, rgba(0,122,255,0.35) 0%, rgba(100,210,255,0.25) 100%)",
  "linear-gradient(135deg, rgba(48,209,88,0.35) 0%, rgba(16,185,129,0.2) 100%)",
  "linear-gradient(135deg, rgba(255,159,10,0.35) 0%, rgba(245,158,11,0.2) 100%)",
  "linear-gradient(135deg, rgba(255,55,95,0.3) 0%, rgba(244,63,94,0.2) 100%)",
];

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
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, #10b981 12%, transparent)" }}>
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


function AttendanceDonut({ counts, total }: { counts: ReturnType<typeof getStatusCounts>; total: number }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const arcs = useMemo(() => {
    const segments = STATUS_ORDER.map((s) => ({ status: s, count: counts[s], color: STATUS_COLORS[s] })).filter((s) => s.count > 0);
    const result: { status: PresenceStatus; count: number; color: string; dasharray: string; finalOffset: number }[] = [];
    let accumulated = 0;
    for (const seg of segments) {
      const len = (seg.count / total) * circumference;
      result.push({ ...seg, dasharray: `${len} ${circumference - len}`, finalOffset: -accumulated });
      accumulated += len;
    }
    return result;
  }, [counts, total, circumference]);

  return (
    <div className="relative flex shrink-0 items-center justify-center">
      <svg className="h-32 w-32 sm:h-36 sm:w-36" viewBox="0 0 100 100">
        <g transform="rotate(-90 50 50)">
          <circle cx="50" cy="50" r={radius} stroke="var(--border)" strokeWidth="10" fill="transparent" />
          {arcs.map((seg, i) => (
            <motion.circle key={seg.status} cx="50" cy="50" r={radius} fill="none" stroke={seg.color} strokeWidth="10" strokeLinecap="round" strokeDasharray={seg.dasharray} initial={{ strokeDashoffset: seg.finalOffset + circumference }} animate={{ strokeDashoffset: seg.finalOffset }} transition={{ duration: 1.2, delay: i * 0.08, ease: "easeOut" }} />
          ))}
        </g>
      </svg>
    </div>
  );
}

const STATUS_RING_CLASS: Record<PresenceStatus, string> = {
  office: "pulse-ring-office",
  remote: "",
  late: "pulse-ring-late",
  overtime: "",
  absent: "pulse-ring-absent",
};

function EmployeePresenceCard({ emp, idx }: { emp: PresenceEmployee; idx: number }) {
  const ringCls = STATUS_RING_CLASS[emp.status] ?? "";
  return (
    <motion.div custom={idx} variants={cardVariants} initial="hidden" animate="visible" whileHover={cardHover} className="card-static card-shine group flex flex-col gap-3 rounded-[var(--radius)] p-3">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white ${AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length]} ${ringCls}`}
          style={{ boxShadow: `0 0 0 2px ${STATUS_COLORS[emp.status]}` }}
        >
          {initials(emp.firstName, emp.lastName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-callout truncate font-semibold" style={{ color: "var(--fg)" }}>{emp.firstName} {emp.lastName}</p>
          <p className="text-caption truncate">{emp.designation}</p>
          {emp.department && <p className="text-[10px] truncate" style={{ color: "var(--fg-tertiary)" }}>{emp.department}</p>}
          <span className={`badge mt-2 ${STATUS_BADGE_CLASS[emp.status]}`}>{STATUS_LABELS[emp.status]}</span>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[var(--border)] pt-2">
        <span className="text-caption">Today</span>
        <span className="text-subhead font-medium tabular-nums" style={{ color: "var(--fg-secondary)" }}>{formatMinutes(emp.todayMinutes)}</span>
      </div>
    </motion.div>
  );
}

/* ──────────────────────── SUPERADMIN OVERVIEW ──────────────────────── */

function PresenceGridShimmer() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="card-static card-shine flex flex-col gap-3 rounded-[var(--radius)] p-3">
          <div className="flex items-start gap-3">
            <div className="shimmer h-11 w-11 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="shimmer h-4 w-28 rounded" />
              <div className="shimmer h-3 w-32 rounded" />
              <div className="shimmer h-3 w-24 rounded" />
              <div className="shimmer mt-2 h-5 w-20 rounded-full" />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--border)] pt-2">
            <div className="shimmer h-3 w-10 rounded" />
            <div className="shimmer h-4 w-14 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

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

  const statItems = [
    { title: "Total Employees", value: totalEmp, caption: "Active roster", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg> },
    { title: "In Office", value: inOffice, caption: "On-site now", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
    { title: "Late Today", value: lateToday, caption: "After grace", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
    { title: "Absent Today", value: absentToday, caption: "No check-in", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg> },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header: Greeting + Actions + Clock — glass blended ── */}
      <motion.header
        className="card-xl relative overflow-hidden p-4 sm:p-5"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-[0.07]" style={{ background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)" }} aria-hidden />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full opacity-[0.05]" style={{ background: "radial-gradient(circle, var(--teal) 0%, transparent 70%)" }} aria-hidden />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <motion.div className="min-w-0 flex-1" variants={slideFromLeft} initial="hidden" animate="visible">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-caption">Single Solution Sync</p>
              <LivePulse />
            </div>
            <h1 className="text-title">
              <span className="gradient-text">{getGreeting()}</span>
              <span style={{ color: "var(--fg)" }}>, {user.firstName}!</span>
            </h1>
            <p className="text-subhead mt-1">
              You have {pendingTasks.length} task{pendingTasks.length !== 1 ? "s" : ""} pending
            </p>
          </motion.div>
          <motion.div className="flex shrink-0 items-center gap-3" variants={slideFromRight} initial="hidden" animate="visible">
            <div className="relative overflow-hidden rounded-xl p-3 sm:min-w-[180px]" style={{ background: "color-mix(in srgb, var(--glass-bg-heavy) 60%, transparent)", border: "0.5px solid var(--glass-border)" }}>
              <p className="text-caption mb-0.5">Local time</p>
              <AnimatePresence mode="wait">
                <motion.div key={timeKey} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
                  <span className="text-headline block tabular-nums" style={{ color: "var(--fg)" }}>{formatClock(now)}</span>
                  <span className="text-caption">{formatClockDate(now)}</span>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </motion.header>

      {/* ── KPI Stat Cards ── */}
      <motion.div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" variants={staggerContainerFast} initial="hidden" animate="visible">
        {statItems.map((stat, i) => (
          <motion.div key={stat.title} className="card group relative overflow-hidden p-4" custom={i} variants={cardVariants} initial="hidden" animate="visible">
            <div className="pointer-events-none absolute -right-1 -top-1 h-20 w-20 rounded-bl-[50px] opacity-10 transition-opacity group-hover:opacity-[0.15]" style={{ background: blobGradients[i % blobGradients.length] }} />
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-white mb-2" style={{ background: statIconGradients[i] }}>
              {stat.icon}
            </div>
            <p className="text-subhead">{stat.title}</p>
            <p className="text-[22px] sm:text-[26px] font-semibold tabular-nums mt-0.5" style={{ color: "var(--fg)" }}>
              <AnimatedNumber value={stat.value} />
            </p>
            <p className="text-caption mt-0.5">{stat.caption}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Live Presence Board ── */}
      <motion.section className="card relative overflow-hidden p-4 sm:p-5" variants={slideUpItem} initial="hidden" animate="visible">
        <div className="mb-4 flex items-center gap-2">
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full live-dot" style={{ background: "var(--teal)" }} />
          <h2 className="text-headline" style={{ color: "var(--fg)" }}>Live Presence</h2>
        </div>
        {presenceLoading ? (
          <PresenceGridShimmer />
        ) : presenceEmps.length > 0 ? (
          <motion.div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" variants={staggerContainerFast} initial="hidden" animate="visible">
            {presenceEmps.map((emp, idx) => (
              <EmployeePresenceCard key={emp._id} emp={emp} idx={idx} />
            ))}
          </motion.div>
        ) : (
          <p className="py-8 text-center text-callout" style={{ color: "var(--fg-tertiary)" }}>No employees found</p>
        )}
      </motion.section>

      {/* ── Attendance Overview + Department Summary ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Attendance Overview — compact single-row */}
        <motion.section className="card p-3 sm:p-4" variants={slideUpItem} initial="hidden" animate="visible">
          <h2 className="text-headline mb-3" style={{ color: "var(--fg)" }}>Attendance Overview</h2>
          <div className="flex items-center gap-4">
            {/* Left: stats legend */}
            <div className="min-w-0 flex-1 space-y-2.5">
              {STATUS_ORDER.map((status) => {
                const pct = totalEmp > 0 ? Math.round((counts[status] / totalEmp) * 100) : 0;
                return (
                  <div key={status} className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
                    <span className="text-callout flex-1 truncate" style={{ color: "var(--fg)" }}>{STATUS_LABELS[status]}</span>
                    <span className="text-headline tabular-nums font-semibold" style={{ color: "var(--fg)" }}>{counts[status]}</span>
                    <span className="w-9 text-right text-caption tabular-nums">{pct}%</span>
                  </div>
                );
              })}
              <div className="flex items-center gap-2.5 border-t border-[var(--border)] pt-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--fg-tertiary)" }} />
                <span className="text-callout flex-1 font-medium" style={{ color: "var(--fg)" }}>Total</span>
                <span className="text-headline tabular-nums font-semibold" style={{ color: "var(--fg)" }}>{totalEmp}</span>
                <span className="w-9 text-right text-caption tabular-nums">100%</span>
              </div>
            </div>
            {/* Right: donut chart */}
            <AttendanceDonut counts={counts} total={totalEmp} />
          </div>
        </motion.section>

        {/* Department Summary — superadmin only */}
        {user.role === "superadmin" && (
        <motion.section className="card p-3 sm:p-4" variants={slideUpItem} initial="hidden" animate="visible">
          <h2 className="text-headline mb-3" style={{ color: "var(--fg)" }}>Department Summary</h2>
          {departments.length > 0 ? (
            <div className="flex flex-col gap-3">
              {departments.map((dept, di) => {
                const pct = totalDeptEmployees > 0 ? (dept.employeeCount / totalDeptEmployees) * 100 : 0;
                return (
                  <div key={dept._id}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-callout font-medium" style={{ color: "var(--fg)" }}>{dept.title}</span>
                      <span className="text-caption tabular-nums">{dept.employeeCount} people</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: "linear-gradient(90deg, var(--primary) 0%, var(--cyan) 100%)" }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 1, delay: di * 0.08, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-callout" style={{ color: "var(--fg-tertiary)" }}>No departments yet</p>
          )}
        </motion.section>
        )}
      </div>

      {/* ── Checklist ── */}
      <motion.section className="card p-4 sm:p-5" variants={slideUpItem} initial="hidden" animate="visible">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-headline" style={{ color: "var(--fg)" }}>Checklist</h2>
          {pendingTasks.length > 0 && (
            <span className="notif-badge-pulse rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: "var(--rose)" }}>
              {pendingTasks.length} Pending
            </span>
          )}
        </div>
        {pendingTasks.length > 0 ? (
          <div className="flex flex-col gap-3">
            {pendingTasks.slice(0, 5).map((task, ti) => (
              <motion.div key={task._id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 + ti * 0.1 }} whileHover={{ x: 5 }} className="flex cursor-pointer items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)"} 15%, transparent)` }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                  <p className="text-callout font-semibold line-clamp-1" style={{ color: "var(--fg)" }}>{task.title}</p>
                  <p className="text-caption line-clamp-1">
                    {task.assignedTo?.about ? `${task.assignedTo.about.firstName} ${task.assignedTo.about.lastName} · ` : ""}{task.deadline ? new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No deadline"} · {PRIORITY_LABELS[task.priority] ?? task.priority}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-callout" style={{ color: "var(--fg-tertiary)" }}>No pending tasks — you&apos;re all caught up!</p>
        )}
        {pendingTasks.length > 0 && (
          <Link href="/tasks">
            <motion.button type="button" className="mt-4 w-full text-center text-callout font-semibold" style={{ color: "var(--primary)" }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              View All Tasks →
            </motion.button>
          </Link>
        )}
      </motion.section>

    </div>
  );
}



/* ──────────────────────── SELF ASSESSMENT (shared) ──────────────────────── */

function SelfAssessmentSection({ pa }: { pa: PersonalAttendance }) {
  const todayHours = pa.todayMinutes / 60;
  const todayProgress = Math.min(todayHours / 9, 1);
  const CIRCUMFERENCE = 2 * Math.PI * 42;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
      {/* Today Card */}
      <motion.div className="card relative overflow-hidden p-4 sm:p-5 md:col-span-5" variants={fadeInItem} initial="hidden" animate="visible">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-headline" style={{ color: "var(--fg)" }}>Today</h3>
          <motion.span
            className="rounded-full px-3 py-1 text-xs font-bold text-white"
            style={{ background: pa.todayMinutes > 0 ? "var(--teal)" : "var(--rose)" }}
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.4 }}
          >
            {pa.todayMinutes > 0 ? "Present" : "Absent"}
          </motion.span>
        </div>
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex items-center justify-center">
            <svg className="h-36 w-36" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" stroke="var(--border)" strokeWidth="8" fill="transparent" />
              <motion.circle
                cx="50" cy="50" r="42" fill="none" stroke="var(--primary)" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={String(CIRCUMFERENCE)}
                initial={{ strokeDashoffset: CIRCUMFERENCE }}
                animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - todayProgress) }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <motion.span
                className="text-title tabular-nums font-bold" style={{ color: "var(--fg)" }}
                initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1, type: "spring" }}
              >
                {todayHours >= 1 ? todayHours.toFixed(1) : pa.todayMinutes}
              </motion.span>
              <span className="text-caption">{todayHours >= 1 ? "hours" : "minutes"}</span>
            </div>
          </div>
          <div className="flex w-full items-center justify-between border-t border-[var(--border)] pt-3">
            <div className="text-center">
              <span className="text-caption">Sessions</span>
              <p className="text-callout font-bold" style={{ color: "var(--fg)" }}>{pa.todaySessions}</p>
            </div>
            <div className="text-center">
              <span className="text-caption">Remote</span>
              <p className="text-callout font-bold" style={{ color: "var(--fg)" }}>{formatMinutes(pa.remoteMinutes)}</p>
            </div>
            <div className="text-center">
              <span className="text-caption">{pa.isOnTime ? "On time" : "Late by"}</span>
              <p className="text-callout font-bold" style={{ color: pa.isOnTime ? "var(--teal)" : "var(--amber)" }}>
                {pa.isOnTime ? "\u2713" : formatMinutes(pa.lateBy)}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Avg Stats Grid */}
      <div className="flex flex-col gap-3 md:col-span-7">
        <div className="grid grid-cols-2 gap-3">
          <motion.div className="card p-4" variants={slideUpItem} initial="hidden" animate="visible">
            <p className="text-caption mb-1">Avg Hours / Day</p>
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center">
                <svg className="h-10 w-10" viewBox="0 0 40 40">
                  <circle cx="20" cy="20" r="16" stroke="var(--border)" strokeWidth="4" fill="transparent" />
                  <motion.circle cx="20" cy="20" r="16" fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={String(2 * Math.PI * 16)}
                    initial={{ strokeDashoffset: 2 * Math.PI * 16 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 16 * (1 - Math.min(pa.monthlyAvgHours / 9, 1)) }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
                  />
                </svg>
              </div>
              <p className="text-headline tabular-nums font-bold" style={{ color: "var(--fg)" }}>
                {pa.monthlyAvgHours.toFixed(1)} Hours
              </p>
            </div>
          </motion.div>
          <motion.div className="card p-4" variants={slideUpItem} initial="hidden" animate="visible">
            <p className="text-caption mb-1">On-Time Arrivals</p>
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center">
                <svg className="h-10 w-10" viewBox="0 0 40 40">
                  <circle cx="20" cy="20" r="16" stroke="var(--border)" strokeWidth="4" fill="transparent" />
                  <motion.circle cx="20" cy="20" r="16" fill="none" stroke="var(--teal)" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={String(2 * Math.PI * 16)}
                    initial={{ strokeDashoffset: 2 * Math.PI * 16 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 16 * (1 - pa.monthlyOnTimePct / 100) }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
                  />
                </svg>
              </div>
              <p className="text-headline tabular-nums font-bold" style={{ color: "var(--fg)" }}>
                {pa.monthlyOnTimePct}%
              </p>
            </div>
          </motion.div>
          <motion.div className="card flex items-center gap-3 p-4" variants={slideUpItem} initial="hidden" animate="visible">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--primary-light)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </div>
            <div>
              <p className="text-caption">Avg Check-in</p>
              <p className="text-callout font-bold tabular-nums" style={{ color: "var(--fg)" }}>{pa.avgInTime || "\u2014"}</p>
            </div>
          </motion.div>
          <motion.div className="card flex items-center gap-3 p-4" variants={slideUpItem} initial="hidden" animate="visible">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(255,159,10,0.12)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "scaleX(-1)" }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </div>
            <div>
              <p className="text-caption">Avg Check-out</p>
              <p className="text-callout font-bold tabular-nums" style={{ color: "var(--fg)" }}>{pa.avgOutTime || "\u2014"}</p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

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

  const statItems = [
    { title: isManager ? "Department" : "My Team", value: totalEmp, icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg> },
    { title: "Present Today", value: presentToday, icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
    { title: "On-Time Rate", value: onTimePct, icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
  ];

  const pa = personalAttendance;
  const myTodayHours = pa ? pa.todayMinutes / 60 : 0;

  const CAMPAIGN_STATUS_COLORS: Record<string, string> = { active: "var(--teal)", paused: "var(--amber)", completed: "var(--primary)", cancelled: "var(--rose)" };

  return (
    <div className="flex flex-col gap-4">
      {/* Header: Greeting + Own Stats — glass blended */}
      <motion.header
        className="card-xl relative overflow-hidden p-4 sm:p-5"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-[0.07]" style={{ background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)" }} aria-hidden />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full opacity-[0.05]" style={{ background: "radial-gradient(circle, var(--teal) 0%, transparent 70%)" }} aria-hidden />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <motion.div className="min-w-0 flex-1" variants={slideFromLeft} initial="hidden" animate="visible">
            <div className="flex items-center gap-2 mb-0.5">
              <LivePulse />
            </div>
            <h1 className="text-title">
              <span className="gradient-text">{getGreeting()}</span>
              <span style={{ color: "var(--fg)" }}>, {user.firstName}!</span>
            </h1>
            <p className="text-subhead mt-0.5">
              {pendingTasks.length} task{pendingTasks.length !== 1 ? "s" : ""} pending
            </p>
          </motion.div>
          {pa && (
            <motion.div className="flex shrink-0 flex-wrap items-center gap-2" variants={slideFromRight} initial="hidden" animate="visible">
              <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "color-mix(in srgb, var(--glass-bg-heavy) 60%, transparent)", border: "0.5px solid var(--glass-border)" }}>
                <svg className="h-4 w-4 shrink-0" style={{ color: "var(--primary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                <span className="text-callout font-bold tabular-nums" style={{ color: "var(--fg)" }}>{myTodayHours >= 1 ? myTodayHours.toFixed(1) + "h" : pa.todayMinutes + "m"}</span>
                <span className="text-caption">today</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-xl px-3 py-2" style={{ background: "color-mix(in srgb, var(--glass-bg-heavy) 60%, transparent)", border: "0.5px solid var(--glass-border)" }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: pa.isOnTime ? "var(--teal)" : "var(--amber)" }} />
                <span className="text-callout font-semibold" style={{ color: pa.isOnTime ? "var(--teal)" : "var(--amber)" }}>{pa.isOnTime ? "On time" : formatMinutes(pa.lateBy) + " late"}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-xl px-3 py-2" style={{ background: "color-mix(in srgb, var(--glass-bg-heavy) 60%, transparent)", border: "0.5px solid var(--glass-border)" }}>
                <span className="text-callout font-bold tabular-nums" style={{ color: "var(--fg)" }}>{pa.todaySessions}</span>
                <span className="text-caption">{pa.todaySessions === 1 ? "session" : "sessions"}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-xl px-3 py-2" style={{ background: "color-mix(in srgb, var(--glass-bg-heavy) 60%, transparent)", border: "0.5px solid var(--glass-border)" }}>
                <span className="text-callout font-bold tabular-nums" style={{ color: "var(--fg)" }}>{pa.monthlyAvgHours.toFixed(1)}h</span>
                <span className="text-caption">avg/day</span>
              </div>
            </motion.div>
          )}
        </div>
      </motion.header>

      {/* 3 KPI Team Stat Cards */}
      <motion.div className="grid grid-cols-3 gap-3" variants={staggerContainerFast} initial="hidden" animate="visible">
        {statItems.map((stat, i) => (
          <motion.div key={stat.title} className="card group relative overflow-hidden p-3 sm:p-4" custom={i} variants={cardVariants} initial="hidden" animate="visible">
            <div className="pointer-events-none absolute -right-1 -top-1 h-20 w-20 rounded-bl-[50px] opacity-10 transition-opacity group-hover:opacity-[0.15]" style={{ background: blobGradients[i % blobGradients.length] }} />
            <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white mb-1.5" style={{ background: statIconGradients[i] }}>
              {stat.icon}
            </div>
            <p className="text-caption">{stat.title}</p>
            <p className="text-[20px] sm:text-[24px] font-semibold tabular-nums" style={{ color: "var(--fg)" }}>
              <AnimatedNumber value={stat.value} />{stat.title === "On-Time Rate" ? "%" : ""}
            </p>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Team Breakdown (manager sees all teams, team lead sees own) ── */}
      {teamBreakdown.length > 0 && (
        <motion.section className="card relative overflow-hidden" variants={slideUpItem} initial="hidden" animate="visible">
          <div className="flex items-center justify-between border-b p-4 sm:p-5" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5" style={{ color: "var(--primary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              <h2 className="text-headline" style={{ color: "var(--fg)" }}>{isManager ? "Teams in Department" : "My Teams"}</h2>
              <span className="text-caption ml-1">{teamBreakdown.length} team{teamBreakdown.length !== 1 ? "s" : ""}</span>
            </div>
            {selectedTeamId && (
              <motion.button type="button" onClick={() => setSelectedTeamId(null)} className="text-xs font-semibold rounded-lg px-2.5 py-1" style={{ color: "var(--primary)", background: "var(--primary-light)" }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                Show All
              </motion.button>
            )}
          </div>
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {teamBreakdown.map((tb, i) => {
                const isSelected = selectedTeamId === tb.team._id;
                const leadName = tb.team.lead ? `${tb.team.lead.about.firstName} ${tb.team.lead.about.lastName}` : null;
                const leadGrad = tb.team.lead ? AVATAR_GRADIENTS[tb.team.lead._id.charCodeAt(0) % AVATAR_GRADIENTS.length] : AVATAR_GRADIENTS[0];
                return (
                  <motion.button
                    key={tb.team._id}
                    type="button"
                    onClick={() => setSelectedTeamId(isSelected ? null : tb.team._id)}
                    custom={i}
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    whileHover={cardHover}
                    className={`card-static relative flex flex-col gap-3 rounded-2xl p-4 text-left transition-all ${isSelected ? "ring-2" : ""}`}
                    style={isSelected ? { boxShadow: "0 0 0 2px var(--primary), var(--glass-shadow)" } : undefined}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white ${AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]}`}>
                        {tb.team.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-callout font-semibold truncate" style={{ color: "var(--fg)" }}>{tb.team.name}</p>
                        {leadName && (
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[8px] font-semibold text-white ${leadGrad}`}>
                              {initials(tb.team.lead!.about.firstName, tb.team.lead!.about.lastName)}
                            </div>
                            <span className="text-caption truncate">{leadName}</span>
                            <span className="text-[10px] rounded px-1 py-px font-medium" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>Lead</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ background: "var(--teal)" }} />
                        <span className="text-[11px] tabular-nums font-semibold" style={{ color: "var(--teal)" }}>{tb.present}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ background: "var(--rose)" }} />
                        <span className="text-[11px] tabular-nums font-semibold" style={{ color: "var(--rose)" }}>{tb.absent}</span>
                      </div>
                      {tb.late > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full" style={{ background: "var(--amber)" }} />
                          <span className="text-[11px] tabular-nums font-semibold" style={{ color: "var(--amber)" }}>{tb.late}</span>
                        </div>
                      )}
                      <span className="ml-auto text-[11px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{tb.members.length} member{tb.members.length !== 1 ? "s" : ""}</span>
                    </div>
                    {tb.totalMins > 0 && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                        <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, var(--teal), var(--primary))" }} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (tb.present / Math.max(tb.members.length, 1)) * 100)}%` }} transition={{ duration: 0.6, delay: 0.05 * i }} />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {tb.members.slice(0, 6).map((m) => (
                        <div key={m._id} className="flex items-center gap-1 rounded-full px-1.5 py-0.5" style={{ background: "var(--glass-bg)" }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[m.status] ?? STATUS_COLORS.absent }} />
                          <span className="text-[10px] truncate max-w-[60px]" style={{ color: "var(--fg-secondary)" }}>{m.firstName}</span>
                        </div>
                      ))}
                      {tb.members.length > 6 && (
                        <span className="text-[10px] rounded-full px-1.5 py-0.5" style={{ background: "var(--glass-bg)", color: "var(--fg-tertiary)" }}>+{tb.members.length - 6}</span>
                      )}
                    </div>
                  </motion.button>
                );
              })}
              {unassignedMembers.length > 0 && isManager && (
                <motion.div custom={teamBreakdown.length} variants={cardVariants} initial="hidden" animate="visible" className="card-static flex flex-col gap-3 rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold" style={{ background: "var(--glass-bg-heavy)", color: "var(--fg-tertiary)" }}>?</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>Unassigned</p>
                      <p className="text-caption mt-0.5">No team assigned</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{unassignedMembers.length} member{unassignedMembers.length !== 1 ? "s" : ""}</span>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </motion.section>
      )}

      {/* Live Presence with filter toggles + team filter + fixed height scroll */}
      <motion.section className="card relative overflow-hidden" variants={slideUpItem} initial="hidden" animate="visible">
        <div className="flex flex-col gap-3 border-b p-4 sm:p-5" style={{ borderColor: "var(--border)" }}>
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
              <div className="relative flex flex-wrap gap-1 rounded-xl p-1" style={{ background: "var(--glass-bg)" }}>
                {PRESENCE_FILTER_ORDER.map((f) => {
                  const active = presenceFilter === f;
                  return (
                    <button key={f} type="button" onClick={() => setPresenceFilter(f)} className="relative z-10 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors" style={{ color: active ? "var(--fg)" : "var(--fg-secondary)" }}>
                      {active && <motion.span layoutId="mgr-presence-active" className="absolute inset-0 rounded-lg" style={{ background: "var(--glass-bg-heavy)", border: "0.5px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }} transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
                      <span className="relative">{PRESENCE_FILTER_LABELS[f]}</span>
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-4 sm:p-5">
          {presenceLoading ? (
            <PresenceGridShimmer />
          ) : filteredPresence.length > 0 ? (
            <motion.div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" variants={staggerContainerFast} initial="hidden" animate="visible">
              {filteredPresence.map((emp, idx) => (
                <EmployeePresenceCard key={emp._id} emp={emp} idx={idx} />
              ))}
            </motion.div>
          ) : (
            <p className="py-8 text-center text-callout" style={{ color: "var(--fg-tertiary)" }}>No members match this filter</p>
          )}
        </div>
      </motion.section>

      {/* Late Arrivals + Attendance Trend */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <motion.section className="card p-4 sm:p-5" variants={fadeInItem} initial="hidden" animate="visible">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-headline" style={{ color: "var(--fg)" }}>Late Arrivals</h3>
              <p className="text-caption mt-0.5">Today&apos;s team</p>
            </div>
            <span className="badge badge-late">{lateArrivals.length} total</span>
          </div>
          {lateArrivals.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {lateArrivals.slice(0, 5).map((emp, i) => (
                <motion.li key={emp._id} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 * i }} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--glass-bg)" }}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(255,159,10,0.15)" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="var(--amber)" /></svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-callout font-semibold truncate" style={{ color: "var(--fg)" }}>{emp.firstName} {emp.lastName}</p>
                    <p className="text-caption">{emp.lateBy > 0 ? `Late by ${formatMinutes(emp.lateBy)}` : "Late today"}</p>
                  </div>
                  {emp.lateBy > 0 && (
                    <span className="text-footnote tabular-nums font-bold" style={{ color: "var(--amber)" }}>+{formatMinutes(emp.lateBy)}</span>
                  )}
                </motion.li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-callout" style={{ color: "var(--fg-tertiary)" }}>No late arrivals today</p>
          )}
        </motion.section>

        <motion.section className="card p-4 sm:p-5" variants={fadeInItem} initial="hidden" animate="visible">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-headline" style={{ color: "var(--fg)" }}>Team Attendance</h3>
              <p className="text-caption mt-0.5">Last 5 working days</p>
            </div>
            <span className="badge badge-office">Trend</span>
          </div>
          {attendanceTrend.length > 0 ? (
            <div className="flex h-36 items-end justify-between gap-2 px-1">
              {attendanceTrend.map((d, i) => (
                <div key={d.date} className="flex min-h-0 flex-1 flex-col items-center gap-2">
                  <div className="relative flex h-28 w-full items-end justify-center">
                    <motion.div
                      className="w-[55%] max-w-[40px] rounded-t-lg"
                      style={{ background: "linear-gradient(180deg, var(--primary), var(--cyan))" }}
                      initial={{ height: "0%" }}
                      animate={{ height: `${(d.count / trendMax) * 100}%` }}
                      transition={{ duration: 0.65, delay: 0.08 * i, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                  <span className="text-caption font-medium" style={{ color: "var(--fg-secondary)" }}>{d.label}</span>
                  <span className="text-footnote tabular-nums font-semibold" style={{ color: "var(--fg)" }}>{d.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-callout" style={{ color: "var(--fg-tertiary)" }}>No trend data yet</p>
          )}
        </motion.section>
      </div>

      {/* Task Breakdown + Office vs Remote */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <motion.section className="card p-4 sm:p-5" variants={fadeInItem} initial="hidden" animate="visible">
          <h3 className="text-headline mb-3" style={{ color: "var(--fg)" }}>Task Status</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total", value: tasks.length, color: "var(--fg)" },
              { label: "Pending", value: pendingTasks.length, color: "var(--amber)" },
              { label: "In Progress", value: inProgressTasks.length, color: "var(--primary)" },
              { label: "Completed", value: completedTasks.length, color: "var(--teal)" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl p-3" style={{ background: "var(--glass-bg)" }}>
                <p className="text-caption">{item.label}</p>
                <p className="text-headline tabular-nums font-bold mt-1" style={{ color: item.color }}>
                  <AnimatedNumber value={item.value} />
                </p>
              </div>
            ))}
          </div>
          {tasks.length > 0 && (
            <div className="mt-3">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                {completedTasks.length > 0 && (
                  <motion.div className="h-full" style={{ background: "var(--teal)" }} initial={{ width: 0 }} animate={{ width: `${(completedTasks.length / tasks.length) * 100}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
                )}
                {inProgressTasks.length > 0 && (
                  <motion.div className="h-full" style={{ background: "var(--primary)" }} initial={{ width: 0 }} animate={{ width: `${(inProgressTasks.length / tasks.length) * 100}%` }} transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }} />
                )}
                {pendingTasks.length > 0 && (
                  <motion.div className="h-full" style={{ background: "var(--amber)" }} initial={{ width: 0 }} animate={{ width: `${(pendingTasks.length / tasks.length) * 100}%` }} transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }} />
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-3 text-caption" style={{ color: "var(--fg-tertiary)" }}>
                <span style={{ color: "var(--teal)" }}>{Math.round((completedTasks.length / tasks.length) * 100)}% done</span>
                <span style={{ color: "var(--primary)" }}>{Math.round((inProgressTasks.length / tasks.length) * 100)}% active</span>
                <span style={{ color: "var(--amber)" }}>{Math.round((pendingTasks.length / tasks.length) * 100)}% pending</span>
              </div>
            </div>
          )}
        </motion.section>

        <motion.section className="card p-4 sm:p-5" variants={fadeInItem} initial="hidden" animate="visible">
          <h3 className="text-headline mb-3" style={{ color: "var(--fg)" }}>Office vs Remote</h3>
          <div className="flex items-center gap-4">
            <div className="relative flex shrink-0 items-center justify-center">
              <svg className="h-28 w-28" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" stroke="var(--border)" strokeWidth="10" fill="transparent" />
                {totalOnline > 0 && (
                  <>
                    <motion.circle cx="50" cy="50" r="38" fill="none" stroke="var(--teal)" strokeWidth="10" strokeLinecap="round"
                      strokeDasharray={`${(officeCount / totalOnline) * 2 * Math.PI * 38} ${2 * Math.PI * 38}`}
                      initial={{ strokeDashoffset: 2 * Math.PI * 38 }} animate={{ strokeDashoffset: 0 }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
                    />
                    <motion.circle cx="50" cy="50" r="38" fill="none" stroke="var(--primary)" strokeWidth="10" strokeLinecap="round"
                      strokeDasharray={`${(remoteCount / totalOnline) * 2 * Math.PI * 38} ${2 * Math.PI * 38}`}
                      initial={{ strokeDashoffset: 2 * Math.PI * 38 }} animate={{ strokeDashoffset: -(officeCount / totalOnline) * 2 * Math.PI * 38 }}
                      transition={{ duration: 1, delay: 0.1, ease: "easeOut" }}
                      style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
                    />
                  </>
                )}
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-headline tabular-nums font-bold" style={{ color: "var(--fg)" }}>{totalOnline}</span>
                <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>online</span>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: "var(--teal)" }} />
                <span className="text-callout flex-1" style={{ color: "var(--fg)" }}>Office</span>
                <span className="text-headline tabular-nums font-bold" style={{ color: "var(--fg)" }}>{officeCount}</span>
                <span className="text-caption tabular-nums w-10 text-right">{totalOnline > 0 ? Math.round((officeCount / totalOnline) * 100) : 0}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: "var(--primary)" }} />
                <span className="text-callout flex-1" style={{ color: "var(--fg)" }}>Remote</span>
                <span className="text-headline tabular-nums font-bold" style={{ color: "var(--fg)" }}>{remoteCount}</span>
                <span className="text-caption tabular-nums w-10 text-right">{totalOnline > 0 ? Math.round((remoteCount / totalOnline) * 100) : 0}%</span>
              </div>
              <div className="flex items-center gap-2 border-t border-[var(--border)] pt-2">
                <span className="h-3 w-3 rounded-full" style={{ background: "var(--rose)" }} />
                <span className="text-callout flex-1" style={{ color: "var(--fg)" }}>Absent</span>
                <span className="text-headline tabular-nums font-bold" style={{ color: "var(--fg)" }}>{counts.absent}</span>
                <span className="text-caption tabular-nums w-10 text-right">{totalEmp > 0 ? Math.round((counts.absent / totalEmp) * 100) : 0}%</span>
              </div>
            </div>
          </div>
        </motion.section>
      </div>

      {/* Top Workers + Active Campaigns */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <motion.section className="card p-4 sm:p-5" variants={fadeInItem} initial="hidden" animate="visible">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-headline" style={{ color: "var(--fg)" }}>Top Workers</h3>
              <p className="text-caption mt-0.5">Most hours logged today</p>
            </div>
            <svg className="h-5 w-5" style={{ color: "var(--amber)" }} fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z" /></svg>
          </div>
          {topWorkers.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {topWorkers.map((emp, i) => {
                const maxMins = topWorkers[0].todayMinutes || 1;
                return (
                  <motion.li key={emp._id} initial={{ x: -12, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.08 * i }} className="flex items-center gap-3">
                    <span className="text-caption w-5 text-center font-bold" style={{ color: i < 3 ? "var(--amber)" : "var(--fg-tertiary)" }}>
                      {i === 0 ? "\ud83e\udd47" : i === 1 ? "\ud83e\udd48" : i === 2 ? "\ud83e\udd49" : `${i + 1}`}
                    </span>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white ${AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]}`}>
                      {initials(emp.firstName, emp.lastName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-callout font-semibold truncate" style={{ color: "var(--fg)" }}>{emp.firstName} {emp.lastName}</p>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                        <motion.div className="h-full rounded-full" style={{ background: i === 0 ? "var(--amber)" : "var(--primary)" }} initial={{ width: 0 }} animate={{ width: `${(emp.todayMinutes / maxMins) * 100}%` }} transition={{ duration: 0.6, delay: 0.1 * i }} />
                      </div>
                    </div>
                    <span className="text-callout tabular-nums font-bold" style={{ color: "var(--fg)" }}>{formatMinutes(emp.todayMinutes)}</span>
                  </motion.li>
                );
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-callout" style={{ color: "var(--fg-tertiary)" }}>No activity yet today</p>
          )}
        </motion.section>

        <motion.section className="card p-4 sm:p-5" variants={fadeInItem} initial="hidden" animate="visible">
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
                  <motion.li key={camp._id} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.08 * ci }} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--glass-bg)" }}>
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
                        {tagCount > 4 && <span className="text-[10px] rounded-md px-1.5 py-0.5" style={{ background: "var(--glass-bg)", color: "var(--fg-tertiary)" }}>+{tagCount - 4}</span>}
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

      {/* Attendance Overview + Checklist (same row) */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <motion.section className="card p-3 sm:p-4" variants={slideUpItem} initial="hidden" animate="visible">
        <h2 className="text-headline mb-3" style={{ color: "var(--fg)" }}>Attendance Overview</h2>
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1 space-y-2.5">
            {STATUS_ORDER.map((status) => {
              const pct = totalEmp > 0 ? Math.round((counts[status] / totalEmp) * 100) : 0;
              return (
                <div key={status} className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
                  <span className="text-callout flex-1 truncate" style={{ color: "var(--fg)" }}>{STATUS_LABELS[status]}</span>
                  <span className="text-headline tabular-nums font-semibold" style={{ color: "var(--fg)" }}>{counts[status]}</span>
                  <span className="w-9 text-right text-caption tabular-nums">{pct}%</span>
                </div>
              );
            })}
            <div className="flex items-center gap-2.5 border-t border-[var(--border)] pt-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--fg-tertiary)" }} />
              <span className="text-callout flex-1 font-medium" style={{ color: "var(--fg)" }}>Total</span>
              <span className="text-headline tabular-nums font-semibold" style={{ color: "var(--fg)" }}>{totalEmp}</span>
              <span className="w-9 text-right text-caption tabular-nums">100%</span>
            </div>
          </div>
          <AttendanceDonut counts={counts} total={totalEmp} />
        </div>
      </motion.section>

      <motion.section className="card p-4 sm:p-5" variants={slideUpItem} initial="hidden" animate="visible">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-headline" style={{ color: "var(--fg)" }}>Checklist</h2>
          {pendingTasks.length > 0 && (
            <span className="notif-badge-pulse rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: "var(--rose)" }}>
              {pendingTasks.length} Pending
            </span>
          )}
        </div>
        {pendingTasks.length > 0 ? (
          <div className="flex flex-col gap-3">
            {pendingTasks.slice(0, 5).map((task, ti) => (
              <motion.div key={task._id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 + ti * 0.1 }} whileHover={{ x: 5 }} className="flex cursor-pointer items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)"} 15%, transparent)` }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                  <p className="text-callout font-semibold line-clamp-1" style={{ color: "var(--fg)" }}>{task.title}</p>
                  <p className="text-caption line-clamp-1">
                    {task.assignedTo?.about ? `${task.assignedTo.about.firstName} ${task.assignedTo.about.lastName} \u00b7 ` : ""}{task.deadline ? new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No deadline"} \u00b7 {PRIORITY_LABELS[task.priority] ?? task.priority}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-callout" style={{ color: "var(--fg-tertiary)" }}>No pending tasks — you&apos;re all caught up!</p>
        )}
        {pendingTasks.length > 0 && (
          <Link href="/tasks">
            <motion.button type="button" className="mt-4 w-full text-center text-callout font-semibold" style={{ color: "var(--primary)" }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              View All Tasks →
            </motion.button>
          </Link>
        )}
      </motion.section>
      </div>
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
  const avatarGrad = AVATAR_GRADIENTS[user.id.charCodeAt(0) % AVATAR_GRADIENTS.length];
  const shiftTarget = userProfile?.workShift ? (() => { const [sh, sm] = userProfile.workShift!.start.split(":").map(Number); const [eh, em] = userProfile.workShift!.end.split(":").map(Number); return Math.max(eh * 60 + em - (sh * 60 + sm) - (userProfile.workShift!.breakTime ?? 60), 1); })() : 480;
  const shiftPct = pa ? Math.min(100, Math.round((pa.todayMinutes / shiftTarget) * 100)) : 0;
  const officePct = pa && (pa.officeMinutes + pa.remoteMinutes > 0) ? Math.round((pa.officeMinutes / (pa.officeMinutes + pa.remoteMinutes)) * 100) : 0;
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
    <motion.div className="flex flex-col gap-4" variants={staggerContainer} initial="hidden" animate="visible">
      {/* Header */}
      <motion.div
        className="card-xl relative overflow-hidden p-4 sm:p-5"
        variants={slideUpItem}
      >
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-[0.07]" style={{ background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)" }} aria-hidden />
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-caption">Single Solution Sync</p>
          <LivePulse />
        </div>
        <h1 className="text-title">
          <span className="gradient-text">{getGreeting()}</span>
          <span style={{ color: "var(--fg)" }}>, {profileName}!</span>
        </h1>
        <p className="text-subhead mt-1">{designation} · {pendingTasks.length} task{pendingTasks.length !== 1 ? "s" : ""} pending</p>
      </motion.div>

      {/* ── Profile Card + Today's Activity (2-col) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="card p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            <div className="flex flex-col items-center gap-3 sm:items-start">
              <div className="relative rounded-full" style={{ boxShadow: `0 0 0 3px ${statusColor}` }}>
                {userProfile?.profileImage ? (
                  <img src={userProfile.profileImage} alt="" className="h-24 w-24 rounded-full object-cover shadow-lg sm:h-28 sm:w-28" />
                ) : (
                  <div className={`flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br text-2xl font-semibold text-white shadow-lg sm:h-28 sm:w-28 sm:text-3xl ${avatarGrad}`}>{initials(profileName, profileLast)}</div>
                )}
              </div>
              <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: `${statusColor}1a`, color: statusColor }}>{statusLabel}</span>
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <h2 className="text-headline" style={{ color: "var(--fg)" }}>{profileName} {profileLast}</h2>
                <p className="text-subhead">{designation}</p>
                {dept && <p className="text-caption mt-0.5">{dept}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="card-static rounded-xl p-3"><p className="text-caption">First entry</p><p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{pa?.firstEntry ?? "—"}</p></div>
                <div className="card-static rounded-xl p-3"><p className="text-caption">Hours logged</p><p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{pa ? (todayHours >= 1 ? todayHours.toFixed(1) + "h" : pa.todayMinutes + "m") : "—"}</p></div>
                <div className="card-static col-span-2 rounded-xl p-3 sm:col-span-1"><p className="text-caption">Office / Remote</p><p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{pa ? `${formatMinutes(pa.officeMinutes)} / ${formatMinutes(pa.remoteMinutes)}` : "—"}</p>{pa && <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-tertiary)" }}>{officePct}% office</p>}</div>
              </div>
              {pa && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><span className="text-[11px]" style={{ color: "var(--fg-secondary)" }}>Shift progress</span><span className="text-[11px] tabular-nums" style={{ color: "var(--fg-secondary)" }}>{pa.todayMinutes} / {shiftTarget} min ({shiftPct}%)</span></div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                    <motion.div className="h-full rounded-full" style={{ background: "var(--primary)" }} initial={{ width: 0 }} animate={{ width: `${shiftPct}%` }} transition={{ duration: 1.2, ease: "easeOut" }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.section>

        {/* Today's Activity Timeline */}
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05 }} className="card-static flex flex-col p-5 sm:p-6">
          <h3 className="text-section-header mb-4">Today&apos;s Activity</h3>
          <ul className="relative flex flex-col gap-0 pl-4">
            <span className="absolute bottom-1 left-[7px] top-1 w-px" style={{ background: "var(--border-strong)" }} aria-hidden />
            {timelineEvents.map((ev, i) => (
              <motion.li key={ev.key} initial={{ x: -12, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 + i * 0.12 }} className="relative flex gap-3 pb-5 last:pb-0">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ev.dot, boxShadow: "0 0 0 2px var(--bg)" }} />
                <div className="min-w-0 flex-1">
                  <span className="text-caption tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{ev.time}</span>
                  <p className="text-callout mt-0.5" style={{ color: "var(--fg)" }}>{ev.label}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </motion.section>
      </div>

      {/* ── Task Stat Cards ── */}
      <motion.div className="grid grid-cols-2 gap-3 lg:grid-cols-4" variants={staggerContainerFast} initial="hidden" animate="visible">
        {[
          { title: "Total Tasks", value: tasks.length, caption: "All assigned", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> },
          { title: "Pending", value: pendingTasks.length, caption: "Not started", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
          { title: "In Progress", value: inProgressTasks.length, caption: "Working on", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
          { title: "Completed", value: completedTasks.length, caption: "Done", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
        ].map((stat, i) => (
          <motion.div key={stat.title} className="card group relative overflow-hidden p-4" custom={i} variants={cardVariants} initial="hidden" animate="visible">
            <div className="pointer-events-none absolute -right-1 -top-1 h-20 w-20 rounded-bl-[50px] opacity-10 transition-opacity group-hover:opacity-[0.15]" style={{ background: blobGradients[i] }} />
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-white mb-2" style={{ background: statIconGradients[i] }}>{stat.icon}</div>
            <p className="text-subhead">{stat.title}</p>
            <p className="text-[22px] sm:text-[26px] font-semibold tabular-nums mt-0.5" style={{ color: "var(--fg)" }}><AnimatedNumber value={stat.value} /></p>
            <p className="text-caption mt-0.5">{stat.caption}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Weekly Overview (scrollable cards) ── */}
      {weeklyRecords.length > 0 && (
        <motion.section variants={fadeInItem} initial="hidden" animate="visible">
          <h3 className="text-section-header mb-3">Weekly overview</h3>
          <div className="scrollbar-hide -mx-1 flex gap-3 overflow-x-auto pb-2 pt-1 px-1">
            {weeklyRecords.map((day, i) => {
              const d = new Date(day.date + "T12:00:00");
              const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
              const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              const isToday = day.date === new Date().toISOString().slice(0, 10);
              const dotColor = !day.isPresent ? STATUS_COLORS.absent : !day.isOnTime ? STATUS_COLORS.late : STATUS_COLORS.office;
              return (
                <motion.div key={day.date} custom={i} variants={cardVariants} initial="hidden" animate="visible" whileHover={cardHover} className={`card-static flex min-w-[112px] shrink-0 flex-col gap-2 rounded-2xl p-4 ${isToday ? "ring-2" : ""}`} style={isToday ? { boxShadow: "0 0 0 2px var(--primary), var(--glass-shadow)" } : undefined}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold" style={{ color: "var(--fg-secondary)" }}>{dayName}</span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                  </div>
                  <span className="text-caption" style={{ color: "var(--fg-tertiary)" }}>{dateLabel}</span>
                  <span className="text-headline tabular-nums" style={{ color: "var(--fg)" }}>{formatMinutes(day.totalMinutes)}</span>
                </motion.div>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* ── Monthly Summary ── */}
      {ms && (
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="card-static p-5 sm:p-6">
          <h3 className="text-section-header mb-4">Monthly summary</h3>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="card-static rounded-xl p-4">
              <p className="text-caption">Present / Total</p>
              <p className="text-title mt-1" style={{ color: "var(--fg)" }}><AnimatedNumber value={ms.presentDays} /><span style={{ color: "var(--fg-tertiary)" }}> / </span><AnimatedNumber value={ms.totalWorkingDays} /><span className="text-subhead"> days</span></p>
            </div>
            <div className="card-static rounded-xl p-4">
              <p className="text-caption">On-time</p>
              <p className="text-title mt-1 gradient-text"><AnimatedNumber value={ms.onTimePercentage} />%</p>
            </div>
            <div className="card-static rounded-xl p-4">
              <p className="text-caption">Avg. daily hours</p>
              <p className="text-title mt-1" style={{ color: "var(--fg)" }}><AnimatedNumber value={ms.averageDailyHours} />h</p>
            </div>
            <div className="card-static rounded-xl p-4">
              <p className="text-caption">Total hours</p>
              <p className="text-title mt-1" style={{ color: "var(--fg)" }}><AnimatedNumber value={ms.totalWorkingHours} />h</p>
            </div>
          </div>
          {(ms.totalOfficeHours + ms.totalRemoteHours > 0) && (
            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between"><span className="text-[11px]" style={{ color: "var(--fg-secondary)" }}>Office vs remote (hours)</span><span className="text-caption tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{ms.totalOfficeHours.toFixed(0)}h · {ms.totalRemoteHours.toFixed(0)}h</span></div>
              <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                <motion.div className="h-full" style={{ background: "var(--teal)" }} initial={{ width: 0 }} animate={{ width: `${monthlyOfficePct}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
                <motion.div className="h-full" style={{ background: "var(--primary)" }} initial={{ width: 0 }} animate={{ width: `${monthlyRemotePct}%` }} transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} />
              </div>
              <div className="flex justify-between text-caption" style={{ color: "var(--fg-tertiary)" }}><span>Office {monthlyOfficePct.toFixed(0)}%</span><span>Remote {monthlyRemotePct.toFixed(0)}%</span></div>
            </div>
          )}
        </motion.section>
      )}

      {/* ── Self Assessment (Today donut + monthly stats grid) ── */}
      {pa && <SelfAssessmentSection pa={pa} />}

      {/* ── Checklist ── */}
      <motion.section className="card p-4 sm:p-5" variants={fadeInItem} initial="hidden" animate="visible">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-headline" style={{ color: "var(--fg)" }}>Checklist</h2>
          {pendingTasks.length > 0 && (
            <span className="notif-badge-pulse rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: "var(--rose)" }}>
              {pendingTasks.length} Pending
            </span>
          )}
        </div>
        {pendingTasks.length > 0 ? (
          <div className="flex flex-col gap-3">
            {pendingTasks.slice(0, 5).map((task, ti) => (
              <motion.div key={task._id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 + ti * 0.1 }} whileHover={{ x: 5 }} className="flex cursor-pointer items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)"} 15%, transparent)` }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    {task.priority === "urgent" ? (<><path d="M12 2v10l4 2" /><circle cx="12" cy="12" r="10" /></>) : task.priority === "high" ? (<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />) : (<><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>)}
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-callout font-semibold line-clamp-1" style={{ color: "var(--fg)" }}>{task.title}</p>
                  <p className="text-caption line-clamp-1">{task.assignedTo?.about ? `${task.assignedTo.about.firstName} ${task.assignedTo.about.lastName} · ` : ""}{task.deadline ? new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No deadline"} · {PRIORITY_LABELS[task.priority] ?? task.priority}</p>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-callout" style={{ color: "var(--fg-tertiary)" }}>No pending tasks — you&apos;re all caught up!</p>
        )}
        {pendingTasks.length > 0 && (
          <Link href="/tasks">
            <motion.button type="button" className="mt-4 w-full text-center text-callout font-semibold" style={{ color: "var(--primary)" }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>View All Tasks →</motion.button>
          </Link>
        )}
      </motion.section>
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
