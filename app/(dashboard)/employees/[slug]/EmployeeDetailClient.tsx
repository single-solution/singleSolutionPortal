"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];
const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } };

interface EmployeeData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  designation: string;
  department: string | null;
  profileImage: string | null;
  phone: string | null;
  createdAt: string | null;
  shiftStart: string;
  shiftEnd: string;
  shiftBreak: number;
  shiftType: string;
}

interface TodayData {
  todayMinutes: number;
  officeMinutes: number;
  remoteMinutes: number;
  isOnTime: boolean;
  lateBy: number;
  firstEntry: string | null;
  sessions: { _id: string; time: string; inOffice: boolean; status: string; durationMinutes: number }[];
  hasRecord: boolean;
}

interface WeeklyDay {
  date: string;
  totalMinutes: number;
  isPresent: boolean;
  isOnTime: boolean;
}

interface MonthlyData {
  presentDays: number;
  totalDays: number;
  onTimePct: number;
  totalHours: number;
  avgDailyHours: number;
  officeHours: number;
  remoteHours: number;
}

interface TaskData {
  _id: string;
  title: string;
  priority: string;
  status: string;
  deadline: string | null;
  createdAt: string | null;
}

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function getShiftMinutes(start: string, end: string, breakTime: number) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(eh * 60 + em - (sh * 60 + sm) - breakTime, 1);
}

function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "var(--primary)",
  medium: "var(--amber)",
  high: "var(--rose)",
  urgent: "#ef4444",
};

const SHIFT_LABELS: Record<string, string> = {
  fullTime: "Full Time",
  partTime: "Part Time",
  contract: "Contract",
};

export default function EmployeeDetailClient({
  employee: emp,
  today,
  weekly,
  monthly: ms,
  tasks,
  todayStr,
}: {
  employee: EmployeeData;
  today: TodayData;
  weekly: WeeklyDay[];
  monthly: MonthlyData;
  tasks: TaskData[];
  todayStr: string;
}) {
  const shiftMins = getShiftMinutes(emp.shiftStart, emp.shiftEnd, emp.shiftBreak);
  const shiftPct = Math.min(100, Math.round((today.todayMinutes / shiftMins) * 100));
  const isPresent = today.hasRecord && today.todayMinutes > 0;
  const statusColor = isPresent ? (today.isOnTime ? "var(--green)" : "var(--amber)") : "#f43f5e";
  const statusLabel = isPresent ? (today.isOnTime ? "Present" : "Late") : "Absent";

  const firstEntryLabel = today.firstEntry
    ? new Date(today.firstEntry).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true })
    : "—";

  const officePct = today.officeMinutes + today.remoteMinutes > 0 ? Math.round((today.officeMinutes / (today.officeMinutes + today.remoteMinutes)) * 100) : 0;
  const remotePct = 100 - officePct;

  const monthlyOfficePct = ms.officeHours + ms.remoteHours > 0 ? (ms.officeHours / (ms.officeHours + ms.remoteHours)) * 100 : 0;
  const monthlyRemotePct = 100 - monthlyOfficePct;

  const pendingTasks = tasks.filter((t) => t.status === "pending");
  const inProgressTasks = tasks.filter((t) => t.status === "inProgress");
  const completedTasks = tasks.filter((t) => t.status === "completed");

  return (
    <div className="relative min-h-full w-full overflow-x-hidden animate-reveal">
      <div className="relative z-10 mx-auto max-w-5xl space-y-6 pb-10">

        {/* Breadcrumb + header */}
        <motion.header
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.4, ease }}
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-caption">
              <Link href="/employees" className="font-semibold hover:underline" style={{ color: "var(--primary)" }}>Employees</Link>
              <span style={{ color: "var(--fg-tertiary)" }}>/</span>
              <span style={{ color: "var(--fg-secondary)" }}>@{emp.username || emp.id.slice(-6)}</span>
            </div>
            <h1 className="text-title" style={{ color: "var(--fg)" }}>{emp.firstName} {emp.lastName}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <span
                className="badge"
                style={
                  isPresent && today.isOnTime
                    ? {
                        background: "color-mix(in srgb, var(--green) 8%, transparent)",
                        color: "var(--green)",
                        border: "1px solid color-mix(in srgb, var(--green) 30%, transparent)",
                      }
                    : isPresent && !today.isOnTime
                      ? {
                          background: "color-mix(in srgb, var(--amber) 8%, transparent)",
                          color: "var(--amber)",
                          border: "1px solid color-mix(in srgb, var(--amber) 30%, transparent)",
                        }
                      : { background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}30` }
                }
              >
                {isPresent && (
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full mr-1" style={{ background: statusColor }}>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ background: statusColor }} />
                  </span>
                )}
                {statusLabel}
              </span>
              {emp.department && (
                <span className="badge" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>{emp.department}</span>
              )}
              <span className="text-caption" style={{ color: "var(--fg-tertiary)" }}>{emp.designation}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href={`/employees/${emp.username || emp.id}/edit`}>
              <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="btn btn-sm" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                Edit
              </motion.button>
            </Link>
          </div>
        </motion.header>

        {/* Self Overview Card + Info sidebar — 2 col grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Overview card — spans 2 cols */}
          <motion.section
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.45, delay: 0.05, ease }}
            className="card p-5 sm:p-6 lg:col-span-2"
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
              <div className="flex flex-col items-center gap-3 sm:items-start">
                {emp.profileImage ? (
                  <img src={emp.profileImage} alt="" className="h-20 w-20 rounded-full object-cover shadow-lg sm:h-24 sm:w-24" />
                ) : (
                  <div
                    className="flex h-20 w-20 items-center justify-center rounded-full text-xl font-semibold text-white shadow-lg sm:h-24 sm:w-24 sm:text-2xl"
                    style={{ background: "linear-gradient(135deg, var(--primary), var(--cyan))" }}
                  >
                    {initials(emp.firstName, emp.lastName)}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="card-static rounded-xl p-3">
                    <p className="text-caption">First entry</p>
                    <p className="text-callout font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{firstEntryLabel}</p>
                  </div>
                  <div className="card-static rounded-xl p-3">
                    <p className="text-caption">Hours logged</p>
                    <p className="text-callout font-semibold tabular-nums" style={{ color: "var(--fg)" }}>
                      {today.todayMinutes >= 60 ? `${(today.todayMinutes / 60).toFixed(1)}h` : `${today.todayMinutes}m`}
                    </p>
                  </div>
                  <div className="card-static col-span-2 rounded-xl p-3 sm:col-span-1">
                    <p className="text-caption">Office / Remote</p>
                    <p className="text-callout font-semibold tabular-nums" style={{ color: "var(--fg)" }}>
                      {formatMinutes(today.officeMinutes)} / {formatMinutes(today.remoteMinutes)}
                    </p>
                    <p className="mt-0.5 text-[10px]" style={{ color: "var(--fg-secondary)" }}>{officePct}% office · {remotePct}% remote</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-caption" style={{ color: "var(--fg-secondary)" }}>Shift progress</span>
                    <span className="text-caption tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                      {today.todayMinutes} / {shiftMins} min ({shiftPct}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${shiftPct}%` }}
                      transition={{ duration: 0.8, ease }}
                      style={{ background: shiftPct >= 100 ? "var(--purple)" : "var(--primary)" }}
                    />
                  </div>
                </div>

                {today.lateBy > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: "color-mix(in srgb, var(--amber) 8%, transparent)", color: "var(--amber)" }}>
                      Late +{formatMinutes(today.lateBy)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.section>

          {/* Info sidebar — 1 col */}
          <motion.aside
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.45, delay: 0.1, ease }}
            className="card-static p-5 sm:p-6 space-y-4"
          >
            <h3 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Details</h3>
            <div className="space-y-3 text-[12px]">
              <div className="flex items-start justify-between gap-2">
                <span style={{ color: "var(--fg-tertiary)" }}>Email</span>
                <span className="truncate font-medium text-right" style={{ color: "var(--fg)" }}>{emp.email}</span>
              </div>
              {emp.phone && (
                <div className="flex items-start justify-between gap-2">
                  <span style={{ color: "var(--fg-tertiary)" }}>Phone</span>
                  <span className="truncate font-medium text-right" style={{ color: "var(--fg)" }}>{emp.phone}</span>
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <span style={{ color: "var(--fg-tertiary)" }}>Role</span>
                <span className="truncate font-medium text-right" style={{ color: "var(--fg)" }}>{emp.designation}</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span style={{ color: "var(--fg-tertiary)" }}>Shift</span>
                <span className="font-medium text-right" style={{ color: "var(--fg)" }}>
                  {emp.shiftStart} – {emp.shiftEnd}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span style={{ color: "var(--fg-tertiary)" }}>Type</span>
                <span className="font-medium text-right" style={{ color: "var(--fg)" }}>{SHIFT_LABELS[emp.shiftType] ?? emp.shiftType}</span>
              </div>
              {emp.createdAt && (
                <div className="flex items-start justify-between gap-2">
                  <span style={{ color: "var(--fg-tertiary)" }}>Joined</span>
                  <span className="font-medium tabular-nums text-right" style={{ color: "var(--fg)" }}>
                    {new Date(emp.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </span>
                </div>
              )}
            </div>
          </motion.aside>
        </div>

        {/* Activity timeline + Tasks — 2 col grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Activity timeline */}
          <motion.section
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.45, delay: 0.15, ease }}
            className="card-static flex flex-col p-5 sm:p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              {isPresent && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ backgroundColor: "var(--green)" }} />
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: "var(--green)" }} />
                </span>
              )}
              <h3 className="text-section-header">Today&apos;s Activity</h3>
            </div>
            {!today.hasRecord ? (
              <p className="text-caption py-4 text-center" style={{ color: "var(--fg-tertiary)" }}>No attendance record for today yet.</p>
            ) : today.sessions.length === 0 ? (
              <p className="text-caption py-4 text-center" style={{ color: "var(--fg-tertiary)" }}>No session timeline for today.</p>
            ) : (
              <ul className="relative flex flex-col gap-0 pl-4">
                <span className="absolute bottom-1 left-[7px] top-1 w-px" style={{ background: "var(--border-strong)" }} aria-hidden />
                {today.sessions.map((s, i) => {
                  const start = s.time ? new Date(s.time) : null;
                  const timeLabel = start && !Number.isNaN(start.getTime())
                    ? start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true })
                    : "—";
                  const where = s.inOffice ? "Office" : "Remote";
                  const dotColor = s.status === "active" ? "var(--green)" : "var(--fg-tertiary)";
                  return (
                    <motion.li
                      key={s._id || i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + i * 0.06, ease }}
                      className="relative flex gap-3 pb-5 last:pb-0"
                    >
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor, boxShadow: "0 0 0 2px var(--bg)" }}>
                        {s.status === "active" && <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full opacity-40" style={{ background: dotColor }} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-caption tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{timeLabel}</span>
                        <p className="text-callout mt-0.5" style={{ color: "var(--fg)" }}>
                          {where}
                          {s.durationMinutes > 0 ? ` · ${formatMinutes(s.durationMinutes)}` : ""}
                        </p>
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </motion.section>

          {/* Tasks */}
          <motion.section
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.45, delay: 0.2, ease }}
            className="card p-4 sm:p-5"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-headline" style={{ color: "var(--fg)" }}>Tasks</h3>
              <div className="flex items-center gap-2">
                {pendingTasks.length > 0 && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "color-mix(in srgb, var(--amber) 8%, transparent)", color: "var(--amber)" }}>{pendingTasks.length} pending</span>
                )}
                {inProgressTasks.length > 0 && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>{inProgressTasks.length} active</span>
                )}
                {completedTasks.length > 0 && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "color-mix(in srgb, var(--green) 8%, transparent)", color: "var(--green)" }}>{completedTasks.length} done</span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {tasks.length === 0 ? (
                <p className="text-caption py-4 text-center" style={{ color: "var(--fg-tertiary)" }}>No tasks assigned</p>
              ) : tasks.slice(0, 8).map((task, ti) => {
                const pc = PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)";
                const statusColor2 = task.status === "inProgress" ? "var(--primary)" : task.status === "completed" ? "var(--green)" : "var(--amber)";
                const statusLbl = task.status === "inProgress" ? "In Progress" : task.status === "completed" ? "Done" : "Pending";
                return (
                  <motion.div
                    key={task._id}
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.04 + ti * 0.04 }}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: "var(--bg-grouped)" }}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${pc} 15%, transparent)` }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: pc }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-callout font-semibold truncate" style={{ color: "var(--fg)" }}>{task.title}</p>
                      <div className="flex gap-2 mt-0.5 text-caption">
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ background: `color-mix(in srgb, ${statusColor2} 12%, transparent)`, color: statusColor2 }}>{statusLbl}</span>
                        {task.deadline && <span className="tabular-nums" style={{ color: "var(--fg-tertiary)" }}>Due {new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>
        </div>

        {/* Weekly overview — horizontal scroll strip */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.45, delay: 0.25, ease }}
          className="space-y-3"
        >
          <h3 className="text-section-header">Weekly overview</h3>
          <div className="scrollbar-hide -mx-1 flex gap-3 overflow-x-auto pb-2 pt-1">
            {weekly.length === 0 ? (
              <p className="text-caption px-1" style={{ color: "var(--fg-tertiary)" }}>No daily records this month yet.</p>
            ) : weekly.map((day, i) => {
              const d = new Date(day.date + "T12:00:00");
              const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
              const isToday = day.date === todayStr;
              const dot = !day.isPresent ? "#f43f5e" : !day.isOnTime ? "var(--amber)" : "var(--green)";
              return (
                <motion.div
                  key={day.date}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.05, ease }}
                  whileHover={{ y: -2, boxShadow: "var(--shadow-md)" }}
                  className={`card-static flex min-w-[112px] shrink-0 flex-col gap-2 rounded-2xl p-4 cursor-default ${isToday ? "border-2" : ""}`}
                  style={isToday ? { borderColor: "var(--primary)", boxShadow: "var(--shadow-sm), 0 0 24px rgba(0,122,255,0.18)" } : undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-caption font-semibold" style={{ color: "var(--fg-secondary)" }}>{dayName}</span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
                  </div>
                  <span className="text-caption" style={{ color: "var(--fg-tertiary)" }}>{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  <span className="text-headline tabular-nums" style={{ color: "var(--fg)" }}>{formatMinutes(day.totalMinutes)}</span>
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {/* Monthly summary */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.5, delay: 0.3, ease }}
          className="card-static p-5 sm:p-6"
        >
          <h3 className="text-section-header mb-4">Monthly summary</h3>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="card-static rounded-xl p-4">
              <p className="text-caption">Present / Total</p>
              <p className="text-title mt-1" style={{ color: "var(--fg)" }}>
                {ms.presentDays}<span style={{ color: "var(--fg-tertiary)" }}> / </span>{ms.totalDays}
                <span className="text-subhead"> days</span>
              </p>
            </div>
            <div className="card-static rounded-xl p-4">
              <p className="text-caption">On-time</p>
              <p className="text-title mt-1 text-[var(--primary)]">{ms.onTimePct}%</p>
            </div>
            <div className="card-static rounded-xl p-4">
              <p className="text-caption">Avg. daily hours</p>
              <p className="text-title mt-1" style={{ color: "var(--fg)" }}>{ms.avgDailyHours}h</p>
            </div>
            <div className="card-static rounded-xl p-4">
              <p className="text-caption">Total hours</p>
              <p className="text-title mt-1" style={{ color: "var(--fg)" }}>{ms.totalHours}h</p>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-caption" style={{ color: "var(--fg-secondary)" }}>Office vs remote (hours)</span>
              <span className="text-caption tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{ms.officeHours}h · {ms.remoteHours}h</span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
              <motion.div className="h-full" style={{ background: "var(--teal)" }} initial={{ width: 0 }} animate={{ width: `${monthlyOfficePct}%` }} transition={{ duration: 0.8, ease }} />
              <motion.div className="h-full" style={{ background: "var(--primary)" }} initial={{ width: 0 }} animate={{ width: `${monthlyRemotePct}%` }} transition={{ duration: 0.8, delay: 0.1, ease }} />
            </div>
            <div className="flex justify-between text-caption" style={{ color: "var(--fg-tertiary)" }}>
              <span>Office {monthlyOfficePct.toFixed(0)}%</span>
              <span>Remote {monthlyRemotePct.toFixed(0)}%</span>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
