"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  staggerContainer,
  slideUpItem,
  fadeInItem,
  cardVariants,
  cardHover,
  buttonHover,
  slideFromLeft,
  slideFromRight,
} from "@/lib/motion";
import {
  employees,
  weeklyRecords,
  monthlyStats,
  getGreeting,
  formatMinutes,
  initials,
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  AVATAR_GRADIENTS,
} from "@/lib/mockData";
import type { Employee, DailyRecord, EmployeeStatus } from "@/lib/mockData";

type InnerTab = "overview" | "attendance" | "profile";
const INNER_TABS: { id: InnerTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "attendance", label: "Attendance" },
  { id: "profile", label: "Profile" },
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

function hexToRgb(hex: string) { const h = hex.replace("#", ""); const n = parseInt(h, 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return <span className="text-headline tabular-nums" style={{ color: "var(--fg)" }}>{now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}</span>;
}

const PREVIEW_TODAY = "2026-03-14";
function shiftTargetMinutes(emp: Employee) {
  const [sh, sm] = emp.shift.start.split(":").map(Number);
  const [eh, em] = emp.shift.end.split(":").map(Number);
  return Math.max(eh * 60 + em - (sh * 60 + sm) - emp.shift.breakTime, 1);
}

const ME = employees.find((e) => e._id === "e5") as Employee;

/* ──────────────────────── OVERVIEW ──────────────────────── */

function OverviewContent() {
  const me = ME;
  const avatarGrad = AVATAR_GRADIENTS[employees.findIndex((e) => e._id === me._id) % AVATAR_GRADIENTS.length];
  const targetMins = shiftTargetMinutes(me);
  const progressPct = Math.min(100, Math.round((me.today.totalMinutes / targetMins) * 100));
  const statusColor = STATUS_COLORS[me.status];
  const rgb = hexToRgb(statusColor);
  const weeklySorted = useMemo(() => [...weeklyRecords].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), []);
  const officePct = me.today.officeMinutes + me.today.remoteMinutes > 0 ? Math.round((me.today.officeMinutes / (me.today.officeMinutes + me.today.remoteMinutes)) * 100) : 0;
  const remotePct = 100 - officePct;
  const totalHours = monthlyStats.totalOfficeHours + monthlyStats.totalRemoteHours;
  const officeHoursPct = totalHours > 0 ? (monthlyStats.totalOfficeHours / totalHours) * 100 : 0;
  const remoteHoursPct = totalHours > 0 ? (monthlyStats.totalRemoteHours / totalHours) * 100 : 0;

  const timelineEvents = [
    { key: "login", dot: statusColor, time: me.today.firstEntry ?? "--:--", label: `Logged in remotely at ${me.today.firstEntry ?? "--:--"}` },
    { key: "break", dot: "var(--amber)", time: "12:30", label: "Break 12:30–13:00" },
    { key: "active", dot: "var(--teal)", time: "Now", label: "Active now" },
  ];

  return (
    <div className="aurora-bg relative min-h-full w-full overflow-x-hidden">
      <div className="relative z-10 mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <motion.div variants={slideFromLeft} initial="hidden" animate="visible" className="space-y-1">
            <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Single Solution Sync</p>
            <h1 className="text-title"><span className="gradient-text">{getGreeting()}, {me.firstName}!</span></h1>
          </motion.div>
          <motion.div variants={slideFromRight} initial="hidden" animate="visible" className="flex flex-col items-start gap-0.5 sm:items-end">
            <span className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Local time</span>
            <LiveClock />
          </motion.div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="card p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
              <div className="flex flex-col items-center gap-3 sm:items-start">
                <motion.div className="relative" animate={{ boxShadow: [`0 0 0 0 rgba(${rgb.r},${rgb.g},${rgb.b},0.45)`, `0 0 0 14px rgba(${rgb.r},${rgb.g},${rgb.b},0)`] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} style={{ borderRadius: "var(--radius-full)" }}>
                  <div className={`flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br text-2xl font-semibold text-white shadow-lg sm:h-32 sm:w-32 sm:text-3xl ${avatarGrad}`}>{initials(me.firstName, me.lastName)}</div>
                </motion.div>
                <span className={`badge ${STATUS_BADGE_CLASS[me.status]}`}>{STATUS_LABELS[me.status]}</span>
              </div>
              <div className="min-w-0 flex-1 space-y-4">
                <div><h2 className="text-headline" style={{ color: "var(--fg)" }}>{me.firstName} {me.lastName}</h2><p className="text-subhead">{me.designation}</p><p className="text-caption mt-0.5">{me.department}</p></div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="card-static rounded-xl p-3"><p className="text-caption">First entry</p><p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{me.today.firstEntry ?? "—"}</p></div>
                  <div className="card-static rounded-xl p-3"><p className="text-caption">Hours logged</p><p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{formatMinutes(me.today.totalMinutes)}</p></div>
                  <div className="card-static col-span-2 rounded-xl p-3 sm:col-span-1"><p className="text-caption">Office / Remote</p><p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{formatMinutes(me.today.officeMinutes)} / {formatMinutes(me.today.remoteMinutes)}</p><p className="text-footnote mt-1" style={{ color: "var(--fg-secondary)" }}>{officePct}% office · {remotePct}% remote</p></div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><span className="text-footnote" style={{ color: "var(--fg-secondary)" }}>Shift progress</span><span className="text-footnote tabular-nums" style={{ color: "var(--fg-secondary)" }}>{me.today.totalMinutes} / {targetMins} min ({progressPct}%)</span></div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                    <div className="relative h-full overflow-hidden rounded-full" style={{ width: `${progressPct}%`, background: "var(--primary)", boxShadow: "inset 0 0.5px 0 rgba(255,255,255,0.25)" }}>
                      <motion.div className="shimmer pointer-events-none absolute inset-0 opacity-70" aria-hidden />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05, ease: [0.22, 1, 0.36, 1] }} className="card-static flex flex-col p-5 sm:p-6">
            <h3 className="text-section-header mb-4">Today&apos;s Activity</h3>
            <motion.ul className="relative flex flex-col gap-0 pl-4" variants={staggerContainer} initial="hidden" animate="visible">
              <span className="absolute bottom-1 left-[7px] top-1 w-px" style={{ background: "var(--border-strong)" }} aria-hidden />
              {timelineEvents.map((ev) => (
                <motion.li key={ev.key} variants={slideUpItem} className="relative flex gap-3 pb-5 last:pb-0">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ev.dot, boxShadow: "0 0 0 2px var(--bg)" }} />
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-2"><span className="text-caption tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{ev.time}</span></div><p className="text-callout mt-0.5" style={{ color: "var(--fg)" }}>{ev.label}</p></div>
                </motion.li>
              ))}
            </motion.ul>
          </motion.section>
        </div>

        <section className="space-y-3">
          <motion.h3 variants={fadeInItem} initial="hidden" animate="visible" className="text-section-header">Weekly overview</motion.h3>
          <div className="scrollbar-hide -mx-1 flex gap-3 overflow-x-auto pb-2 pt-1">
            {weeklySorted.map((day: DailyRecord, i: number) => {
              const d = new Date(day.date + "T12:00:00");
              const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
              const isToday = day.date === PREVIEW_TODAY;
              const dot = STATUS_COLORS[day.status];
              return (
                <motion.div key={day.date} custom={i} variants={cardVariants} initial="hidden" animate="visible" whileHover={cardHover} className={`card-static flex min-w-[112px] shrink-0 flex-col gap-2 rounded-2xl p-4 ${isToday ? "border-2" : ""}`} style={isToday ? { borderColor: "var(--primary)", boxShadow: "var(--glass-shadow), 0 0 24px rgba(0,122,255,0.18)" } : undefined}>
                  <div className="flex items-center justify-between gap-2"><span className="text-footnote font-semibold" style={{ color: "var(--fg-secondary)" }}>{dayName}</span><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} title={STATUS_LABELS[day.status]} /></div>
                  <span className="text-caption" style={{ color: "var(--fg-tertiary)" }}>{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  <span className="text-headline tabular-nums" style={{ color: "var(--fg)" }}>{formatMinutes(day.totalMinutes)}</span>
                </motion.div>
              );
            })}
          </div>
        </section>

        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="card-static p-5 sm:p-6">
          <h3 className="text-section-header mb-4">Monthly summary</h3>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="card-static rounded-xl p-4"><p className="text-caption">Present / Total</p><p className="text-title mt-1" style={{ color: "var(--fg)" }}><AnimatedNumber value={monthlyStats.presentDays} /><span style={{ color: "var(--fg-tertiary)" }}> / </span><AnimatedNumber value={monthlyStats.totalWorkingDays} /><span className="text-subhead"> days</span></p></div>
            <div className="card-static rounded-xl p-4"><p className="text-caption">On-time</p><p className="text-title mt-1 gradient-text"><AnimatedNumber value={monthlyStats.onTimePercentage} suffix="%" /></p></div>
            <div className="card-static rounded-xl p-4"><p className="text-caption">Avg. daily hours</p><p className="text-title mt-1" style={{ color: "var(--fg)" }}><AnimatedNumber value={monthlyStats.averageDailyHours} suffix="h" /></p></div>
            <div className="card-static rounded-xl p-4"><p className="text-caption">Total hours</p><p className="text-title mt-1" style={{ color: "var(--fg)" }}><AnimatedNumber value={monthlyStats.totalWorkingHours} suffix="h" /></p></div>
          </div>
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between"><span className="text-footnote" style={{ color: "var(--fg-secondary)" }}>Office vs remote (hours)</span><span className="text-caption tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{monthlyStats.totalOfficeHours}h · {monthlyStats.totalRemoteHours}h</span></div>
            <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
              <motion.div className="h-full" style={{ background: "var(--teal)" }} initial={{ width: 0 }} animate={{ width: `${officeHoursPct}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
              <motion.div className="h-full" style={{ background: "var(--primary)" }} initial={{ width: 0 }} animate={{ width: `${remoteHoursPct}%` }} transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} />
            </div>
            <div className="flex justify-between text-caption" style={{ color: "var(--fg-tertiary)" }}><span>Office {officeHoursPct.toFixed(0)}%</span><span>Remote {remoteHoursPct.toFixed(0)}%</span></div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}

/* ──────────────────────── ATTENDANCE TAB ──────────────────────── */

const MONTH_DAYS = 31;
const MARCH_2026_FIRST_DAY = 0; // Sunday

const calendarStatuses: Record<number, EmployeeStatus> = {
  1: "office", 2: "office", 3: "office", 4: "office", 5: "office",
  6: "remote", 7: "absent",
  8: "office", 9: "office", 10: "late", 11: "office", 12: "remote",
  13: "absent", 14: "office",
  15: "office", 16: "office", 17: "late", 18: "office", 19: "office",
  20: "overtime", 21: "absent",
  22: "office", 23: "office", 24: "office", 25: "remote", 26: "office",
};

function AttendanceContent() {
  const weeklySorted = useMemo(() => [...weeklyRecords].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), []);

  const calDays = useMemo(() => {
    const days: { day: number; status: EmployeeStatus | null }[] = [];
    for (let i = 0; i < MARCH_2026_FIRST_DAY; i++) days.push({ day: 0, status: null });
    for (let d = 1; d <= MONTH_DAYS; d++) {
      const today = d <= 14;
      days.push({ day: d, status: today ? (calendarStatuses[d] ?? null) : null });
    }
    return days;
  }, []);

  return (
    <motion.div className="flex flex-col gap-6" variants={staggerContainer} initial="hidden" animate="visible">
      <motion.section className="card-static p-5" variants={fadeInItem}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-headline" style={{ color: "var(--fg)" }}>March 2026</h3>
          <div className="flex flex-wrap gap-2">
            {(["office", "remote", "late", "overtime", "absent"] as EmployeeStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1 text-caption">
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[s] }} />
                {STATUS_LABELS[s]}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-caption py-2 font-semibold" style={{ color: "var(--fg-tertiary)" }}>{d}</div>
          ))}
          {calDays.map((cell, i) => {
            if (cell.day === 0) return <div key={`empty-${i}`} />;
            const isToday = cell.day === 14;
            return (
              <motion.div
                key={cell.day}
                className={`relative flex flex-col items-center justify-center rounded-xl py-2.5 ${isToday ? "ring-2" : ""}`}
                style={{
                  background: cell.status ? `color-mix(in srgb, ${STATUS_COLORS[cell.status]} 12%, transparent)` : "var(--glass-bg)",
                  ...(isToday ? { boxShadow: "0 0 0 2px var(--primary)" } : {}),
                }}
                whileHover={{ scale: 1.08 }}
              >
                <span className="text-callout font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{cell.day}</span>
                {cell.status && <span className="mt-1 h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLORS[cell.status] }} />}
              </motion.div>
            );
          })}
        </div>
      </motion.section>

      <motion.section className="card-static p-5" variants={fadeInItem}>
        <h3 className="text-headline mb-4" style={{ color: "var(--fg)" }}>Recent Records</h3>
        <div className="flex flex-col gap-2">
          {weeklySorted.map((day, i) => {
            const d = new Date(day.date + "T12:00:00");
            const isToday = day.date === PREVIEW_TODAY;
            return (
              <motion.div
                key={day.date}
                variants={slideUpItem}
                className={`flex items-center gap-4 rounded-xl px-4 py-3 ${isToday ? "border" : ""}`}
                style={{
                  background: isToday ? "var(--primary-light)" : "var(--glass-bg)",
                  borderColor: isToday ? "var(--primary)" : undefined,
                }}
              >
                <div className="min-w-[52px] text-center">
                  <p className="text-caption font-semibold" style={{ color: "var(--fg-secondary)" }}>{d.toLocaleDateString("en-US", { weekday: "short" })}</p>
                  <p className="text-callout font-bold tabular-nums" style={{ color: "var(--fg)" }}>{d.getDate()}</p>
                </div>
                <div className="h-8 w-px" style={{ background: "var(--border)" }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${STATUS_BADGE_CLASS[day.status]}`}>{STATUS_LABELS[day.status]}</span>
                    {day.lateBy > 0 && <span className="text-caption font-semibold" style={{ color: "var(--amber)" }}>+{day.lateBy}m late</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-caption" style={{ color: "var(--fg-secondary)" }}>
                    <span>In: {day.firstEntry}</span>
                    <span>Out: {day.lastExit}</span>
                  </div>
                </div>
                <span className="text-callout font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{formatMinutes(day.totalMinutes)}</span>
              </motion.div>
            );
          })}
        </div>
      </motion.section>
    </motion.div>
  );
}

/* ──────────────────────── PROFILE ──────────────────────── */

function ProfileContent() {
  const me = ME;
  const gi = employees.findIndex((e) => e._id === me._id);
  const avatarGrad = AVATAR_GRADIENTS[gi % AVATAR_GRADIENTS.length];

  return (
    <motion.div className="flex flex-col gap-6" variants={staggerContainer} initial="hidden" animate="visible">
      <motion.div className="card-static flex flex-col items-center gap-5 p-6 sm:flex-row sm:items-start sm:gap-6" variants={fadeInItem}>
        <div className="group relative">
          <div className={`flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br text-2xl font-bold text-white shadow-lg sm:h-28 sm:w-28 ${avatarGrad}`}>{initials(me.firstName, me.lastName)}</div>
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>
          </div>
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h2 className="text-title" style={{ color: "var(--fg)" }}>{me.firstName} {me.lastName}</h2>
          <p className="text-subhead mt-1">{me.designation}</p>
          <p className="text-caption mt-0.5">{me.department} · {me.email}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <span className={`badge ${STATUS_BADGE_CLASS[me.status]}`}>{STATUS_LABELS[me.status]}</span>
            <span className="badge" style={{ background: "var(--glass-bg)", color: "var(--fg-secondary)" }}>{me.shift.type === "fullTime" ? "Full Time" : me.shift.type === "partTime" ? "Part Time" : "Contract"}</span>
          </div>
        </div>
      </motion.div>

      <motion.div className="card-static p-5" variants={fadeInItem}>
        <h3 className="text-headline mb-4" style={{ color: "var(--fg)" }}>Edit Profile</h3>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>First Name</label><input className="input" defaultValue={me.firstName} /></div>
            <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Last Name</label><input className="input" defaultValue={me.lastName} /></div>
          </div>
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Email</label><input className="input" type="email" defaultValue={me.email} /></div>
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Username</label><input className="input" defaultValue={me.username} /></div>
          <div className="flex justify-end gap-3">
            <motion.button type="button" className="btn btn-secondary" whileHover={buttonHover}>Cancel</motion.button>
            <motion.button type="button" className="btn btn-primary" whileHover={buttonHover} whileTap={{ scale: 0.97 }}>Save Changes</motion.button>
          </div>
        </div>
      </motion.div>

      <motion.div className="card-xl p-5 sm:p-6" variants={fadeInItem}>
        <h3 className="text-headline mb-1" style={{ color: "var(--fg)" }}>Security</h3>
        <p className="text-caption mb-4">Update your password to keep your account secure.</p>
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg)" }}>
              <svg className="h-4 w-4" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              Current password
            </label>
            <input className="input" type="password" placeholder="Required to confirm changes" />
          </div>
          <div className="border-t border-[var(--border)]" />
          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg)" }}>
              <svg className="h-4 w-4" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
              New password
            </label>
            <input className="input" type="password" placeholder="At least 8 characters" />
            <div className="mt-1.5 flex gap-1">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i < 3 ? "var(--primary)" : "var(--border)" }} />)}</div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: "var(--fg)" }}>Confirm password</label>
            <input className="input" type="password" placeholder="Type password again" />
            <p className="mt-1.5 flex items-center gap-1 text-xs" style={{ color: "var(--teal)" }}>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              Passwords match
            </p>
          </div>
          <motion.button type="button" className="btn btn-primary w-full" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>Save changes</motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ──────────────────────── MAIN ──────────────────────── */

export default function DeveloperPreview() {
  const [innerTab, setInnerTab] = useState<InnerTab>("overview");

  return (
    <div className="flex flex-col gap-4 py-4 sm:gap-5 sm:py-5">
      <LayoutGroup id="dev-inner-tabs">
        <div className="scrollbar-hide flex gap-1 overflow-x-auto rounded-xl p-1" style={{ background: "var(--glass-bg)" }}>
          {INNER_TABS.map((tab) => {
            const active = innerTab === tab.id;
            return (
              <button key={tab.id} type="button" onClick={() => setInnerTab(tab.id)} className="btn btn-sm relative z-10 min-h-0 shrink-0 border-0 bg-transparent px-4 py-2 shadow-none" style={{ color: active ? "var(--fg)" : "var(--fg-secondary)" }}>
                {active && <motion.span layoutId="dev-inner-active" className="absolute inset-0 rounded-lg" style={{ background: "var(--glass-bg-heavy)", border: "0.5px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }} transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
                <span className="relative text-callout font-semibold">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <AnimatePresence mode="wait">
        <motion.div key={innerTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
          {innerTab === "overview" && <OverviewContent />}
          {innerTab === "attendance" && <AttendanceContent />}
          {innerTab === "profile" && <ProfileContent />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
