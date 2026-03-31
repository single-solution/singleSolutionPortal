"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  buttonHover,
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
  workShift?: {
    type: string;
    shift: { start: string; end: string };
    workingDays: string[];
    breakTime: number;
  };
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
  isActive: boolean;
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

function AnimatedNumber({ value, prefix = "" }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 800;
    const start = Date.now();
    const step = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
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

function EmployeePresenceCard({ emp, idx, reduceMotion }: { emp: PresenceEmployee; idx: number; reduceMotion: boolean }) {
  return (
    <motion.div custom={idx} variants={cardVariants} initial="hidden" animate="visible" whileHover={cardHover} className="card-static card-shine group flex flex-col gap-3 rounded-[var(--radius)] p-3">
      <div className="flex items-start gap-3">
        <motion.div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white ${AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length]}`}
          animate={reduceMotion ? undefined : { boxShadow: [`0 0 0 2px ${STATUS_COLORS[emp.status]}`, `0 0 0 3px ${STATUS_COLORS[emp.status]}`, `0 0 0 2px ${STATUS_COLORS[emp.status]}`] }}
          style={reduceMotion ? { boxShadow: `0 0 0 2px ${STATUS_COLORS[emp.status]}` } : undefined}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          {initials(emp.firstName, emp.lastName)}
        </motion.div>
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

function SuperAdminOverview({
  user,
  presenceEmps,
  tasks,
  departments,
  employees,
}: {
  user: User;
  presenceEmps: PresenceEmployee[];
  tasks: ApiTask[];
  departments: ApiDepartment[];
  employees: ApiEmployee[];
}) {
  const reduceMotion = useReducedMotion();
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
      {/* ── Header: Greeting + Actions + Clock ── */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <motion.div className="min-w-0 flex-1" variants={slideFromLeft} initial="hidden" animate="visible">
          <p className="text-caption mb-0.5">Single Solution Sync</p>
          <h1 className="text-title">
            <span className="gradient-text">{getGreeting()}</span>
            <span style={{ color: "var(--fg)" }}>, {user.firstName}!</span>
          </h1>
          <p className="text-subhead mt-1">
            You have {pendingTasks.length} task{pendingTasks.length !== 1 ? "s" : ""} pending
          </p>
        </motion.div>
        <motion.div className="flex shrink-0 items-center gap-3" variants={slideFromRight} initial="hidden" animate="visible">
          <div className="card group relative overflow-hidden p-3 sm:min-w-[180px]">
            <div className="pointer-events-none absolute -right-2 -top-2 h-16 w-16 rounded-bl-[50px] opacity-10 transition-opacity group-hover:opacity-15" style={{ background: blobGradients[0] }} />
            <p className="text-caption mb-0.5">Local time</p>
            <AnimatePresence mode="wait">
              <motion.div key={timeKey} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
                <span className="text-headline block tabular-nums" style={{ color: "var(--fg)" }}>{formatClock(now)}</span>
                <span className="text-caption">{formatClockDate(now)}</span>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </header>

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
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ backgroundColor: "var(--teal)" }} />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--teal)" }} />
          </span>
          <h2 className="text-headline" style={{ color: "var(--fg)" }}>Live Presence</h2>
        </div>
        {presenceEmps.length > 0 ? (
          <motion.div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" variants={staggerContainerFast} initial="hidden" animate="visible">
            {presenceEmps.map((emp, idx) => (
              <EmployeePresenceCard key={emp._id} emp={emp} idx={idx} reduceMotion={!!reduceMotion} />
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
            <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity }} className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: "var(--rose)" }}>
              {pendingTasks.length} Pending
            </motion.div>
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
                {pa.isOnTime ? "\u2713" : `${pa.lateBy}m`}
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
  tasks,
  personalAttendance,
}: {
  user: User;
  presenceEmps: PresenceEmployee[];
  tasks: ApiTask[];
  personalAttendance: PersonalAttendance | null;
}) {
  const reduceMotion = useReducedMotion();
  const counts = useMemo(() => getStatusCounts(presenceEmps), [presenceEmps]);
  const totalEmp = counts.total;
  const presentToday = totalEmp - counts.absent;
  const onTimePct = totalEmp > 0 ? Math.round(((totalEmp - counts.late - counts.absent) / totalEmp) * 100) : 0;

  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);

  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>("all");
  const filteredPresence = useMemo(
    () => presenceEmps.filter((e) => matchPresenceFilter(e.status, presenceFilter)),
    [presenceEmps, presenceFilter],
  );

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const timeKey = `${now.getHours()}-${now.getMinutes()}`;

  const statItems = [
    { title: "My Team", value: totalEmp, caption: "Active roster", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg> },
    { title: "Present Today", value: presentToday, caption: "Non-absent", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
    { title: "On-Time Rate", value: onTimePct, caption: "Among present", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Header: Greeting + Time Card */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <motion.div className="min-w-0 flex-1" variants={slideFromLeft} initial="hidden" animate="visible">
          <p className="text-caption mb-0.5">Single Solution Sync</p>
          <h1 className="text-title">
            <span className="gradient-text">{getGreeting()}</span>
            <span style={{ color: "var(--fg)" }}>, {user.firstName}!</span>
          </h1>
          <p className="text-subhead mt-1">
            You have {pendingTasks.length} task{pendingTasks.length !== 1 ? "s" : ""} pending
          </p>
        </motion.div>
        <motion.div className="flex shrink-0 items-center gap-3" variants={slideFromRight} initial="hidden" animate="visible">
          <div className="card group relative overflow-hidden p-3 sm:min-w-[180px]">
            <div className="pointer-events-none absolute -right-2 -top-2 h-16 w-16 rounded-bl-[50px] opacity-10 transition-opacity group-hover:opacity-15" style={{ background: blobGradients[0] }} />
            <p className="text-caption mb-0.5">Local time</p>
            <AnimatePresence mode="wait">
              <motion.div key={timeKey} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
                <span className="text-headline block tabular-nums" style={{ color: "var(--fg)" }}>{formatClock(now)}</span>
                <span className="text-caption">{formatClockDate(now)}</span>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </header>

      {/* 3 KPI Stat Cards */}
      <motion.div className="grid grid-cols-3 gap-3" variants={staggerContainerFast} initial="hidden" animate="visible">
        {statItems.map((stat, i) => (
          <motion.div key={stat.title} className="card group relative overflow-hidden p-4" custom={i} variants={cardVariants} initial="hidden" animate="visible">
            <div className="pointer-events-none absolute -right-1 -top-1 h-20 w-20 rounded-bl-[50px] opacity-10 transition-opacity group-hover:opacity-[0.15]" style={{ background: blobGradients[i % blobGradients.length] }} />
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-white mb-2" style={{ background: statIconGradients[i] }}>
              {stat.icon}
            </div>
            <p className="text-subhead">{stat.title}</p>
            <p className="text-[22px] sm:text-[26px] font-semibold tabular-nums mt-0.5" style={{ color: "var(--fg)" }}>
              <AnimatedNumber value={stat.value} />{stat.title === "On-Time Rate" ? "%" : ""}
            </p>
            <p className="text-caption mt-0.5">{stat.caption}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Self Assessment */}
      {personalAttendance && <SelfAssessmentSection pa={personalAttendance} />}

      {/* Live Presence with filter toggles + fixed height scroll */}
      <motion.section className="card relative overflow-hidden" variants={slideUpItem} initial="hidden" animate="visible">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ backgroundColor: "var(--teal)" }} />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--teal)" }} />
            </span>
            <h2 className="text-headline" style={{ color: "var(--fg)" }}>Live Presence</h2>
            <span className="text-caption ml-1">{filteredPresence.length} of {totalEmp}</span>
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
        <div className="max-h-[420px] overflow-y-auto p-4 sm:p-5">
          {filteredPresence.length > 0 ? (
            <motion.div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" variants={staggerContainerFast} initial="hidden" animate="visible">
              {filteredPresence.map((emp, idx) => (
                <EmployeePresenceCard key={emp._id} emp={emp} idx={idx} reduceMotion={!!reduceMotion} />
              ))}
            </motion.div>
          ) : (
            <p className="py-8 text-center text-callout" style={{ color: "var(--fg-tertiary)" }}>No members match this filter</p>
          )}
        </div>
      </motion.section>

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
            <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity }} className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: "var(--rose)" }}>
              {pendingTasks.length} Pending
            </motion.div>
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

function OtherRoleOverview({ user, tasks, personalAttendance }: { user: User; tasks: ApiTask[]; personalAttendance: PersonalAttendance | null }) {
  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);
  const inProgressTasks = useMemo(() => tasks.filter((t) => t.status === "inProgress"), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((t) => t.status === "completed"), [tasks]);
  const roleLabel = ROLE_DESIGNATION[user.role] ?? user.role;

  return (
    <motion.div className="flex flex-col gap-4" variants={staggerContainer} initial="hidden" animate="visible">
      <motion.div variants={slideUpItem}>
        <p className="text-caption mb-0.5">Single Solution Sync</p>
        <h1 className="text-title">
          <span className="gradient-text">{getGreeting()}</span>
          <span style={{ color: "var(--fg)" }}>, {user.firstName}!</span>
        </h1>
        <p className="text-subhead mt-1">{roleLabel} · {pendingTasks.length} task{pendingTasks.length !== 1 ? "s" : ""} pending</p>
      </motion.div>

      <motion.div className="grid grid-cols-2 gap-3 lg:grid-cols-4" variants={staggerContainerFast} initial="hidden" animate="visible">
        {[
          { title: "Total Tasks", value: tasks.length, caption: "All assigned", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> },
          { title: "Pending", value: pendingTasks.length, caption: "Not started", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
          { title: "In Progress", value: inProgressTasks.length, caption: "Working on", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
          { title: "Completed", value: completedTasks.length, caption: "Done", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
        ].map((stat, i) => (
          <motion.div key={stat.title} className="card group relative overflow-hidden p-4" custom={i} variants={cardVariants} initial="hidden" animate="visible">
            <div className="pointer-events-none absolute -right-1 -top-1 h-20 w-20 rounded-bl-[50px] opacity-10 transition-opacity group-hover:opacity-[0.15]" style={{ background: blobGradients[i] }} />
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

      {/* Self Assessment */}
      {personalAttendance && <SelfAssessmentSection pa={personalAttendance} />}

      {/* Checklist */}
      <motion.section className="card p-4 sm:p-5" variants={fadeInItem} initial="hidden" animate="visible">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-headline" style={{ color: "var(--fg)" }}>Checklist</h2>
          {pendingTasks.length > 0 && (
            <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity }} className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: "var(--rose)" }}>
              {pendingTasks.length} Pending
            </motion.div>
          )}
        </div>
        {pendingTasks.length > 0 ? (
          <div className="flex flex-col gap-3">
            {pendingTasks.slice(0, 5).map((task, ti) => (
              <motion.div key={task._id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 + ti * 0.1 }} whileHover={{ x: 5 }} className="flex cursor-pointer items-start gap-3">
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

  useEffect(() => {
    async function load() {
      try {
        const isSuperAdmin = user.role === "superadmin";
        const isAdminRole = isSuperAdmin || user.role === "manager" || user.role === "teamLead";
        const fetches: Promise<unknown>[] = [
          fetch("/api/employees").then((r) => r.ok ? r.json() : []),
          fetch("/api/tasks").then((r) => r.ok ? r.json() : []),
          isSuperAdmin ? fetch("/api/departments").then((r) => r.ok ? r.json() : []) : Promise.resolve([]),
        ];

        if (isAdminRole) {
          fetches.push(fetch("/api/attendance/presence").then((r) => r.ok ? r.json() : []));
        }

        const [empRes, taskRes, deptRes, presenceRes] = await Promise.all(fetches);

        if (!isSuperAdmin) {
          try {
            const todayStr = new Date().toISOString().slice(0, 10);
            const [dailyRes, monthlyRes] = await Promise.all([
              fetch(`/api/attendance?type=detail&date=${todayStr}`).then((r) => r.ok ? r.json() : null),
              fetch("/api/attendance?type=monthly").then((r) => r.ok ? r.json() : null),
            ]);
            setPersonalAttendance({
              todayMinutes: dailyRes?.totalWorkingMinutes ?? 0,
              todaySessions: dailyRes?.activitySessions?.length ?? 0,
              officeMinutes: dailyRes?.officeMinutes ?? 0,
              remoteMinutes: dailyRes?.remoteMinutes ?? 0,
              isOnTime: dailyRes?.isOnTime ?? true,
              lateBy: dailyRes?.lateBy ?? 0,
              firstEntry: dailyRes?.firstOfficeEntry ? new Date(dailyRes.firstOfficeEntry).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null,
              monthlyAvgHours: monthlyRes?.averageDailyHours ?? 0,
              monthlyOnTimePct: monthlyRes?.onTimePercentage ?? 0,
              avgInTime: monthlyRes?.averageOfficeInTime ?? "",
              avgOutTime: monthlyRes?.averageOfficeOutTime ?? "",
            });
          } catch { /* personal data is optional */ }
        }
        setEmployees(Array.isArray(empRes) ? empRes as ApiEmployee[] : []);
        setTasks(Array.isArray(taskRes) ? taskRes as ApiTask[] : []);
        setDepartments(Array.isArray(deptRes) ? deptRes as ApiDepartment[] : []);

        if (Array.isArray(presenceRes)) {
          setRealPresence(
            (presenceRes as Array<{ _id: string; firstName: string; lastName: string; userRole: string; department: string; status: string; todayMinutes: number; isActive: boolean }>).map((p) => ({
              _id: p._id,
              firstName: p.firstName,
              lastName: p.lastName,
              designation: ROLE_DESIGNATION[p.userRole] ?? p.userRole,
              department: p.department,
              status: p.status as PresenceStatus,
              todayMinutes: p.todayMinutes,
              isActive: p.isActive,
            })),
          );
        }
      } catch (err) { console.error("Dashboard fetch error:", err); }
      setLoading(false);
    }
    load();
  }, [user.role]);

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
      isActive: true,
    }));
  }, [realPresence, employees]);

  if (loading) {
    const isAdminRole = user.role === "superadmin" || user.role === "manager" || user.role === "teamLead";
    if (!isAdminRole) {
      return (
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <div className="shimmer h-3 w-32 rounded" />
            <div className="shimmer h-9 w-64 max-w-full rounded" />
            <div className="shimmer h-4 w-56 max-w-full rounded" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card group relative overflow-hidden p-4">
                <div className="shimmer mb-2 h-9 w-9 rounded-xl" />
                <div className="shimmer mb-1 h-4 w-24 rounded" />
                <div className="shimmer mt-0.5 h-8 w-14 rounded" />
                <div className="shimmer mt-0.5 h-3 w-20 rounded" />
              </div>
            ))}
          </div>
          <section className="card p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="shimmer h-6 w-28 rounded" />
              <div className="shimmer h-5 w-20 rounded-full" />
            </div>
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="shimmer mt-0.5 h-8 w-8 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="shimmer h-4 w-full max-w-xs rounded" />
                    <div className="shimmer h-3 w-full max-w-sm rounded" />
                  </div>
                </div>
              ))}
            </div>
            <div className="shimmer mx-auto mt-4 h-4 w-36 rounded" />
          </section>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="shimmer h-3 w-36 rounded" />
            <div className="shimmer h-9 w-72 max-w-full rounded" />
            <div className="shimmer h-4 w-52 max-w-full rounded" />
          </div>
          <div className="card flex shrink-0 flex-col gap-2 p-3 sm:min-w-[180px]">
            <div className="shimmer h-3 w-16 rounded" />
            <div className="shimmer h-8 w-28 rounded" />
            <div className="shimmer h-3 w-36 rounded" />
          </div>
        </header>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card group relative overflow-hidden p-4">
              <div className="shimmer mb-2 h-9 w-9 rounded-xl" />
              <div className="shimmer h-4 w-28 rounded" />
              <div className="shimmer mt-0.5 h-8 w-12 rounded" />
              <div className="shimmer mt-0.5 h-3 w-24 rounded" />
            </div>
          ))}
        </div>
        <section className="card relative overflow-hidden p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="shimmer h-2.5 w-2.5 rounded-full" />
            <div className="shimmer h-6 w-36 rounded" />
          </div>
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
        </section>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <section className="card p-3 sm:p-4">
            <div className="shimmer mb-3 h-6 w-44 rounded" />
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1 space-y-2.5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="shimmer h-2.5 w-2.5 shrink-0 rounded-full" />
                    <div className="shimmer h-3 flex-1 rounded" />
                    <div className="shimmer h-5 w-7 rounded" />
                    <div className="shimmer h-3 w-9 rounded" />
                  </div>
                ))}
              </div>
              <div className="shimmer h-32 w-32 shrink-0 rounded-full sm:h-36 sm:w-36" />
            </div>
          </section>
          <section className="card p-3 sm:p-4">
            <div className="shimmer mb-3 h-6 w-40 rounded" />
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="shimmer h-3 w-28 rounded" />
                    <div className="shimmer h-3 w-16 rounded" />
                  </div>
                  <div className="shimmer h-2 w-full rounded-full" />
                </div>
              ))}
            </div>
          </section>
        </div>
        <section className="card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="shimmer h-6 w-24 rounded" />
            <div className="shimmer h-5 w-20 rounded-full" />
          </div>
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="shimmer mt-0.5 h-8 w-8 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="shimmer h-4 w-full max-w-sm rounded" />
                  <div className="shimmer h-3 w-full max-w-md rounded" />
                </div>
              </div>
            ))}
          </div>
          <div className="shimmer mx-auto mt-4 h-4 w-40 rounded" />
        </section>
      </div>
    );
  }

  if (user.role === "superadmin") {
    return (
      <SuperAdminOverview
        user={user}
        presenceEmps={presenceEmps}
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
        tasks={tasks}
        personalAttendance={personalAttendance}
      />
    );
  }

  return <OtherRoleOverview user={user} tasks={tasks} personalAttendance={personalAttendance} />;
}
