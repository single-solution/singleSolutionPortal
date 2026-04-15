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
import { RefreshBtn } from "./components/ui";
import { EmployeeModal } from "./components/EmployeeModal";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { useGuide } from "@/lib/useGuide";
import { usePermissions } from "@/lib/usePermissions";
import { useLive } from "@/lib/useLive";
import { dashboardTour } from "@/lib/tourConfigs";
import { useQuery, useCachedState } from "@/lib/useQuery";
import { timeAgo } from "@/lib/formatters";
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
  campaign?: { _id: string; name: string } | string;
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
  parentDepartment: string;
  reportsTo: string | null;
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
  taskStats?: { total: number; completed: number; recurring: number; todayDue: number; todayDone: number };
  todayChecklist?: { _id: string; title: string; done: boolean }[];
}

interface LogEntry {
  _id: string; userEmail: string; userName: string; action: string;
  entity: string; entityId?: string; details?: string; createdAt: string;
}

const LOG_ENTITY_COLORS: Record<string, { bg: string; fg: string }> = {
  task:       { bg: "color-mix(in srgb, var(--primary) 14%, transparent)", fg: "var(--primary)" },
  campaign:   { bg: "color-mix(in srgb, #8b5cf6 14%, transparent)", fg: "#8b5cf6" },
  employee:   { bg: "color-mix(in srgb, var(--teal) 14%, transparent)", fg: "var(--teal)" },
  department: { bg: "color-mix(in srgb, var(--amber) 14%, transparent)", fg: "var(--amber)" },
  attendance: { bg: "color-mix(in srgb, var(--green) 14%, transparent)", fg: "var(--green)" },
  leave:      { bg: "color-mix(in srgb, var(--rose) 14%, transparent)", fg: "var(--rose)" },
  payroll:    { bg: "color-mix(in srgb, var(--amber) 14%, transparent)", fg: "var(--amber)" },
  security:   { bg: "color-mix(in srgb, var(--rose) 14%, transparent)", fg: "var(--rose)" },
};
const LOG_DEFAULT_COLOR = { bg: "var(--bg-grouped)", fg: "var(--fg-tertiary)" };
const LOG_ENTITY_LABELS: Record<string, string> = {
  task: "Tasks", campaign: "Campaigns", employee: "Employees", department: "Departments",
  attendance: "Attendance", leave: "Leave", payroll: "Payroll", security: "Security",
  settings: "Settings", auth: "Auth",
};
const LOG_ENTITY_PRIORITY: Record<string, number> = {
  task: 0, campaign: 1, attendance: 2, employee: 3, leave: 4,
  department: 5, payroll: 6, settings: 7, security: 8, auth: 9,
};
function logAvatarLabel(log: LogEntry) {
  const n = (log.userName || "").trim();
  if (n) { const parts = n.split(/\s+/).filter(Boolean); return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : (parts[0]?.slice(0, 2) ?? "?").toUpperCase(); }
  return (log.userEmail || "?").slice(0, 2).toUpperCase();
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
  "linear-gradient(135deg, color-mix(in srgb, var(--teal) 35%, transparent), color-mix(in srgb, var(--cyan) 25%, transparent))",
  "linear-gradient(135deg, color-mix(in srgb, var(--green) 35%, transparent), color-mix(in srgb, var(--teal) 20%, transparent))",
  "linear-gradient(135deg, color-mix(in srgb, var(--amber) 35%, transparent), color-mix(in srgb, var(--amber) 20%, transparent))",
  "linear-gradient(135deg, color-mix(in srgb, var(--rose) 30%, transparent), color-mix(in srgb, var(--rose) 20%, transparent))",
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
    const id = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const timeKey = `${now.getHours()}-${now.getMinutes()}`;

  return (
    <header data-tour="dashboard-welcome" className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <motion.div className="min-w-0" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
        <p className="text-caption mb-0.5">Single Solution Sync</p>
        <h1 className="text-title"><span style={{ color: "var(--primary)" }}>{getGreeting()}</span><span style={{ color: "var(--fg)" }}>, {profileName}!</span></h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 [&_.badge]:!gap-1 [&_.badge]:!px-2 [&_.badge]:!py-0.5 [&_.badge]:!text-[9px] sm:[&_.badge]:!px-2.5 sm:[&_.badge]:!py-1 sm:[&_.badge]:!text-[10px] [&_.badge::before]:!h-[5px] [&_.badge::before]:!w-[5px]">
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
            <p className="text-subhead">You have <span className="font-bold" style={{ color: "var(--amber)" }}>{pendingTasks}</span> tasks pending · <span className="font-bold" style={{ color: "var(--teal)" }}>{activeCampaigns}</span> active campaign{activeCampaigns !== 1 ? "s" : ""}</p>
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

function SelfOverviewCard({ pa, userProfile, user, companyTz = "Asia/Karachi" }: {
  pa: PersonalAttendance | null;
  userProfile: UserProfile | null;
  user: User;
  companyTz?: string;
}) {
  const todayForShift = userProfile?.weeklySchedule
    ? getTodaySchedule(
        { weeklySchedule: userProfile.weeklySchedule } as Record<string, unknown>,
        companyTz,
      )
    : null;
  const shiftTarget = todayForShift
    ? getShiftMinutes(todayForShift.start, todayForShift.end, todayForShift.breakMinutes)
    : 480;

  if (!pa) {
                return (
      <div className="card p-3">
        <div className="flex gap-3 items-start">
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div className="shimmer h-12 w-12 rounded-full" />
            <Bone w="w-12" h="h-3" />
                  </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div><Bone w="w-32" h="h-4" /><Bone w="w-24" h="h-2.5" /></div>
            <div className="grid grid-cols-3 gap-1.5">
              {[1, 2, 3].map((i) => <div key={i} className="card-static p-1.5"><Bone w="w-12" h="h-2" /><Bone w="w-10" h="h-3" /></div>)}
              </div>
            <Bone w="w-full" h="h-2" />
          </div>
                    </div>
    </div>
  );
}

  const todayHours = pa.todayMinutes / 60;
  const shiftPct = Math.min(100, Math.round((pa.todayMinutes / shiftTarget) * 100));
  const isPresent = pa.todaySessions > 0 || pa.todayMinutes > 0;
  const statusColor = isPresent ? (pa.isOnTime ? "var(--green)" : "var(--amber)") : "var(--rose)";
  const statusBadgeBg = isPresent
    ? pa.isOnTime
      ? "color-mix(in srgb, var(--green) 7%, transparent)"
      : "color-mix(in srgb, var(--amber) 7%, transparent)"
    : `${statusColor}15`;
  const statusBadgeBorder = isPresent
    ? pa.isOnTime
      ? "1px solid color-mix(in srgb, var(--green) 19%, transparent)"
      : "1px solid color-mix(in srgb, var(--amber) 19%, transparent)"
    : `1px solid ${statusColor}30`;
  const statusLabel = isPresent ? (pa.isOnTime ? "Present" : "Late") : "Absent";
  const profileName = userProfile?.firstName ?? user.firstName;
  const profileLast = userProfile?.lastName ?? user.lastName;
  const officePct = pa.officeMinutes + pa.remoteMinutes > 0 ? Math.round((pa.officeMinutes / (pa.officeMinutes + pa.remoteMinutes)) * 100) : 0;
  const remotePct = 100 - officePct;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="card p-3">
      <div className="flex gap-3 items-start">
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          {userProfile?.profileImage ? (
            <img src={userProfile.profileImage} alt="" className="h-12 w-12 rounded-full object-cover shadow" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-white shadow" style={{ background: "linear-gradient(135deg, var(--primary), var(--cyan))" }}>{initials(profileName, profileLast)}</div>
          )}
          <span className="rounded-full px-1.5 py-px text-[8px] font-semibold" style={{ background: statusBadgeBg, color: statusColor, border: statusBadgeBorder }}>{statusLabel}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h2 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>{profileName} {profileLast}</h2>
            <p className="text-[10px]" style={{ color: "var(--fg-secondary)" }}>{userProfile?.department ?? (user.isSuperAdmin ? "System Administrator" : "Employee")}</p>
            </div>
          <div className="grid grid-cols-3 gap-1.5 border-t pt-2" style={{ borderColor: "var(--border)" }}>
            <div className="card-static p-1.5">
              <p className="text-[8px]" style={{ color: "var(--fg-tertiary)" }}>Clock In</p>
              <p className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{pa.clockIn ? formatClock(new Date(pa.clockIn)) : "—"}</p>
          </div>
            <div className="card-static p-1.5 text-center">
              <p className="text-[8px]" style={{ color: "var(--fg-tertiary)" }}>Hours</p>
              <p className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{todayHours >= 1 ? todayHours.toFixed(1) + "h" : pa.todayMinutes + "m"}</p>
            </div>
            <div className="card-static p-1.5 text-right">
              <p className="text-[8px]" style={{ color: "var(--fg-tertiary)" }}>Clock Out</p>
              <p className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{pa.clockOut ? formatClock(new Date(pa.clockOut)) : "—"}</p>
            </div>
            </div>
          <div className="grid grid-cols-3 gap-1.5" style={{ color: "var(--fg-secondary)" }}>
            <div className="card-static p-1.5">
              <p className="text-[8px]" style={{ color: "var(--fg-tertiary)" }}>Office In</p>
              <p className="text-[10px] font-semibold tabular-nums">{pa.firstOfficeEntry ? formatClock(new Date(pa.firstOfficeEntry)) : "—"}</p>
          </div>
            <div className="card-static p-1.5 text-center">
              <p className="text-[8px]" style={{ color: "var(--fg-tertiary)" }}>Office</p>
              <p className="text-[10px] font-semibold tabular-nums">{formatMinutes(pa.officeMinutes)}</p>
        </div>
            <div className="card-static p-1.5 text-right">
              <p className="text-[8px]" style={{ color: "var(--fg-tertiary)" }}>Office Out</p>
              <p className="text-[10px] font-semibold tabular-nums">{pa.lastOfficeExit ? formatClock(new Date(pa.lastOfficeExit)) : "—"}</p>
              </div>
            </div>
          <div className="flex items-center gap-2 text-[9px]" style={{ color: "var(--fg-secondary)" }}>
            <span className="rounded px-1 py-px font-medium" style={{ background: "color-mix(in srgb, var(--green) 7%, transparent)", color: "var(--green)" }}>{formatMinutes(pa.officeMinutes)} office ({officePct}%)</span>
            <span className="rounded px-1 py-px font-medium" style={{ background: "color-mix(in srgb, var(--teal) 7%, transparent)", color: "var(--teal)" }}>{formatMinutes(pa.remoteMinutes)} remote ({remotePct}%)</span>
              </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[8px]" style={{ color: "var(--fg-secondary)" }}>Shift progress</span>
              <span className="text-[8px] tabular-nums" style={{ color: "var(--fg-secondary)" }}>{pa.todayMinutes}/{shiftTarget}m ({shiftPct}%)</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
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
  const statusColor = isLive ? "var(--green)" : "var(--fg-tertiary)";
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
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05, ease: [0.22, 1, 0.36, 1] }} className="card-static flex flex-col p-3">
      <h3 className="text-[11px] font-bold mb-2" style={{ color: "var(--fg)" }}>Today&apos;s Activity</h3>
      {isLoading ? (
        <ul className="relative flex flex-col gap-0 pl-3">
          <span className="absolute bottom-1 left-[5px] top-1 w-px" style={{ background: "var(--border-strong)" }} aria-hidden />
          {[1, 2, 3].map((i) => (
            <li key={i} className="relative flex gap-2 pb-3 last:pb-0">
              <span className="shimmer mt-1 h-2 w-2 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1"><Bone w="w-10" h="h-2" /><Bone w="w-28" h="h-2.5" /></div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="relative flex flex-col gap-0 pl-3">
          <span className="absolute bottom-1 left-[5px] top-1 w-px" style={{ background: "var(--border-strong)" }} aria-hidden />
          {events.map((ev, i) => (
            <motion.li key={ev.key} initial={{ x: -8, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 + i * 0.07 }} className="relative flex gap-2 pb-3 last:pb-0">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ev.dot, boxShadow: "0 0 0 2px var(--bg)" }} />
              <div className="min-w-0 flex-1">
                <span className="text-[9px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{ev.time}</span>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--fg)" }}>{ev.label}</p>
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

function NeedsAttentionItems({ tasks, canViewTasks, emps, hasTeamAccess, flagStats, taskQuickStats }: {
  tasks: ApiTask[];
  canViewTasks: boolean;
  emps: PresenceEmployee[];
  hasTeamAccess: boolean;
  flagStats: { total: number; warnings: number; violations: number } | null;
  taskQuickStats: { total: number; pending: number; inProg: number; dueSoon: number; dueThisWeek: number; overdue: number; overdueHU: number; overdue7d: number } | null;
}) {
  const items: { key: string; icon: React.ReactNode; label: string; detail: string; color: string }[] = [];

  if (canViewTasks && taskQuickStats) {
    if (taskQuickStats.overdue > 0) items.push({ key: "overdue", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>, label: `${taskQuickStats.overdue} overdue task${taskQuickStats.overdue !== 1 ? "s" : ""}`, detail: taskQuickStats.overdueHU > 0 ? `${taskQuickStats.overdueHU} high/urgent` : "", color: "var(--rose)" });
    if (taskQuickStats.dueSoon > 0) items.push({ key: "duesoon", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, label: `${taskQuickStats.dueSoon} task${taskQuickStats.dueSoon !== 1 ? "s" : ""} due within 48h`, detail: "", color: "var(--amber)" });
  }

  if (hasTeamAccess) {
    const absent = emps.filter((e) => e.status === "absent").length;
    if (absent > 0) items.push({ key: "absent", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>, label: `${absent} absent today`, detail: "", color: "var(--fg-tertiary)" });
    const late = emps.filter((e) => e.lateBy && e.lateBy > 0).length;
    if (late > 0) items.push({ key: "late", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, label: `${late} late arrival${late !== 1 ? "s" : ""}`, detail: "", color: "var(--amber)" });
  }

  if (flagStats && flagStats.total > 0) {
    items.push({ key: "flags", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, label: `${flagStats.total} location flag${flagStats.total !== 1 ? "s" : ""}`, detail: flagStats.violations > 0 ? `${flagStats.violations} violation${flagStats.violations !== 1 ? "s" : ""}` : "", color: "var(--rose)" });
  }

  if (canViewTasks) {
    const unassigned = tasks.filter((t) => t.status !== "completed" && !t.assignedTo).length;
    if (unassigned > 0) items.push({ key: "unassigned", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>, label: `${unassigned} unassigned task${unassigned !== 1 ? "s" : ""}`, detail: "", color: "var(--fg-secondary)" });
  }

  if (items.length === 0) {
    return <p className="py-4 text-center text-caption" style={{ color: "var(--green)" }}>All clear! Nothing needs attention.</p>;
  }

  return (
    <>
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2" style={{ background: `color-mix(in srgb, ${item.color} 6%, transparent)` }}>
          <span className="shrink-0" style={{ color: item.color }}>{item.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold" style={{ color: item.color }}>{item.label}</p>
            {item.detail && <p className="text-[9px]" style={{ color: item.color, opacity: 0.7 }}>{item.detail}</p>}
          </div>
        </div>
      ))}
    </>
  );
}

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
  companyTz,
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
  companyTz: string;
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

  const canViewLogs = canPerm("activityLogs_view");
  const { data: logsPayload, refetch: refetchLogs } = useQuery<{ logs: LogEntry[] }>(canViewLogs ? "/api/activity-logs?limit=30" : null, "dash-activity");
  const { data: lastSeenPayload } = useQuery<{ lastSeenLogId: string | null; lastSeenLogIds: Record<string, string> }>(canViewLogs ? "/api/user/last-seen" : null, "dash-lastseen");
  const { data: flagsPayload } = useQuery<{ flags: { _id: string; severity: string; acknowledged: boolean; createdAt: string }[]; total: number }>(
    hasTeamAccess ? "/api/location-flags?limit=200" : null,
    "dash-flags",
  );
  const logs: LogEntry[] = useMemo(() => logsPayload?.logs ?? [], [logsPayload]);

  const lastSeenLogIdRef = useRef<string | null>(null);
  const lastSeenEntityRef = useRef<Record<string, string>>({});
  useEffect(() => {
    lastSeenLogIdRef.current = lastSeenPayload?.lastSeenLogId ?? null;
    lastSeenEntityRef.current = lastSeenPayload?.lastSeenLogIds ?? {};
  }, [lastSeenPayload]);
  const [activityExpanded, setActivityExpanded] = useState<string | null>(null);
  const toggleActivityGroup = useCallback((entity: string) => {
    setActivityExpanded((prev) => prev === entity ? null : entity);
  }, []);
  const [allMarkedRead, setAllMarkedRead] = useState(false);
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [empModalId, setEmpModalId] = useState<string | null>(null);

  const logGroups = useMemo(() => {
    const globalId = lastSeenLogIdRef.current;
    const entityIds = lastSeenEntityRef.current;
    const globalIdx = globalId ? logs.findIndex((l) => l._id === globalId) : -1;
    const map = new Map<string, { logs: LogEntry[]; unread: number }>();
    logs.forEach((log, i) => {
      const entry = map.get(log.entity) ?? { logs: [], unread: 0 };
      entry.logs.push(log);
      if (allMarkedRead) { map.set(log.entity, entry); return; }
      const entCursorId = entityIds[log.entity];
      const entIdx = entCursorId ? logs.findIndex((l) => l._id === entCursorId) : -1;
      const effectiveIdx = entIdx !== -1 ? (globalIdx !== -1 ? Math.max(entIdx, globalIdx) : entIdx) : globalIdx;
      const isNew = effectiveIdx === -1 || i < effectiveIdx;
      if (isNew) entry.unread++;
      map.set(log.entity, entry);
    });
    return map;
  }, [logs, allMarkedRead]);

  const totalUnread = useMemo(() => {
    let count = 0;
    logGroups.forEach((g) => { count += g.unread; });
    return count;
  }, [logGroups]);

  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current || logGroups.size === 0) return;
    autoOpenedRef.current = true;
    const sorted = Array.from(logGroups.entries()).sort((a, b) => {
      const pa = LOG_ENTITY_PRIORITY[a[0]] ?? 50;
      const pb = LOG_ENTITY_PRIORITY[b[0]] ?? 50;
      if (pa !== pb) return pa - pb;
      if (b[1].unread !== a[1].unread) return b[1].unread - a[1].unread;
      return b[1].logs.length - a[1].logs.length;
    });
    setActivityExpanded(sorted[0][0]);
  }, [logGroups]);

  const markAllRead = useCallback(() => {
    setAllMarkedRead(true);
    if (logs.length > 0) {
      lastSeenLogIdRef.current = logs[0]._id;
      lastSeenEntityRef.current = {};
      fetch("/api/user/last-seen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lastSeenLogId: logs[0]._id }) }).catch(() => {});
    }
  }, [logs]);

  const markEntityRead = useCallback((entity: string) => {
    const entityLogs = logs.filter((l) => l.entity === entity);
    if (entityLogs.length > 0) {
      const latest = entityLogs[0]._id;
      lastSeenEntityRef.current = { ...lastSeenEntityRef.current, [entity]: latest };
      fetch("/api/user/last-seen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity, lastSeenLogId: latest }) }).catch(() => {});
    }
  }, [logs]);

  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>("all");
  const filteredPresence = useMemo(() => {
    return otherEmps
      .filter((e) => matchPresenceFilter(e.status, presenceFilter))
      .sort((a, b) => {
        if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
        return b.todayMinutes - a.todayMinutes;
      });
  }, [otherEmps, presenceFilter]);

  const teamTodayStats = useMemo(() => {
    const total = otherEmps.length;
    if (!total) return null;
    const present = otherEmps.filter((e) => e.status !== "absent").length;
    const inOffice = otherEmps.filter((e) => e.status === "office" || e.status === "overtime").length;
    const late = otherEmps.filter((e) => e.status === "late").length;
    const flagged = otherEmps.filter((e) => e.locationFlagged).length;
    const avgMins = total > 0 ? Math.round(otherEmps.reduce((s, e) => s + e.todayMinutes, 0) / total) : 0;
    const officeMins = otherEmps.reduce((s, e) => s + e.officeMinutes, 0);
    const remoteMins = otherEmps.reduce((s, e) => s + e.remoteMinutes, 0);
    const totalWorkMins = officeMins + remoteMins;
    const officePct = totalWorkMins > 0 ? Math.round((officeMins / totalWorkMins) * 100) : 0;
    const pctPresent = total > 0 ? Math.round((present / total) * 100) : 0;
    const pctInOffice = present > 0 ? Math.round((inOffice / present) * 100) : 0;
    const pctLate = total > 0 ? Math.round((late / total) * 100) : 0;
    return { total, present, inOffice, late, flagged, avgMins, officePct, pctPresent, pctInOffice, pctLate };
  }, [otherEmps]);

  const taskQuickStats = useMemo(() => {
    if (!tasks.length) return null;
    const total = tasks.length;
    const pending = tasks.filter((t) => t.status === "pending").length;
    const inProg = tasks.filter((t) => t.status === "inProgress").length;
    const now = Date.now();
    const dueSoon = tasks.filter((t) => t.deadline && t.status !== "completed" && new Date(t.deadline).getTime() - now < 48 * 3600_000 && new Date(t.deadline).getTime() > now).length;
    const dueThisWeek = tasks.filter((t) => {
      if (!t.deadline || t.status === "completed") return false;
      const dl = new Date(t.deadline).getTime();
      const end = now + 7 * 86400_000;
      return dl > now && dl <= end;
    }).length;
    const overdue = tasks.filter((t) => t.deadline && t.status !== "completed" && new Date(t.deadline).getTime() < now).length;
    const overdueHU = tasks.filter((t) => t.deadline && t.status !== "completed" && new Date(t.deadline).getTime() < now && (t.priority === "high" || t.priority === "urgent")).length;
    const overdue7d = tasks.filter((t) => t.deadline && t.status !== "completed" && (now - new Date(t.deadline).getTime()) > 7 * 86400_000).length;
    return { total, pending, inProg, dueSoon, dueThisWeek, overdue, overdueHU, overdue7d };
  }, [tasks]);

  const flagStats = useMemo(() => {
    const flags = flagsPayload?.flags ?? [];
    if (!flags.length) return null;
    const total = flags.length;
    const warnings = flags.filter((f) => f.severity === "warning").length;
    const violations = flags.filter((f) => f.severity === "violation").length;
    return { total, warnings, violations };
  }, [flagsPayload]);

  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);

  const myTasks = useMemo(() => tasks.filter((t) => t.assignedTo?._id === user.id && t.status !== "completed"), [tasks, user.id]);
  const myCompleted = useMemo(() => tasks.filter((t) => t.assignedTo?._id === user.id && t.status === "completed").length, [tasks, user.id]);
  const myChecklists = useMemo(() => {
    const items: { campaignId: string; campaignName: string; taskId: string; title: string; done: boolean }[] = [];
    for (const c of campaigns) {
      if (c.todayChecklist) {
        for (const item of c.todayChecklist) items.push({ campaignId: c._id, campaignName: c.name, taskId: item._id, title: item.title, done: item.done });
      }
    }
    return items;
  }, [campaigns]);

  const [checklistOverrides, setChecklistOverrides] = useState<Map<string, boolean>>(new Map());
  const [cyclingTask, setCyclingTask] = useState<string | null>(null);

  const dashStatusLabels: Record<string, string> = { pending: "Pending", inProgress: "Working", completed: "Done" };
  const dashNextStatusMap: Record<string, string> = { pending: "inProgress", inProgress: "completed", completed: "pending" };

  const [dashStatusConfirm, setDashStatusConfirm] = useState<{ type: "task"; task: ApiTask; next: string; label: string } | { type: "checklist"; campaignId: string; taskId: string; title: string; currentDone: boolean } | null>(null);
  const [dashStatusUpdating, setDashStatusUpdating] = useState(false);

  const requestCycleTask = useCallback((task: ApiTask) => {
    const next = dashNextStatusMap[task.status] ?? "pending";
    setDashStatusConfirm({ type: "task", task, next, label: dashStatusLabels[next] ?? next });
  }, []);

  const requestToggleChecklist = useCallback((campaignId: string, taskId: string, title: string, currentDone: boolean) => {
    setDashStatusConfirm({ type: "checklist", campaignId, taskId, title, currentDone });
  }, []);

  const handleDashStatusConfirm = useCallback(async () => {
    if (!dashStatusConfirm) return;
    setDashStatusUpdating(true);
    try {
      if (dashStatusConfirm.type === "task") {
        setCyclingTask(dashStatusConfirm.task._id);
        const res = await fetch(`/api/tasks/${dashStatusConfirm.task._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: dashStatusConfirm.next }) });
        if (res.ok) onRefreshFull();
        setCyclingTask(null);
      } else {
        setChecklistOverrides((prev) => new Map(prev).set(dashStatusConfirm.taskId, !dashStatusConfirm.currentDone));
        try {
          await fetch(`/api/campaigns/${dashStatusConfirm.campaignId}/checklist`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: dashStatusConfirm.taskId, done: !dashStatusConfirm.currentDone }),
          });
          onRefreshFull();
        } catch {
          setChecklistOverrides((prev) => { const m = new Map(prev); m.delete(dashStatusConfirm.taskId); return m; });
        }
      }
    } catch { /* ignore */ }
    setDashStatusConfirm(null);
    setDashStatusUpdating(false);
  }, [dashStatusConfirm, onRefreshFull]);

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
    <div className="flex flex-col" style={{ height: "calc(90dvh - 80px)" }}>
      {/* 1. Welcome header */}
      <div className="shrink-0 mb-4">
        <WelcomeHeader user={user} presenceEmps={otherEmps} tasks={tasks} campaigns={campaigns} userProfile={userProfile} hasTeamAccess={hasTeamAccess} dataLoading={dataLoading} scopeStrip={<ScopeStrip value={scopeDept} onChange={setScopeDept} />} />
            </div>

      {/* 2. Self overview + timeline + my tasks (for Manager/Lead — SuperAdmin exempt from attendance) */}
      {!isSuperAdmin && (
        <div className="shrink-0 mb-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <SelfOverviewCard pa={personalAttendance} userProfile={userProfile} user={user} companyTz={companyTz} />
          <TodayTimelineCard pa={personalAttendance} dataLoading={dataLoading} />
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} className="card flex flex-col overflow-hidden p-3">
            <div className="mb-1.5 flex shrink-0 items-center justify-between">
              <h3 className="text-[11px] font-bold" style={{ color: "var(--fg)" }}>My Tasks</h3>
              <div className="flex items-center gap-1.5">
                {(myTasks.length + myChecklists.filter((cl) => !(checklistOverrides.has(cl.taskId) ? checklistOverrides.get(cl.taskId)! : cl.done)).length) > 0 && (
                  <span className="rounded-full px-1.5 py-px text-[8px] font-bold tabular-nums" style={{ background: "color-mix(in srgb, var(--amber) 12%, transparent)", color: "var(--amber)" }}>
                    {myTasks.length + myChecklists.filter((cl) => !(checklistOverrides.has(cl.taskId) ? checklistOverrides.get(cl.taskId)! : cl.done)).length} pending
                  </span>
                )}
                {(myCompleted + myChecklists.filter((cl) => checklistOverrides.has(cl.taskId) ? checklistOverrides.get(cl.taskId)! : cl.done).length) > 0 && (
                  <span className="rounded-full px-1.5 py-px text-[8px] font-bold tabular-nums" style={{ background: "color-mix(in srgb, var(--teal) 12%, transparent)", color: "var(--teal)" }}>
                    {myCompleted + myChecklists.filter((cl) => checklistOverrides.has(cl.taskId) ? checklistOverrides.get(cl.taskId)! : cl.done).length} done
                  </span>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto space-y-0.5" style={{ scrollbarWidth: "thin" }}>
              {(() => {
                type UnifiedItem = { key: string; kind: "checklist"; campaignId: string; taskId: string; title: string; done: boolean } | { key: string; kind: "task"; task: ApiTask };
                const unified: UnifiedItem[] = [
                  ...myChecklists.map((item) => ({ key: `cl-${item.taskId}`, kind: "checklist" as const, campaignId: item.campaignId, taskId: item.taskId, title: item.title, done: checklistOverrides.has(item.taskId) ? checklistOverrides.get(item.taskId)! : item.done })),
                  ...myTasks.map((t) => ({ key: `tk-${t._id}`, kind: "task" as const, task: t })),
                ];
                const isDoneItem = (item: UnifiedItem) => item.kind === "checklist" ? item.done : item.task.status === "completed";
                unified.sort((a, b) => {
                  const ad = isDoneItem(a) ? 1 : 0;
                  const bd = isDoneItem(b) ? 1 : 0;
                  return ad - bd;
                });

                if (unified.length === 0) return <p className="py-4 text-center text-[9px]" style={{ color: "var(--fg-tertiary)" }}>No tasks assigned to you</p>;

                return unified.map((item) => {
                  if (item.kind === "checklist") {
                    const isDone = item.done;
                    return (
                      <button key={item.key} type="button" onClick={() => requestToggleChecklist(item.campaignId, item.taskId, item.title, isDone)}
                        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-all hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]"
                        style={{
                          borderLeft: isDone ? "2px solid var(--teal)" : "2px solid var(--amber)",
                          background: isDone ? "color-mix(in srgb, var(--teal) 5%, transparent)" : "transparent",
                          opacity: isDone ? 0.7 : 1,
                        }}>
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md border-2 transition-all"
                          style={{ borderColor: isDone ? "var(--teal)" : "var(--border-strong)", background: isDone ? "var(--teal)" : "transparent", boxShadow: isDone ? "0 0 4px color-mix(in srgb, var(--teal) 25%, transparent)" : "none" }}>
                          {isDone && (
                            <motion.svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
                              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
                              <path d="M20 6L9 17l-5-5" />
                            </motion.svg>
                          )}
                        </span>
                        <span className="text-[9px] flex-1 truncate transition-all" style={{ color: isDone ? "var(--fg-tertiary)" : "var(--fg)", textDecoration: isDone ? "line-through" : "none", textDecorationColor: isDone ? "var(--teal)" : undefined }}>{item.title}</span>
                        {isDone
                          ? <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[7px] font-bold" style={{ background: "color-mix(in srgb, var(--teal) 14%, transparent)", color: "var(--teal)" }}>✓</span>
                          : <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[7px] font-semibold" style={{ background: "color-mix(in srgb, var(--amber) 12%, transparent)", color: "var(--amber)" }}>○</span>
                        }
                      </button>
                    );
                  }
                  const { task } = item;
                  const statusColor = task.status === "completed" ? "var(--teal)" : task.status === "inProgress" ? "var(--primary)" : "var(--amber)";
                  const statusLabel = task.status === "completed" ? "Done" : task.status === "inProgress" ? "Working" : "Pending";
                  const isCycling = cyclingTask === task._id;
                  const isCompleted = task.status === "completed";
                  return (
                    <div key={item.key} className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-all hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]"
                      style={{ borderLeft: `2px solid ${statusColor}`, background: isCompleted ? "color-mix(in srgb, var(--teal) 5%, transparent)" : "color-mix(in srgb, var(--fg) 2%, var(--bg-elevated))", opacity: isCompleted ? 0.7 : 1 }}>
                      <span className="text-[9px] font-medium flex-1 truncate" style={{ color: isCompleted ? "var(--fg-tertiary)" : "var(--fg)", textDecoration: isCompleted ? "line-through" : undefined, textDecorationColor: isCompleted ? "var(--teal)" : undefined }}>{task.title}</span>
                      <motion.button type="button" onClick={() => requestCycleTask(task)} disabled={isCycling}
                        whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
                        className="inline-flex items-center gap-1 shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold transition-all"
                        style={{ borderColor: `color-mix(in srgb, ${statusColor} 30%, transparent)`, background: `color-mix(in srgb, ${statusColor} 12%, transparent)`, color: statusColor, opacity: isCycling ? 0.5 : 1, cursor: "pointer" }}>
                        <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: statusColor }}>
                          {task.status === "inProgress" && <span className="absolute inset-0 animate-ping rounded-full opacity-50" style={{ background: statusColor }} />}
                        </span>
                        {statusLabel}
                        <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
                      </motion.button>
                    </div>
                  );
                });
              })()}
            </div>
          </motion.div>
              </div>
      )}

      {/* 2-SA. My Tasks for SuperAdmin (no self-overview row) */}
      {isSuperAdmin && (myTasks.length > 0 || myChecklists.length > 0) && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="card shrink-0 mb-3 flex flex-col overflow-hidden p-3" style={{ maxHeight: 160 }}>
          <div className="mb-1.5 flex shrink-0 items-center justify-between">
            <h3 className="text-[11px] font-bold" style={{ color: "var(--fg)" }}>My Tasks</h3>
            <div className="flex items-center gap-1.5">
              {myTasks.length > 0 && <span className="rounded-full px-1.5 py-px text-[8px] font-bold tabular-nums" style={{ background: "color-mix(in srgb, var(--amber) 12%, transparent)", color: "var(--amber)" }}>{myTasks.length}</span>}
              {myCompleted > 0 && <span className="rounded-full px-1.5 py-px text-[8px] font-bold tabular-nums" style={{ background: "color-mix(in srgb, var(--teal) 12%, transparent)", color: "var(--teal)" }}>{myCompleted} done</span>}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto flex flex-wrap gap-1" style={{ scrollbarWidth: "thin" }}>
            {(() => {
              type SAItem = { key: string; kind: "checklist"; campaignId: string; taskId: string; title: string; done: boolean } | { key: string; kind: "task"; task: ApiTask };
              const saUnified: SAItem[] = [
                ...myChecklists.map((item) => ({ key: `cl-${item.taskId}`, kind: "checklist" as const, campaignId: item.campaignId, taskId: item.taskId, title: item.title, done: checklistOverrides.has(item.taskId) ? checklistOverrides.get(item.taskId)! : item.done })),
                ...myTasks.map((t) => ({ key: `tk-${t._id}`, kind: "task" as const, task: t })),
              ];
              const saIsDone = (i: SAItem) => i.kind === "checklist" ? i.done : i.task.status === "completed";
              saUnified.sort((a, b) => (saIsDone(a) ? 1 : 0) - (saIsDone(b) ? 1 : 0));

              return saUnified.map((item) => {
                if (item.kind === "checklist") {
                  const isDone = item.done;
                  return (
                    <button key={item.key} type="button" onClick={() => requestToggleChecklist(item.campaignId, item.taskId, item.title, isDone)}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[9px] font-medium transition-all"
                      style={{
                        borderColor: isDone ? "var(--teal)" : "var(--border)",
                        background: isDone ? "color-mix(in srgb, var(--teal) 8%, transparent)" : "var(--bg-grouped)",
                        color: isDone ? "var(--fg-tertiary)" : "var(--fg)",
                        textDecoration: isDone ? "line-through" : undefined,
                        textDecorationColor: isDone ? "var(--teal)" : undefined,
                        opacity: isDone ? 0.7 : 1,
                      }}>
                      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-md border-2 transition-all"
                        style={{ borderColor: isDone ? "var(--teal)" : "var(--border-strong)", background: isDone ? "var(--teal)" : "transparent", boxShadow: isDone ? "0 0 4px color-mix(in srgb, var(--teal) 25%, transparent)" : "none" }}>
                        {isDone && (
                          <motion.svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
                            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
                            <path d="M20 6L9 17l-5-5" />
                          </motion.svg>
                        )}
                      </span>
                      {item.title}
                    </button>
                  );
                }
                const { task } = item;
                const sc = task.status === "completed" ? "var(--teal)" : task.status === "inProgress" ? "var(--primary)" : "var(--amber)";
                const sl = task.status === "completed" ? "Done" : task.status === "inProgress" ? "Working" : "Pending";
                const isCycling = cyclingTask === task._id;
                const isComp = task.status === "completed";
                return (
                  <div key={item.key} className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[9px] font-medium"
                    style={{ borderLeft: `2px solid ${sc}`, borderColor: "var(--border)", background: isComp ? "color-mix(in srgb, var(--teal) 8%, transparent)" : "color-mix(in srgb, var(--fg) 2%, var(--bg-elevated))", opacity: isComp ? 0.7 : 1 }}>
                    <span className="truncate max-w-[140px]" style={{ color: isComp ? "var(--fg-tertiary)" : "var(--fg)", textDecoration: isComp ? "line-through" : undefined, textDecorationColor: isComp ? "var(--teal)" : undefined }}>{task.title}</span>
                    <motion.button type="button" onClick={() => requestCycleTask(task)} disabled={isCycling}
                      whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
                      className="inline-flex items-center gap-1 shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-semibold"
                      style={{ borderColor: `color-mix(in srgb, ${sc} 30%, transparent)`, background: `color-mix(in srgb, ${sc} 12%, transparent)`, color: sc, opacity: isCycling ? 0.5 : 1, cursor: "pointer" }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: sc }} />
                      {sl}
                      <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
                    </motion.button>
                  </div>
                );
              });
            })()}
          </div>
        </motion.div>
      )}

      {/* 2b. Quick stat pills */}
      {((hasTeamAccess && teamTodayStats && !presenceLoading) || (canViewTasks && taskQuickStats)) && (
        <div className="scrollbar-hide mb-3 flex shrink-0 gap-1.5 overflow-x-auto pb-0.5">
          {hasTeamAccess && teamTodayStats && !presenceLoading && (
            <>
              <span className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}>{teamTodayStats.pctPresent}% present</span>
              <span className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--teal)" }}>{teamTodayStats.pctInOffice}% in-office</span>
              <span className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}>Avg per person: {formatMinutes(teamTodayStats.avgMins)}</span>
              <span className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}>{teamTodayStats.officePct}% office / {100 - teamTodayStats.officePct}% remote</span>
              {teamTodayStats.pctLate > 0 && <span className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--rose)" }}>{teamTodayStats.pctLate}% late</span>}
              {teamTodayStats.flagged > 0 && <span className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--rose)" }}>{teamTodayStats.flagged} location flagged</span>}
              {flagStats && flagStats.total > 0 && (
                <>
                  <span className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--rose)" }}>{flagStats.total} location flags</span>
                  {flagStats.warnings > 0 && <span className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--amber)" }}>{flagStats.warnings} warnings</span>}
                  {flagStats.violations > 0 && <span className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--rose)" }}>{flagStats.violations} violations</span>}
                </>
              )}
            </>
          )}
          {canViewTasks && taskQuickStats && (
            <>
              <span className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}>{taskQuickStats.total} tasks</span>
              <span className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--amber)" }}>{taskQuickStats.pending} pending</span>
              <span className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--primary)" }}>{taskQuickStats.inProg} in progress</span>
              {taskQuickStats.dueSoon > 0 && <span className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--amber)" }}>{taskQuickStats.dueSoon} due soon</span>}
              {taskQuickStats.dueThisWeek > 0 && <span className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}>{taskQuickStats.dueThisWeek} due this week</span>}
              {taskQuickStats.overdueHU > 0 && <span className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--rose)" }}>{taskQuickStats.overdueHU} overdue high/urgent</span>}
              {taskQuickStats.overdue7d > 0 && <span className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--rose)" }}>{taskQuickStats.overdue7d} overdue 7d+</span>}
            </>
          )}
        </div>
      )}

      {/* 3. Main content + Activity sidebar */}
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* 3a. Team Status — limited height */}
        <motion.section data-tour="dashboard-team-status" className="card relative flex min-w-0 flex-col overflow-hidden p-3 sm:p-3.5" style={{ flex: "1 1 0", minHeight: 0 }} variants={slideUpItem} initial="hidden" animate="visible">
          <div className="mb-2 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ backgroundColor: "var(--teal)" }} /><span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--teal)" }} /></span>
              <h2 className="text-headline" style={{ color: "var(--fg)" }}>Team Status</h2>
              <RefreshBtn onRefresh={onRefreshLive} />
              {hasTeamAccess && (presenceLoading ? (
                <Bone w="w-20" h="h-3.5" />
              ) : (
                <>
                  <span className="text-caption font-semibold" style={{ color: "var(--green)" }}>{liveCount} live</span>
                  <span className="text-caption" style={{ color: "var(--fg-tertiary)" }}>· {filteredPresence.length} shown</span>
                </>
              ))}
                    </div>
            {hasTeamAccess && (
              <LayoutGroup id="admin-presence-filter">
                <div className="relative flex flex-wrap gap-1 rounded-xl p-1" style={{ background: "var(--bg-grouped)" }}>
                {PRESENCE_FILTER_ORDER.map((f) => {
                  const active = presenceFilter === f;
                  return (
                      <button key={f} type="button" onClick={() => setPresenceFilter(f)} className="btn btn-sm relative z-10 min-h-0 border-0 bg-transparent px-3 py-1.5 shadow-none" style={{ color: active ? "var(--fg)" : "var(--fg-secondary)" }}>
                        {active && <motion.span layoutId="admin-presence-active" className="absolute inset-0 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }} transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
                        <span className="relative text-caption font-semibold">{PRESENCE_FILTER_LABELS[f]}</span>
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>
          )}
        </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 pt-4" style={{ scrollbarWidth: "thin" }}>
            {presenceLoading && filteredPresence.length === 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="card flex flex-col overflow-hidden">
                    <div className="p-2.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="shimmer h-5 w-5 shrink-0 rounded-full" />
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
              <motion.div className="grid grid-cols-3 gap-3" variants={staggerContainerFast} initial="hidden" animate="visible">
                <AnimatePresence mode="popLayout">
                  {filteredPresence.map((emp, idx) => {
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
                        onCardClick={(id) => { setEmpModalId(id); setEmpModalOpen(true); }}
                        showAttendance={hasTeamAccess}
                        showAttendanceDetail={canViewAttendanceDetail}
                        showLocationFlags={canViewAttendanceDetail}
                        showTasks={canViewTasks}
                        showCampaigns={canViewCampaigns}
                        emp={{
                          _id: emp._id, username: emp.username, firstName: emp.firstName, lastName: emp.lastName, email: emp.email,
                          designation: emp.designation, department: emp.department, parentDepartment: emp.parentDepartment, reportsTo: emp.reportsTo, isLive: emp.isLive, status: emp.status,
                          locationFlagged: emp.locationFlagged, flagReason: emp.flagReason, flagCoords: emp.flagCoords,
                          firstEntry: emp.firstEntry ?? undefined, firstOfficeEntry: emp.firstOfficeEntry ?? undefined,
                          lastOfficeExit: emp.lastOfficeExit ?? undefined, lastExit: emp.lastExit ?? undefined,
                          todayMinutes: emp.todayMinutes, officeMinutes: emp.officeMinutes, remoteMinutes: emp.remoteMinutes,
                          lateBy: emp.lateBy, isLateToOffice: emp.isLateToOffice, lateToOfficeBy: emp.lateToOfficeBy,
                          breakMinutes: emp.breakMinutes, sessionCount: emp.sessionCount,
                          shiftStart: emp.shiftStart, shiftEnd: emp.shiftEnd, shiftBreakTime: emp.shiftBreakTime,
                          pendingTasks: canViewTasks ? pendingCount : 0, inProgressTasks: canViewTasks ? inProgressCount : 0,
                          campaigns: canViewCampaigns ? activeCampNames : [],
                        }}
                      />
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            ) : (
              <p className="py-8 text-center text-caption" style={{ color: "var(--fg-tertiary)" }}>No employees match this filter</p>
            )}
      </div>
        </motion.section>

        {/* 3b. Bottom 2-column grid — Today's Snapshot + Needs Attention */}
        <div className="grid min-h-0 grid-cols-2 gap-3" style={{ flex: "1 1 0" }}>
          {/* Today's Snapshot */}
          <div className="card flex flex-col overflow-hidden p-3">
            <h3 className="mb-2 shrink-0 text-[12px] font-bold" style={{ color: "var(--fg)" }}>Today&apos;s Snapshot</h3>
            <div className="min-h-0 flex-1 overflow-y-auto space-y-2" style={{ scrollbarWidth: "thin" }}>
              {hasTeamAccess && teamTodayStats && !presenceLoading && (
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: "Present", value: `${teamTodayStats.pctPresent}%`, color: "var(--green)" },
                    { label: "In Office", value: `${teamTodayStats.pctInOffice}%`, color: "var(--teal)" },
                    { label: "Avg Hours", value: formatMinutes(teamTodayStats.avgMins), color: "var(--primary)" },
                    { label: "Office / Remote", value: `${teamTodayStats.officePct}% / ${100 - teamTodayStats.officePct}%`, color: "var(--fg-secondary)" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                      <p className="text-[8px] font-semibold uppercase" style={{ color: s.color }}>{s.label}</p>
                      <p className="text-[13px] font-bold tabular-nums" style={{ color: "var(--fg)" }}>{s.value}</p>
                    </div>
                  ))}
                </div>
              )}
              {canViewTasks && taskQuickStats && (
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: "Tasks", value: taskQuickStats.total, color: "var(--fg-secondary)" },
                    { label: "Pending", value: taskQuickStats.pending, color: "var(--amber)" },
                    { label: "In Progress", value: taskQuickStats.inProg, color: "var(--primary)" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                      <p className="text-[8px] font-semibold uppercase" style={{ color: s.color }}>{s.label}</p>
                      <p className="text-[13px] font-bold tabular-nums" style={{ color: "var(--fg)" }}>{s.value}</p>
                    </div>
                  ))}
                </div>
              )}
              {canViewCampaigns && (
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                    <p className="text-[8px] font-semibold uppercase" style={{ color: "var(--teal)" }}>Active Campaigns</p>
                    <p className="text-[13px] font-bold tabular-nums" style={{ color: "var(--fg)" }}>{campaigns.filter((c) => c.status === "active").length}</p>
                  </div>
                  <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                    <p className="text-[8px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>Total Campaigns</p>
                    <p className="text-[13px] font-bold tabular-nums" style={{ color: "var(--fg)" }}>{campaigns.length}</p>
                  </div>
                </div>
              )}
              {!hasTeamAccess && !canViewTasks && !canViewCampaigns && (
                <p className="py-4 text-center text-caption" style={{ color: "var(--fg-tertiary)" }}>No data to show</p>
              )}
            </div>
          </div>

          {/* Needs Attention */}
          <div className="card flex flex-col overflow-hidden p-3">
            <h3 className="mb-2 shrink-0 text-[12px] font-bold" style={{ color: "var(--fg)" }}>Needs Attention</h3>
            <div className="min-h-0 flex-1 overflow-y-auto space-y-1.5" style={{ scrollbarWidth: "thin" }}>
              <NeedsAttentionItems tasks={tasks} canViewTasks={canViewTasks} emps={otherEmps} hasTeamAccess={hasTeamAccess} flagStats={flagStats} taskQuickStats={taskQuickStats} />
            </div>
          </div>
        </div>
        </div>{/* end left column wrapper */}

        {/* 3c. Activity sidebar */}
        {canViewLogs && (
          <aside className="hidden lg:flex shrink-0 overflow-hidden flex-col min-h-0 w-[380px]">
            <div className="flex w-[380px] min-h-0 flex-1 flex-col rounded-xl border overflow-hidden" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
              <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center min-w-0">
                  <h3 className="text-headline" style={{ color: "var(--fg)" }}>Activity</h3>
                  <RefreshBtn onRefresh={() => void refetchLogs()} />
                  {totalUnread > 0 && (
                    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ml-2" style={{ background: "var(--rose)" }}>
                      {totalUnread > 99 ? "99+" : totalUnread}
                    </span>
                  )}
              </div>
                {totalUnread > 0 && (
                  <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={markAllRead}
                    className="h-6 w-6 flex items-center justify-center rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--teal)_10%,transparent)]"
                    style={{ color: "var(--teal)" }} title="Mark all as read">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L7 17l-5-5" /><path d="M22 10l-9.5 9.5L10 17" /></svg>
                  </motion.button>
                )}
              </div>
              {logs.length === 0 ? (
                <p className="text-center text-xs py-8 flex-1" style={{ color: "var(--fg-tertiary)" }}>No activity yet</p>
              ) : (
                <div className="flex flex-1 min-h-0 flex-col gap-1 p-2">
                  {Array.from(logGroups.entries())
                    .sort((a, b) => {
                      const pa = LOG_ENTITY_PRIORITY[a[0]] ?? 50;
                      const pb = LOG_ENTITY_PRIORITY[b[0]] ?? 50;
                      if (pa !== pb) return pa - pb;
                      if (b[1].unread !== a[1].unread) return b[1].unread - a[1].unread;
                      return b[1].logs.length - a[1].logs.length;
                    })
                    .map(([entity, group]) => {
                      const lc = LOG_ENTITY_COLORS[entity] ?? LOG_DEFAULT_COLOR;
                      const label = LOG_ENTITY_LABELS[entity] ?? entity.charAt(0).toUpperCase() + entity.slice(1);
                      const isOpen = activityExpanded === entity;
                      return (
                        <div key={entity} className={`rounded-xl border overflow-hidden flex flex-col ${isOpen ? "flex-1 min-h-0" : "shrink-0"}`} style={{ borderColor: "var(--border)" }}>
                          <div className="flex w-full shrink-0 items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
                            <button type="button" onClick={() => toggleActivityGroup(entity)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: lc.fg }} />
                              <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--fg)" }}>{label}</span>
                              {group.unread > 0 && (
                                <span className="flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white" style={{ background: "var(--rose)" }}>
                                  {group.unread}
                                </span>
                              )}
                              <span className="text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{group.logs.length}</span>
                              <motion.svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.15 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </motion.svg>
                            </button>
                            {group.unread > 0 && (
                              <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => markEntityRead(entity)}
                                className="shrink-0 h-5 w-5 flex items-center justify-center rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--teal)_10%,transparent)]"
                                style={{ color: "var(--teal)" }} title="Mark as read">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                              </motion.button>
                            )}
              </div>
                          {isOpen && (
                            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-1.5" style={{ scrollbarWidth: "thin" }}>
                              {group.logs.map((log) => {
                                const isSelf = user.email && log.userEmail?.toLowerCase() === user.email.toLowerCase();
                                const needsPossessive = /^(location|account|profile|password|session)\b/i.test(log.action);
                                const displayName = isSelf ? (needsPossessive ? "Your" : "You") : (log.userName?.trim() || log.userEmail);
                return (
                                  <div key={log._id} className="rounded-lg p-2.5 transition-colors" style={{ background: "var(--bg)" }}>
                                    <div className="flex items-start gap-2">
                                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[8px] font-bold"
                                        style={{ background: lc.bg, color: lc.fg }}>
                                        {logAvatarLabel(log)}
                    </div>
                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] leading-snug" style={{ color: "var(--fg)" }}>
                                          <span className="font-semibold">{displayName}</span>{" "}
                                          <span style={{ color: "var(--fg-secondary)" }}>{log.action}</span>
                                        </p>
                                        {log.details && log.entity !== "security" && (
                                          <p className="text-[10px] line-clamp-2 mt-0.5" style={{ color: "var(--fg-tertiary)" }}>{log.details}</p>
                                        )}
                                        <div className="flex items-center gap-2 mt-1">
                                          <span className="text-[9px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{timeAgo(log.createdAt)}</span>
                                          {log.entity === "task" && log.entityId && (() => {
                                            const linkedTask = tasks.find((t) => t._id === log.entityId);
                                            if (!linkedTask) return null;
                                            const sc = linkedTask.status === "completed" ? "var(--teal)" : linkedTask.status === "inProgress" ? "var(--primary)" : "var(--amber)";
                                            const sl = linkedTask.status === "completed" ? "Done" : linkedTask.status === "inProgress" ? "Working" : "Pending";
                                            const canAct = linkedTask.status !== "completed";
                                            return (
                                              <motion.button type="button" onClick={canAct ? () => requestCycleTask(linkedTask) : undefined} disabled={!canAct}
                                                whileHover={canAct ? { scale: 1.06 } : undefined} whileTap={canAct ? { scale: 0.94 } : undefined}
                                                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold transition-all disabled:cursor-default"
                                                style={{ borderColor: `color-mix(in srgb, ${sc} 30%, transparent)`, background: `color-mix(in srgb, ${sc} 12%, transparent)`, color: sc, cursor: canAct ? "pointer" : "default" }}>
                                                <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: sc }}>
                                                  {linkedTask.status === "inProgress" && <span className="absolute inset-0 animate-ping rounded-full opacity-50" style={{ background: sc }} />}
                                                </span>
                                                {sl}
                                                {canAct && <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>}
                                              </motion.button>
                                            );
                                          })()}
                                        </div>
            </div>
          </div>
                      </div>
                );
              })}
                            </div>
                          )}
                </div>
              );
            })}
            </div>
          )}
        </div>
          </aside>
        )}
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
      <EmployeeModal open={empModalOpen} onClose={() => setEmpModalOpen(false)} initialEmployeeId={empModalId} />

      {/* ── status change confirm ── */}
      <ConfirmDialog
        open={!!dashStatusConfirm}
        title={dashStatusConfirm?.type === "task"
          ? `Mark as ${dashStatusConfirm.label}?`
          : dashStatusConfirm?.currentDone ? "Undo completion?" : "Mark as done?"}
        description={dashStatusConfirm?.type === "task"
          ? `Change "${dashStatusConfirm.task.title}" status to ${dashStatusConfirm.label}.`
          : dashStatusConfirm?.currentDone
            ? `Unmark "${dashStatusConfirm?.title}" as completed for today.`
            : `Mark "${dashStatusConfirm?.title}" as completed for today.`}
        confirmLabel={dashStatusConfirm?.type === "task" ? dashStatusConfirm.label : dashStatusConfirm?.currentDone ? "Undo" : "Done"}
        variant={dashStatusConfirm?.type === "task" && dashStatusConfirm.next === "pending" ? "warning" : "default"}
        loading={dashStatusUpdating}
        onConfirm={handleDashStatusConfirm}
        onCancel={() => setDashStatusConfirm(null)}
      />
    </div>
  );
}

/* ──────────────────────── OTHER ROLES OVERVIEW ──────────────────────── */

function OtherRoleOverview({ user, tasks, personalAttendance, weeklyRecords, monthlyStats: ms, userProfile, dataLoading, companyTz = "Asia/Karachi" }: { user: User; tasks: ApiTask[]; personalAttendance: PersonalAttendance | null; weeklyRecords: WeeklyDay[]; monthlyStats: FullMonthlyStats | null; userProfile: UserProfile | null; dataLoading: boolean; companyTz?: string }) {
  const pa = personalAttendance;
  const profileName = userProfile?.firstName ?? user.firstName;
  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);

  const weeklyInsights = useMemo(() => {
    if (!weeklyRecords.length) return null;
    const present = weeklyRecords.filter((d) => d.isPresent);
    if (!present.length) return null;
    const best = present.reduce((a, b) => (b.totalMinutes > a.totalMinutes ? b : a));
    const worst = present.reduce((a, b) => (b.totalMinutes < a.totalMinutes ? b : a));
    const bestDay = new Date(best.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
    const worstDay = new Date(worst.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
    const onTimeStreak = (() => {
      let streak = 0;
      for (let i = weeklyRecords.length - 1; i >= 0; i--) {
        if (weeklyRecords[i].isPresent && weeklyRecords[i].isOnTime) streak++;
        else break;
      }
      return streak;
    })();
    const presentStreak = (() => {
      let streak = 0;
      for (let i = weeklyRecords.length - 1; i >= 0; i--) {
        if (weeklyRecords[i].isPresent) streak++;
        else break;
      }
      return streak;
    })();
    return { bestDay, bestMins: best.totalMinutes, worstDay, worstMins: worst.totalMinutes, onTimeStreak, presentStreak };
  }, [weeklyRecords]);

  const isDayOff = useMemo(() => {
    if (!userProfile?.weeklySchedule) return false;
    const rec = userProfile as unknown as Record<string, unknown>;
    const schedule = resolveWeeklySchedule(rec);
    const todayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
    return !schedule[todayKey as keyof typeof schedule]?.isWorking;
  }, [userProfile]);

  const taskStats = useMemo(() => {
    if (!tasks.length) return null;
    const total = tasks.length;
    const pending = tasks.filter((t) => t.status === "pending").length;
    const inProg = tasks.filter((t) => t.status === "inProgress").length;
    const now = Date.now();
    const dueSoon = tasks.filter((t) => t.deadline && t.status !== "completed" && new Date(t.deadline).getTime() - now < 48 * 3600_000 && new Date(t.deadline).getTime() > now).length;
    const overdue7d = tasks.filter((t) => t.deadline && t.status !== "completed" && (now - new Date(t.deadline).getTime()) > 7 * 86400_000).length;
    const overdueHU = tasks.filter((t) => t.deadline && t.status !== "completed" && new Date(t.deadline).getTime() < now && (t.priority === "high" || t.priority === "urgent")).length;
    return { total, pending, inProg, dueSoon, overdue7d, overdueHU };
  }, [tasks]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1_000); return () => window.clearInterval(id); }, []);

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

        {taskStats && (
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}>{taskStats.total} tasks</span>
            <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--amber)" }}>{taskStats.pending} pending</span>
            <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--primary)" }}>{taskStats.inProg} in progress</span>
            {taskStats.dueSoon > 0 && <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--amber)" }}>{taskStats.dueSoon} due soon</span>}
            {taskStats.overdueHU > 0 && <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--rose)" }}>{taskStats.overdueHU} overdue high/urgent</span>}
            {taskStats.overdue7d > 0 && <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--rose)" }}>{taskStats.overdue7d} overdue 7d+</span>}
          </div>
        )}

        {/* Self overview + Activity timeline */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SelfOverviewCard pa={pa} userProfile={userProfile} user={user} companyTz={companyTz} />
          <TodayTimelineCard pa={pa} dataLoading={dataLoading} />
      </div>

        {/* Weekly Overview — horizontal scroll strip */}
        <section className="space-y-3">
          <motion.h3 variants={fadeInItem} initial="hidden" animate="visible" className="text-section-header">Weekly Overview</motion.h3>
          {weeklyInsights && (
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--green)" }}>Best: {weeklyInsights.bestDay} ({formatMinutes(weeklyInsights.bestMins)})</span>
              <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg-tertiary)" }}>Least: {weeklyInsights.worstDay} ({formatMinutes(weeklyInsights.worstMins)})</span>
              {weeklyInsights.onTimeStreak > 0 && <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--teal)" }}>{weeklyInsights.onTimeStreak}d on-time streak</span>}
              {weeklyInsights.presentStreak > 0 && <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--primary)" }}>{weeklyInsights.presentStreak}d present streak</span>}
              {isDayOff && <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold" style={{ borderColor: "var(--border)", color: "var(--amber)" }}>Day off today</span>}
            </div>
          )}
          <div className="scrollbar-hide -mx-1 flex gap-3 overflow-x-auto pb-2 pt-1">
            {weeklyRecords.length === 0 ? (
              [1, 2, 3, 4, 5].map((i) => <div key={i} className="card-static flex min-w-[112px] shrink-0 flex-col gap-2 p-4"><Bone w="w-12" h="h-3" /><Bone w="w-16" h="h-2.5" /><Bone w="w-10" h="h-5" /></div>)
            ) : weeklyRecords.map((day, i) => {
              const d = new Date(day.date + "T12:00:00");
              const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
                const isToday = day.date === new Intl.DateTimeFormat("en-CA", { timeZone: companyTz }).format(now);
                const dot = !day.isPresent ? "var(--rose)" : !day.isOnTime ? "var(--amber)" : "var(--green)";
              return (
                  <motion.div key={day.date} custom={i} variants={cardVariants} initial="hidden" animate="visible" whileHover={cardHover} className={`card-static flex min-w-[112px] shrink-0 flex-col gap-2 p-4 ${isToday ? "border-2" : ""}`} style={isToday ? { borderColor: "var(--primary)", boxShadow: "var(--shadow-sm), 0 0 24px color-mix(in srgb, var(--primary) 18%, transparent)" } : undefined}>
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

        {/* Monthly Summary */}
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="card-static p-5 sm:p-6">
          <h3 className="text-section-header mb-4">Monthly Summary</h3>
          {ms ? (
            <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="card-static p-4">
              <p className="text-caption">Present / Total</p>
              <p className="text-title mt-1" style={{ color: "var(--fg)" }}><AnimatedNumber value={ms.presentDays} /><span style={{ color: "var(--fg-tertiary)" }}> / </span><AnimatedNumber value={ms.totalWorkingDays} /><span className="text-subhead"> days</span></p>
            </div>
            <div className="card-static p-4">
              <p className="text-caption">On-time</p>
                  <p className="text-title mt-1 text-[var(--primary)]"><AnimatedNumber value={ms.onTimePercentage} suffix="%" /></p>
            </div>
            <div className="card-static p-4">
              <p className="text-caption">Avg. daily hours</p>
                  <p className="text-title mt-1" style={{ color: "var(--fg)" }}><AnimatedNumber value={ms.averageDailyHours} suffix="h" /></p>
            </div>
            <div className="card-static p-4">
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
              {[1, 2, 3, 4].map((i) => <div key={i} className="card-static p-4 space-y-2"><Bone w="w-20" h="h-3" /><Bone w="w-14" h="h-6" /></div>)}
            </div>
        )}
      </motion.section>
      </div>
        </div>
  );
}

/* ──────────────────────── MAIN EXPORT ──────────────────────── */

export default function DashboardHome({ user }: { user: User }) {
  const [employees, setEmployees] = useCachedState<ApiEmployee[]>("$dash/employees", []);
  const [tasks, setTasks] = useCachedState<ApiTask[]>("$dash/tasks", []);
  const [realPresence, setRealPresence] = useCachedState<PresenceEmployee[] | null>("$dash/presence", null);
  const [personalAttendance, setPersonalAttendance] = useCachedState<PersonalAttendance | null>("$dash/personalAttendance", null);
  const [campaigns, setCampaigns] = useCachedState<ApiCampaign[]>("$dash/campaigns", []);
  const [weeklyRecords, setWeeklyRecords] = useCachedState<WeeklyDay[]>("$dash/weeklyRecords", []);
  const [monthlyStats, setMonthlyStats] = useCachedState<FullMonthlyStats | null>("$dash/monthlyStats", null);
  const [userProfile, setUserProfile] = useCachedState<UserProfile | null>("$dash/userProfile", null);
  const [companyTz, setCompanyTz] = useCachedState<string>("$dash/companyTz", "Asia/Karachi");

  const hasCachedData = employees.length > 0 || campaigns.length > 0 || tasks.length > 0;
  const [loading, setLoading] = useState(!hasCachedData);

  const isSuperAdmin = user.isSuperAdmin === true;
  const { can: canPermRoot, hasSubordinates } = usePermissions();
  const hasTeamAccess = canPermRoot("attendance_viewTeam") || hasSubordinates;
  const canViewEmployees = canPermRoot("employees_view");
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
        designation: p.isSuperAdmin ? "System Administrator" : (p.designation ?? ""),
        department: p.department ?? "",
        departmentId: p.departmentId ?? null,
        parentDepartment: p.parentDepartment ?? "",
        reportsTo: p.reportsTo ?? null,
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
      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: companyTz }).format(new Date());
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
            firstEntry: dailyRes.firstOfficeEntry ? new Date(dailyRes.firstOfficeEntry).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true }) : null,
            clockIn: ct.clockIn,
            clockOut: ct.clockOut,
            firstOfficeEntry: dailyRes.firstOfficeEntry ? new Date(dailyRes.firstOfficeEntry).toISOString() : null,
            lastOfficeExit: dailyRes.lastOfficeExit ? new Date(dailyRes.lastOfficeExit).toISOString() : null,
          };
        });
      }
    } catch { /* optional */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyTz]);

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
      const pktNow = new Intl.DateTimeFormat("en-CA", { timeZone: companyTz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
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
          firstEntry: dailyDetailRes.firstOfficeEntry ? new Date(dailyDetailRes.firstOfficeEntry).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true }) : null,
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
          designation: user.isSuperAdmin ? "System Administrator" : "",
          weeklySchedule: resolveWeeklySchedule(p),
          shiftType: typeof p.shiftType === "string" ? p.shiftType : undefined,
          graceMinutes: resolveGraceMinutes(p),
        });
      }
    } catch { /* optional data */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, user, companyTz]);

  /* ── SLOW POLL: full data set ── */
  const fetchFull = useCallback(async () => {
    try {
      const fetches: Promise<unknown>[] = [
        canViewEmployees ? fetch("/api/employees").then((r) => r.ok ? r.json() : []) : Promise.resolve([]),
        fetch("/api/tasks").then((r) => r.ok ? r.json() : []),
        fetch("/api/campaigns").then((r) => r.ok ? r.json() : []),
      ];
      const [empRes, taskRes, campaignRes] = await Promise.all(fetches);

      setEmployees(Array.isArray(empRes) ? empRes as ApiEmployee[] : []);
      setTasks(Array.isArray(taskRes) ? taskRes as ApiTask[] : []);
      if (Array.isArray(campaignRes)) setCampaigns(campaignRes as ApiCampaign[]);

      if (!isSuperAdmin) await fetchPersonalData();
    } catch (err) { console.error("Dashboard fetch error:", err); }
  }, [canViewEmployees, isSuperAdmin, fetchPersonalData]);

  /* ── Initial load ── */
  useEffect(() => {
    if (initialDone.current) return;
      initialDone.current = true;
    fetch("/api/attendance/session").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.companyTimezone) setCompanyTz(d.companyTimezone);
    }).catch(() => {});
    Promise.all([fetchFull(), fetchLive()]).then(() => {
      if (hasTeamAccess && !realPresence) {
        setTimeout(fetchLive, 1500);
      }
    }).finally(() => {
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasPresenceData = realPresence !== null && realPresence.length > 0;
  const presenceLoading = realPresence === null && hasTeamAccess;
  const presenceEmps = useMemo(() => {
    if (hasPresenceData) return realPresence!;
    return employees.map((e) => {
      const fallbackSch = getTodaySchedule(e as unknown as Record<string, unknown>, companyTz);
      return {
      _id: e._id,
      username: e.username ?? "",
      firstName: e.about?.firstName ?? "",
      lastName: e.about?.lastName ?? "",
      email: e.email ?? "",
      designation: e.isSuperAdmin ? "System Administrator" : (() => {
        const mems = (e as unknown as { memberships?: { designation?: { name?: string } }[] }).memberships;
        return mems?.find((m) => m.designation?.name)?.designation?.name ?? "";
      })(),
      department: (() => {
        const mems = (e as unknown as { memberships?: { department?: { title?: string } }[] }).memberships;
        return mems?.find((m) => m.department?.title)?.department?.title ?? "";
      })(),
      departmentId: (() => {
        const mems = (e as unknown as { memberships?: { department?: { _id?: string } }[] }).memberships;
        return mems?.find((m) => m.department?._id)?.department?._id ?? null;
      })(),
      parentDepartment: (() => {
        const mems = (e as unknown as { memberships?: { department?: { parentDepartment?: { title?: string } } }[] }).memberships;
        return mems?.find((m) => m.department?.parentDepartment?.title)?.department?.parentDepartment?.title ?? "";
      })(),
      reportsTo: null,
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
  }, [hasPresenceData, realPresence, employees]);

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
        companyTz={companyTz}
      />
    );
  }

  return <OtherRoleOverview user={user} tasks={tasks} personalAttendance={personalAttendance} weeklyRecords={weeklyRecords} monthlyStats={monthlyStats} userProfile={userProfile} dataLoading={loading} companyTz={companyTz} />;
}
