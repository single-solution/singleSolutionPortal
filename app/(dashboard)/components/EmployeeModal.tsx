"use client";

import { useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { Portal } from "../components/Portal";
import { useQuery } from "@/lib/useQuery";
import { ease } from "@/lib/motion";
import {
  ALL_WEEKDAYS,
  WEEKDAY_LABELS,
  getTodaySchedule,
  resolveWeeklySchedule,
  type WeeklySchedule,
} from "@/lib/schedule";

/* ─── types ─── */
interface EmployeeDoc {
  _id: string;
  email: string;
  username: string;
  isSuperAdmin?: boolean;
  isVerified?: boolean;
  about?: { firstName?: string; lastName?: string; phone?: string; profileImage?: string };
  department?: { _id?: string; title?: string } | null;
  weeklySchedule?: WeeklySchedule;
  shiftType?: string;
  graceMinutes?: number;
  isActive?: boolean;
  salary?: number;
  salaryHistory?: { previousSalary: number; newSalary: number; effectiveDate: string; changedAt?: string }[];
  createdAt?: string;
  createdBy?: string;
}
interface SessionApi {
  activeSession?: { status?: string; location?: { inOffice?: boolean } } | null;
  todayMinutes?: number;
  locationFlagged?: boolean;
  flagReason?: string | null;
}
interface MembershipRow {
  _id: string;
  isActive?: boolean;
  department?: { title?: string };
  designation?: { name?: string; color?: string };
}
interface DailyRow {
  date: string;
  isPresent?: boolean;
  isOnTime?: boolean;
  lateBy?: number;
}
interface MonthlyStats {
  presentDays?: number;
  absentDays?: number;
  totalWorkingDays?: number;
  onTimePercentage?: number;
  onTimeArrivals?: number;
  lateArrivals?: number;
  totalWorkingHours?: number;
  averageDailyHours?: number;
  totalOfficeHours?: number;
  totalRemoteHours?: number;
  attendancePercentage?: number;
  averageOfficeInTime?: string;
  averageOfficeOutTime?: string;
}
interface PayEstimate {
  workingDays?: number;
  presentDays?: number;
  absentDays?: number;
  lateDays?: number;
  holidays?: number;
  leaveDays?: number;
  baseSalary?: number;
  grossPay?: number;
  totalDeductions?: number;
  deductions?: number | { name: string; amount: number }[];
  netPay?: number;
  overtimeHours?: number;
  overtimePay?: number;
  exempt?: boolean;
  ytd?: { earned: number; deductions: number; netPay: number; months: number };
  dailyBreakdown?: {
    day: number;
    dayOfWeek: string;
    date: string;
    status: string;
    workingMinutes: number;
    officeMinutes: number;
    remoteMinutes: number;
    lateMinutes: number;
    deduction: number;
  }[];
}
interface LeaveBalance {
  total: number;
  used: number;
  remaining: number;
}
interface LeaveRecord {
  _id: string;
  startDate: string;
  endDate: string;
  type: string;
  status: string;
  reason?: string;
  isHalfDay?: boolean;
}
interface TaskRow {
  _id: string;
  title: string;
  status: string;
  priority: string;
  deadline?: string;
  campaign?: { _id: string; name: string };
  assignedTo?: { _id?: string } | string;
  createdAt?: string;
}
interface CampaignRow {
  _id: string;
  name: string;
  status: string;
  startDate?: string;
  endDate?: string;
  tags?: { employees?: ({ _id?: string } | string)[] };
}
interface FlagEvent {
  _id: string;
  severity: "warning" | "violation";
  reasons: string[];
  acknowledged: boolean;
  createdAt: string;
  latitude: number;
  longitude: number;
}
type TabId = "overview" | "attendance" | "payroll" | "leaves" | "tasks" | "location" | "schedule" | "profile";
interface Props {
  open: boolean;
  onClose: () => void;
  initialEmployeeId?: string | null;
}

const SHIFT_LABELS: Record<string, string> = {
  fullTime: "Full Time",
  partTime: "Part Time",
  contract: "Contract",
};
const TASK_STATUS_COLORS: Record<string, string> = {
  pending: "var(--amber)",
  inProgress: "var(--primary)",
  completed: "var(--green)",
  cancelled: "var(--fg-tertiary)",
};
const PRIORITY_COLORS: Record<string, string> = {
  low: "var(--fg-tertiary)",
  medium: "var(--primary)",
  high: "var(--amber)",
  urgent: "var(--rose)",
};
const TZ = "Asia/Karachi";
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function todayStrKarachi() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}
function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60),
    m = mins % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function recordDateKey(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}
function primaryDesignation(memberships: MembershipRow[] | null, isSuperAdmin?: boolean) {
  if (isSuperAdmin) return "System Administrator";
  const w = memberships?.find((m) => m.designation?.name);
  return w?.designation?.name ?? "Employee";
}
function calendarCells(year: number, month: number) {
  const first = new Date(year, month - 1, 1),
    last = new Date(year, month, 0),
    cells: { day: number | null }[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push({ day: null });
  for (let d = 1; d <= last.getDate(); d++) cells.push({ day: d });
  while (cells.length % 7) cells.push({ day: null });
  return cells;
}
function avatarColor(id: string) {
  const h = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${h}, 55%, 50%)`;
}
function assigneeId(t: TaskRow) {
  if (typeof t.assignedTo === "object" && t.assignedTo?._id) return String(t.assignedTo._id);
  if (typeof t.assignedTo === "string") return t.assignedTo;
  return undefined;
}
function todayWeekdayKey() {
  const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  return dayMap[new Date(new Date().toLocaleString("en-US", { timeZone: TZ })).getDay()];
}
function totalDeductionsAmount(p: PayEstimate | null | undefined) {
  if (!p) return 0;
  if (typeof p.deductions === "number") return p.deductions;
  if (Array.isArray(p.deductions)) return p.deductions.reduce((s, d) => s + (d.amount ?? 0), 0);
  return p.totalDeductions ?? 0;
}

function Sh({ c }: { c: string }) {
  return <div className={`shimmer rounded ${c}`} />;
}
function ProfRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-2 text-[12px] sm:block">
      <dt style={{ color: "var(--fg-tertiary)" }}>{k}</dt>
      <dd className="truncate font-medium sm:mt-0.5 sm:text-right" style={{ color: "var(--fg)" }}>
        {v}
      </dd>
    </div>
  );
}

export function EmployeeModal({ open, onClose, initialEmployeeId }: Props) {
  const { data: session } = useSession();
  const { can: canPerm, isSuperAdmin: viewerIsSuperAdmin } = usePermissions();
  const [userId, setUserId] = useState("");
  const [tab, setTab] = useState<TabId>("overview");
  const n = new Date();
  const [calYear, setCalYear] = useState(n.getFullYear());
  const [calMonth, setCalMonth] = useState(n.getMonth() + 1);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialEmployeeId) setUserId(initialEmployeeId);
  }, [initialEmployeeId]);
  useEffect(() => {
    if (!open) return;
    if (initialEmployeeId) setUserId(initialEmployeeId);
    else if (!viewerIsSuperAdmin) setUserId("");
    setTab("overview");
  }, [open, initialEmployeeId, viewerIsSuperAdmin]);

  const effectiveId = useMemo(() => {
    if (viewerIsSuperAdmin && !userId) return null;
    return userId || session?.user?.id || null;
  }, [viewerIsSuperAdmin, userId, session?.user?.id]);
  const isOwn = Boolean(session?.user?.id && effectiveId && session.user.id === effectiveId);
  const canAtt = isOwn || canPerm("attendance_viewTeam");
  const canTasksNav = isOwn || canPerm("tasks_view");
  const tasksUrl =
    open && effectiveId && canTasksNav && (tab === "overview" || tab === "tasks") ? "/api/tasks" : null;
  const campUrl =
    open && effectiveId && (isOwn || canPerm("campaigns_view")) && (tab === "overview" || tab === "tasks")
      ? "/api/campaigns"
      : null;
  const empUrl = open && effectiveId ? `/api/employees/${effectiveId}` : null;
  const sessUrl =
    open && effectiveId && canAtt ? `/api/attendance/session?userId=${encodeURIComponent(effectiveId)}` : null;
  const memUrl = open && effectiveId ? `/api/memberships?userId=${encodeURIComponent(effectiveId)}` : null;
  const dailyUrl =
    open && effectiveId && canAtt
      ? `/api/attendance?type=daily&year=${calYear}&month=${calMonth}&userId=${encodeURIComponent(effectiveId)}`
      : null;
  const monthlyUrl =
    open && effectiveId && canAtt
      ? `/api/attendance?type=monthly&year=${calYear}&month=${calMonth}&userId=${encodeURIComponent(effectiveId)}`
      : null;

  const { data: employee, loading: empL } = useQuery<EmployeeDoc>(empUrl);
  const { data: sess, loading: sessL } = useQuery<SessionApi>(sessUrl);
  const { data: memRaw, loading: memL } = useQuery<MembershipRow[]>(memUrl);
  const { data: dailyRaw, loading: dayL } = useQuery<DailyRow[]>(dailyUrl, undefined, { enabled: tab === "attendance" });
  const { data: monthlyRaw, loading: monL } = useQuery<MonthlyStats | null>(monthlyUrl, undefined, {
    enabled: tab === "attendance" || tab === "overview",
  });
  const { data: tasksRaw, loading: taskL } = useQuery<TaskRow[]>(tasksUrl, undefined, {
    enabled: tab === "overview" || tab === "tasks",
  });
  const { data: campRaw, loading: campL } = useQuery<CampaignRow[]>(campUrl, undefined, {
    enabled: tab === "overview" || tab === "tasks",
  });

  const canViewPayroll = isOwn || canPerm("payroll_viewTeam");
  const canViewLeaves = isOwn || canPerm("leaves_viewTeam");

  const now2 = new Date();
  const payMonth = now2.getMonth() + 1;
  const payYear = now2.getFullYear();
  const otherUserParam =
    session?.user?.id && effectiveId && session.user.id !== effectiveId
      ? `userId=${encodeURIComponent(effectiveId)}`
      : "";
  const payUrl =
    open && effectiveId && canViewPayroll && tab === "payroll"
      ? `/api/payroll/estimate?detail=true&month=${payMonth}&year=${payYear}${otherUserParam ? `&${otherUserParam}` : ""}`
      : null;
  const flagsUrl =
    open && effectiveId && canAtt && tab === "location"
      ? `/api/location-flags?userId=${encodeURIComponent(effectiveId)}&limit=50`
      : null;
  const { data: flagsPayload, loading: flagsL } = useQuery<{ flags: FlagEvent[]; total: number }>(flagsUrl, undefined, {
    enabled: tab === "location",
  });
  const flags = flagsPayload?.flags ?? [];

  const balUrl =
    open && effectiveId && canViewLeaves && (tab === "leaves" || tab === "overview")
      ? `/api/leaves/balance${otherUserParam ? `?${otherUserParam}` : ""}`
      : null;
  const leavesUrl =
    open && effectiveId && canViewLeaves && tab === "leaves"
      ? `/api/leaves${otherUserParam ? `?${otherUserParam}` : ""}`
      : null;

  const { data: payEstimate, loading: payL } = useQuery<PayEstimate>(payUrl);
  const { data: leaveBalance, loading: balL } = useQuery<LeaveBalance>(balUrl);
  const { data: leavesRaw, loading: leaveL } = useQuery<LeaveRecord[]>(leavesUrl);
  const leavesList = Array.isArray(leavesRaw) ? leavesRaw : [];

  const memberships = Array.isArray(memRaw) ? memRaw : [];
  const id = effectiveId ?? "";
  const memActive = useMemo(() => memberships.filter((m) => m.isActive !== false), [memberships]);
  const designation = useMemo(
    () => primaryDesignation(memberships, employee?.isSuperAdmin),
    [memberships, employee?.isSuperAdmin],
  );
  const empTasks = useMemo(() => {
    const list = Array.isArray(tasksRaw) ? tasksRaw : [];
    return !effectiveId ? [] : list.filter((t) => assigneeId(t) === effectiveId);
  }, [tasksRaw, effectiveId]);
  const activeTasks = useMemo(
    () => empTasks.filter((t) => t.status === "pending" || t.status === "inProgress").length,
    [empTasks],
  );
  const empCampaigns = useMemo(() => {
    const list = Array.isArray(campRaw) ? campRaw : [];
    if (!effectiveId) return [];
    return list.filter((c) =>
      (c.tags?.employees ?? []).some((e) => String(typeof e === "object" && e && "_id" in e ? e._id : e) === effectiveId),
    );
  }, [campRaw, effectiveId]);
  const campCount = empCampaigns.length;

  const targetSA = employee?.isSuperAdmin === true;
  const canEdit = isOwn || (canPerm("employees_edit") && (!targetSA || viewerIsSuperAdmin));
  const displayName = employee
    ? [employee.about?.firstName, employee.about?.lastName].filter(Boolean).join(" ") || employee.email || "Employee"
    : "Employee";
  const parts = displayName.trim().split(/\s+/);
  const fn = employee?.about?.firstName ?? parts[0] ?? "Employee";
  const ln = employee?.about?.lastName ?? parts.slice(1).join(" ");
  const deptTitle = employee?.department?.title ?? "";
  const tm = sess?.todayMinutes ?? 0;
  const hasAct = !!sess?.activeSession && sess.activeSession.status === "active";
  const inOff = sess?.activeSession?.location?.inOffice ?? false;
  const stLabel =
    employee && !employee.isActive ? "Inactive"
    : hasAct ? (inOff ? "Active · Office" : "Active · Remote")
    : tm > 0 ? "Checked in"
    : "Off shift";
  const stCol =
    employee && !employee.isActive ? "var(--fg-tertiary)"
    : hasAct ? "var(--green)"
    : tm > 0 ? "var(--primary)"
    : "var(--fg-secondary)";
  const empRec = employee as unknown as Record<string, unknown> | undefined;
  const week = empRec ? resolveWeeklySchedule(empRec) : null;
  const todayS = empRec ? getTodaySchedule(empRec, TZ) : { isWorking: false, start: "", end: "", breakMinutes: 0 };
  const shiftK = employee?.shiftType ?? "";
  const dailyList = Array.isArray(dailyRaw) ? dailyRaw : [];
  const dailyMap = useMemo(() => {
    const m = new Map<string, DailyRow>();
    for (const r of dailyList) m.set(recordDateKey(r.date), r);
    return m;
  }, [dailyList]);
  const cells = calendarCells(calYear, calMonth);
  const monthLab = new Date(calYear, calMonth - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const ms = monthlyRaw;
  const offPct =
    ms && (ms.totalOfficeHours ?? 0) + (ms.totalRemoteHours ?? 0) > 0
      ? ((ms.totalOfficeHours ?? 0) / ((ms.totalOfficeHours ?? 0) + (ms.totalRemoteHours ?? 0))) * 100
      : 0;
  useEffect(() => {
    detailRef.current && (detailRef.current.scrollTop = 0);
  }, [userId, effectiveId, tab]);

  const overviewAttendancePct = useMemo(() => {
    const m = monthlyRaw;
    if (!m) return null;
    if (typeof m.attendancePercentage === "number") return m.attendancePercentage;
    const tw = m.totalWorkingDays ?? 0;
    if (tw <= 0) return null;
    return Math.round(((m.presentDays ?? 0) / tw) * 100);
  }, [monthlyRaw]);

  const leaveInsights = useMemo(() => {
    if (!leavesList.length) return null;
    const approved = leavesList.filter((l) => l.status === "approved").length;
    const decided = leavesList.filter((l) => ["approved", "rejected"].includes(l.status)).length;
    const approvalRate = decided ? Math.round((approved / decided) * 100) : null;
    let totalDays = 0;
    let halfDays = 0;
    const byType: Record<string, number> = {};
    for (const l of leavesList) {
      if (l.isHalfDay) halfDays += 1;
      const start = new Date(l.startDate).getTime();
      const end = new Date(l.endDate).getTime();
      const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
      totalDays += l.isHalfDay ? 0.5 : days;
      const t = l.type || "Other";
      byType[t] = (byType[t] ?? 0) + (l.isHalfDay ? 0.5 : days);
    }
    const avgDur = leavesList.length ? totalDays / leavesList.length : 0;
    return { approvalRate, avgDur, halfDays, byType };
  }, [leavesList]);
  const editSlug = employee?.username || id.slice(-6);
  const onEdit = useCallback(() => onClose(), [onClose]);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <motion.div
              className="relative mx-4 flex w-full max-w-7xl flex-col overflow-hidden rounded-2xl border shadow-xl h-[85vh]"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header: avatar + name + close */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3" style={{ borderColor: "var(--border)" }}>
                {!effectiveId ? (
                  <h2 className="text-base font-bold" style={{ color: "var(--fg)" }}>Employee</h2>
                ) : (
                  <div className="flex min-w-0 items-center gap-3">
                    {employee?.about?.profileImage ? (
                      <img src={employee.about.profileImage} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover shadow" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow" style={{ background: id ? avatarColor(id) : "var(--primary)" }}>
                        {empL ? <span className="opacity-60">…</span> : initials(fn, ln)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-bold" style={{ color: "var(--fg)" }}>{displayName}</h3>
                        {canEdit && editSlug && (
                          <Link href={`/employee/${editSlug}/edit`} onClick={onEdit} className="shrink-0 text-[11px] font-semibold hover:underline" style={{ color: "var(--primary)" }}>Edit</Link>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="badge inline-flex items-center gap-1 text-[9px]" style={{ background: `color-mix(in srgb, ${stCol} 9%, transparent)`, color: stCol, border: `1px solid color-mix(in srgb, ${stCol} 35%, transparent)` }}>
                          {hasAct && (
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ background: stCol }} />
                              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: stCol }} />
                            </span>
                          )}
                          {stLabel}
                        </span>
                        {deptTitle ? <span className="badge text-[9px]" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>{deptTitle}</span> : null}
                        <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{memL ? "…" : designation}</span>
                      </div>
                    </div>
                  </div>
                )}
                <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1.5 hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-secondary)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              {/* Body: sidebar nav + content */}
              <div className="flex min-h-0 flex-1 overflow-hidden">
                {/* Sidebar navigation */}
                {effectiveId && (
                  <nav className="flex w-[180px] shrink-0 flex-col gap-0.5 border-r py-3 px-2" style={{ borderColor: "var(--border)", background: "var(--bg)" }} aria-label="Employee sections">
                    {(
                      [
                        ["overview", "Overview", "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"],
                        ["attendance", "Attendance", "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"],
                        ...(canViewPayroll ? [["payroll", "Payroll", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"]] : []),
                        ...(canViewLeaves ? [["leaves", "Leaves", "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"]] : []),
                        ...(canTasksNav ? [["tasks", "Tasks", "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 12l2 2 4-4"]] : []),
                        ...(canAtt ? [["location", "Location", "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z"]] : []),
                        ["schedule", "Schedule", "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"],
                        ["profile", "Profile", "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"],
                      ] as [string, string, string][]
                    ).map(([tid, lab, icon]) => {
                      const act = tab === tid;
                      return (
                        <button
                          key={tid}
                          type="button"
                          onClick={() => setTab(tid as TabId)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] font-medium transition-colors"
                          style={{
                            background: act ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "transparent",
                            color: act ? "var(--primary)" : "var(--fg-secondary)",
                          }}
                        >
                          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                          </svg>
                          {lab}
                        </button>
                      );
                    })}
                  </nav>
                )}

                {/* Content */}
                <div ref={detailRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {!effectiveId ? (
                  <div className="flex flex-col items-center py-16">
                    <p className="text-sm font-semibold" style={{ color: "var(--fg-secondary)" }}>No employee selected</p>
                  </div>
                ) : (
                  <>

                      {tab === "overview" && (
                        <div className="space-y-3">
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Today&apos;s attendance</p>
                            {sessL ? (
                              <div className="flex flex-wrap gap-2"><Sh c="h-8 flex-1 min-w-[90px]" /><Sh c="h-8 flex-1 min-w-[90px]" /><Sh c="h-8 flex-1 min-w-[90px]" /></div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium" style={{ borderColor: "var(--border)", color: "var(--fg)" }}><span style={{ color: "var(--fg-tertiary)" }}>Time</span>{formatMinutes(tm)}</span>
                                <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium" style={{ borderColor: "var(--border)", color: "var(--fg)" }}><span style={{ color: "var(--fg-tertiary)" }}>Session</span>{hasAct ? (inOff ? "Active · Office" : "Active · Remote") : "None"}</span>
                                <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium" style={{ borderColor: "var(--border)", color: "var(--fg)" }}><span style={{ color: "var(--fg-tertiary)" }}>Location</span>{sess?.locationFlagged ? "Flagged" : "OK"}</span>
                              </div>
                            )}
                            {sess?.flagReason && !sessL && <p className="mt-1.5 text-[10px]" style={{ color: "var(--rose)" }}>{sess.flagReason}</p>}
                            {!sessL && (monL || overviewAttendancePct != null || monthlyRaw?.averageDailyHours != null) && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {monL ? (
                                  <>
                                    <Sh c="h-6 w-24 rounded-full" />
                                    <Sh c="h-6 w-28 rounded-full" />
                                  </>
                                ) : (
                                  <>
                                    {overviewAttendancePct != null && (
                                      <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg)" }}>
                                        <span style={{ color: "var(--fg-tertiary)" }}>Attendance</span>
                                        {overviewAttendancePct}%
                                      </span>
                                    )}
                                    {monthlyRaw?.averageDailyHours != null && (
                                      <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg)" }}>
                                        <span style={{ color: "var(--fg-tertiary)" }}>Avg / day</span>
                                        {monthlyRaw.averageDailyHours}h
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Workload</p>
                            {taskL || campL ? <div className="flex gap-2"><Sh c="h-8 w-28" /><Sh c="h-8 w-32" /></div> : (
                              <div className="flex flex-wrap gap-2">
                                <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg)" }}>Active tasks <span style={{ color: "var(--primary)" }}>{activeTasks}</span></span>
                                <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg)" }}>Campaigns <span style={{ color: "var(--teal)" }}>{campCount}</span></span>
                              </div>
                            )}
                            {canViewLeaves && (
                              <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2" style={{ borderColor: "var(--border)" }}>
                                {balL ? <Sh c="h-7 w-full max-w-xs rounded-lg" /> : !leaveBalance ? (
                                  <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>Leave balance unavailable.</p>
                                ) : (
                                  <>
                                    <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>Leave balance</span>
                                    <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-bold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--green)" }}>Left {leaveBalance.remaining}</span>
                                    <span className="text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>of {leaveBalance.total} · used {leaveBalance.used}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Memberships</p>
                            {memL ? <div className="flex flex-wrap gap-1.5"><Sh c="h-7 w-24" /><Sh c="h-7 w-28" /></div>
                            : memActive.length === 0 ? <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No active memberships.</p>
                            : (
                              <div className="flex flex-wrap gap-1.5">
                                {memActive.map((m) => (
                                  <span key={m._id} className="max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ borderColor: m.designation?.color ?? "var(--border)", color: "var(--fg-secondary)", background: "var(--bg-elevated)" }} title={m.designation?.name}>
                                    {m.department?.title ?? "Dept"}{m.designation?.name ? ` · ${m.designation.name}` : ""}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {tab === "attendance" && (
                        <div className="space-y-3">
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <h4 className="text-sm font-bold" style={{ color: "var(--fg)" }}>{monthLab}</h4>
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  style={{ background: "var(--bg-grouped)", color: "var(--fg)" }}
                                  onClick={() => {
                                    if (calMonth === 1) {
                                      setCalMonth(12);
                                      setCalYear((y) => y - 1);
                                    } else setCalMonth((m) => m - 1);
                                  }}
                                >
                                  Prev
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  style={{ background: "var(--bg-grouped)", color: "var(--fg)" }}
                                  onClick={() => {
                                    if (calMonth === 12) {
                                      setCalMonth(1);
                                      setCalYear((y) => y + 1);
                                    } else setCalMonth((m) => m + 1);
                                  }}
                                >
                                  Next
                                </button>
                              </div>
                            </div>
                            {dayL ? (
                              <div className="grid grid-cols-7 gap-1">{Array.from({ length: 28 }, (_, i) => <Sh key={i} c="aspect-square rounded-lg" />)}</div>
                            ) : (
                              <>
                                <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>{WD.map((d) => <div key={d}>{d}</div>)}</div>
                                <div className="grid grid-cols-7 gap-1">
                                  {cells.map((c, idx) =>
                                    c.day === null ? (
                                      <div key={`e-${idx}`} className="aspect-square rounded-lg" />
                                    ) : (() => {
                                      const key = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`,
                                        rec = dailyMap.get(key),
                                        dot = !rec || !rec.isPresent ? "#f43f5e" : !rec.isOnTime || (rec.lateBy ?? 0) > 0 ? "var(--amber)" : "var(--green)",
                                        today = key === todayStrKarachi();
                                      return (
                                        <div key={key} className="flex aspect-square flex-col items-center justify-center rounded-lg border text-[10px] font-medium tabular-nums" style={{ borderColor: today ? "var(--primary)" : "var(--border)", background: "var(--bg-grouped)", color: "var(--fg)" }}>
                                          <span>{c.day}</span>
                                          <span className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />
                                        </div>
                                      );
                                    })(),
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Monthly stats</p>
                            {monL ? <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[1, 2, 3, 4].map((i) => <Sh key={i} c="h-14 rounded-lg" />)}</div>
                            : !ms ? <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No stats for this month.</p>
                            : (
                              <>
                                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                                  {[
                                    ["Present / days", `${ms.presentDays ?? 0} / ${ms.totalWorkingDays ?? 0}`],
                                    ["On-time", `${ms.onTimePercentage ?? 0}%`],
                                    ["Total hours", `${ms.totalWorkingHours ?? 0}h`],
                                    ["Avg / day", `${ms.averageDailyHours ?? 0}h`],
                                  ].map(([k, v]) => (
                                    <div key={k} className="rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--border)" }}>
                                      <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>{k}</p>
                                      <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{v}</p>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-3 space-y-1">
                                  <div className="flex justify-between text-[10px]" style={{ color: "var(--fg-secondary)" }}>
                                    <span>Office / remote</span>
                                    <span className="tabular-nums">{ms.totalOfficeHours ?? 0}h · {ms.totalRemoteHours ?? 0}h</span>
                                  </div>
                                  <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                                    <motion.div className="h-full" style={{ background: "var(--teal)" }} initial={{ width: 0 }} animate={{ width: `${offPct}%` }} transition={{ duration: 0.5, ease }} />
                                    <motion.div className="h-full" style={{ background: "var(--primary)" }} initial={{ width: 0 }} animate={{ width: `${100 - offPct}%` }} transition={{ duration: 0.5, delay: 0.04, ease }} />
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {overviewAttendancePct != null && (
                                    <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg)" }}>Attendance {overviewAttendancePct}%</span>
                                  )}
                                  {ms.averageOfficeInTime && (
                                    <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg)" }}>Avg in {ms.averageOfficeInTime}</span>
                                  )}
                                  {ms.averageOfficeOutTime && (
                                    <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg)" }}>Avg out {ms.averageOfficeOutTime}</span>
                                  )}
                                  {typeof ms.lateArrivals === "number" && (
                                    <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--amber)" }}>Late {ms.lateArrivals}</span>
                                  )}
                                  {typeof ms.absentDays === "number" && (
                                    <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--rose)" }}>Absent {ms.absentDays}</span>
                                  )}
                                  {typeof ms.onTimeArrivals === "number" && (
                                    <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--green)" }}>On-time arr. {ms.onTimeArrivals}</span>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {tab === "payroll" && (
                        <div className="space-y-3">
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                              Current month estimate
                            </p>
                            {payL ? (
                              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => <Sh key={i} c="h-14 rounded-lg" />)}</div>
                            ) : !payEstimate || payEstimate.exempt ? (
                              <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>Payroll data not available.</p>
                            ) : (
                              <>
                                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                                  {[
                                    ["Working Days", `${payEstimate.workingDays ?? 0}`],
                                    ["Present", `${payEstimate.presentDays ?? 0}`],
                                    ["Absent", `${payEstimate.absentDays ?? 0}`],
                                    ["Late Days", `${payEstimate.lateDays ?? 0}`],
                                    ["Holidays", `${payEstimate.holidays ?? 0}`],
                                    ["Leave Days", `${payEstimate.leaveDays ?? 0}`],
                                    ["Base Salary", `${(payEstimate.baseSalary ?? 0).toLocaleString()}`],
                                    ["Gross Pay", `${(payEstimate.grossPay ?? 0).toLocaleString()}`],
                                    ["Deductions", `${totalDeductionsAmount(payEstimate).toLocaleString()}`],
                                    ["Net Pay", `${(payEstimate.netPay ?? 0).toLocaleString()}`],
                                  ].map(([k, v]) => (
                                    <div key={k} className="rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--border)" }}>
                                      <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>{k}</p>
                                      <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{v}</p>
                                    </div>
                                  ))}
                                </div>
                                {(payEstimate.overtimeHours ?? 0) > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--teal)" }}>OT: {payEstimate.overtimeHours}h</span>
                                    <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--teal)" }}>OT Pay: {(payEstimate.overtimePay ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                          {!payL && payEstimate && !payEstimate.exempt && payEstimate.ytd && (
                            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Year to date</p>
                              <div className="grid grid-cols-3 gap-2">
                                {(
                                  [
                                    ["Earned", payEstimate.ytd.earned],
                                    ["Deductions", payEstimate.ytd.deductions],
                                    ["Net Pay", payEstimate.ytd.netPay],
                                  ] as const
                                ).map(([k, v]) => (
                                  <div key={k} className="rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--border)" }}>
                                    <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>{k}</p>
                                    <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{v.toLocaleString()}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {!payL && payEstimate && !payEstimate.exempt && payEstimate.dailyBreakdown && payEstimate.dailyBreakdown.length > 0 && (
                            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Daily breakdown</p>
                              <div className="max-h-[200px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                                <table className="w-full text-[10px]">
                                  <thead>
                                    <tr style={{ color: "var(--fg-tertiary)" }}>
                                      <th className="py-1 text-left font-semibold">Day</th>
                                      <th className="py-1 text-left font-semibold">Status</th>
                                      <th className="py-1 text-right font-semibold">Hours</th>
                                      <th className="py-1 text-right font-semibold">Late</th>
                                      <th className="py-1 text-right font-semibold">Deduction</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {payEstimate.dailyBreakdown.map((d) => (
                                      <tr key={d.day} style={{ color: "var(--fg)" }}>
                                        <td className="py-1 tabular-nums">{d.dayOfWeek} {d.day}</td>
                                        <td className="py-1">{d.status}</td>
                                        <td className="py-1 text-right tabular-nums">{((d.workingMinutes ?? 0) / 60).toFixed(1)}</td>
                                        <td className="py-1 text-right tabular-nums">{d.lateMinutes ?? 0}m</td>
                                        <td className="py-1 text-right tabular-nums">{(d.deduction ?? 0).toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          {employee?.salary != null && canPerm("payroll_manageSalary") && (
                            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Salary</p>
                              <p className="text-lg font-bold tabular-nums" style={{ color: "var(--fg)" }}>{employee.salary.toLocaleString()}</p>
                              {employee.salaryHistory?.length ? (
                                <div className="mt-2 space-y-1">
                                  {employee.salaryHistory.slice().reverse().slice(0, 5).map((h, i) => (
                                    <div key={i} className="flex items-center justify-between rounded-lg px-2 py-1" style={{ background: "var(--bg-grouped)" }}>
                                      <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{new Date(h.effectiveDate).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>
                                      <span className="text-[10px] font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{h.previousSalary.toLocaleString()} → {h.newSalary.toLocaleString()}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      )}

                      {tab === "leaves" && (
                        <div className="space-y-3">
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Balance</p>
                            {balL ? (
                              <div className="grid grid-cols-3 gap-2">{[1, 2, 3].map((i) => <Sh key={i} c="h-14 rounded-lg" />)}</div>
                            ) : !leaveBalance ? (
                              <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>Leave balance not available.</p>
                            ) : (
                              <div className="grid grid-cols-3 gap-2">
                                {(
                                  [
                                    ["Total", `${leaveBalance.total}`, "var(--primary)"],
                                    ["Used", `${leaveBalance.used}`, "var(--amber)"],
                                    [
                                      "Remaining",
                                      `${leaveBalance.remaining}`,
                                      leaveBalance.remaining > 0 ? "var(--green)" : "var(--rose)",
                                    ],
                                  ] as [string, string, string][]
                                ).map(([k, v, c]) => (
                                  <div key={k} className="rounded-lg border px-2 py-1.5 text-center" style={{ borderColor: "var(--border)" }}>
                                    <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>{k}</p>
                                    <p className="text-sm font-bold tabular-nums" style={{ color: c }}>{v}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            {!balL && leaveBalance && leaveInsights && leavesList.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-2" style={{ borderColor: "var(--border)" }}>
                                {leaveInsights.approvalRate != null && (
                                  <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold" style={{ borderColor: "var(--border)", color: "var(--fg)" }}>Approval {leaveInsights.approvalRate}%</span>
                                )}
                                <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg)" }}>Avg dur. {leaveInsights.avgDur.toFixed(1)}d</span>
                                <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--amber)" }}>Half-days {leaveInsights.halfDays}</span>
                                {Object.entries(leaveInsights.byType).map(([typ, n]) => (
                                  <span key={typ} className="rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}>{typ}: {n}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>History</p>
                            {leaveL ? (
                              <div className="space-y-2">{[1, 2, 3].map((i) => <Sh key={i} c="h-10 w-full rounded-lg" />)}</div>
                            ) : leavesList.length === 0 ? (
                              <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No leave records found.</p>
                            ) : (
                              <div className="max-h-[300px] space-y-1.5 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                                {leavesList.slice(0, 20).map((l) => {
                                  const sc: Record<string, string> = { approved: "var(--green)", pending: "var(--amber)", rejected: "var(--rose)", cancelled: "var(--fg-tertiary)" };
                                  const col = sc[l.status] ?? "var(--fg-secondary)";
                                  const start = new Date(l.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                                  const end = new Date(l.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                                  const same = l.startDate === l.endDate;
                                  return (
                                    <div key={l._id} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-grouped)" }}>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: col }} />
                                          <span className="truncate text-[11px] font-semibold" style={{ color: "var(--fg)" }}>{l.type || "Leave"}{l.isHalfDay ? " (½)" : ""}</span>
                                        </div>
                                        <p className="mt-0.5 truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{same ? start : `${start} – ${end}`}{l.reason ? ` · ${l.reason}` : ""}</p>
                                      </div>
                                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `color-mix(in srgb, ${col} 12%, transparent)`, color: col }}>{l.status}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {tab === "tasks" && canTasksNav && (
                        <div className="space-y-3">
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Tasks</p>
                            {taskL ? (
                              <div className="space-y-1.5">{[1, 2, 3, 4].map((i) => <Sh key={i} c="h-12 w-full rounded-lg" />)}</div>
                            ) : empTasks.length === 0 ? (
                              <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No tasks assigned.</p>
                            ) : (
                              <div className="max-h-[250px] space-y-1.5 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                                {empTasks.map((t) => {
                                  const stCol = TASK_STATUS_COLORS[t.status] ?? "var(--fg-secondary)";
                                  const prCol = PRIORITY_COLORS[t.priority] ?? "var(--fg-tertiary)";
                                  const overdue = t.deadline && new Date(t.deadline) < new Date() && t.status !== "completed";
                                  return (
                                    <div key={t._id} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-grouped)" }}>
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-[11px] font-semibold" style={{ color: "var(--fg)" }}>{t.title || "Untitled"}</p>
                                        <div className="mt-0.5 flex flex-wrap gap-1.5">
                                          {t.campaign?.name && <span className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>{t.campaign.name}</span>}
                                          {t.deadline && (
                                            <span className="text-[9px] tabular-nums" style={{ color: overdue ? "var(--rose)" : "var(--fg-tertiary)" }}>
                                              Due {new Date(t.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-1.5">
                                        <span className="rounded-full px-2 py-0.5 text-[9px] font-bold capitalize" style={{ background: `color-mix(in srgb, ${prCol} 14%, transparent)`, color: prCol }}>{t.priority || "—"}</span>
                                        <span className="rounded-full px-2 py-0.5 text-[9px] font-bold capitalize" style={{ background: `color-mix(in srgb, ${stCol} 14%, transparent)`, color: stCol }}>{t.status}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Campaigns</p>
                            {campL ? (
                              <div className="space-y-1.5">{[1, 2, 3].map((i) => <Sh key={i} c="h-10 w-full rounded-lg" />)}</div>
                            ) : empCampaigns.length === 0 ? (
                              <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No campaign involvement.</p>
                            ) : (
                              <div className="max-h-[220px] space-y-1.5 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                                {empCampaigns.map((c) => (
                                  <div key={c._id} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-grouped)" }}>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-[11px] font-semibold" style={{ color: "var(--fg)" }}>{c.name}</p>
                                      <div className="mt-0.5 flex flex-wrap gap-1.5 text-[9px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                                        {c.startDate && <span>Start {new Date(c.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                                        {c.endDate && <span>End {new Date(c.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                                      </div>
                                    </div>
                                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold capitalize" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" }}>{c.status}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {tab === "location" && canAtt && (
                        <div className="space-y-3">
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Location flags</p>
                            <div className="mb-2 flex flex-wrap gap-1.5">
                              <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg)" }}>Total {flagsPayload?.total ?? flags.length}</span>
                              <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--amber)" }}>Warnings {flags.filter((f) => f.severity === "warning").length}</span>
                              <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--rose)" }}>Violations {flags.filter((f) => f.severity === "violation").length}</span>
                              <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--green)" }}>Ack {flags.filter((f) => f.acknowledged).length}</span>
                            </div>
                            {flagsL ? (
                              <div className="space-y-1.5">{[1, 2, 3, 4].map((i) => <Sh key={i} c="h-14 w-full rounded-lg" />)}</div>
                            ) : flags.length === 0 ? (
                              <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No location flags recorded.</p>
                            ) : (
                              <div className="mt-2 max-h-[350px] space-y-1.5 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                                {flags.map((f) => (
                                  <div key={f._id} className="flex items-start justify-between gap-2 rounded-lg px-2.5 py-2" style={{ background: "var(--bg-grouped)" }}>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: f.severity === "violation" ? "var(--rose)" : "var(--amber)" }} />
                                        <span className="text-[11px] font-semibold" style={{ color: "var(--fg)" }}>{f.severity === "violation" ? "Violation" : "Warning"}</span>
                                        <span className="text-[9px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{new Date(f.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                                      </div>
                                      <p className="mt-0.5 text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{f.reasons.join(", ")}</p>
                                    </div>
                                    <span
                                      className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold"
                                      style={{
                                        background: f.acknowledged ? "color-mix(in srgb, var(--green) 12%, transparent)" : "color-mix(in srgb, var(--amber) 12%, transparent)",
                                        color: f.acknowledged ? "var(--green)" : "var(--amber)",
                                      }}
                                    >
                                      {f.acknowledged ? "Ack" : "Pending"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {tab === "schedule" && (
                        <div className="space-y-3">
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Shift & Schedule</p>
                            {empL || !employee ? (
                              <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Sh key={i} c="h-10 w-full rounded-lg" />)}</div>
                            ) : (
                              <>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--border)" }}>
                                    <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>Shift Type</p>
                                    <p className="text-sm font-bold" style={{ color: "var(--fg)" }}>{(SHIFT_LABELS[shiftK] ?? shiftK) || "—"}</p>
                                  </div>
                                  <div className="rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--border)" }}>
                                    <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>Grace Minutes</p>
                                    <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{employee.graceMinutes ?? 0}m</p>
                                  </div>
                                </div>
                                <div className="mt-3 rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--border)" }}>
                                  <p className="mb-1 text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>Today</p>
                                  <p className="text-sm font-bold" style={{ color: todayS.isWorking ? "var(--fg)" : "var(--amber)" }}>{todayS.isWorking ? `${todayS.start} – ${todayS.end} (${todayS.breakMinutes}m break)` : "Day off"}</p>
                                </div>
                                {week && (
                                  <div className="mt-3">
                                    <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Weekly schedule</p>
                                    <div className="space-y-1">
                                      {ALL_WEEKDAYS.map((d) => {
                                        const wd = week[d];
                                        const isToday = d === todayWeekdayKey();
                                        return (
                                          <div
                                            key={d}
                                            className="flex items-center justify-between rounded-lg px-2.5 py-1.5"
                                            style={{
                                              background: isToday ? "color-mix(in srgb, var(--primary) 6%, transparent)" : "var(--bg-grouped)",
                                              border: isToday ? "1px solid color-mix(in srgb, var(--primary) 20%, transparent)" : "none",
                                            }}
                                          >
                                            <span className="text-[11px] font-semibold" style={{ color: isToday ? "var(--primary)" : "var(--fg-secondary)" }}>
                                              {WEEKDAY_LABELS[d]}{isToday ? " (Today)" : ""}
                                            </span>
                                            <span className="text-[11px] font-bold tabular-nums" style={{ color: wd.isWorking ? "var(--fg)" : "var(--fg-tertiary)" }}>
                                              {wd.isWorking ? `${wd.start} – ${wd.end} · ${wd.breakMinutes}m break` : "Off"}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {tab === "profile" && (
                        <section className="space-y-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                          {empL || !employee ? (
                            <div className="space-y-2">{[1, 2, 3, 4, 5, 6].map((i) => <Sh key={i} c="h-4 w-full" />)}</div>
                          ) : (
                            <dl className="grid gap-2 sm:grid-cols-2">
                              <ProfRow k="Email" v={employee.email} />
                              <ProfRow k="Phone" v={employee.about?.phone || "—"} />
                              <ProfRow k="Username" v={`@${employee.username}`} />
                              <div className="flex justify-between gap-2 text-[12px] sm:block">
                                <dt style={{ color: "var(--fg-tertiary)" }}>Role</dt>
                                <dd className="flex flex-wrap items-center justify-end gap-1 sm:mt-0.5">
                                  <span className="font-medium" style={{ color: "var(--fg)" }}>{designation}</span>
                                  {employee.isSuperAdmin && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: "var(--rose)", color: "#fff" }}>Super Admin</span>}
                                  {employee.isVerified === true && (
                                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: "color-mix(in srgb, var(--green) 18%, transparent)", color: "var(--green)" }}>Verified</span>
                                  )}
                                  {employee.isVerified === false && (
                                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: "color-mix(in srgb, var(--amber) 18%, transparent)", color: "var(--amber)" }}>Unverified</span>
                                  )}
                                </dd>
                              </div>
                              <ProfRow k="Department" v={employee.department?.title ?? "—"} />
                              <ProfRow k="Designation" v={designation} />
                              <ProfRow k="Joined" v={employee.createdAt ? new Date(employee.createdAt).toLocaleDateString() : "—"} />
                              <ProfRow k="Active" v={employee.isActive === false ? "Inactive" : "Active"} />
                            </dl>
                          )}
                        </section>
                      )}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
