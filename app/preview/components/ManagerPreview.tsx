"use client";

import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  staggerContainer,
  slideUpItem,
  fadeInItem,
  cardVariants,
  cardHover,
  buttonHover,
  listItemHover,
  slideFromLeft,
  slideFromRight,
} from "@/lib/motion";
import {
  employees,
  departments,
  getStatusCounts,
  getOnTimePct,
  getGreeting,
  formatMinutes,
  initials,
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  AVATAR_GRADIENTS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  activityTasks,
  monthlyStats,
  type Employee,
} from "@/lib/mockData";

type InnerTab = "overview" | "tasks";
const INNER_TABS: { id: InnerTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
];

function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 800; const start = Date.now();
    const step = () => { const elapsed = Date.now() - start; const progress = Math.min(elapsed / duration, 1); const eased = 1 - Math.pow(1 - progress, 3); setDisplay(value * eased); if (progress < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }, [value]);
  const formatted = Number.isInteger(value) ? Math.round(display).toString() : display.toFixed(1);
  return <>{formatted}{suffix}</>;
}

const ME_ID = "e2";
const DEPT_NAME = "Engineering";
type StatusFilter = "all" | "office" | "remote" | "late" | "absent";
const FILTER_ORDER: StatusFilter[] = ["all", "office", "remote", "late", "absent"];
const FILTER_LABELS: Record<StatusFilter, string> = { all: "All", office: "Office", remote: "Remote", late: "Late", absent: "Absent" };

function matchesStatusFilter(emp: Employee, f: StatusFilter): boolean {
  if (f === "all") return true;
  if (f === "office") return emp.status === "office" || emp.status === "overtime";
  if (f === "remote") return emp.status === "remote";
  if (f === "late") return emp.today.lateBy > 0;
  if (f === "absent") return emp.status === "absent";
  return true;
}

const LAST_FIVE_DAYS_PRESENT = [
  { label: "Mon", count: 5 }, { label: "Tue", count: 4 }, { label: "Wed", count: 5 }, { label: "Thu", count: 5 }, { label: "Fri", count: 4 },
];

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(id); }, []);
  return <span className="text-subhead tabular-nums" style={{ color: "var(--fg-secondary)" }}>{now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>;
}

function StatCard({ title, subtitle, value, suffix, icon, index, gradientStyle }: { title: string; subtitle: string; value: number; suffix?: string; icon: ReactNode; index: number; gradientStyle: React.CSSProperties }) {
  return (
    <motion.div className="card-static relative overflow-hidden p-4 sm:p-5" custom={index} variants={cardVariants} initial="hidden" animate="visible" whileHover={cardHover}>
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-40 blur-2xl" style={{ background: "var(--primary-light)" }} aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-caption mb-1">{title}</p>
          <p className="text-title tabular-nums"><span className="text-[var(--primary)]"><AnimatedNumber value={value} suffix={suffix} /></span></p>
          <p className="text-subhead mt-1">{subtitle}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12" style={gradientStyle}>{icon}</div>
      </div>
    </motion.div>
  );
}

function StatusToggle({ active }: { active: boolean }) {
  return (
    <div className="relative h-7 w-12 shrink-0 rounded-full transition-colors" style={{ background: active ? "var(--primary)" : "var(--fg-tertiary)" }} aria-hidden>
      <motion.div className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-md" style={{ left: active ? "calc(100% - 1.25rem - 0.25rem)" : "0.25rem" }} layout transition={{ type: "spring", stiffness: 500, damping: 35 }} />
    </div>
  );
}

/* ──────────────────────── OVERVIEW ──────────────────────── */

function OverviewContent() {
  const me = useMemo(() => employees.find((e) => e._id === ME_ID)!, []);
  const team = useMemo(() => employees.filter((e) => e.department === DEPT_NAME), []);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const teamCounts = useMemo(() => getStatusCounts(team), [team]);
  const presentToday = teamCounts.total - teamCounts.absent;
  const onTimePct = useMemo(() => getOnTimePct(team), [team]);
  const filteredTeam = useMemo(() => team.filter((e) => matchesStatusFilter(e, filter)), [team, filter]);
  const lateThisWeek = useMemo(() => team.filter((e) => e.today.lateBy > 0).sort((a, b) => b.today.lateBy - a.today.lateBy), [team]);
  const engDept = useMemo(() => departments.find((d) => d.name === DEPT_NAME), []);
  const maxBar = useMemo(() => Math.max(...LAST_FIVE_DAYS_PRESENT.map((d) => d.count), 1), []);

  const pendingCount = activityTasks.filter((t) => t.status === "pending" && (t.assignedRole === "manager" || t.assignedRole === "developer")).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div variants={slideFromLeft} initial="hidden" animate="visible" className="min-w-0">
          <p className="text-title">{getGreeting()}, {me.firstName}!</p>
          <p className="text-subhead mt-1">You have {pendingCount} tasks pending</p>
        </motion.div>
        <motion.div variants={slideFromRight} initial="hidden" animate="visible" className="flex flex-wrap items-center gap-3 sm:justify-end">
          <LiveClock />
          <span className="badge badge-office">{engDept?.name ?? DEPT_NAME}</span>
        </motion.div>
      </div>

      <motion.div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4" variants={staggerContainer} initial="hidden" animate="visible">
        <StatCard title="My Team" subtitle="Engineering roster" value={team.length} index={0} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: "var(--primary)" }}><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" fill="currentColor" /></svg>} gradientStyle={{ background: "linear-gradient(135deg, var(--primary-light), rgba(100,210,255,0.2))" }} />
        <StatCard title="Present Today" subtitle="Non-absent in team" value={presentToday} index={1} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: "var(--teal)" }}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="currentColor" /></svg>} gradientStyle={{ background: "linear-gradient(135deg, rgba(48,209,88,0.2), rgba(100,210,255,0.15))" }} />
        <StatCard title="On-Time Rate" subtitle="Among present today" value={onTimePct} suffix="%" index={2} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: "var(--purple)" }}><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" fill="currentColor" /></svg>} gradientStyle={{ background: "linear-gradient(135deg, rgba(191,90,242,0.2), var(--primary-light))" }} />
      </motion.div>

      <motion.div className="card-static overflow-hidden" variants={fadeInItem} initial="hidden" animate="visible">
        <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" style={{ borderColor: "var(--border)" }}>
          <div><h2 className="text-headline">Today&apos;s Board</h2><p className="text-caption mt-0.5">Live status · {teamCounts.total} people</p></div>
          <LayoutGroup id="manager-filters">
            <div className="relative flex flex-wrap gap-1 rounded-xl p-1" style={{ background: "var(--bg-grouped)" }}>
              {FILTER_ORDER.map((f) => {
                const active = filter === f;
                return (
                  <button key={f} type="button" className="btn btn-sm relative z-10 min-h-0 border-0 bg-transparent px-3 py-1.5 shadow-none" style={{ color: active ? "var(--fg)" : "var(--fg-secondary)" }} onClick={() => setFilter(f)}>
                    {active && <motion.span layoutId="manager-filter" className="absolute inset-0 rounded-lg" style={{ background: "var(--bg-elevated)", border: "0.5px solid var(--border)", boxShadow: "var(--shadow-sm)" }} transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
                    <span className="relative text-caption font-semibold sm:text-callout">{FILTER_LABELS[f]}</span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>
        </div>
        <div className="scrollbar-hide overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead><tr className="text-caption" style={{ color: "var(--fg-tertiary)" }}><th className="px-4 py-3 font-medium sm:px-5">Member</th><th className="px-4 py-3 font-medium sm:px-5">Role</th><th className="px-4 py-3 font-medium sm:px-5">Status</th><th className="px-4 py-3 font-medium sm:px-5">First entry</th><th className="px-4 py-3 font-medium sm:px-5">Hours today</th><th className="px-4 py-3 text-right font-medium sm:px-5">Active</th></tr></thead>
            <motion.tbody variants={staggerContainer} initial="hidden" animate="visible">
              {filteredTeam.map((emp) => {
                const gi = team.findIndex((t) => t._id === emp._id);
                const grad = AVATAR_GRADIENTS[gi % AVATAR_GRADIENTS.length];
                return (
                  <motion.tr key={emp._id} variants={slideUpItem} whileHover={listItemHover} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3 sm:px-5"><div className="flex items-center gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-bold text-white ${grad}`}>{initials(emp.firstName, emp.lastName)}</div><div className="min-w-0"><div className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{emp.firstName} {emp.lastName}</div><div className="text-caption line-clamp-1">{emp.email}</div></div></div></td>
                    <td className="text-subhead px-4 py-3 sm:px-5">{emp.designation}</td>
                    <td className="px-4 py-3 sm:px-5"><span className={`badge ${STATUS_BADGE_CLASS[emp.status]}`}>{STATUS_LABELS[emp.status]}</span></td>
                    <td className="text-subhead tabular-nums px-4 py-3 sm:px-5">{emp.today.firstEntry ?? "—"}</td>
                    <td className="text-subhead tabular-nums px-4 py-3 sm:px-5">{formatMinutes(emp.today.totalMinutes)}</td>
                    <td className="px-4 py-3 text-right sm:px-5"><StatusToggle active={emp.isActive} /></td>
                  </motion.tr>
                );
              })}
            </motion.tbody>
          </table>
        </div>
      </motion.div>

      {/* ── Today + Avg Stats ── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        <motion.div className="card-static relative overflow-hidden p-4 sm:p-5 md:col-span-5" variants={fadeInItem} initial="hidden" animate="visible">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-headline" style={{ color: "var(--fg)" }}>Today</h3>
            <motion.span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: me.status !== "absent" ? "var(--teal)" : "var(--rose)" }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.4 }}>
              {me.status !== "absent" ? "Present" : "Absent"}
            </motion.span>
          </div>
          <div className="flex flex-col items-center gap-4">
            <div className="relative flex items-center justify-center">
              <svg className="h-36 w-36" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" stroke="var(--border)" strokeWidth="8" fill="transparent" />
                <motion.circle cx="50" cy="50" r="42" fill="none" stroke="var(--primary)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 42}`} initial={{ strokeDashoffset: 2 * Math.PI * 42 }} animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - Math.min(me.today.totalMinutes / 540, 1)) }} transition={{ duration: 1.5, ease: "easeOut" }} style={{ transform: "rotate(-90deg)", transformOrigin: "center" }} />
              </svg>
              <div className="absolute flex flex-col items-center">
                <motion.span className="text-title tabular-nums font-bold" style={{ color: "var(--fg)" }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1, type: "spring" }}>
                  {me.today.totalMinutes >= 60 ? (me.today.totalMinutes / 60).toFixed(1) : me.today.totalMinutes}
                </motion.span>
                <span className="text-caption">{me.today.totalMinutes >= 60 ? "hours" : "minutes"}</span>
              </div>
            </div>
            <div className="flex w-full items-center justify-between border-t border-[var(--border)] pt-3">
              <div className="text-center"><span className="text-caption">Sessions</span><p className="text-callout font-bold" style={{ color: "var(--fg)" }}>3</p></div>
              <div className="text-center"><span className="text-caption">Remote</span><p className="text-callout font-bold" style={{ color: "var(--fg)" }}>{formatMinutes(me.today.totalMinutes - me.today.officeMinutes)}</p></div>
              <div className="text-center"><span className="text-caption">{me.today.isOnTime ? "On time" : "Late by"}</span><p className="text-callout font-bold" style={{ color: me.today.isOnTime ? "var(--teal)" : "var(--amber)" }}>{me.today.isOnTime ? "✓" : formatMinutes(me.today.lateBy)}</p></div>
            </div>
          </div>
        </motion.div>

        <div className="flex flex-col gap-4 md:col-span-7">
          <div className="grid grid-cols-2 gap-3">
            <motion.div className="card-static p-4" variants={slideUpItem} initial="hidden" animate="visible">
              <p className="text-caption mb-1">Avg Hours / Day</p>
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center">
                  <svg className="h-10 w-10" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" stroke="var(--border)" strokeWidth="4" fill="transparent" /><motion.circle cx="20" cy="20" r="16" fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 16}`} initial={{ strokeDashoffset: 2 * Math.PI * 16 }} animate={{ strokeDashoffset: 2 * Math.PI * 16 * (1 - monthlyStats.averageDailyHours / 9) }} transition={{ duration: 1, ease: "easeOut" }} style={{ transform: "rotate(-90deg)", transformOrigin: "center" }} /></svg>
                </div>
                <p className="text-headline tabular-nums font-bold" style={{ color: "var(--fg)" }}><AnimatedNumber value={monthlyStats.averageDailyHours} /> Hours</p>
              </div>
            </motion.div>
            <motion.div className="card-static p-4" variants={slideUpItem} initial="hidden" animate="visible">
              <p className="text-caption mb-1">On-Time Arrivals</p>
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center">
                  <svg className="h-10 w-10" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" stroke="var(--border)" strokeWidth="4" fill="transparent" /><motion.circle cx="20" cy="20" r="16" fill="none" stroke="var(--teal)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 16}`} initial={{ strokeDashoffset: 2 * Math.PI * 16 }} animate={{ strokeDashoffset: 2 * Math.PI * 16 * (1 - monthlyStats.onTimePercentage / 100) }} transition={{ duration: 1, ease: "easeOut" }} style={{ transform: "rotate(-90deg)", transformOrigin: "center" }} /></svg>
                </div>
                <p className="text-headline tabular-nums font-bold" style={{ color: "var(--fg)" }}><AnimatedNumber value={monthlyStats.onTimePercentage} suffix="%" /></p>
              </div>
            </motion.div>
            <motion.div className="card-static flex items-center gap-3 p-4" variants={slideUpItem} initial="hidden" animate="visible">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--primary-light)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              </div>
              <div><p className="text-caption">Avg Check-in</p><p className="text-callout font-bold tabular-nums" style={{ color: "var(--fg)" }}>{monthlyStats.averageInTime} AM</p></div>
            </motion.div>
            <motion.div className="card-static flex items-center gap-3 p-4" variants={slideUpItem} initial="hidden" animate="visible">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(255,159,10,0.12)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "scaleX(-1)" }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              </div>
              <div><p className="text-caption">Avg Check-out</p><p className="text-callout font-bold tabular-nums" style={{ color: "var(--fg)" }}>{monthlyStats.averageOutTime} PM</p></div>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <motion.div className="card-static relative overflow-hidden p-4 sm:p-5" variants={fadeInItem} initial="hidden" animate="visible">
          <div className="mb-4 flex items-start justify-between gap-2"><div><h3 className="text-headline">Team Attendance This Month</h3><p className="text-caption mt-0.5">{monthlyStats.month} {monthlyStats.year} · Last 5 working days</p></div><span className="badge badge-office">Trend</span></div>
          <div className="flex h-36 items-end justify-between gap-2 px-1">
            {LAST_FIVE_DAYS_PRESENT.map((d, i) => (
              <div key={d.label} className="flex min-h-0 flex-1 flex-col items-center gap-2">
                <div className="relative flex h-28 w-full items-end justify-center">
                  <motion.div className="w-[55%] max-w-[40px] rounded-t-lg" style={{ background: "linear-gradient(180deg, var(--primary), var(--cyan))" }} initial={{ height: "0%" }} animate={{ height: `${(d.count / maxBar) * 100}%` }} transition={{ duration: 0.65, delay: 0.08 * i, ease: [0.22, 1, 0.36, 1] }} />
                </div>
                <span className="text-caption font-medium" style={{ color: "var(--fg-secondary)" }}>{d.label}</span>
                <span className="text-footnote tabular-nums font-semibold" style={{ color: "var(--fg)" }}>{d.count}</span>
              </div>
            ))}
          </div>
        </motion.div>
        <motion.div className="card-static relative overflow-hidden p-4 sm:p-5" variants={fadeInItem} initial="hidden" animate="visible">
          <div className="mb-4 flex items-start justify-between gap-2"><div><h3 className="text-headline">Late Arrivals</h3><p className="text-caption mt-0.5">This week · Engineering</p></div><span className="badge badge-late">{lateThisWeek.length} total</span></div>
          {lateThisWeek.length === 0 ? <p className="text-subhead py-6 text-center">No late arrivals this week.</p> : (
            <ul className="flex flex-col gap-2">
              {lateThisWeek.map((emp) => (
                <motion.li key={emp._id} variants={slideUpItem} initial="hidden" animate="visible" className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--bg-grouped)" }}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(255,159,10,0.15)" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="var(--amber)" /></svg></span>
                  <div className="min-w-0 flex-1"><p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{emp.firstName} {emp.lastName}</p><p className="text-caption">Late by {formatMinutes(emp.today.lateBy)}</p></div>
                  <span className="text-footnote tabular-nums font-bold" style={{ color: "var(--amber)" }}>+{formatMinutes(emp.today.lateBy)}</span>
                </motion.li>
              ))}
            </ul>
          )}
        </motion.div>
      </div>

      {/* ── Checklist ── */}
      <motion.div className="card-static p-4 sm:p-5" variants={fadeInItem} initial="hidden" animate="visible">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-headline" style={{ color: "var(--fg)" }}>Checklist</h3>
          <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity }} className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: "var(--rose)" }}>
            {pendingCount} Pending
          </motion.div>
        </div>
        <div className="flex flex-col gap-3">
          {activityTasks.filter((t) => t.status === "pending" && (t.assignedRole === "manager" || t.assignedRole === "developer")).slice(0, 5).map((task, ti) => {
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
      </motion.div>
    </div>
  );
}

/* ──────────────────────── TASKS TAB ──────────────────────── */

type PriorityFilter = "all" | "low" | "medium" | "high" | "urgent";

function TasksContent() {
  const managerTasks = useMemo(() => activityTasks.filter((t) => t.assignedRole === "manager" || t.assignedRole === "developer"), []);
  const [prioFilter, setPrioFilter] = useState<PriorityFilter>("all");
  const filteredTasks = useMemo(() => prioFilter === "all" ? managerTasks : managerTasks.filter((t) => t.priority === prioFilter), [managerTasks, prioFilter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-headline" style={{ color: "var(--fg)" }}>Assigned Tasks</h2><p className="text-caption mt-0.5">{managerTasks.length} tasks for your team</p></div>
        <LayoutGroup id="mgr-prio-filter">
          <div className="flex gap-1 rounded-xl p-1" style={{ background: "var(--bg-grouped)" }}>
            {(["all", "low", "medium", "high", "urgent"] as PriorityFilter[]).map((f) => {
              const active = prioFilter === f;
              return (
                <button key={f} type="button" onClick={() => setPrioFilter(f)} className="btn btn-sm relative z-10 min-h-0 border-0 bg-transparent px-2.5 py-1 shadow-none" style={{ color: active ? "var(--fg)" : "var(--fg-secondary)" }}>
                  {active && <motion.span layoutId="mgr-prio-active" className="absolute inset-0 rounded-lg" style={{ background: "var(--bg-elevated)", border: "0.5px solid var(--border)" }} transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
                  <span className="relative text-caption font-semibold">{f === "all" ? "All" : PRIORITY_LABELS[f]}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>
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
              <span className="badge shrink-0" style={{ background: task.status === "completed" ? "rgba(48,209,88,0.12)" : task.status === "inProgress" ? "var(--primary-light)" : "var(--bg-grouped)", color: task.status === "completed" ? "var(--teal)" : task.status === "inProgress" ? "var(--primary)" : "var(--fg-secondary)" }}>
                {TASK_STATUS_LABELS[task.status]}
              </span>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

/* ──────────────────────── MAIN ──────────────────────── */

export default function ManagerPreview() {
  const [innerTab, setInnerTab] = useState<InnerTab>("overview");

  return (
    <div className="flex flex-col gap-4 py-4 sm:gap-5 sm:py-5">
      <LayoutGroup id="mgr-inner-tabs">
        <div className="scrollbar-hide flex gap-1 overflow-x-auto rounded-xl p-1" style={{ background: "var(--bg-grouped)" }}>
          {INNER_TABS.map((tab) => {
            const active = innerTab === tab.id;
            return (
              <button key={tab.id} type="button" onClick={() => setInnerTab(tab.id)} className="btn btn-sm relative z-10 min-h-0 shrink-0 border-0 bg-transparent px-4 py-2 shadow-none" style={{ color: active ? "var(--fg)" : "var(--fg-secondary)" }}>
                {active && <motion.span layoutId="mgr-inner-active" className="absolute inset-0 rounded-lg" style={{ background: "var(--bg-elevated)", border: "0.5px solid var(--border)", boxShadow: "var(--shadow-sm)" }} transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
                <span className="relative text-callout font-semibold">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <AnimatePresence mode="wait">
        <motion.div key={innerTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
          {innerTab === "overview" && <OverviewContent />}
          {innerTab === "tasks" && <TasksContent />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
