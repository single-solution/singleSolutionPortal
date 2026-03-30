"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  AVATAR_GRADIENTS,
  STATUS_BADGE_CLASS,
  STATUS_COLORS,
  STATUS_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  departments,
  employees,
  activityTasks,
  formatMinutes,
  getGreeting,
  getOnTimePct,
  getStatusCounts,
  initials,
  type Employee,
  type EmployeeStatus,
} from "@/lib/mockData";
import DataTablePreview, { StatusToggle, type Column } from "./DataTablePreview";
import SidebarModal from "./SidebarModal";

type InnerTab = "overview" | "employees" | "departments" | "activity" | "settings";

const INNER_TABS: { id: InnerTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "employees", label: "Employees" },
  { id: "departments", label: "Departments" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];

const STATUS_ORDER: EmployeeStatus[] = ["office", "remote", "late", "overtime", "absent"];

/* ──────────────────────── SHARED HELPERS ──────────────────────── */

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

function formatClock(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatClockDate(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/* ──────────────────────── OVERVIEW TAB ──────────────────────── */

function CircularProgress({ value, total, color, label }: { value: number; total: number; color: string; label: string }) {
  const percentage = (value / total) * 100;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  return (
    <div className="relative h-28 w-28 sm:h-32 sm:w-32">
      <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" stroke="var(--border)" strokeWidth="8" fill="transparent" />
        <motion.circle cx="50" cy="50" r="45" stroke={color} strokeWidth="8" fill="transparent" strokeDasharray={circumference} strokeLinecap="round" initial={{ strokeDashoffset: circumference }} animate={{ strokeDashoffset }} transition={{ duration: 2, ease: "easeOut" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span className="text-lg font-bold" style={{ color: "var(--fg)" }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1, type: "spring" }}>{value}</motion.span>
        <span className="text-caption">{label}</span>
      </div>
    </div>
  );
}

function AttendanceDonut({ counts, total }: { counts: ReturnType<typeof getStatusCounts>; total: number }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const arcs = useMemo(() => {
    const segments = STATUS_ORDER.map((s) => ({ status: s, count: counts[s], color: STATUS_COLORS[s] })).filter((s) => s.count > 0);
    const result: { status: EmployeeStatus; count: number; color: string; dasharray: string; finalOffset: number }[] = [];
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
      <svg className="h-40 w-40 sm:h-44 sm:w-44" viewBox="0 0 100 100">
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

function EmployeePresenceCard({ emp, idx, reduceMotion }: { emp: Employee; idx: number; reduceMotion: boolean }) {
  return (
    <motion.div custom={idx} variants={cardVariants} initial="hidden" animate="visible" whileHover={cardHover} className="card-static group flex flex-col gap-3 rounded-[var(--radius)] p-3">
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
          <span className={`badge mt-2 ${STATUS_BADGE_CLASS[emp.status]}`}>{STATUS_LABELS[emp.status]}</span>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[var(--border)] pt-2">
        <span className="text-caption">Today</span>
        <span className="text-subhead font-medium tabular-nums" style={{ color: "var(--fg-secondary)" }}>{formatMinutes(emp.today.totalMinutes)}</span>
      </div>
    </motion.div>
  );
}

function OverviewContent() {
  const reduceMotion = useReducedMotion();
  const counts = getStatusCounts(employees);
  const totalEmp = counts.total;
  const inOffice = counts.office;
  const lateToday = counts.late;
  const absentToday = counts.absent;
  const superAdmin = employees.find((e) => e.role === "superadmin") ?? employees[0];
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(id); }, []);
  const timeKey = `${now.getHours()}-${now.getMinutes()}`;
  const totalDeptEmployees = departments.reduce((s, d) => s + d.employeeCount, 0);
  const onTimePct = getOnTimePct(employees);

  const statItems = [
    { title: "Total Employees", value: totalEmp, caption: "Active roster", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg> },
    { title: "In Office", value: inOffice, caption: "On-site now", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
    { title: "Late Today", value: lateToday, caption: "After grace", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
    { title: "Absent Today", value: absentToday, caption: "No check-in", icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <motion.div className="min-w-0" variants={slideFromLeft} initial="hidden" animate="visible">
          <p className="text-caption mb-0.5">Single Solution Sync</p>
          <h1 className="text-title"><span className="gradient-text">{getGreeting()}</span><span style={{ color: "var(--fg)" }}>, {superAdmin.firstName}!</span></h1>
          <p className="text-subhead mt-1">You have {activityTasks.filter((t) => t.status === "pending").length} tasks pending</p>
        </motion.div>
        <motion.div className="card group relative overflow-hidden p-4 sm:min-w-[200px]" variants={slideFromRight} initial="hidden" animate="visible">
          <div className="pointer-events-none absolute -right-2 -top-2 h-16 w-16 rounded-bl-[50px] opacity-10 transition-opacity group-hover:opacity-15" style={{ background: blobGradients[0] }} />
          <p className="text-caption mb-1">Local time</p>
          <AnimatePresence mode="wait">
            <motion.div key={timeKey} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
              <span className="text-title block tabular-nums" style={{ color: "var(--fg)" }}>{formatClock(now)}</span>
              <span className="text-caption">{formatClockDate(now)}</span>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </header>

      <motion.div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" variants={staggerContainerFast} initial="hidden" animate="visible">
        {statItems.map((stat, i) => (
          <motion.div key={stat.title} className="card group relative overflow-hidden p-4" custom={i} variants={cardVariants} initial="hidden" animate="visible">
            <div className="pointer-events-none absolute -right-1 -top-1 h-20 w-20 rounded-bl-[50px] opacity-10 transition-opacity group-hover:opacity-[0.15]" style={{ background: blobGradients[i % blobGradients.length] }} />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-caption mb-2">{stat.title}</p>
                <span className="text-title block text-2xl font-semibold tabular-nums sm:text-3xl" style={{ color: "var(--fg)" }}><AnimatedNumber value={stat.value} /></span>
                <p className="text-caption mt-1">{stat.caption}</p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm" style={{ background: statIconGradients[i] }}>{stat.icon}</div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <motion.section className="card relative overflow-hidden p-4 sm:p-5" variants={slideUpItem} initial="hidden" animate="visible">
        <div className="mb-4 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ backgroundColor: "var(--teal)" }} /><span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--teal)" }} /></span>
          <h2 className="text-headline" style={{ color: "var(--fg)" }}>Live Presence</h2>
        </div>
        <motion.div className="grid grid-cols-2 gap-3 xl:grid-cols-4 md:grid-cols-3" variants={staggerContainerFast} initial="hidden" animate="visible">
          {employees.map((emp, idx) => (
            <EmployeePresenceCard key={emp._id} emp={emp} idx={idx} reduceMotion={!!reduceMotion} />
          ))}
        </motion.div>
      </motion.section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <motion.section className="card p-3 sm:p-4" variants={slideUpItem} initial="hidden" animate="visible">
          <h2 className="text-headline mb-3" style={{ color: "var(--fg)" }}>Attendance Overview</h2>
          <div className="flex flex-col items-center gap-4">
            <AttendanceDonut counts={counts} total={totalEmp} />
            <div className="w-full max-w-md space-y-2">
              {STATUS_ORDER.map((status) => (
                <div key={status} className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
                  <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="text-callout truncate" style={{ color: "var(--fg)" }}>{STATUS_LABELS[status]}</span><span className="text-caption tabular-nums">{counts[status]} ({Math.round((counts[status] / totalEmp) * 100)}%)</span></div></div>
                </div>
              ))}
            </div>
            <div className="flex w-full justify-center border-t border-[var(--border)] pt-3">
              <CircularProgress value={onTimePct} total={100} color="var(--primary)" label="On-time (present)" />
            </div>
          </div>
        </motion.section>
        <motion.section className="card p-3 sm:p-4" variants={slideUpItem} initial="hidden" animate="visible">
          <h2 className="text-headline mb-3" style={{ color: "var(--fg)" }}>Department Summary</h2>
          <div className="flex flex-col gap-3">
            {departments.map((dept, di) => {
              const pct = totalDeptEmployees > 0 ? (dept.employeeCount / totalDeptEmployees) * 100 : 0;
              return (
                <div key={dept._id}>
                  <div className="mb-1 flex items-center justify-between gap-2"><span className="text-callout font-medium" style={{ color: "var(--fg)" }}>{dept.name}</span><span className="text-caption tabular-nums">{dept.employeeCount} people</span></div>
                  <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
                    <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, var(--primary) 0%, var(--cyan) 100%)" }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, delay: di * 0.08, ease: "easeOut" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>
      </div>

      {/* ── Checklist sidebar ── */}
      <motion.section className="card p-4 sm:p-5" variants={slideUpItem} initial="hidden" animate="visible">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-headline" style={{ color: "var(--fg)" }}>Checklist</h2>
          <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity }} className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: "var(--rose)" }}>
            {activityTasks.filter((t) => t.status === "pending").length} Pending
          </motion.div>
        </div>
        <div className="flex flex-col gap-3">
          {activityTasks.filter((t) => t.status === "pending").slice(0, 5).map((task, ti) => {
            const pColors: Record<string, string> = { low: "var(--primary)", medium: "var(--amber)", high: "var(--rose)", urgent: "#ef4444" };
            return (
              <motion.div key={task._id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 + ti * 0.1 }} whileHover={{ x: 5 }} className="flex items-start gap-3 cursor-pointer">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${pColors[task.priority]} 15%, transparent)` }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={pColors[task.priority]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    {task.priority === "urgent" ? <><path d="M12 2v10l4 2" /><circle cx="12" cy="12" r="10" /></> : task.priority === "high" ? <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" /> : <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>}
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-callout font-semibold line-clamp-1" style={{ color: "var(--fg)" }}>{task.title}</p>
                  <p className="text-caption line-clamp-1">{new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {PRIORITY_LABELS[task.priority]}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
        <motion.button type="button" className="mt-4 w-full text-center text-callout font-semibold" style={{ color: "var(--primary)" }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          View All Tasks →
        </motion.button>
      </motion.section>

      <div className="flex justify-center pt-2">
        <motion.span whileHover={buttonHover} className="inline-flex"><span className="btn btn-primary btn-sm">Export report</span></motion.span>
      </div>
    </div>
  );
}

/* ──────────────────────── EMPLOYEES TAB ──────────────────────── */

const empColumns: Column<Employee>[] = [
  {
    key: "name", label: "Name", sortable: true,
    render: (emp, idx) => (
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-bold text-white ${AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length]}`}>{initials(emp.firstName, emp.lastName)}</div>
        <div className="min-w-0"><div className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{emp.firstName} {emp.lastName}</div><div className="text-caption line-clamp-1">{emp.email}</div></div>
      </div>
    ),
  },
  { key: "designation", label: "Designation", sortable: true, render: (emp) => <span className="text-subhead">{emp.designation}</span> },
  { key: "department", label: "Department", sortable: true, render: (emp) => <span className="text-subhead">{emp.department}</span> },
  { key: "status", label: "Status", render: (emp) => <span className={`badge ${STATUS_BADGE_CLASS[emp.status]}`}>{STATUS_LABELS[emp.status]}</span> },
  { key: "active", label: "Active", render: (emp) => <StatusToggle active={emp.isActive} /> },
  {
    key: "actions", label: "Actions",
    render: () => (
      <div className="flex items-center gap-1">
        <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--primary)" }} title="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
        </motion.button>
        <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--rose)" }} title="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
        </motion.button>
      </div>
    ),
  },
];

type RoleFilter = "all" | "manager" | "businessDeveloper" | "developer";
const ROLE_FILTER_LABELS: Record<RoleFilter, string> = { all: "All Employees", manager: "Managers", businessDeveloper: "Business Developers", developer: "Developers" };

function EmployeesContent() {
  const [modalOpen, setModalOpen] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const filteredEmps = useMemo(() => roleFilter === "all" ? employees : employees.filter((e) => e.role === roleFilter), [roleFilter]);

  return (
    <>
      <DataTablePreview<Employee>
        columns={empColumns}
        data={filteredEmps}
        searchPlaceholder="Search employees..."
        searchKey={(e) => `${e.firstName} ${e.lastName} ${e.email} ${e.designation}`}
        filterSlot={
          <div className="flex items-center gap-2">
            <span className="text-caption font-semibold" style={{ color: "var(--fg-secondary)" }}>Designation</span>
            <select className="input text-sm" style={{ width: "auto", minWidth: 160 }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}>
              {(Object.keys(ROLE_FILTER_LABELS) as RoleFilter[]).map((k) => <option key={k} value={k}>{ROLE_FILTER_LABELS[k]}</option>)}
            </select>
          </div>
        }
        headerAction={
          <motion.button type="button" whileHover={buttonHover} className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Employee
          </motion.button>
        }
      />
      <SidebarModal open={modalOpen} onClose={() => setModalOpen(false)} title="Create Employee" subtitle="An invitation email will be sent to the employee.">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>First Name</label><input className="input" placeholder="Ali" /></div>
            <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Last Name</label><input className="input" placeholder="Ahmed" /></div>
          </div>
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Email</label><input className="input" type="email" placeholder="ali@singlesolution.com" /></div>
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <label className="text-caption block font-semibold" style={{ color: "var(--fg)" }}>Username</label>
              <div className="group relative">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="cursor-help"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-48 rounded-xl p-3 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100" style={{ background: "var(--bg-solid)", border: "1px solid var(--border)" }}>
                  <p className="text-caption font-semibold" style={{ color: "var(--fg)" }}>Username rules:</p>
                  <ul className="mt-1 space-y-0.5 text-caption" style={{ color: "var(--fg-secondary)" }}>
                    <li>3-20 characters</li><li>Lowercase letters, numbers</li><li>No spaces or special chars</li>
                  </ul>
                </div>
              </div>
            </div>
            <input className="input" placeholder="ali" />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <label className="text-caption block font-semibold" style={{ color: "var(--fg)" }}>Password</label>
              <div className="group relative">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="cursor-help"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-52 rounded-xl p-3 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100" style={{ background: "var(--bg-solid)", border: "1px solid var(--border)" }}>
                  <p className="text-caption font-semibold" style={{ color: "var(--fg)" }}>Password rules:</p>
                  <ul className="mt-1 space-y-0.5 text-caption" style={{ color: "var(--fg-secondary)" }}>
                    <li>Minimum 8 characters</li><li>One uppercase letter</li><li>One lowercase letter</li><li>One number</li><li>One special character</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="relative">
              <input className="input pr-12" type={showPw ? "text" : "password"} placeholder="Set initial password" />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--fg-secondary)" }} onClick={() => setShowPw(!showPw)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{showPw ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" /><line x1="1" y1="1" x2="23" y2="23" /></> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}</svg>
              </button>
            </div>
            <div className="mt-1.5 flex gap-1">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i < 3 ? "var(--primary)" : "var(--border)" }} />)}</div>
          </div>
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Designation</label>
            <select className="input" defaultValue="developer"><option value="manager">Manager</option><option value="businessDeveloper">Business Developer</option><option value="developer">Developer</option></select>
          </div>
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Department</label>
            <select className="input" defaultValue="d1">{departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select>
          </div>
          <hr className="divider" />
          <p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>Shift Configuration</p>
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Shift Type</label>
            <select className="input" defaultValue="fullTime"><option value="fullTime">Full Time</option><option value="partTime">Part Time</option><option value="contract">Contract</option></select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Start Time</label><input className="input" type="time" defaultValue="10:00" /></div>
            <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>End Time</label><input className="input" type="time" defaultValue="19:00" /></div>
          </div>
          <div>
            <label className="text-caption mb-2 block font-semibold" style={{ color: "var(--fg)" }}>Working Days</label>
            <div className="flex flex-wrap gap-2">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => (
                <label key={day} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-caption font-medium" style={{ background: i < 5 ? "var(--primary-light)" : "var(--glass-bg)", color: i < 5 ? "var(--primary)" : "var(--fg-secondary)" }}>
                  <input type="checkbox" defaultChecked={i < 5} className="accent-[var(--primary)]" />
                  {day}
                </label>
              ))}
            </div>
          </div>
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Break Time (min)</label><input className="input" type="number" defaultValue="60" /></div>
          <motion.button type="button" className="btn btn-primary w-full" whileHover={buttonHover} whileTap={{ scale: 0.97 }}>Create Employee</motion.button>
        </div>
      </SidebarModal>
    </>
  );
}

/* ──────────────────────── DEPARTMENTS TAB ──────────────────────── */

function DepartmentsContent() {
  const [modalOpen, setModalOpen] = useState(false);
  const deptColumns: Column<typeof departments[0]>[] = [
    { key: "name", label: "Department", sortable: true, render: (d) => <span className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{d.name}</span> },
    { key: "manager", label: "Manager", render: (d) => { const mgr = employees.find((e) => e._id === d.managerId); return mgr ? <span className="text-subhead">{mgr.firstName} {mgr.lastName}</span> : <span className="text-caption">—</span>; } },
    { key: "count", label: "Employees", sortable: true, render: (d) => <span className="text-subhead tabular-nums">{d.employeeCount}</span> },
    { key: "active", label: "Active", render: (d) => <StatusToggle active={d.isActive} /> },
    {
      key: "actions", label: "Actions",
      render: () => (
        <div className="flex items-center gap-1">
          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--primary)" }} title="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          </motion.button>
          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--rose)" }} title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
          </motion.button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTablePreview
        columns={deptColumns}
        data={departments}
        searchPlaceholder="Search departments..."
        searchKey={(d) => d.name}
        headerAction={
          <motion.button type="button" whileHover={buttonHover} className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Department
          </motion.button>
        }
      />
      <SidebarModal open={modalOpen} onClose={() => setModalOpen(false)} title="Create Department" subtitle="Add a new department to the organization.">
        <div className="flex flex-col gap-5">
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Department Name</label><input className="input" placeholder="e.g. Marketing" /></div>
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Description</label><textarea className="input" rows={3} placeholder="Brief description of this department..." /></div>
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Assign Manager</label>
            <select className="input">{employees.filter((e) => e.role === "manager").map((m) => <option key={m._id} value={m._id}>{m.firstName} {m.lastName}</option>)}</select>
          </div>
          <motion.button type="button" className="btn btn-primary w-full" whileHover={buttonHover} whileTap={{ scale: 0.97 }}>Create Department</motion.button>
        </div>
      </SidebarModal>
    </>
  );
}

/* ──────────────────────── ACTIVITY TASKS TAB ──────────────────────── */

type PriorityFilter = "all" | "low" | "medium" | "high" | "urgent";

function ActivityContent() {
  const [modalOpen, setModalOpen] = useState(false);
  const [prioFilter, setPrioFilter] = useState<PriorityFilter>("all");
  const filteredTasks = useMemo(() => prioFilter === "all" ? activityTasks : activityTasks.filter((t) => t.priority === prioFilter), [prioFilter]);
  const pendingCount = activityTasks.filter((t) => t.status === "pending").length;

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-headline" style={{ color: "var(--fg)" }}>Activity Tasks</h2><p className="text-caption mt-0.5">{activityTasks.length} tasks total · {pendingCount} pending</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <LayoutGroup id="sa-prio-filter">
              <div className="flex gap-1 rounded-xl p-1" style={{ background: "var(--glass-bg)" }}>
                {(["all", "low", "medium", "high", "urgent"] as PriorityFilter[]).map((f) => {
                  const active = prioFilter === f;
                  return (
                    <button key={f} type="button" onClick={() => setPrioFilter(f)} className="btn btn-sm relative z-10 min-h-0 border-0 bg-transparent px-2.5 py-1 shadow-none" style={{ color: active ? "var(--fg)" : "var(--fg-secondary)" }}>
                      {active && <motion.span layoutId="sa-prio-active" className="absolute inset-0 rounded-lg" style={{ background: "var(--glass-bg-heavy)", border: "0.5px solid var(--glass-border)" }} transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
                      <span className="relative text-caption font-semibold">{f === "all" ? "All" : PRIORITY_LABELS[f]}</span>
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>
            <motion.button type="button" whileHover={buttonHover} className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Create Task
            </motion.button>
          </div>
        </div>

        <motion.div className="flex flex-col gap-3" variants={staggerContainer} initial="hidden" animate="visible">
          {filteredTasks.map((task) => {
            const assignee = employees.find((e) => e._id === task.assignedTo);
            const gi = assignee ? employees.indexOf(assignee) : 0;
            return (
              <motion.div key={task._id} variants={slideUpItem} className="card-static flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: PRIORITY_COLORS[task.priority] }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{task.title}</p>
                      <span className="text-caption rounded-md px-1.5 py-0.5 font-semibold" style={{ background: `color-mix(in srgb, ${PRIORITY_COLORS[task.priority]} 15%, transparent)`, color: PRIORITY_COLORS[task.priority] }}>{PRIORITY_LABELS[task.priority]}</span>
                    </div>
                    <p className="text-caption mt-1 line-clamp-1">{task.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {assignee && (
                        <span className="flex items-center gap-1.5 text-caption">
                          <span className={`flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br text-[9px] font-bold text-white ${AVATAR_GRADIENTS[gi % AVATAR_GRADIENTS.length]}`}>{initials(assignee.firstName, assignee.lastName)}</span>
                          {assignee.firstName} {assignee.lastName}
                        </span>
                      )}
                      <span className="text-caption tabular-nums" style={{ color: "var(--fg-tertiary)" }}>Due {task.deadline}</span>
                    </div>
                  </div>
                </div>
                <span className="badge shrink-0" style={{ background: task.status === "completed" ? "rgba(48,209,88,0.12)" : task.status === "inProgress" ? "var(--primary-light)" : "var(--glass-bg)", color: task.status === "completed" ? "var(--teal)" : task.status === "inProgress" ? "var(--primary)" : "var(--fg-secondary)" }}>
                  {TASK_STATUS_LABELS[task.status]}
                </span>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      <SidebarModal open={modalOpen} onClose={() => setModalOpen(false)} title="Create Task" subtitle="Assign a new task to a team member.">
        <div className="flex flex-col gap-5">
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Title</label><input className="input" placeholder="Task title..." /></div>
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Description</label><textarea className="input" rows={3} placeholder="Describe the task..." /></div>
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Assign To</label>
            <select className="input">{employees.filter((e) => e.role !== "superadmin").map((e) => <option key={e._id} value={e._id}>{e.firstName} {e.lastName} — {e.designation}</option>)}</select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Priority</label>
              <select className="input" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select>
            </div>
            <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Deadline</label><input className="input" type="date" defaultValue="2026-03-20" /></div>
          </div>
          <motion.button type="button" className="btn btn-primary w-full" whileHover={buttonHover} whileTap={{ scale: 0.97 }}>Create Task</motion.button>
        </div>
      </SidebarModal>
    </>
  );
}

/* ──────────────────────── SETTINGS TAB ──────────────────────── */

function SettingsContent() {
  return (
    <motion.div className="flex flex-col gap-6" variants={staggerContainer} initial="hidden" animate="visible">
      <motion.section className="card-static p-5" variants={fadeInItem}>
        <h3 className="text-headline mb-4" style={{ color: "var(--fg)" }}>Office Location</h3>
        <p className="text-caption mb-4">Geofence center for automatic presence detection.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Latitude</label><input className="input" defaultValue="24.8607" readOnly /></div>
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Longitude</label><input className="input" defaultValue="67.0011" readOnly /></div>
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Radius (meters)</label><input className="input" defaultValue="50" readOnly /></div>
        </div>
      </motion.section>

      <motion.section className="card-static p-5" variants={fadeInItem}>
        <h3 className="text-headline mb-4" style={{ color: "var(--fg)" }}>Shift Defaults</h3>
        <p className="text-caption mb-4">Default shift configuration for new employees.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Start Time</label><input className="input" type="time" defaultValue="10:00" /></div>
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>End Time</label><input className="input" type="time" defaultValue="19:00" /></div>
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Break (min)</label><input className="input" type="number" defaultValue="60" /></div>
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Grace Period (min)</label><input className="input" type="number" defaultValue="30" /></div>
        </div>
      </motion.section>

      <motion.section className="card-static p-5" variants={fadeInItem}>
        <h3 className="text-headline mb-4" style={{ color: "var(--fg)" }}>System</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Company Name</label><input className="input" defaultValue="Single Solution" /></div>
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Timezone</label><select className="input" defaultValue="asia-karachi"><option value="asia-karachi">Asia/Karachi (PKT +05:00)</option><option value="utc">UTC</option><option value="est">America/New_York (EST)</option></select></div>
        </div>
      </motion.section>

      <div className="flex justify-end gap-3">
        <motion.button type="button" className="btn btn-secondary" whileHover={buttonHover}>Reset to defaults</motion.button>
        <motion.button type="button" className="btn btn-primary" whileHover={buttonHover} whileTap={{ scale: 0.97 }}>Save Settings</motion.button>
      </div>
    </motion.div>
  );
}

/* ──────────────────────── MAIN COMPONENT ──────────────────────── */

export default function SuperAdminPreview() {
  const [innerTab, setInnerTab] = useState<InnerTab>("overview");

  return (
    <div className="flex flex-col gap-4 py-4 sm:gap-5 sm:py-5">
      <LayoutGroup id="sa-inner-tabs">
        <div className="scrollbar-hide flex gap-1 overflow-x-auto rounded-xl p-1" style={{ background: "var(--glass-bg)" }}>
          {INNER_TABS.map((tab) => {
            const active = innerTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setInnerTab(tab.id)}
                className="btn btn-sm relative z-10 min-h-0 shrink-0 border-0 bg-transparent px-4 py-2 shadow-none"
                style={{ color: active ? "var(--fg)" : "var(--fg-secondary)" }}
              >
                {active && (
                  <motion.span
                    layoutId="sa-inner-active"
                    className="absolute inset-0 rounded-lg"
                    style={{ background: "var(--glass-bg-heavy)", border: "0.5px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.45 }}
                  />
                )}
                <span className="relative text-callout font-semibold">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <AnimatePresence mode="wait">
        <motion.div key={innerTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
          {innerTab === "overview" && <OverviewContent />}
          {innerTab === "employees" && <EmployeesContent />}
          {innerTab === "departments" && <DepartmentsContent />}
          {innerTab === "activity" && <ActivityContent />}
          {innerTab === "settings" && <SettingsContent />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
