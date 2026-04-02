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
  slideUpItem,
  staggerContainerFast,
  fadeInItem,
  cardVariants,
  cardHover,
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
  email: string;
  designation: string;
  department: string;
  reportsTo: string | null;
  reportsToId: string | null;
  status: PresenceStatus;
  todayMinutes: number;
  officeMinutes: number;
  remoteMinutes: number;
  lateBy: number;
  breakMinutes: number;
  firstEntry: string | null;
  lastExit: string | null;
  shiftStart: string;
  shiftEnd: string;
  shiftBreakTime: number;
  isLive: boolean;
  locationFlagged: boolean;
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
  reportsTo?: { _id: string; about: { firstName: string; lastName: string } } | null;
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

const STATUS_BADGE_CLASS: Record<PresenceStatus, string> = {
  office: "badge-office",
  remote: "badge-remote",
  late: "badge-late",
  overtime: "badge-overtime",
  absent: "badge-absent",
};

const AVATAR_GRADIENTS = [
  "from-blue-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-purple-500 to-pink-400",
  "from-amber-500 to-orange-400",
  "from-rose-500 to-red-400",
  "from-indigo-500 to-violet-400",
  "from-lime-500 to-green-400",
  "from-fuchsia-500 to-pink-300",
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

function formatTimeStr(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
}

function getShiftMinutes(start: string, end: string, breakTime: number) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(eh * 60 + em - (sh * 60 + sm) - breakTime, 1);
}


/* ──────────────────────── SHARED COMPONENTS ──────────────────────── */

function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
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
  const formatted = Number.isInteger(value) ? Math.round(display).toString() : display.toFixed(1);
  return <>{formatted}{suffix}</>;
}

const blobGradients = [
  "linear-gradient(135deg, rgba(0,122,255,0.35) 0%, rgba(100,210,255,0.25) 100%)",
  "linear-gradient(135deg, rgba(48,209,88,0.35) 0%, rgba(16,185,129,0.2) 100%)",
  "linear-gradient(135deg, rgba(255,159,10,0.35) 0%, rgba(245,158,11,0.2) 100%)",
  "linear-gradient(135deg, rgba(255,55,95,0.3) 0%, rgba(244,63,94,0.2) 100%)",
];

const statIconGradients = [
  "linear-gradient(135deg, var(--primary) 0%, var(--cyan) 100%)",
  "linear-gradient(135deg, var(--teal) 0%, #30d158 100%)",
  "linear-gradient(135deg, var(--amber) 0%, #f59e0b 100%)",
  "linear-gradient(135deg, var(--rose) 0%, #f43f5e 100%)",
];

/* ──────────────────────── WELCOME HEADER ──────────────────────── */

function WelcomeHeader({ user, presenceEmps, tasks, campaigns, userProfile, isSuperAdmin }: {
  user: User;
  presenceEmps: PresenceEmployee[];
  tasks: ApiTask[];
  campaigns: ApiCampaign[];
  userProfile: UserProfile | null;
  isSuperAdmin: boolean;
}) {
  const profileName = userProfile?.firstName ?? user.firstName;
  const pendingTasks = tasks.filter((t) => t.status === "pending").length;
  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  const liveCount = presenceEmps.filter((e) => e.isLive).length;
  const officeCount = presenceEmps.filter((e) => e.status === "office" || e.status === "overtime").length;
  const remoteCount = presenceEmps.filter((e) => e.status === "remote").length;
  const lateCount = presenceEmps.filter((e) => e.status === "late").length;
  const absentCount = presenceEmps.filter((e) => e.status === "absent").length;

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const timeKey = `${now.getHours()}-${now.getMinutes()}`;

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <motion.div className="min-w-0" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
        <p className="text-caption mb-0.5">Single Solution Sync</p>
        <h1 className="text-title"><span style={{ color: "var(--primary)" }}>{getGreeting()}</span><span style={{ color: "var(--fg)" }}>, {profileName}!</span></h1>
        <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px]">
          {isSuperAdmin ? (
            <>
              <span className="badge badge-office">{officeCount} Office</span>
              <span className="badge badge-remote">{remoteCount} Remote</span>
              {lateCount > 0 && <span className="badge badge-late">{lateCount} Late</span>}
              <span className="badge badge-absent">{absentCount} Absent</span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "#10b98115", color: "#10b981" }}>{liveCount} live</span>
            </>
          ) : (
            <p className="text-subhead">You have <span className="font-bold" style={{ color: "var(--amber)" }}>{pendingTasks}</span> tasks pending · <span className="font-bold" style={{ color: "var(--teal)" }}>{activeCampaigns}</span> active campaigns</p>
          )}
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="card group relative overflow-hidden p-4 sm:min-w-[220px] shrink-0">
        <div className="pointer-events-none absolute -right-2 -top-2 h-16 w-16 rounded-bl-[50px] opacity-10 transition-opacity group-hover:opacity-15" style={{ background: blobGradients[0] }} />
        <p className="text-caption mb-1">Local time</p>
        <AnimatePresence mode="wait">
          <motion.div key={timeKey} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
            <span className="text-title block tabular-nums" style={{ color: "var(--fg)" }}>{formatClock(now)}</span>
            <span className="text-caption">{formatClockDate(now)}</span>
          </motion.div>
        </AnimatePresence>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[9px]">
          {pendingTasks > 0 && <span className="rounded-md px-1.5 py-0.5 font-semibold" style={{ background: "#f59e0b12", color: "#f59e0b" }}>{pendingTasks} new tasks</span>}
          {activeCampaigns > 0 && <span className="rounded-md px-1.5 py-0.5 font-semibold" style={{ background: "rgba(48,209,88,0.1)", color: "var(--teal)" }}>{activeCampaigns} campaigns</span>}
        </div>
      </motion.div>
    </header>
  );
}

/* ──────────────────────── SELF OVERVIEW CARD (DeveloperPreview style) ──────────────────────── */

function SelfOverviewCard({ pa, userProfile, user }: {
  pa: PersonalAttendance | null;
  userProfile: UserProfile | null;
  user: User;
}) {
  if (!pa) return null;
  const todayHours = pa.todayMinutes / 60;
  const shiftTarget = userProfile?.workShift
    ? getShiftMinutes(userProfile.workShift.start, userProfile.workShift.end, userProfile.workShift.breakTime)
    : 480;
  const shiftPct = Math.min(100, Math.round((pa.todayMinutes / shiftTarget) * 100));
  const isPresent = pa.todaySessions > 0 || pa.todayMinutes > 0;
  const statusColor = isPresent ? (pa.isOnTime ? "#10b981" : "#f59e0b") : "#f43f5e";
  const statusLabel = isPresent ? (pa.isOnTime ? "Present" : "Late") : "Absent";
  const profileName = userProfile?.firstName ?? user.firstName;
  const profileLast = userProfile?.lastName ?? user.lastName;
  const officePct = pa.officeMinutes + pa.remoteMinutes > 0 ? Math.round((pa.officeMinutes / (pa.officeMinutes + pa.remoteMinutes)) * 100) : 0;
  const remotePct = 100 - officePct;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="card p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex flex-col items-center gap-3 sm:items-start">
          {userProfile?.profileImage ? (
            <img src={userProfile.profileImage} alt="" className="h-20 w-20 rounded-full object-cover shadow-lg sm:h-24 sm:w-24" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full text-xl font-semibold text-white shadow-lg sm:h-24 sm:w-24 sm:text-2xl" style={{ background: "linear-gradient(135deg, var(--primary), var(--cyan))" }}>{initials(profileName, profileLast)}</div>
          )}
          <span className="badge" style={{ background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}30` }}>{statusLabel}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h2 className="text-headline" style={{ color: "var(--fg)" }}>{profileName} {profileLast}</h2>
            <p className="text-subhead">{userProfile?.department ?? ROLE_DESIGNATION[user.role]}</p>
            <p className="text-caption mt-0.5">{user.email}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="card-static rounded-xl p-3">
              <p className="text-caption">First entry</p>
              <p className="text-callout font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{pa.firstEntry ?? "—"}</p>
            </div>
            <div className="card-static rounded-xl p-3">
              <p className="text-caption">Hours logged</p>
              <p className="text-callout font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{todayHours >= 1 ? todayHours.toFixed(1) + "h" : pa.todayMinutes + "m"}</p>
            </div>
            <div className="card-static col-span-2 rounded-xl p-3 sm:col-span-1">
              <p className="text-caption">Office / Remote</p>
              <p className="text-callout font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{formatMinutes(pa.officeMinutes)} / {formatMinutes(pa.remoteMinutes)}</p>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-secondary)" }}>{officePct}% office · {remotePct}% remote</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-caption" style={{ color: "var(--fg-secondary)" }}>Shift progress</span>
              <span className="text-caption tabular-nums" style={{ color: "var(--fg-secondary)" }}>{pa.todayMinutes} / {shiftTarget} min ({shiftPct}%)</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
              <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${shiftPct}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} style={{ background: "var(--primary)" }} />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ──────────────────────── TODAY ACTIVITY TIMELINE ──────────────────────── */

function TodayTimelineCard({ pa, tasks }: { pa: PersonalAttendance | null; tasks: ApiTask[] }) {
  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);
  const inProgressTasks = useMemo(() => tasks.filter((t) => t.status === "inProgress"), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((t) => t.status === "completed"), [tasks]);
  const isLive = pa && (pa.todaySessions > 0 || pa.todayMinutes > 0);
  const statusColor = isLive ? "#10b981" : "var(--fg-tertiary)";

  const events = useMemo(() => {
    const evs: { key: string; dot: string; time: string; label: string }[] = [];
    if (pa?.firstEntry) evs.push({ key: "login", dot: statusColor, time: pa.firstEntry, label: `Checked in at ${pa.firstEntry}` });
    if (pa && pa.todaySessions > 1) evs.push({ key: "sessions", dot: "var(--amber)", time: `${pa.todaySessions} sessions`, label: `${pa.todaySessions} sessions today (${formatMinutes(pa.officeMinutes)} office, ${formatMinutes(pa.remoteMinutes)} remote)` });
    if (pa && pa.todayMinutes > 0) evs.push({ key: "active", dot: "var(--teal)", time: "Now", label: `Active now · ${formatMinutes(pa.todayMinutes)} logged` });
    if (evs.length === 0) evs.push({ key: "empty", dot: "var(--fg-tertiary)", time: "—", label: "No activity yet today" });
    return evs;
  }, [pa, statusColor]);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05, ease: [0.22, 1, 0.36, 1] }} className="card-static flex flex-col p-5 sm:p-6">
      <h3 className="text-section-header mb-4">Today&apos;s Activity</h3>
      <ul className="relative flex flex-col gap-0 pl-4">
        <span className="absolute bottom-1 left-[7px] top-1 w-px" style={{ background: "var(--border-strong)" }} aria-hidden />
        {events.map((ev, i) => (
          <motion.li key={ev.key} initial={{ x: -8, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 + i * 0.07 }} className="relative flex gap-3 pb-5 last:pb-0">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ev.dot, boxShadow: "0 0 0 2px var(--bg)" }} />
            <div className="min-w-0 flex-1">
              <span className="text-caption tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{ev.time}</span>
              <p className="text-callout mt-0.5" style={{ color: "var(--fg)" }}>{ev.label}</p>
            </div>
          </motion.li>
        ))}
      </ul>

      <div className="border-t pt-3 mt-auto" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-callout font-semibold" style={{ color: "var(--fg)" }}>My Tasks</h4>
          {pendingTasks.length > 0 && (
            <motion.span animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity }} className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: "var(--rose)" }}>{pendingTasks.length} Pending</motion.span>
          )}
        </div>
        <div className="flex items-center gap-3 text-caption mb-2">
          <span><span className="font-bold tabular-nums" style={{ color: "var(--amber)" }}>{pendingTasks.length}</span> pending</span>
          <span><span className="font-bold tabular-nums" style={{ color: "var(--primary)" }}>{inProgressTasks.length}</span> active</span>
          <span><span className="font-bold tabular-nums" style={{ color: "var(--teal)" }}>{completedTasks.length}</span> done</span>
        </div>
        {pendingTasks.length > 0 && (
          <div className="space-y-1.5">
            {pendingTasks.slice(0, 4).map((task, ti) => (
              <motion.div key={task._id} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 + ti * 0.06 }} className="flex items-start gap-2 text-[11px]">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)" }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium" style={{ color: "var(--fg)" }}>{task.title}</p>
                  <p className="text-caption">{task.deadline ? new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No deadline"} · {PRIORITY_LABELS[task.priority] ?? task.priority}</p>
                </div>
              </motion.div>
            ))}
            <Link href="/tasks"><span className="text-callout font-semibold" style={{ color: "var(--primary)" }}>View all →</span></Link>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ──────────────────────── INLINE SHIMMER ──────────────────────── */

function Bone({ w = "w-10", h = "h-3" }: { w?: string; h?: string }) {
  return <span className={`shimmer inline-block rounded ${w} ${h}`} />;
}

/* ──────────────────────── PRESENCE EMPLOYEE CARD ──────────────────────── */

function PresenceCard({ emp, empTasks, empCampaigns, attendanceLoading, idx, onPing }: {
  emp: PresenceEmployee;
  empTasks: ApiTask[];
  empCampaigns: ApiCampaign[];
  attendanceLoading?: boolean;
  idx?: number;
  onPing?: (toId: string, toName: string) => void;
}) {
  const pendingTasks = empTasks.filter((t) => t.status === "pending");
  const inProgressTasks = empTasks.filter((t) => t.status === "inProgress");
  const activeCamps = empCampaigns.filter((c) => c.status === "active");

  const shiftMins = getShiftMinutes(emp.shiftStart, emp.shiftEnd, emp.shiftBreakTime);
  const shiftPct = Math.min(100, Math.round((emp.todayMinutes / shiftMins) * 100));
  const overtimeMinutes = emp.todayMinutes > shiftMins ? emp.todayMinutes - shiftMins : 0;

  const liveColor = emp.locationFlagged ? "#ef4444" : emp.isLive ? "#10b981" : "#94a3b8";

  const avatarGradIdx = (idx ?? 0) % AVATAR_GRADIENTS.length;

  return (
    <motion.div
      layout
      custom={idx ?? 0}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={cardHover}
      exit={{ opacity: 0, scale: 0.97 }}
      className="card-static group flex flex-col gap-3 rounded-[var(--radius)] p-3"
      style={{ opacity: !attendanceLoading && !emp.isLive ? 0.7 : 1 }}
    >
      <div className="flex items-start gap-3">
        <motion.div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white ${AVATAR_GRADIENTS[avatarGradIdx]}`}
          animate={emp.isLive && !attendanceLoading ? { boxShadow: [`0 0 0 2px ${STATUS_COLORS[emp.status]}`, `0 0 0 3px ${STATUS_COLORS[emp.status]}`, `0 0 0 2px ${STATUS_COLORS[emp.status]}`] } : undefined}
          style={!emp.isLive || attendanceLoading ? { boxShadow: `0 0 0 2px ${liveColor}40` } : undefined}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          {initials(emp.firstName, emp.lastName)}
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-callout truncate font-semibold" style={{ color: "var(--fg)" }}>{emp.firstName} {emp.lastName}</p>
            {onPing && (
              <motion.button type="button" whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); onPing(emp._id, `${emp.firstName} ${emp.lastName}`); }} title={`Ping ${emp.firstName}`} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors" style={{ color: "var(--primary)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
              </motion.button>
            )}
          </div>
          <p className="text-caption truncate">{emp.designation} · {emp.department}</p>
          {emp.reportsTo && (
            <p className="text-caption truncate flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
              <span style={{ color: "var(--fg-tertiary)" }}>Reports to <span className="font-medium" style={{ color: "var(--fg-secondary)" }}>{emp.reportsTo}</span></span>
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {attendanceLoading ? (
              <Bone w="w-16" h="h-4" />
            ) : (
              <>
                <span className={`badge ${STATUS_BADGE_CLASS[emp.status]}`}>{STATUS_LABELS[emp.status]}</span>
                {emp.isLive && !emp.locationFlagged && (
                  <span className="inline-flex items-center gap-1 badge" style={{ background: "#10b98115", color: "#10b981", border: "1px solid #10b98130" }}>
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "#10b981" }}>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: "#10b981" }} />
                    </span>
                    Live
                  </span>
                )}
                {emp.locationFlagged && (
                  <span className="badge" style={{ background: "#ef444415", color: "#ef4444", border: "1px solid #ef444430" }}>
                    <svg className="inline -mt-px mr-0.5" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    GPS Flagged
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {attendanceLoading ? (
        <div className="flex items-center justify-between border-t border-[var(--border)] pt-2">
          <span className="text-caption">Today</span>
          <Bone w="w-10" h="h-3" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between border-t border-[var(--border)] pt-2">
            <div className="flex items-center gap-3 text-caption">
              <span>{emp.firstEntry ? formatTimeStr(emp.firstEntry) : "—"}</span>
              <span>→</span>
              <span>{emp.isLive ? (emp.status === "remote" ? "Remote" : "Working") : emp.lastExit ? formatTimeStr(emp.lastExit) : (emp.status === "absent" ? "—" : "No exit")}</span>
            </div>
            <span className="text-subhead font-medium tabular-nums" style={{ color: "var(--fg-secondary)" }}>{formatMinutes(emp.todayMinutes)}</span>
          </div>

          <div className="flex flex-wrap gap-1 text-[9px]">
            {emp.officeMinutes > 0 && <span className="rounded-md px-1.5 py-0.5 font-medium" style={{ background: "#10b98112", color: "#10b981" }}>Office {formatMinutes(emp.officeMinutes)}</span>}
            {emp.remoteMinutes > 0 && <span className="rounded-md px-1.5 py-0.5 font-medium" style={{ background: "#007aff12", color: "#007aff" }}>Remote {formatMinutes(emp.remoteMinutes)}</span>}
            {emp.lateBy > 0 && <span className="rounded-md px-1.5 py-0.5 font-medium" style={{ background: "#f59e0b12", color: "#f59e0b" }}>Late +{formatMinutes(emp.lateBy)}</span>}
            {overtimeMinutes > 0 && <span className="rounded-md px-1.5 py-0.5 font-medium" style={{ background: "#8b5cf612", color: "#8b5cf6" }}>OT +{formatMinutes(overtimeMinutes)}</span>}
          </div>

          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
              <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${shiftPct}%` }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} style={{ background: overtimeMinutes > 0 ? "#8b5cf6" : "var(--primary)" }} />
            </div>
            <span className="text-caption tabular-nums font-semibold" style={{ color: "var(--fg-secondary)" }}>{shiftPct}%</span>
          </div>
        </>
      )}

      {!attendanceLoading && (pendingTasks.length > 0 || inProgressTasks.length > 0 || activeCamps.length > 0) && (
        <div className="border-t border-[var(--border)] pt-2 flex flex-wrap gap-1 text-[9px]">
          {pendingTasks.length > 0 && <span className="rounded-full px-1.5 py-0.5 font-semibold" style={{ background: "#f59e0b15", color: "#f59e0b", border: "1px solid #f59e0b30" }}>{pendingTasks.length} pending</span>}
          {inProgressTasks.length > 0 && <span className="rounded-full px-1.5 py-0.5 font-semibold" style={{ background: "var(--primary-light)", color: "var(--primary)", border: "1px solid rgba(0,122,255,0.2)" }}>{inProgressTasks.length} active</span>}
          {activeCamps.slice(0, 2).map((c) => (
            <span key={c._id} className="rounded-full px-1.5 py-0.5 font-medium truncate max-w-[100px]" style={{ background: "rgba(48,209,88,0.1)", color: "var(--teal)" }}>{c.name}</span>
          ))}
          {activeCamps.length > 2 && <span className="rounded-full px-1.5 py-0.5" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>+{activeCamps.length - 2}</span>}
        </div>
      )}
    </motion.div>
  );
}

/* ──────────────────────── ADMIN STAT CARDS (SuperAdmin preview-style) ──────────────────────── */

function AdminStatCards({ otherEmps }: { otherEmps: PresenceEmployee[] }) {
  const officeCount = otherEmps.filter((e) => e.status === "office" || e.status === "overtime").length;
  const lateCount = otherEmps.filter((e) => e.status === "late").length;
  const absentCount = otherEmps.filter((e) => e.status === "absent").length;
  const statItems = [
    { title: "Total Employees", value: otherEmps.length, caption: "Active roster", gradient: statIconGradients[0], blob: blobGradients[0], icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
    { title: "In Office", value: officeCount, caption: "On-site now", gradient: statIconGradients[1], blob: blobGradients[1], icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
    { title: "Late Today", value: lateCount, caption: "After grace", gradient: statIconGradients[2], blob: blobGradients[2], icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
    { title: "Absent Today", value: absentCount, caption: "No check-in", gradient: statIconGradients[3], blob: blobGradients[3], icon: <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg> },
  ];

  return (
    <motion.div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" variants={staggerContainerFast} initial="hidden" animate="visible">
      {statItems.map((stat, i) => (
        <motion.div key={stat.title} className="card group relative overflow-hidden p-4" custom={i} variants={cardVariants} initial="hidden" animate="visible" whileHover={cardHover}>
          <div className="pointer-events-none absolute -right-1 -top-1 h-20 w-20 rounded-bl-[50px] opacity-10 transition-opacity group-hover:opacity-[0.15]" style={{ background: stat.blob }} />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-caption mb-2">{stat.title}</p>
              <span className="text-title block text-2xl font-semibold tabular-nums sm:text-3xl" style={{ color: "var(--fg)" }}><AnimatedNumber value={stat.value} /></span>
              <p className="text-caption mt-1">{stat.caption}</p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm" style={{ background: stat.gradient }}>{stat.icon}</div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

/* ──────────────────────── ADMIN DASHBOARD (SuperAdmin / Manager / Team Lead) ──────────────────────── */

type PresenceFilter = "all" | "office" | "remote" | "late" | "absent";
const PRESENCE_FILTER_ORDER: PresenceFilter[] = ["all", "office", "remote", "late", "absent"];
const PRESENCE_FILTER_LABELS: Record<PresenceFilter, string> = { all: "All", office: "Office", remote: "Remote", late: "Late", absent: "Absent" };

function matchPresenceFilter(status: PresenceStatus, f: PresenceFilter): boolean {
  if (f === "all") return true;
  if (f === "office") return status === "office" || status === "overtime";
  return status === f;
}

const CAMPAIGN_STATUS_COLORS: Record<string, string> = { active: "var(--teal)", paused: "var(--amber)", completed: "var(--primary)", cancelled: "var(--rose)" };

function AdminDashboard({
  user,
  presenceEmps,
  presenceLoading,
  tasks,
  personalAttendance,
  campaigns,
  teams,
  userProfile,
}: {
  user: User;
  presenceEmps: PresenceEmployee[];
  presenceLoading: boolean;
  tasks: ApiTask[];
  personalAttendance: PersonalAttendance | null;
  campaigns: ApiCampaign[];
  teams: ApiTeam[];
  userProfile: UserProfile | null;
}) {
  const isSuperAdmin = user.role === "superadmin";
  const isManager = user.role === "manager";

  const otherEmps = useMemo(() => presenceEmps.filter((e) => e._id !== user.id), [presenceEmps, user.id]);

  const tasksByEmployee = useMemo(() => {
    const map = new Map<string, ApiTask[]>();
    for (const t of tasks) {
      const eid = t.assignedTo?._id;
      if (eid) {
        if (!map.has(eid)) map.set(eid, []);
        map.get(eid)!.push(t);
      }
    }
    return map;
  }, [tasks]);

  const campaignsByEmployee = useMemo(() => {
    const map = new Map<string, ApiCampaign[]>();
    for (const c of campaigns) {
      for (const e of c.tags.employees) {
        if (!map.has(e._id)) map.set(e._id, []);
        map.get(e._id)!.push(c);
      }
    }
    return map;
  }, [campaigns]);

  const teamBreakdown = useMemo(() => {
    if (teams.length === 0) return [];
    return teams.map((team) => {
      const members = otherEmps.filter((e) => e.teamIds?.includes(team._id));
      const present = members.filter((m) => m.status !== "absent").length;
      const live = members.filter((m) => m.isLive).length;
      const late = members.filter((m) => m.status === "late").length;
      return { team, members, present, live, absent: members.length - present, late, total: members.length };
    });
  }, [teams, otherEmps]);

  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>("all");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const filteredPresence = useMemo(() => {
    let list = otherEmps;
    if (selectedTeamId) list = list.filter((e) => e.teamIds?.includes(selectedTeamId));
    return list
      .filter((e) => matchPresenceFilter(e.status, presenceFilter))
      .sort((a, b) => {
        if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
        return b.todayMinutes - a.todayMinutes;
      });
  }, [otherEmps, presenceFilter, selectedTeamId]);

  const activeCampaigns = useMemo(() => campaigns.filter((c) => c.status === "active"), [campaigns]);
  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);
  const liveCount = otherEmps.filter((e) => e.isLive).length;

  const [pingSending, setPingSending] = useState<string | null>(null);
  const [pingSuccess, setPingSuccess] = useState<string | null>(null);

  const handlePing = useCallback(async (toId: string, toName: string) => {
    if (pingSending) return;
    setPingSending(toId);
    try {
      const res = await fetch("/api/ping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: toId }) });
      if (res.ok) {
        setPingSuccess(toName);
        setTimeout(() => setPingSuccess(null), 2500);
      }
    } catch { /* ignore */ }
    setPingSending(null);
  }, [pingSending]);

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Welcome header */}
      <WelcomeHeader user={user} presenceEmps={otherEmps} tasks={tasks} campaigns={campaigns} userProfile={userProfile} isSuperAdmin={isSuperAdmin} />

      {/* 2. SuperAdmin: stat cards; Manager/Lead: Self overview + timeline */}
      {isSuperAdmin ? (
        <AdminStatCards otherEmps={otherEmps} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SelfOverviewCard pa={personalAttendance} userProfile={userProfile} user={user} />
          <TodayTimelineCard pa={personalAttendance} tasks={tasks} />
        </div>
      )}

      {/* 3. Campaigns (left) + Tasks (right) for admin/superadmin */}
      {(activeCampaigns.length > 0 || pendingTasks.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {activeCampaigns.length > 0 && (
            <motion.section className="card p-4 sm:p-5 lg:col-span-5" variants={slideUpItem} initial="hidden" animate="visible">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-headline" style={{ color: "var(--fg)" }}>Active Campaigns</h3>
                <Link href="/campaigns"><span className="text-caption font-semibold" style={{ color: "var(--primary)" }}>View All →</span></Link>
              </div>
              <div className="flex flex-col gap-2">
                {activeCampaigns.slice(0, 8).map((camp, ci) => (
                  <motion.div key={camp._id} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.04 * ci }} whileHover={{ x: 4 }} className="flex items-center gap-3 rounded-xl px-3 py-2 cursor-pointer" style={{ background: "var(--bg-grouped)" }}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${CAMPAIGN_STATUS_COLORS[camp.status]} 15%, transparent)` }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={CAMPAIGN_STATUS_COLORS[camp.status]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-callout font-semibold truncate" style={{ color: "var(--fg)" }}>{camp.name}</p>
                      <div className="flex gap-1.5 mt-0.5">
                        {camp.tags.departments.slice(0, 1).map((d) => <span key={d._id} className="text-[9px] rounded-full px-1.5 py-0.5 font-medium" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>{d.title}</span>)}
                        {camp.tags.teams.slice(0, 1).map((t) => <span key={t._id} className="text-[9px] rounded-full px-1.5 py-0.5 font-medium" style={{ background: "rgba(48,209,88,0.12)", color: "var(--teal)" }}>{t.name}</span>)}
                        <span className="text-caption tabular-nums">{camp.tags.employees.length} people</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}
          {pendingTasks.length > 0 && (
            <motion.section className="card p-4 sm:p-5 lg:col-span-7" variants={slideUpItem} initial="hidden" animate="visible">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-headline" style={{ color: "var(--fg)" }}>Checklist</h3>
                <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity }} className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: "var(--rose)" }}>
                  {pendingTasks.length} Pending
                </motion.div>
              </div>
              <div className="flex flex-col gap-3">
                {pendingTasks.slice(0, 6).map((task, ti) => {
                  const pColors: Record<string, string> = { low: "var(--primary)", medium: "var(--amber)", high: "var(--rose)", urgent: "#ef4444" };
                  const pc = pColors[task.priority] ?? "var(--fg-tertiary)";
                  return (
                    <motion.div key={task._id} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.08 + ti * 0.06 }} whileHover={{ x: 5 }} className="flex items-start gap-3 cursor-pointer">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${pc} 15%, transparent)` }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={pc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          {task.priority === "urgent" ? <><path d="M12 2v10l4 2" /><circle cx="12" cy="12" r="10" /></> : task.priority === "high" ? <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" /> : <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>}
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-callout font-semibold line-clamp-1" style={{ color: "var(--fg)" }}>{task.title}</p>
                          <span className="text-caption rounded-md px-1.5 py-0.5 font-semibold" style={{ background: `color-mix(in srgb, ${pc} 15%, transparent)`, color: pc }}>{PRIORITY_LABELS[task.priority] ?? task.priority}</span>
                        </div>
                        <p className="text-caption line-clamp-1">{task.deadline ? new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No deadline"}{task.assignedTo ? ` · ${task.assignedTo.about?.firstName ?? ""} ${task.assignedTo.about?.lastName ?? ""}` : ""}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              <Link href="/tasks"><motion.button type="button" className="mt-4 w-full text-center text-callout font-semibold" style={{ color: "var(--primary)" }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>View All Tasks →</motion.button></Link>
            </motion.section>
          )}
        </div>
      )}

      {/* 4. Team breakdown */}
      {teamBreakdown.length > 0 && (
        <motion.div className="card-static overflow-hidden" variants={fadeInItem} initial="hidden" animate="visible">
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <h3 className="text-headline" style={{ color: "var(--fg)" }}>{isManager ? "Teams" : "My Teams"}</h3>
            {selectedTeamId && (
              <button type="button" onClick={() => setSelectedTeamId(null)} className="text-caption font-semibold" style={{ color: "var(--primary)" }}>Show All</button>
            )}
          </div>
          <div className="divide-y divide-[var(--border)]">
            {teamBreakdown.map((tb) => {
              const isSelected = selectedTeamId === tb.team._id;
              return (
                <button key={tb.team._id} type="button" onClick={() => setSelectedTeamId(isSelected ? null : tb.team._id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--hover-bg)] transition-colors ${isSelected ? "bg-[var(--primary-light)]" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-callout font-semibold truncate" style={{ color: "var(--fg)" }}>{tb.team.name}</p>
                    {tb.team.lead && <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Lead: {tb.team.lead.about.firstName} {tb.team.lead.about.lastName}</p>}
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 text-caption tabular-nums">
                    <span className="font-semibold" style={{ color: "#10b981" }}>{tb.live} live</span>
                    <span style={{ color: "var(--fg-secondary)" }}>{tb.present} in</span>
                    <span style={{ color: "#f43f5e" }}>{tb.absent} out</span>
                    {tb.late > 0 && <span style={{ color: "#f59e0b" }}>{tb.late} late</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* 5. Live Presence — employee cards */}
      <motion.section className="card relative overflow-hidden p-4 sm:p-5" variants={slideUpItem} initial="hidden" animate="visible">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ backgroundColor: "var(--teal)" }} /><span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--teal)" }} /></span>
            <h2 className="text-headline" style={{ color: "var(--fg)" }}>Team Status</h2>
            <span className="text-caption font-semibold" style={{ color: "#10b981" }}>{liveCount} live</span>
            <span className="text-caption" style={{ color: "var(--fg-tertiary)" }}>· {filteredPresence.length} shown</span>
            {selectedTeamId && (
              <span className="badge" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>{teams.find((t) => t._id === selectedTeamId)?.name ?? "Team"}</span>
            )}
          </div>
          <LayoutGroup id="admin-presence-filter">
            <div className="relative flex flex-wrap gap-1 rounded-xl p-1" style={{ background: "var(--bg-grouped)" }}>
              {PRESENCE_FILTER_ORDER.map((f) => {
                const active = presenceFilter === f;
                return (
                  <button key={f} type="button" onClick={() => setPresenceFilter(f)} className="btn btn-sm relative z-10 min-h-0 border-0 bg-transparent px-3 py-1.5 shadow-none" style={{ color: active ? "var(--fg)" : "var(--fg-secondary)" }}>
                    {active && <motion.span layoutId="admin-presence-active" className="absolute inset-0 rounded-lg" style={{ background: "var(--bg-elevated)", border: "0.5px solid var(--border)", boxShadow: "var(--shadow-sm)" }} transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
                    <span className="relative text-caption font-semibold">{PRESENCE_FILTER_LABELS[f]}</span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>
        </div>
        {filteredPresence.length > 0 ? (
          <motion.div className="grid grid-cols-2 gap-3 xl:grid-cols-4 md:grid-cols-3" variants={staggerContainerFast} initial="hidden" animate="visible">
            <AnimatePresence mode="popLayout">
              {filteredPresence.map((emp, idx) => (
                <PresenceCard
                  key={emp._id}
                  emp={emp}
                  empTasks={tasksByEmployee.get(emp._id) ?? []}
                  empCampaigns={campaignsByEmployee.get(emp._id) ?? []}
                  attendanceLoading={presenceLoading}
                  idx={idx}
                  onPing={handlePing}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : presenceLoading ? (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 md:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="shimmer h-44 rounded-xl" />)}
          </div>
        ) : (
          <p className="py-8 text-center text-caption" style={{ color: "var(--fg-tertiary)" }}>No employees match this filter</p>
        )}
      </motion.section>

      {/* Ping toast */}
      <AnimatePresence>
        {pingSuccess && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 shadow-lg" style={{ background: "var(--primary)", color: "#fff" }}>
            <p className="text-callout font-semibold flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
              Pinged {pingSuccess}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ──────────────────────── OTHER ROLES OVERVIEW ──────────────────────── */

function OtherRoleOverview({ user, tasks, personalAttendance, weeklyRecords, monthlyStats: ms, userProfile }: { user: User; tasks: ApiTask[]; personalAttendance: PersonalAttendance | null; weeklyRecords: WeeklyDay[]; monthlyStats: FullMonthlyStats | null; userProfile: UserProfile | null }) {
  const pa = personalAttendance;
  const profileName = userProfile?.firstName ?? user.firstName;
  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(id); }, []);

  const reportsToName = userProfile?.reportsTo?.about
    ? `${userProfile.reportsTo.about.firstName} ${userProfile.reportsTo.about.lastName}`.trim()
    : null;
  const reportsToId = userProfile?.reportsTo?._id ?? null;

  /* ── Manager / lead live status ── */
  interface ManagerStatus {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    userRole: string;
    department: string;
    status: PresenceStatus;
    todayMinutes: number;
    officeMinutes: number;
    remoteMinutes: number;
    firstEntry: string | null;
    lastExit: string | null;
    shiftStart: string;
    shiftEnd: string;
    isLive: boolean;
  }
  const [mgrStatus, setMgrStatus] = useState<ManagerStatus | null>(null);
  const [mgrLoading, setMgrLoading] = useState(true);

  const fetchMgrStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance/presence/manager");
      if (!res.ok) return;
      const data = await res.json();
      setMgrStatus(data);
    } catch { /* silent */ }
    setMgrLoading(false);
  }, []);

  useEffect(() => {
    if (!reportsToId) { setMgrLoading(false); return; }
    fetchMgrStatus();
    const id = window.setInterval(fetchMgrStatus, 30_000);
    return () => window.clearInterval(id);
  }, [reportsToId, fetchMgrStatus]);

  const [pingSending, setPingSending] = useState(false);
  const [pingSuccess, setPingSuccess] = useState<string | null>(null);

  const handlePingManager = useCallback(async () => {
    if (!reportsToId || pingSending) return;
    setPingSending(true);
    try {
      const res = await fetch("/api/ping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: reportsToId }) });
      if (res.ok) {
        setPingSuccess(reportsToName ?? "Manager");
        setTimeout(() => setPingSuccess(null), 2500);
      }
    } catch { /* ignore */ }
    setPingSending(false);
  }, [reportsToId, reportsToName, pingSending]);

  const monthlyOfficePct = ms && (ms.totalOfficeHours + ms.totalRemoteHours > 0) ? (ms.totalOfficeHours / (ms.totalOfficeHours + ms.totalRemoteHours)) * 100 : 0;
  const monthlyRemotePct = 100 - monthlyOfficePct;

  return (
    <div className="relative min-h-full w-full overflow-x-hidden">
      <div className="relative z-10 mx-auto max-w-6xl space-y-6">
        {/* Welcome header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="space-y-1">
            <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Single Solution Sync</p>
            <h1 className="text-title"><span style={{ color: "var(--primary)" }}>{getGreeting()}, {profileName}!</span></h1>
            <p className="text-subhead mt-1">You have {pendingTasks.length} tasks pending</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-start gap-0.5 sm:items-end">
            <span className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Local time</span>
            <span className="text-headline tabular-nums" style={{ color: "var(--fg)" }}>{formatClock(now)}</span>
            <span className="text-caption">{formatClockDate(now)}</span>
          </motion.div>
        </header>

        {/* Reports-to card — shows manager/lead live status */}
        {reportsToName && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="card-static rounded-xl p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
                  {mgrStatus?.isLive && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2" style={{ borderColor: "var(--bg-elevated)", background: "#10b981" }}>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ background: "#10b981" }} />
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Reports to</p>
                  <p className="text-callout font-semibold truncate" style={{ color: "var(--fg)" }}>{reportsToName}</p>
                  {mgrStatus && <p className="text-caption truncate" style={{ color: "var(--fg-tertiary)" }}>{ROLE_DESIGNATION[mgrStatus.userRole] ?? mgrStatus.userRole} · {mgrStatus.department}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {mgrLoading ? (
                  <Bone w="w-16" h="h-5" />
                ) : mgrStatus ? (
                  <span className={`badge ${STATUS_BADGE_CLASS[mgrStatus.status]}`}>
                    {mgrStatus.isLive && (
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full mr-1" style={{ background: "currentColor" }}>
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ background: "currentColor" }} />
                      </span>
                    )}
                    {STATUS_LABELS[mgrStatus.status]}
                  </span>
                ) : null}
                <motion.button type="button" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handlePingManager} disabled={pingSending} className="btn btn-sm flex items-center gap-1.5" style={{ background: "var(--primary)", color: "#fff", opacity: pingSending ? 0.5 : 1 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                  Ping
                </motion.button>
              </div>
            </div>

            {/* Status details row */}
            {mgrLoading ? (
              <div className="flex gap-4">
                <Bone w="w-20" h="h-4" /><Bone w="w-24" h="h-4" /><Bone w="w-16" h="h-4" />
              </div>
            ) : mgrStatus && mgrStatus.status !== "absent" ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption" style={{ color: "var(--fg-secondary)" }}>
                {mgrStatus.firstEntry && (
                  <span className="flex items-center gap-1">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                    Arrived {new Date(mgrStatus.firstEntry).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                  {formatMinutes(mgrStatus.todayMinutes)} worked
                </span>
                <span className="flex items-center gap-1">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  {mgrStatus.officeMinutes > 0 && mgrStatus.remoteMinutes > 0
                    ? `${formatMinutes(mgrStatus.officeMinutes)} office · ${formatMinutes(mgrStatus.remoteMinutes)} remote`
                    : mgrStatus.officeMinutes > 0 ? "In Office" : "Remote"}
                </span>
                {mgrStatus.isLive && mgrStatus.shiftEnd && (
                  <span className="flex items-center gap-1">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
                    Shift until {mgrStatus.shiftEnd}
                  </span>
                )}
                {!mgrStatus.isLive && mgrStatus.lastExit && (
                  <span className="flex items-center gap-1">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
                    Left {new Date(mgrStatus.lastExit).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                )}
              </div>
            ) : mgrStatus?.status === "absent" ? (
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Not checked in today</p>
            ) : null}
          </motion.div>
        )}

        {/* Self overview + Activity timeline */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SelfOverviewCard pa={pa} userProfile={userProfile} user={user} />
          <TodayTimelineCard pa={pa} tasks={tasks} />
        </div>

        {/* Weekly overview — horizontal scroll strip */}
        {weeklyRecords.length > 0 && (
          <section className="space-y-3">
            <motion.h3 variants={fadeInItem} initial="hidden" animate="visible" className="text-section-header">Weekly overview</motion.h3>
            <div className="scrollbar-hide -mx-1 flex gap-3 overflow-x-auto pb-2 pt-1">
              {weeklyRecords.map((day, i) => {
                const d = new Date(day.date + "T12:00:00");
                const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
                const isToday = day.date === now.toISOString().slice(0, 10);
                const dot = !day.isPresent ? "#f43f5e" : !day.isOnTime ? "#f59e0b" : "#10b981";
                return (
                  <motion.div key={day.date} custom={i} variants={cardVariants} initial="hidden" animate="visible" whileHover={cardHover} className={`card-static flex min-w-[112px] shrink-0 flex-col gap-2 rounded-2xl p-4 ${isToday ? "border-2" : ""}`} style={isToday ? { borderColor: "var(--primary)", boxShadow: "var(--shadow-sm), 0 0 24px rgba(0,122,255,0.18)" } : undefined}>
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
          </section>
        )}

        {/* Monthly summary */}
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
                <p className="text-title mt-1 text-[var(--primary)]"><AnimatedNumber value={ms.onTimePercentage} suffix="%" /></p>
              </div>
              <div className="card-static rounded-xl p-4">
                <p className="text-caption">Avg. daily hours</p>
                <p className="text-title mt-1" style={{ color: "var(--fg)" }}><AnimatedNumber value={ms.averageDailyHours} suffix="h" /></p>
              </div>
              <div className="card-static rounded-xl p-4">
                <p className="text-caption">Total hours</p>
                <p className="text-title mt-1" style={{ color: "var(--fg)" }}><AnimatedNumber value={ms.totalWorkingHours} suffix="h" /></p>
              </div>
            </div>
            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-caption" style={{ color: "var(--fg-secondary)" }}>Office vs remote (hours)</span>
                <span className="text-caption tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{ms.totalOfficeHours.toFixed(0)}h · {ms.totalRemoteHours.toFixed(0)}h</span>
              </div>
              <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                <motion.div className="h-full" style={{ background: "var(--teal)" }} initial={{ width: 0 }} animate={{ width: `${monthlyOfficePct}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
                <motion.div className="h-full" style={{ background: "var(--primary)" }} initial={{ width: 0 }} animate={{ width: `${monthlyRemotePct}%` }} transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} />
              </div>
              <div className="flex justify-between text-caption" style={{ color: "var(--fg-tertiary)" }}>
                <span>Office {monthlyOfficePct.toFixed(0)}%</span>
                <span>Remote {monthlyRemotePct.toFixed(0)}%</span>
              </div>
            </div>
          </motion.section>
        )}
      </div>

      {/* Ping success toast */}
      <AnimatePresence>
        {pingSuccess && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 shadow-lg" style={{ background: "var(--primary)", color: "#fff" }}>
            <p className="text-callout font-semibold flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
              Pinged {pingSuccess}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (raw as any[]).map((p) => ({
        _id: p._id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email ?? "",
        designation: ROLE_DESIGNATION[p.userRole] ?? p.userRole,
        department: p.department,
        reportsTo: p.reportsTo ?? null,
        reportsToId: p.reportsToId ?? null,
        status: p.status as PresenceStatus,
        todayMinutes: p.todayMinutes,
        officeMinutes: p.officeMinutes ?? 0,
        remoteMinutes: p.remoteMinutes ?? 0,
        lateBy: p.lateBy ?? 0,
        breakMinutes: p.breakMinutes ?? 0,
        firstEntry: p.firstEntry ?? null,
        lastExit: p.lastExit ?? null,
        shiftStart: p.shiftStart ?? "10:00",
        shiftEnd: p.shiftEnd ?? "19:00",
        shiftBreakTime: p.shiftBreakTime ?? 60,
        isLive: p.isLive ?? false,
        locationFlagged: p.locationFlagged ?? false,
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
        const res = await fetch("/api/attendance/presence");
        if (res.ok) {
          const presRes = await res.json();
          parsePresence(presRes);
        }
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
    Promise.all([fetchFull(), fetchLive()]).then(() => {
      if (isAdminRole && !realPresence) {
        setTimeout(fetchLive, 1500);
      }
    }).finally(() => {
      setLoading(false);
      initialDone.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      email: e.email ?? "",
      designation: ROLE_DESIGNATION[e.userRole] ?? e.userRole,
      department: (e.department as { title?: string })?.title ?? "Unassigned",
      reportsTo: null,
      reportsToId: null,
      status: "absent" as PresenceStatus,
      todayMinutes: 0,
      officeMinutes: 0,
      remoteMinutes: 0,
      lateBy: 0,
      breakMinutes: 0,
      firstEntry: null,
      lastExit: null,
      shiftStart: e.workShift?.shift?.start ?? "10:00",
      shiftEnd: e.workShift?.shift?.end ?? "19:00",
      shiftBreakTime: e.workShift?.breakTime ?? 60,
      isLive: false,
      locationFlagged: false,
      isActive: true,
      teamIds: e.teams?.map((t) => t._id) ?? [],
    }));
  }, [realPresence, employees]);

  if (user.role === "superadmin" || user.role === "manager" || user.role === "teamLead") {
    return (
      <AdminDashboard
        user={user}
        presenceEmps={presenceEmps}
        presenceLoading={presenceLoading}
        tasks={tasks}
        personalAttendance={personalAttendance}
        campaigns={campaigns}
        teams={teams}
        userProfile={userProfile}
      />
    );
  }

  return <OtherRoleOverview user={user} tasks={tasks} personalAttendance={personalAttendance} weeklyRecords={weeklyRecords} monthlyStats={monthlyStats} userProfile={userProfile} />;
}
