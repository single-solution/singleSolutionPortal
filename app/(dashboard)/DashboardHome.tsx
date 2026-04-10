"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
import { EmployeeCard } from "./components/EmployeeCard";
import { ScopeStrip } from "./components/ScopeStrip";
import { useGuide } from "@/lib/useGuide";
import { usePermissions } from "@/lib/usePermissions";
import { useLive } from "@/lib/useLive";
import { dashboardTour } from "@/lib/tourConfigs";
import {
  getTodaySchedule,
  resolveGraceMinutes,
  resolveWeeklySchedule,
  type WeeklySchedule,
} from "@/lib/schedule";

/* ──────────────────────── TYPES ──────────────────────── */

interface User {
  id: string;
  email: string;
  isSuperAdmin?: boolean;
  firstName: string;
  lastName: string;
  username: string;
}

interface ApiEmployee {
  _id: string;
  email: string;
  username: string;
  about: { firstName: string; lastName: string };
  isSuperAdmin?: boolean;
  isActive: boolean;
  department?: { _id: string; title: string; slug?: string };
  weeklySchedule?: WeeklySchedule;
  shiftType?: string;
}

interface ApiTask {
  _id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  deadline?: string;
  createdAt?: string;
  assignedTo?: { _id?: string; about?: { firstName: string; lastName: string }; email?: string; department?: { title?: string } | string };
  createdBy?: { _id?: string; about?: { firstName: string; lastName: string }; email?: string };
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
  clockIn: string | null;
  clockOut: string | null;
  firstOfficeEntry: string | null;
  lastOfficeExit: string | null;
  monthlyAvgHours: number;
  monthlyOnTimePct: number;
  avgInTime: string;
  avgOutTime: string;
}

type PresenceStatus = "office" | "remote" | "late" | "overtime" | "absent";

interface PresenceEmployee {
  _id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  designation: string;
  department: string;
  departmentId: string | null;
  status: PresenceStatus;
  todayMinutes: number;
  officeMinutes: number;
  remoteMinutes: number;
  lateBy: number;
  isLateToOffice: boolean;
  lateToOfficeBy: number;
  breakMinutes: number;
  sessionCount: number;
  firstEntry: string | null;
  firstOfficeEntry: string | null;
  lastOfficeExit: string | null;
  lastExit: string | null;
  shiftStart: string;
  shiftEnd: string;
  shiftBreakTime: number;
  isLive: boolean;
  locationFlagged: boolean;
  flagReason?: string | null;
  flagCoords?: { lat: number; lng: number } | null;
  isActive: boolean;
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
  };
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
  weeklySchedule?: WeeklySchedule;
  shiftType?: string;
  graceMinutes?: number;
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

/* ──────────────────────── HELPERS ──────────────────────── */

/* eslint-disable @typescript-eslint/no-explicit-any */
function extractClockTimes(sessions: any[]): { clockIn: string | null; clockOut: string | null } {
  if (!sessions?.length) return { clockIn: null, clockOut: null };
  const sorted = [...sessions].sort((a, b) => new Date(a.sessionTime?.start).getTime() - new Date(b.sessionTime?.start).getTime());
  const clockIn = sorted[0]?.sessionTime?.start ?? null;
  const last = sorted[sorted.length - 1];
  const clockOut = last?.sessionTime?.end ?? last?.lastActivity ?? null;
  return { clockIn: clockIn ? new Date(clockIn).toISOString() : null, clockOut: clockOut ? new Date(clockOut).toISOString() : null };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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

function RefreshBtn({ onRefresh }: { onRefresh: () => void }) {
  const [spinning, setSpinning] = useState(false);
  return (
    <motion.button
      type="button"
      onClick={() => { setSpinning(true); onRefresh(); setTimeout(() => setSpinning(false), 800); }}
      animate={{ rotate: spinning ? 360 : 0 }}
      transition={{ duration: 0.6 }}
      className="ml-2 p-1 rounded-full hover:bg-[var(--bg-secondary)] transition-colors"
      style={{ color: "var(--fg-tertiary)" }}
      title="Refresh"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
    </motion.button>
  );
}

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


/* ──────────────────────── WELCOME HEADER ──────────────────────── */

function WelcomeHeader({ user, presenceEmps, tasks, campaigns, userProfile, hasTeamAccess, dataLoading, scopeStrip }: {
  user: User;
  presenceEmps: PresenceEmployee[];
  tasks: ApiTask[];
  campaigns: ApiCampaign[];
  userProfile: UserProfile | null;
  hasTeamAccess: boolean;
  dataLoading?: boolean;
  scopeStrip?: React.ReactNode;
}) {
  const profileName = userProfile?.firstName ?? user.firstName;
  const pendingTasks = tasks.filter((t) => t.status === "pending").length;
  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  // "In Office" = currently live AND located in office (not just today's status)
  const liveOfficeCount = presenceEmps.filter((e) => e.isLive && (e.status === "office" || e.status === "overtime")).length;
  const liveRemoteCount = presenceEmps.filter((e) => e.isLive && e.status === "remote").length;
  const lateCount = presenceEmps.filter((e) => (e.lateBy ?? 0) > 0).length;
  const absentCount = presenceEmps.filter((e) => e.status === "absent").length;

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const timeKey = `${now.getHours()}-${now.getMinutes()}`;

  return (
    <header data-tour="dashboard-welcome" className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <motion.div className="min-w-0" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
        <p className="text-caption mb-0.5">Single Solution Sync</p>
        <h1 className="text-title"><span style={{ color: "var(--primary)" }}>{getGreeting()}</span><span style={{ color: "var(--fg)" }}>, {profileName}!</span></h1>
        <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px]">
          {hasTeamAccess ? (
            <>
              <span className="badge badge-office">{liveOfficeCount} In Office</span>
              <span className="badge badge-remote">{liveRemoteCount} Remote</span>
              {lateCount > 0 && <span className="badge badge-late">{lateCount} Late</span>}
              <span className="badge badge-absent">{absentCount} Absent</span>
            </>
          ) : dataLoading ? (
            <span className="shimmer inline-block h-3.5 w-48 rounded" />
          ) : (
            <p className="text-subhead">You have <span className="font-bold" style={{ color: "var(--amber)" }}>{pendingTasks}</span> tasks pending · <span className="font-bold" style={{ color: "var(--teal)" }}>{activeCampaigns}</span> active campaigns</p>
          )}
            </div>
          </motion.div>
      <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
        {scopeStrip}
        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="card group relative overflow-hidden px-4 py-2.5 shrink-0">
          <div className="pointer-events-none absolute -right-2 -top-2 h-16 w-16 rounded-bl-[50px] opacity-10 transition-opacity group-hover:opacity-15" style={{ background: blobGradients[0] }} />
          <div className="flex items-baseline gap-2">
            <p className="text-caption">Local time</p>
            <span className="text-caption tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{formatClockDate(now)}</span>
          </div>
              <AnimatePresence mode="wait">
                <motion.div key={timeKey} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
                  <span className="text-headline block tabular-nums" style={{ color: "var(--fg)" }}>{formatClock(now)}</span>
                </motion.div>
              </AnimatePresence>
          </motion.div>
        </div>
    </header>
  );
}

/* ──────────────────────── SELF OVERVIEW CARD (DeveloperPreview style) ──────────────────────── */

function SelfOverviewCard({ pa, userProfile, user }: {
  pa: PersonalAttendance | null;
  userProfile: UserProfile | null;
  user: User;
}) {
  const todayForShift = userProfile?.weeklySchedule
    ? getTodaySchedule(
        { weeklySchedule: userProfile.weeklySchedule } as Record<string, unknown>,
        "Asia/Karachi",
      )
    : null;
  const shiftTarget = todayForShift
    ? getShiftMinutes(todayForShift.start, todayForShift.end, todayForShift.breakMinutes)
    : 480;

  if (!pa) {
                return (
      <div className="card p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          <div className="flex flex-col items-center gap-3 sm:items-start">
            <div className="shimmer h-20 w-20 rounded-full sm:h-24 sm:w-24" />
            <Bone w="w-16" h="h-5" />
                  </div>
          <div className="min-w-0 flex-1 space-y-4">
            <div><Bone w="w-40" h="h-5" /><Bone w="w-28" h="h-3" /></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[1, 2, 3].map((i) => <div key={i} className="card-static rounded-xl p-3"><Bone w="w-16" h="h-3" /><Bone w="w-12" h="h-4" /></div>)}
              </div>
            <div className="space-y-2">
              <Bone w="w-full" h="h-2.5" />
            </div>
          </div>
                    </div>
    </div>
  );
}

  const todayHours = pa.todayMinutes / 60;
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
            <p className="text-subhead">{userProfile?.department ?? (user.isSuperAdmin ? "System Administrator" : "Employee")}</p>
            <p className="text-caption mt-0.5">{user.email}</p>
            </div>
          {/* Clock In / Hours / Clock Out */}
          <div className="grid grid-cols-3 gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
            <div className="card-static rounded-xl p-2.5">
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Clock In</p>
              <p className="text-callout font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{pa.clockIn ? formatClock(new Date(pa.clockIn)) : "—"}</p>
          </div>
            <div className="card-static rounded-xl p-2.5 text-center">
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Hours</p>
              <p className="text-callout font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{todayHours >= 1 ? todayHours.toFixed(1) + "h" : pa.todayMinutes + "m"}</p>
            </div>
            <div className="card-static rounded-xl p-2.5 text-right">
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Clock Out</p>
              <p className="text-callout font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{pa.clockOut ? formatClock(new Date(pa.clockOut)) : "—"}</p>
            </div>
            </div>
          {/* Arrived / Office / Left */}
          <div className="grid grid-cols-3 gap-2" style={{ color: "var(--fg-secondary)" }}>
            <div className="card-static rounded-xl p-2.5">
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Arrived</p>
              <p className="text-callout font-semibold tabular-nums">{pa.firstOfficeEntry ? formatClock(new Date(pa.firstOfficeEntry)) : "—"}</p>
          </div>
            <div className="card-static rounded-xl p-2.5 text-center">
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Office</p>
              <p className="text-callout font-semibold tabular-nums">{formatMinutes(pa.officeMinutes)}</p>
        </div>
            <div className="card-static rounded-xl p-2.5 text-right">
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Left</p>
              <p className="text-callout font-semibold tabular-nums">{pa.lastOfficeExit ? formatClock(new Date(pa.lastOfficeExit)) : "—"}</p>
              </div>
            </div>
          {/* Office / Remote split */}
          <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--fg-secondary)" }}>
            <span className="rounded-md px-1.5 py-0.5 font-medium" style={{ background: "#10b98112", color: "#10b981" }}>{formatMinutes(pa.officeMinutes)} office ({officePct}%)</span>
            <span className="rounded-md px-1.5 py-0.5 font-medium" style={{ background: "#007aff12", color: "#007aff" }}>{formatMinutes(pa.remoteMinutes)} remote ({remotePct}%)</span>
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

function TodayTimelineCard({ pa, dataLoading }: { pa: PersonalAttendance | null; dataLoading?: boolean }) {
  const isLive = pa && (pa.todaySessions > 0 || pa.todayMinutes > 0);
  const statusColor = isLive ? "#10b981" : "var(--fg-tertiary)";
  const isLoading = !pa && dataLoading;

  const events = useMemo(() => {
    const evs: { key: string; dot: string; time: string; label: string }[] = [];
    const checkInTime = pa?.clockIn ? formatClock(new Date(pa.clockIn)) : pa?.firstEntry;
    if (checkInTime) evs.push({ key: "login", dot: statusColor, time: checkInTime, label: `Checked in at ${checkInTime}` });
    if (pa && pa.todaySessions > 1) evs.push({ key: "sessions", dot: "var(--amber)", time: `${pa.todaySessions} sessions`, label: `${pa.todaySessions} sessions today (${formatMinutes(pa.officeMinutes)} office, ${formatMinutes(pa.remoteMinutes)} remote)` });
    if (pa && pa.todayMinutes > 0) evs.push({ key: "active", dot: "var(--teal)", time: "Now", label: `Active now · ${formatMinutes(pa.todayMinutes)} logged` });
    if (!isLoading && evs.length === 0) evs.push({ key: "empty", dot: "var(--fg-tertiary)", time: "—", label: "No activity yet today" });
    return evs;
  }, [pa, statusColor, isLoading]);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05, ease: [0.22, 1, 0.36, 1] }} className="card-static flex flex-col p-5 sm:p-6">
      <h3 className="text-section-header mb-4">Today&apos;s Activity</h3>
      {isLoading ? (
        <ul className="relative flex flex-col gap-0 pl-4">
          <span className="absolute bottom-1 left-[7px] top-1 w-px" style={{ background: "var(--border-strong)" }} aria-hidden />
          {[1, 2, 3].map((i) => (
            <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
              <span className="shimmer mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1"><Bone w="w-12" h="h-2.5" /><Bone w="w-32" h="h-3" /></div>
            </li>
          ))}
        </ul>
      ) : (
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
      )}

          </motion.div>
  );
}

/* ──────────────────────── INLINE SHIMMER ──────────────────────── */

function Bone({ w = "w-10", h = "h-3" }: { w?: string; h?: string }) {
  return <span className={`shimmer inline-block rounded ${w} ${h}`} />;
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
  userProfile,
  dataLoading,
  onRefreshLive,
  onRefreshFull,
}: {
  user: User;
  presenceEmps: PresenceEmployee[];
  presenceLoading: boolean;
  tasks: ApiTask[];
  personalAttendance: PersonalAttendance | null;
  campaigns: ApiCampaign[];
  userProfile: UserProfile | null;
  dataLoading: boolean;
  onRefreshLive: () => void;
  onRefreshFull: () => void;
}) {
  const liveUpdates = useLive();
  const isSuperAdmin = user.isSuperAdmin === true;
  const { can: canPerm } = usePermissions();
  const hasTeamAccess = canPerm("attendance_viewTeam");
  const canViewAttendanceDetail = canPerm("attendance_viewDetail");
  const canViewTasks = canPerm("tasks_view");
  const canViewCampaigns = canPerm("campaigns_view");
  const canSendPing = canPerm("ping_send");
  const { registerTour } = useGuide();
  useEffect(() => { registerTour("dashboard", dashboardTour); }, [registerTour]);
  const [scopeDept, setScopeDept] = useState("all");

  const otherEmps = useMemo(() => {
    let list = presenceEmps.filter((e) => e._id !== user.id);
    if (scopeDept !== "all") list = list.filter((e) => e.departmentId === scopeDept);
    return list;
  }, [presenceEmps, user.id, scopeDept]);

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

  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>("all");
  type DashGroupMode = "flat" | "department";
  const [dashGroupMode, setDashGroupMode] = useState<DashGroupMode>("flat");
  const filteredPresence = useMemo(() => {
    return otherEmps
      .filter((e) => matchPresenceFilter(e.status, presenceFilter))
      .sort((a, b) => {
        if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
        return b.todayMinutes - a.todayMinutes;
      });
  }, [otherEmps, presenceFilter]);

  const presenceGrouped = useMemo(() => {
    if (dashGroupMode === "flat") return null;
    const map = new Map<string, { label: string; employees: typeof filteredPresence }>();
    for (const emp of filteredPresence) {
      const key = emp.departmentId ?? "__none__";
      const label = emp.department || "No Department";
      if (!map.has(key)) map.set(key, { label, employees: [] });
      map.get(key)!.employees.push(emp);
    }
    return [...map.values()].sort((a, b) => {
      if (a.label === "No Department") return 1;
      if (b.label === "No Department") return -1;
      return a.label.localeCompare(b.label);
    });
  }, [filteredPresence, dashGroupMode]);

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
    <div className="flex min-h-[calc(100dvh-15rem)] flex-col gap-5">
      {/* 1. Welcome header (includes scope strip on the right) */}
      <WelcomeHeader user={user} presenceEmps={otherEmps} tasks={tasks} campaigns={campaigns} userProfile={userProfile} hasTeamAccess={hasTeamAccess} dataLoading={dataLoading} scopeStrip={<ScopeStrip value={scopeDept} onChange={setScopeDept} />} />

      {/* 2. Self overview + timeline (for Manager/Lead — SuperAdmin exempt from attendance) */}
      {!isSuperAdmin && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SelfOverviewCard pa={personalAttendance} userProfile={userProfile} user={user} />
          <TodayTimelineCard pa={personalAttendance} dataLoading={dataLoading} />
            </div>
      )}

      {/* 3. Team Status + Campaigns/Checklist */}
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-12 lg:grid-rows-[1fr_0.7fr]">
      {/* 3a. Live Presence — employee cards (Team Status) */}
      <motion.section data-tour="dashboard-team-status" className="card relative flex flex-col overflow-visible p-4 sm:p-5 lg:col-span-12 lg:row-span-1" variants={slideUpItem} initial="hidden" animate="visible">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ backgroundColor: "var(--teal)" }} /><span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--teal)" }} /></span>
            <h2 className="text-headline" style={{ color: "var(--fg)" }}>Team Status</h2>
            <RefreshBtn onRefresh={onRefreshLive} />
            {presenceLoading ? (
              <Bone w="w-20" h="h-3.5" />
            ) : (
              <>
                <span className="text-caption font-semibold" style={{ color: "#10b981" }}>{liveCount} live</span>
                <span className="text-caption" style={{ color: "var(--fg-tertiary)" }}>· {filteredPresence.length} shown</span>
              </>
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
            <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
              {(["flat", "department"] as DashGroupMode[]).map((g) => (
                <button key={g} type="button" onClick={() => setDashGroupMode(g)} className={`px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${dashGroupMode === g ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"}`}>
                  {g === "flat" ? "Flat" : "By Dept"}
                </button>
              ))}
        </div>
            </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: "thin" }}>
          {presenceLoading && filteredPresence.length === 0 ? (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 md:grid-cols-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card flex flex-col overflow-hidden">
                <div className="p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="shimmer h-7 w-7 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1"><Bone w="w-20" h="h-3" /></div>
                    <Bone w="w-12" h="h-3.5" />
          </div>
                  <Bone w="w-24" h="h-2" />
                  <div className="mt-1.5 flex justify-between"><Bone w="w-10" h="h-2" /><Bone w="w-14" h="h-2" /></div>
                  <div className="mt-1"><Bone w="w-full" h="h-1.5" /></div>
                  </div>
                </div>
              ))}
            </div>
        ) : filteredPresence.length > 0 ? (
          (() => {
            function renderPresenceCard(emp: PresenceEmployee, idx: number) {
              const empTasks = tasksByEmployee.get(emp._id) ?? [];
              const empCampaigns = campaignsByEmployee.get(emp._id) ?? [];
              const pendingCount = empTasks.filter((t) => t.status === "pending").length;
              const inProgressCount = empTasks.filter((t) => t.status === "inProgress").length;
              const activeCampNames = empCampaigns.filter((c) => c.status === "active").map((c) => c.name);
              return (
                <EmployeeCard
                  key={emp._id}
                  idx={idx}
                  attendanceLoading={presenceLoading}
                  onPing={liveUpdates && canSendPing ? handlePing : undefined}
                  showAttendance={hasTeamAccess}
                  showAttendanceDetail={canViewAttendanceDetail}
                  showLocationFlags={canViewAttendanceDetail}
                  showTasks={canViewTasks}
                  showCampaigns={canViewCampaigns}
                  emp={{
                    _id: emp._id,
                    username: emp.username,
                    firstName: emp.firstName,
                    lastName: emp.lastName,
                    email: emp.email,
                    designation: emp.designation,
                    department: emp.department,
                    isLive: emp.isLive,
                    status: emp.status,
                    locationFlagged: emp.locationFlagged,
                    flagReason: emp.flagReason,
                    flagCoords: emp.flagCoords,
                    firstEntry: emp.firstEntry ?? undefined,
                    firstOfficeEntry: emp.firstOfficeEntry ?? undefined,
                    lastOfficeExit: emp.lastOfficeExit ?? undefined,
                    lastExit: emp.lastExit ?? undefined,
                    todayMinutes: emp.todayMinutes,
                    officeMinutes: emp.officeMinutes,
                    remoteMinutes: emp.remoteMinutes,
                    lateBy: emp.lateBy,
                    isLateToOffice: emp.isLateToOffice,
                    lateToOfficeBy: emp.lateToOfficeBy,
                    breakMinutes: emp.breakMinutes,
                    sessionCount: emp.sessionCount,
                    shiftStart: emp.shiftStart,
                    shiftEnd: emp.shiftEnd,
                    shiftBreakTime: emp.shiftBreakTime,
                    pendingTasks: canViewTasks ? pendingCount : 0,
                    inProgressTasks: canViewTasks ? inProgressCount : 0,
                    campaigns: canViewCampaigns ? activeCampNames : [],
                  }}
                />
              );
            }

            if (presenceGrouped) {
                return (
                <div className="space-y-5 pt-2">
                  {presenceGrouped.map((group) => (
                    <motion.div key={group.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{group.label}</h3>
                        <span className="text-caption font-medium px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
                          {group.employees.length}
                    </span>
                    </div>
                      <motion.div className="grid grid-cols-2 gap-3 xl:grid-cols-4 md:grid-cols-3" variants={staggerContainerFast} initial="hidden" animate="visible">
                        <AnimatePresence mode="popLayout">
                          {group.employees.map((emp, idx) => renderPresenceCard(emp, idx))}
                        </AnimatePresence>
                      </motion.div>
                    </motion.div>
                  ))}
                      </div>
              );
            }

            return (
              <motion.div className="grid pt-4 grid-cols-2 gap-3 xl:grid-cols-4 md:grid-cols-3" variants={staggerContainerFast} initial="hidden" animate="visible">
                <AnimatePresence mode="popLayout">
                  {filteredPresence.map((emp, idx) => renderPresenceCard(emp, idx))}
                </AnimatePresence>
              </motion.div>
            );
          })()
        ) : (
          <p className="py-8 text-center text-caption" style={{ color: "var(--fg-tertiary)" }}>No employees match this filter</p>
          )}
            </div>
        </motion.section>

        {/* 3b. Active Campaigns (left) + Checklist (right) */}
        <motion.section data-tour="dashboard-campaigns" className="card flex flex-col overflow-hidden p-4 sm:p-5 lg:col-span-5 lg:row-span-1" variants={slideUpItem} initial="hidden" animate="visible">
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <div className="flex items-center min-w-0">
              <h3 className="text-headline" style={{ color: "var(--fg)" }}>Active Campaigns</h3>
              <RefreshBtn onRefresh={onRefreshFull} />
            </div>
            <Link href="/workspace"><span className="text-caption font-semibold" style={{ color: "var(--primary)" }}>View All →</span></Link>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: "thin" }}>
            {dataLoading ? (
              [1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: "var(--bg-grouped)" }}><div className="shimmer h-8 w-8 shrink-0 rounded-lg" /><div className="flex-1 space-y-1.5"><Bone w="w-32" h="h-3.5" /><Bone w="w-20" h="h-2.5" /></div></div>)
            ) : activeCampaigns.length === 0 ? (
              <p className="text-caption py-3 text-center" style={{ color: "var(--fg-tertiary)" }}>No active campaigns</p>
            ) : activeCampaigns.map((camp, ci) => (
              <motion.div key={camp._id} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.04 * ci }} whileHover={{ x: 4 }} className="flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 cursor-pointer" style={{ background: "var(--bg-grouped)" }}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${CAMPAIGN_STATUS_COLORS[camp.status]} 15%, transparent)` }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={CAMPAIGN_STATUS_COLORS[camp.status]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-callout font-semibold truncate" style={{ color: "var(--fg)" }}>{camp.name}</p>
                  <div className="flex gap-1.5 mt-0.5">
                    {camp.tags.departments.slice(0, 1).map((d) => <span key={d._id} className="text-[9px] rounded-full px-1.5 py-0.5 font-medium" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>{d.title}</span>)}
                    <span className="text-caption tabular-nums">{camp.tags.employees.length} people</span>
                      </div>
                    </div>
              </motion.div>
            ))}
        </div>
      </motion.section>
        <motion.section data-tour="dashboard-checklist" className="card flex flex-col overflow-hidden p-4 sm:p-5 lg:col-span-7 lg:row-span-1" variants={slideUpItem} initial="hidden" animate="visible">
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <div className="flex items-center min-w-0">
              <h3 className="text-headline" style={{ color: "var(--fg)" }}>Checklist</h3>
              <RefreshBtn onRefresh={onRefreshFull} />
            </div>
            {!dataLoading && (
            <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity }} className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: "var(--rose)" }}>
              {pendingTasks.length} Pending
            </motion.div>
          )}
        </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: "thin" }}>
            {dataLoading ? (
              [1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--bg-grouped)" }}><div className="shimmer h-8 w-8 shrink-0 rounded-lg" /><div className="flex-1 space-y-1.5"><Bone w="w-40" h="h-3.5" /><Bone w="w-24" h="h-2.5" /></div></div>)
            ) : pendingTasks.length === 0 ? (
              <p className="text-caption py-3 text-center" style={{ color: "var(--fg-tertiary)" }}>All caught up!</p>
            ) : pendingTasks.map((task, ti) => {
              const pColors: Record<string, string> = { low: "var(--primary)", medium: "var(--amber)", high: "var(--rose)", urgent: "#ef4444" };
              const pc = pColors[task.priority] ?? "var(--fg-tertiary)";
              const assigneeName = task.assignedTo?.about ? `${task.assignedTo.about.firstName} ${task.assignedTo.about.lastName}`.trim() : "";
              const creatorName = task.createdBy?.about ? `${task.createdBy.about.firstName} ${task.createdBy.about.lastName}`.trim() : "";
              const statusLabel = task.status === "inProgress" ? "In Progress" : task.status === "pending" ? "Pending" : task.status;
              const statusColor = task.status === "inProgress" ? "var(--primary)" : task.status === "pending" ? "var(--amber)" : "var(--teal)";
              return (
                <motion.div key={task._id} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.04 + ti * 0.04 }} whileHover={{ x: 4 }} className="flex shrink-0 items-start gap-3 rounded-xl px-3 py-2.5 cursor-pointer" style={{ background: "var(--bg-grouped)" }}>
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${pc} 15%, transparent)` }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={pc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      {task.priority === "urgent" ? <><path d="M12 2v10l4 2" /><circle cx="12" cy="12" r="10" /></> : task.priority === "high" ? <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" /> : <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>}
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                  <p className="text-callout font-semibold line-clamp-1" style={{ color: "var(--fg)" }}>{task.title}</p>
                      <span className="text-[9px] rounded-full px-1.5 py-0.5 font-semibold" style={{ background: `color-mix(in srgb, ${pc} 15%, transparent)`, color: pc }}>{PRIORITY_LABELS[task.priority] ?? task.priority}</span>
                      <span className="text-[9px] rounded-full px-1.5 py-0.5 font-medium" style={{ background: `color-mix(in srgb, ${statusColor} 12%, transparent)`, color: statusColor }}>{statusLabel}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-caption">
                      {assigneeName && <span style={{ color: "var(--fg-secondary)" }}>→ {assigneeName}</span>}
                      {creatorName && <span style={{ color: "var(--fg-tertiary)" }}>by {creatorName}</span>}
                      {task.deadline && <span className="tabular-nums" style={{ color: "var(--fg-tertiary)" }}>Due {new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                      {task.createdAt && <span className="tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{new Date(task.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                    </div>
                </div>
              </motion.div>
              );
            })}
          </div>
          <Link href="/workspace" className="shrink-0"><motion.button type="button" className="mt-4 w-full text-center text-callout font-semibold" style={{ color: "var(--primary)" }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>View All Tasks →</motion.button></Link>
      </motion.section>
      </div>

      {/* Ping toast */}
      <AnimatePresence>
        {pingSuccess && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 shadow-lg" style={{ background: "var(--primary)", color: "#fff" }}>
            <p className="text-callout font-semibold flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5.636 18.364a9 9 0 010-12.728" /><path d="M18.364 5.636a9 9 0 010 12.728" /><circle cx="12" cy="12" r="1" /></svg>
              Pinged {pingSuccess}
            </p>
              </motion.div>
          )}
      </AnimatePresence>
    </div>
  );
}

/* ──────────────────────── OTHER ROLES OVERVIEW ──────────────────────── */

function OtherRoleOverview({ user, tasks, personalAttendance, weeklyRecords, monthlyStats: ms, userProfile, dataLoading }: { user: User; tasks: ApiTask[]; personalAttendance: PersonalAttendance | null; weeklyRecords: WeeklyDay[]; monthlyStats: FullMonthlyStats | null; userProfile: UserProfile | null; dataLoading: boolean }) {
  const pa = personalAttendance;
  const profileName = userProfile?.firstName ?? user.firstName;
  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(id); }, []);

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
            {dataLoading ? <span className="shimmer inline-block h-3.5 w-40 rounded mt-1" /> : <p className="text-subhead mt-1">You have {pendingTasks.length} tasks pending</p>}
      </motion.div>
          <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-start gap-0.5 sm:items-end">
            <span className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Local time</span>
            <span className="text-headline tabular-nums" style={{ color: "var(--fg)" }}>{formatClock(now)}</span>
            <span className="text-caption">{formatClockDate(now)}</span>
              </motion.div>
        </header>

        {/* Self overview + Activity timeline */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SelfOverviewCard pa={pa} userProfile={userProfile} user={user} />
          <TodayTimelineCard pa={pa} dataLoading={dataLoading} />
      </div>

        {/* Weekly overview — horizontal scroll strip */}
        <section className="space-y-3">
          <motion.h3 variants={fadeInItem} initial="hidden" animate="visible" className="text-section-header">Weekly overview</motion.h3>
          <div className="scrollbar-hide -mx-1 flex gap-3 overflow-x-auto pb-2 pt-1">
            {weeklyRecords.length === 0 ? (
              [1, 2, 3, 4, 5].map((i) => <div key={i} className="card-static flex min-w-[112px] shrink-0 flex-col gap-2 rounded-2xl p-4"><Bone w="w-12" h="h-3" /><Bone w="w-16" h="h-2.5" /><Bone w="w-10" h="h-5" /></div>)
            ) : weeklyRecords.map((day, i) => {
              const d = new Date(day.date + "T12:00:00");
              const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
                const isToday = day.date === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(now);
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

        {/* Monthly summary */}
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="card-static p-5 sm:p-6">
          <h3 className="text-section-header mb-4">Monthly summary</h3>
          {ms ? (
            <>
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
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => <div key={i} className="card-static rounded-xl p-4 space-y-2"><Bone w="w-20" h="h-3" /><Bone w="w-14" h="h-6" /></div>)}
            </div>
        )}
      </motion.section>
      </div>
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
  const [weeklyRecords, setWeeklyRecords] = useState<WeeklyDay[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<FullMonthlyStats | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const isSuperAdmin = user.isSuperAdmin === true;
  const { can: canPermRoot, hasSubordinates } = usePermissions();
  const hasTeamAccess = canPermRoot("attendance_viewTeam") || hasSubordinates;
  const canViewEmployees = canPermRoot("employees_view");
  const canViewTasks = canPermRoot("tasks_view");
  const canViewCampaigns = canPermRoot("campaigns_view");
  const canViewDepts = canPermRoot("departments_view");
  const initialDone = useRef(false);

  /* ── Helper: parse presence array ── */
  const parsePresence = useCallback((raw: unknown) => {
    if (!Array.isArray(raw)) return;
    setRealPresence(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (raw as any[]).map((p) => ({
        _id: p._id,
        username: p.username ?? "",
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email ?? "",
        designation: p.isSuperAdmin ? "System Administrator" : "Employee",
        department: p.department,
        departmentId: p.departmentId ?? null,
        status: p.status as PresenceStatus,
        todayMinutes: p.todayMinutes,
        officeMinutes: p.officeMinutes ?? 0,
        remoteMinutes: p.remoteMinutes ?? 0,
        lateBy: p.lateBy ?? 0,
        isLateToOffice: p.isLateToOffice ?? false,
        lateToOfficeBy: p.lateToOfficeBy ?? 0,
        breakMinutes: p.breakMinutes ?? 0,
        sessionCount: p.sessionCount ?? 0,
        firstEntry: p.firstEntry ?? null,
        firstOfficeEntry: p.firstOfficeEntry ?? null,
        lastOfficeExit: p.lastOfficeExit ?? null,
        lastExit: p.lastExit ?? null,
        shiftStart: p.shiftStart ?? "10:00",
        shiftEnd: p.shiftEnd ?? "19:00",
        shiftBreakTime: p.shiftBreakTime ?? 60,
        isLive: p.isLive ?? false,
        locationFlagged: p.locationFlagged ?? false,
        flagReason: p.flagReason ?? null,
        flagCoords: p.flagCoords ?? null,
        isActive: p.isActive,
      })),
    );
  }, []);

  /* ── Helper: fetch today's attendance detail (lightweight, for presence updates) ── */
  const fetchTodayDetail = useCallback(async () => {
    try {
      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
      const dailyRes = await fetch(`/api/attendance?type=detail&date=${todayStr}`).then((r) => r.ok ? r.json() : null);
      if (dailyRes) {
        setPersonalAttendance((prev) => {
          const base = prev ?? { todayMinutes: 0, todaySessions: 0, officeMinutes: 0, remoteMinutes: 0, isOnTime: true, lateBy: 0, firstEntry: null, clockIn: null, clockOut: null, firstOfficeEntry: null, lastOfficeExit: null, monthlyAvgHours: 0, monthlyOnTimePct: 0, avgInTime: "", avgOutTime: "" };
          const ct = extractClockTimes(dailyRes.activitySessions ?? []);
          return {
            ...base,
            todayMinutes: dailyRes.totalWorkingMinutes ?? 0,
            todaySessions: dailyRes.activitySessions?.length ?? 0,
            officeMinutes: dailyRes.officeMinutes ?? 0,
            remoteMinutes: dailyRes.remoteMinutes ?? 0,
            isOnTime: dailyRes.isOnTime ?? true,
            lateBy: dailyRes.lateBy ?? 0,
            firstEntry: dailyRes.firstOfficeEntry ? new Date(dailyRes.firstOfficeEntry).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null,
            clockIn: ct.clockIn,
            clockOut: ct.clockOut,
            firstOfficeEntry: dailyRes.firstOfficeEntry ? new Date(dailyRes.firstOfficeEntry).toISOString() : null,
            lastOfficeExit: dailyRes.lastOfficeExit ? new Date(dailyRes.lastOfficeExit).toISOString() : null,
          };
        });
      }
    } catch { /* optional */ }
  }, []);

  /* ── FAST POLL: presence + today's detail ── */
  const fetchLive = useCallback(async () => {
    try {
      if (hasTeamAccess) {
        const res = await fetch("/api/attendance/presence");
        if (res.ok) {
          const presRes = await res.json();
        parsePresence(presRes);
      }
      }
      if (!isSuperAdmin) await fetchTodayDetail();
    } catch { /* silent */ }
  }, [hasTeamAccess, isSuperAdmin, parsePresence, fetchTodayDetail]);

  /* ── Helper: fetch all personal data (monthly + weekly + profile) in one pass ── */
  const fetchPersonalData = useCallback(async () => {
    if (isSuperAdmin) return;
    try {
      const pktNow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const [y, m] = pktNow.split("-").map(Number);
      const todayStr = pktNow;

      const [dailyDetailRes, weeklyRes, monthlyRes, profileRes] = await Promise.all([
        fetch(`/api/attendance?type=detail&date=${todayStr}`).then((r) => r.ok ? r.json() : null),
        fetch(`/api/attendance?type=daily&year=${y}&month=${m}`).then((r) => r.ok ? r.json() : []),
        fetch(`/api/attendance?type=monthly&year=${y}&month=${m}`).then((r) => r.ok ? r.json() : null),
        fetch("/api/profile").then((r) => r.ok ? r.json() : null),
      ]);

      if (dailyDetailRes) {
        const ct = extractClockTimes(dailyDetailRes.activitySessions ?? []);
        setPersonalAttendance({
          todayMinutes: dailyDetailRes.totalWorkingMinutes ?? 0,
          todaySessions: dailyDetailRes.activitySessions?.length ?? 0,
          officeMinutes: dailyDetailRes.officeMinutes ?? 0,
          remoteMinutes: dailyDetailRes.remoteMinutes ?? 0,
          isOnTime: dailyDetailRes.isOnTime ?? true,
          lateBy: dailyDetailRes.lateBy ?? 0,
          firstEntry: dailyDetailRes.firstOfficeEntry ? new Date(dailyDetailRes.firstOfficeEntry).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null,
          clockIn: ct.clockIn,
          clockOut: ct.clockOut,
          firstOfficeEntry: dailyDetailRes.firstOfficeEntry ? new Date(dailyDetailRes.firstOfficeEntry).toISOString() : null,
          lastOfficeExit: dailyDetailRes.lastOfficeExit ? new Date(dailyDetailRes.lastOfficeExit).toISOString() : null,
          monthlyAvgHours: monthlyRes?.averageDailyHours ?? 0,
          monthlyOnTimePct: monthlyRes?.onTimePercentage ?? 0,
          avgInTime: monthlyRes?.averageOfficeInTime ?? "",
          avgOutTime: monthlyRes?.averageOfficeOutTime ?? "",
        });
      } else if (monthlyRes) {
        setPersonalAttendance((prev) => {
          const base = prev ?? { todayMinutes: 0, todaySessions: 0, officeMinutes: 0, remoteMinutes: 0, isOnTime: true, lateBy: 0, firstEntry: null, clockIn: null, clockOut: null, firstOfficeEntry: null, lastOfficeExit: null, monthlyAvgHours: 0, monthlyOnTimePct: 0, avgInTime: "", avgOutTime: "" };
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
        setUserProfile({
          firstName: (about?.firstName as string) ?? user.firstName,
          lastName: (about?.lastName as string) ?? user.lastName,
          email: (p.email as string) ?? user.email,
          username: (p.username as string) ?? user.username,
          profileImage: (about?.profileImage as string) || undefined,
          department: dept?.title ?? undefined,
          designation: user.isSuperAdmin ? "System Administrator" : "Employee",
          weeklySchedule: resolveWeeklySchedule(p),
          shiftType: typeof p.shiftType === "string" ? p.shiftType : undefined,
          graceMinutes: resolveGraceMinutes(p),
        });
      }
    } catch { /* optional data */ }
  }, [isSuperAdmin, user]);

  /* ── SLOW POLL: full data set ── */
  const fetchFull = useCallback(async () => {
    try {
      const fetches: Promise<unknown>[] = [
        canViewEmployees ? fetch("/api/employees").then((r) => r.ok ? r.json() : []) : Promise.resolve([]),
        canViewTasks ? fetch("/api/tasks").then((r) => r.ok ? r.json() : []) : Promise.resolve([]),
        canViewDepts ? fetch("/api/departments").then((r) => r.ok ? r.json() : []) : Promise.resolve([]),
      ];
      if (canViewCampaigns) {
        fetches.push(fetch("/api/campaigns").then((r) => r.ok ? r.json() : []));
      }
      const [empRes, taskRes, deptRes, ...rest] = await Promise.all(fetches);
      const campaignRes = canViewCampaigns ? rest[0] : undefined;

      setEmployees(Array.isArray(empRes) ? empRes as ApiEmployee[] : []);
      setTasks(Array.isArray(taskRes) ? taskRes as ApiTask[] : []);
      setDepartments(Array.isArray(deptRes) ? deptRes as ApiDepartment[] : []);
      if (Array.isArray(campaignRes)) setCampaigns(campaignRes as ApiCampaign[]);

      if (!isSuperAdmin) await fetchPersonalData();
    } catch (err) { console.error("Dashboard fetch error:", err); }
  }, [canViewEmployees, canViewTasks, canViewDepts, canViewCampaigns, isSuperAdmin, fetchPersonalData]);

  /* ── Initial load ── */
  useEffect(() => {
    if (initialDone.current) return;
      initialDone.current = true;
    Promise.all([fetchFull(), fetchLive()]).then(() => {
      if (hasTeamAccess && !realPresence) {
        setTimeout(fetchLive, 1500);
      }
    }).finally(() => {
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const presenceLoading = realPresence === null && hasTeamAccess;
  const presenceEmps = useMemo(() => {
    if (realPresence) return realPresence;
    return employees.map((e) => {
      const fallbackSch = getTodaySchedule(e as unknown as Record<string, unknown>, "Asia/Karachi");
      return {
      _id: e._id,
      username: e.username ?? "",
      firstName: e.about?.firstName ?? "",
      lastName: e.about?.lastName ?? "",
      email: e.email ?? "",
      designation: e.isSuperAdmin ? "System Administrator" : "Employee",
      department: (e.department as { title?: string })?.title ?? "Unassigned",
      departmentId: (e.department as { _id?: string })?._id ?? null,
      status: "absent" as PresenceStatus,
      todayMinutes: 0,
      officeMinutes: 0,
      remoteMinutes: 0,
      lateBy: 0,
      isLateToOffice: false,
      lateToOfficeBy: 0,
      breakMinutes: 0,
      sessionCount: 0,
      firstEntry: null,
      firstOfficeEntry: null,
      lastOfficeExit: null,
      lastExit: null,
      shiftStart: fallbackSch.start,
      shiftEnd: fallbackSch.end,
      shiftBreakTime: fallbackSch.breakMinutes,
      isLive: false,
      locationFlagged: false,
      isActive: true,
    };
    });
  }, [realPresence, employees]);

  if (hasTeamAccess) {
      return (
      <AdminDashboard
        user={user}
        presenceEmps={presenceEmps}
        presenceLoading={presenceLoading}
        tasks={tasks}
        personalAttendance={personalAttendance}
        campaigns={campaigns}
        userProfile={userProfile}
        dataLoading={loading}
        onRefreshLive={fetchLive}
        onRefreshFull={fetchFull}
      />
    );
  }

  return <OtherRoleOverview user={user} tasks={tasks} personalAttendance={personalAttendance} weeklyRecords={weeklyRecords} monthlyStats={monthlyStats} userProfile={userProfile} dataLoading={loading} />;
}
