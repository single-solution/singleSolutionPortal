"use client";

import { useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { Portal } from "./Portal";
import { useQuery, invalidateQueries } from "@/lib/useQuery";
import { ease } from "@/lib/motion";
import { ToggleSwitch } from "./ToggleSwitch";
import { MiniCalendar } from "./MiniCalendar";
import toast from "react-hot-toast";
import {
  ALL_WEEKDAYS,
  WEEKDAY_LABELS,
  getTodaySchedule,
  resolveWeeklySchedule,
  resolveGraceMinutes,
  type Weekday,
  type DaySchedule,
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
  officeMinutes?: number;
  remoteMinutes?: number;
  breakMinutes?: number;
  locationFlagged?: boolean;
  flagReason?: string | null;
  flagCoords?: { lat: number; lng: number } | null;
  firstEntry?: string;
  firstOfficeEntry?: string;
  lastOfficeExit?: string;
  lastExit?: string;
  lateBy?: number;
  isLateToOffice?: boolean;
  lateToOfficeBy?: number;
  sessionCount?: number;
  shiftStart?: string;
  shiftEnd?: string;
  shiftBreakTime?: number;
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
  totalWorkingMinutes?: number;
  officeMinutes?: number;
  remoteMinutes?: number;
  breakMinutes?: number;
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
interface TaskUserStatus {
  user: { _id?: string } | string;
  status: string;
  updatedAt?: string;
}
interface TaskRow {
  _id: string;
  title: string;
  status: string;
  priority: string;
  deadline?: string;
  campaign?: { _id: string; name: string };
  assignedTo?: { _id?: string }[] | string;
  createdAt?: string;
  userStatuses?: TaskUserStatus[];
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

interface EditForm {
  fullName: string;
  password: string;
  department: string;
  managedDepartments: string[];
  shiftType: string;
  graceMinutes: number;
  weeklySchedule: WeeklySchedule;
  salary: string;
}

interface DeptOption { _id: string; title: string; manager?: string | { _id: string } }
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

function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}
function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60),
    m = mins % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function fmtHours(mins: number) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function recordDateKey(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}
function primaryDesignation(memberships: MembershipRow[] | null, isSuperAdmin?: boolean) {
  if (isSuperAdmin) return "System Administrator";
  const w = memberships?.find((m) => m.designation?.name);
  return w?.designation?.name ?? "";
}
function avatarColor(id: string) {
  const h = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${h}, 55%, 50%)`;
}
function assigneeId(t: TaskRow) {
  if (Array.isArray(t.assignedTo) && t.assignedTo.length > 0 && t.assignedTo[0]._id) return String(t.assignedTo[0]._id);
  if (typeof t.assignedTo === "string") return t.assignedTo;
  return undefined;
}
function employeeTaskStatus(t: TaskRow, employeeId: string): string {
  if (Array.isArray(t.userStatuses)) {
    const entry = t.userStatuses.find((us) => {
      const uid = typeof us.user === "object" && us.user ? us.user._id : String(us.user);
      return uid === employeeId;
    });
    if (entry) return entry.status;
  }
  return t.status;
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

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [multiDeptUi, setMultiDeptUi] = useState(false);

  const [locYear, setLocYear] = useState(n.getFullYear());
  const [locMonth, setLocMonth] = useState(n.getMonth() + 1);
  const [locDay, setLocDay] = useState<number | null>(n.getDate());

  useEffect(() => {
    if (initialEmployeeId) setUserId(initialEmployeeId);
  }, [initialEmployeeId]);
  useEffect(() => {
    if (!open) return;
    if (initialEmployeeId) setUserId(initialEmployeeId);
    else if (!viewerIsSuperAdmin) setUserId("");
    setTab("overview");
    setEditing(false);
    setEditForm(null);
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
  const { data: dailyRaw, loading: dayL } = useQuery<DailyRow[]>(dailyUrl, undefined, { enabled: tab === "attendance" || tab === "overview" });
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

  const locDateStr = locDay ? `${locYear}-${String(locMonth).padStart(2, "0")}-${String(locDay).padStart(2, "0")}` : null;
  const locDetailUrl =
    open && effectiveId && canAtt && tab === "location" && locDateStr
      ? `/api/attendance?type=detail&date=${locDateStr}&userId=${encodeURIComponent(effectiveId)}`
      : null;
  interface LocSession {
    _id: string;
    status: string;
    sessionTime: { start: string; end?: string | null };
    location?: { inOffice?: boolean; latitude?: number; longitude?: number; accuracy?: number; locationFlagged?: boolean; flagReason?: string };
    totalMinutes?: number;
  }
  interface LocDetail {
    totalWorkingMinutes?: number;
    officeMinutes?: number;
    remoteMinutes?: number;
    isPresent?: boolean;
    isOnTime?: boolean;
    lateBy?: number;
    firstOfficeEntry?: string;
    lastOfficeExit?: string;
    activitySessions?: LocSession[];
  }
  const { data: locDetail, loading: locDetailL } = useQuery<LocDetail | null>(locDetailUrl, undefined, {
    enabled: tab === "location" && !!locDateStr,
  });

  const locDayFlags = useMemo(() => {
    if (!locDateStr || !flags.length) return [];
    return flags.filter((f) => {
      const fDate = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(f.createdAt));
      return fDate === locDateStr;
    });
  }, [flags, locDateStr]);

  const locTimeline = useMemo(() => {
    const items: { time: string; timeRaw: number; type: "session" | "flag"; label: string; sublabel?: string; lat?: number; lng?: number; color: string; icon: "office" | "remote" | "flag-warn" | "flag-viol" | "end" }[] = [];
    const sessions = locDetail?.activitySessions ?? [];
    for (const s of sessions) {
      const startT = new Date(s.sessionTime.start);
      const inOff2 = s.location?.inOffice ?? false;
      items.push({
        time: startT.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true }),
        timeRaw: startT.getTime(),
        type: "session",
        label: inOff2 ? "Office check-in" : "Remote check-in",
        sublabel: s.totalMinutes != null ? `${Math.round(s.totalMinutes)}m` : undefined,
        lat: s.location?.latitude,
        lng: s.location?.longitude,
        color: inOff2 ? "var(--status-office)" : "var(--status-remote)",
        icon: inOff2 ? "office" : "remote",
      });
      if (s.sessionTime.end) {
        const endT = new Date(s.sessionTime.end);
        items.push({
          time: endT.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true }),
          timeRaw: endT.getTime(),
          type: "session",
          label: "Check-out",
          lat: s.location?.latitude,
          lng: s.location?.longitude,
          color: "var(--fg-tertiary)",
          icon: "end",
        });
      }
    }
    for (const f of locDayFlags) {
      const fT = new Date(f.createdAt);
      items.push({
        time: fT.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true }),
        timeRaw: fT.getTime(),
        type: "flag",
        label: f.severity === "violation" ? "Location violation" : "Location warning",
        sublabel: f.reasons.join(", "),
        lat: f.latitude,
        lng: f.longitude,
        color: f.severity === "violation" ? "var(--rose)" : "var(--amber)",
        icon: f.severity === "violation" ? "flag-viol" : "flag-warn",
      });
    }
    items.sort((a, b) => a.timeRaw - b.timeRaw);
    return items;
  }, [locDetail, locDayFlags]);

  const balUrl =
    open && effectiveId && canViewLeaves && (tab === "leaves" || tab === "overview" || tab === "attendance")
      ? `/api/leaves/balance${otherUserParam ? `?${otherUserParam}` : ""}`
      : null;
  const leavesUrl =
    open && effectiveId && canViewLeaves && (tab === "leaves" || tab === "overview")
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
    () => empTasks.filter((t) => { const s = effectiveId ? employeeTaskStatus(t, effectiveId) : t.status; return s === "pending" || s === "inProgress"; }).length,
    [empTasks, effectiveId],
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
    : hasAct ? (inOff ? "Working · In office" : "Working · Remote")
    : tm > 0 ? "Checked in"
    : "Off shift";
  const stCol =
    employee && !employee.isActive ? "var(--fg-tertiary)"
    : hasAct ? (inOff ? "var(--status-office)" : "var(--status-remote)")
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
  const personalInsights = useMemo(() => {
    const present = dailyList.filter((r) => r.isPresent);
    if (!present.length) return null;
    const totalLateMins = present.reduce((s, r) => s + (r.lateBy ?? 0), 0);
    const lateRecords = present.filter((r) => (r.lateBy ?? 0) > 0);
    const avgLateMins = lateRecords.length > 0 ? Math.round(totalLateMins / lateRecords.length) : 0;
    const perfectDays = present.filter((r) => r.isOnTime).length;
    const totalBreakMins = present.reduce((s, r) => s + (r.breakMinutes ?? 0), 0);
    const avgBreakMins = present.length > 0 ? Math.round(totalBreakMins / present.length) : 0;
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const byDay = new Map<number, { total: number; count: number }>();
    for (const r of present) {
      const dow = new Date(r.date).getDay();
      const cur = byDay.get(dow) ?? { total: 0, count: 0 };
      cur.total += r.totalWorkingMinutes ?? 0; cur.count += 1;
      byDay.set(dow, cur);
    }
    let bestDay = "", worstDay = "", bestAvg = 0, worstAvg = Infinity;
    for (const [dow, v] of byDay) {
      const avg = v.total / v.count;
      if (avg > bestAvg) { bestAvg = avg; bestDay = dayNames[dow]; }
      if (avg < worstAvg) { worstAvg = avg; worstDay = dayNames[dow]; }
    }
    if (!byDay.size) worstAvg = 0;
    const sorted = [...dailyList].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let longestPresentStreak = 0, runPresent = 0;
    for (const r of sorted) {
      if (r.isPresent) { runPresent++; longestPresentStreak = Math.max(longestPresentStreak, runPresent); } else runPresent = 0;
    }
    let onTimeStreak = 0, runOt = 0;
    for (const r of sorted) {
      if (r.isPresent && r.isOnTime) { runOt++; onTimeStreak = Math.max(onTimeStreak, runOt); } else runOt = 0;
    }
    let maxHoursDay = "", maxHoursMins = 0, minHoursDay = "", minHoursMins = Infinity;
    for (const r of present) {
      const m = r.totalWorkingMinutes ?? 0;
      if (m > maxHoursMins) { maxHoursMins = m; maxHoursDay = r.date; }
      if (m > 0 && m < minHoursMins) { minHoursMins = m; minHoursDay = r.date; }
    }
    if (minHoursMins === Infinity) { minHoursMins = 0; minHoursDay = ""; }
    const remoteOnlyDays = present.filter((r) => (r.remoteMinutes ?? 0) > 0 && (r.officeMinutes ?? 0) === 0).length;
    const officeOnlyDays = present.filter((r) => (r.officeMinutes ?? 0) > 0 && (r.remoteMinutes ?? 0) === 0).length;
    return { totalLateMins, avgLateMins, perfectDays, avgBreakMins, bestDay, worstDay, bestAvg, worstAvg, longestPresentStreak, maxHoursDay, maxHoursMins, minHoursDay, minHoursMins, remoteOnlyDays, officeOnlyDays, onTimeStreak };
  }, [dailyList]);
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
  const leaveExtras = useMemo(() => {
    if (!leavesList.length) return { onLeaveToday: false, nextLeave: null as string | null, daysSinceLast: null as number | null, runoutDays: null as number | null };
    const today = new Date(); const todayT = today.getTime();
    const approved = leavesList.filter((l) => l.status === "approved");
    const onLeaveToday = approved.some((l) => todayT >= new Date(l.startDate).getTime() && todayT <= new Date(l.endDate).getTime() + 86400000);
    let nextLeave: string | null = null, nextT = Infinity;
    for (const l of approved) { const s = new Date(l.startDate).getTime(); if (s > todayT && s < nextT) { nextT = s; nextLeave = l.startDate; } }
    const past = approved.filter((l) => new Date(l.endDate).getTime() < todayT).sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
    const daysSinceLast = past.length > 0 ? Math.ceil((todayT - new Date(past[0].endDate).getTime()) / 86400000) : null;
    let runoutDays: number | null = null;
    if (leaveBalance && leaveBalance.used > 0 && leaveBalance.remaining > 0) {
      const yr = today.getFullYear();
      const y0 = new Date(yr, 0, 1).getTime();
      const months = Math.max((todayT - y0) / (86400000 * 30.44), 1 / 12);
      const rate = leaveBalance.used / months;
      if (rate > 0) runoutDays = Math.round((leaveBalance.remaining / rate) * 30.44);
    }
    return { onLeaveToday, nextLeave, daysSinceLast, runoutDays };
  }, [leavesList, leaveBalance]);

  const weeklyDots = useMemo(() => {
    if (!dailyList.length) return [];
    const sorted = [...dailyList].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted.slice(0, 5).reverse().map((r) => ({
      date: new Date(r.date).toLocaleDateString(undefined, { weekday: "short" }),
      color: !r.isPresent ? "var(--status-absent)" : r.isOnTime ? "var(--status-ontime)" : "var(--status-late)",
      present: !!r.isPresent,
    }));
  }, [dailyList]);

  const startEditing = useCallback(async () => {
    if (!employee || !effectiveId) return;
    const empRec2 = employee as unknown as Record<string, unknown>;
    const sched = resolveWeeklySchedule(empRec2);
    const grace = resolveGraceMinutes(empRec2);
    setEditForm({
      fullName: [employee.about?.firstName, employee.about?.lastName].filter(Boolean).join(" "),
      password: "",
      department: employee.department?._id ?? "",
      managedDepartments: [],
      shiftType: employee.shiftType ?? "fullTime",
      graceMinutes: grace,
      weeklySchedule: sched,
      salary: employee.salary != null ? String(employee.salary) : "",
    });
    setMultiDeptUi(false);
    try {
      const deptRes = await fetch("/api/departments").then((r) => r.ok ? r.json() : []);
      if (Array.isArray(deptRes)) {
        setDepartments(deptRes);
        const managed = deptRes.filter((d: DeptOption) => {
          const mId = typeof d.manager === "object" && d.manager ? d.manager._id : d.manager;
          return mId === effectiveId;
        }).map((d: DeptOption) => d._id);
        if (managed.length > 0) {
          setMultiDeptUi(true);
          setEditForm((f) => f ? { ...f, managedDepartments: managed } : f);
        }
      }
    } catch { /* optional */ }
    setEditing(true);
    setTab("profile");
  }, [employee, effectiveId]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setEditForm(null);
  }, []);

  const saveEdits = useCallback(async () => {
    if (!editForm || !effectiveId) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        fullName: editForm.fullName,
        department: editForm.department || null,
        managedDepartments: multiDeptUi ? editForm.managedDepartments : [],
        weeklySchedule: editForm.weeklySchedule,
        graceMinutes: editForm.graceMinutes,
        shiftType: editForm.shiftType,
      };
      if (editForm.password) body.password = editForm.password;
      if (canPerm("payroll_manageSalary") && editForm.salary !== "") body.salary = Number(editForm.salary);
      const res = await fetch(`/api/employees/${effectiveId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success("Employee updated");
        invalidateQueries(`/api/employees`);
        invalidateQueries(`/api/departments`);
        invalidateQueries(`/api/attendance`);
        setEditing(false);
        setEditForm(null);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error || "Failed to update");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setSaving(false);
  }, [editForm, effectiveId, multiDeptUi, canPerm]);

  const updateEditDay = useCallback((day: Weekday, patch: Partial<DaySchedule>) => {
    setEditForm((f) => f ? { ...f, weeklySchedule: { ...f.weeklySchedule, [day]: { ...f.weeklySchedule[day], ...patch } } } : f);
  }, []);

  const copyMondayToAll = useCallback(() => {
    setEditForm((f) => {
      if (!f) return f;
      const mon = f.weeklySchedule.mon;
      const next = { ...f.weeklySchedule };
      for (const d of ALL_WEEKDAYS) next[d] = { ...mon };
      return { ...f, weeklySchedule: next };
    });
  }, []);

  const toggleManagedDept = useCallback((deptId: string) => {
    setEditForm((f) => f ? {
      ...f,
      managedDepartments: f.managedDepartments.includes(deptId)
        ? f.managedDepartments.filter((id2) => id2 !== deptId)
        : [...f.managedDepartments, deptId],
    } : f);
  }, []);

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
              <div className="flex shrink-0 items-center justify-between gap-3 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
                {!effectiveId ? (
                  <h2 className="text-base font-bold" style={{ color: "var(--fg)" }}>User Details</h2>
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
                        {canEdit && !editing && (
                          <button type="button" onClick={startEditing} className="shrink-0 text-[11px] font-semibold hover:underline" style={{ color: "var(--primary)" }}>Edit</button>
                        )}
                        {editing && (
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={cancelEditing} className="shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-[var(--bg-grouped)]" style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}>Cancel</button>
                            <button type="button" onClick={saveEdits} disabled={saving} className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white transition-colors" style={{ background: saving ? "var(--fg-tertiary)" : "var(--primary)" }}>{saving ? "Saving…" : "Save"}</button>
                          </div>
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
                    <p className="text-sm font-semibold" style={{ color: "var(--fg-secondary)" }}>No user selected</p>
                  </div>
                ) : (
                  <AnimatePresence mode="wait">
                  <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }} className="space-y-3">

                      {tab === "overview" && (() => {
                        const sFirstArrival = sessL ? "—" : sess?.firstEntry ? (sess.firstEntry.includes("T") ? new Date(sess.firstEntry).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true }) : sess.firstEntry) : "—";
                        const sClockOut = sessL ? "—" : hasAct ? "—" : sess?.lastExit ? new Date(sess.lastExit).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true }) : "—";
                        const sOfficeIn = sess?.firstOfficeEntry ? new Date(sess.firstOfficeEntry).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true }) : "—";
                        const sOfficeOut = (!hasAct || !inOff) && sess?.lastOfficeExit ? new Date(sess.lastOfficeExit).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true }) : "—";
                        const sOfficeMins = sess?.officeMinutes ?? 0;
                        const sRemoteMins = sess?.remoteMinutes ?? 0;
                        const sBreakMins = sess?.breakMinutes ?? 0;
                        const sSessions = sess?.sessionCount ?? 0;
                        const sShiftStart = sess?.shiftStart ?? employee?.weeklySchedule?.[todayWeekdayKey()]?.start ?? "10:00";
                        const sShiftEnd = sess?.shiftEnd ?? employee?.weeklySchedule?.[todayWeekdayKey()]?.end ?? "19:00";
                        const sShiftBreak = sess?.shiftBreakTime ?? employee?.weeklySchedule?.[todayWeekdayKey()]?.breakMinutes ?? 60;
                        const [sh2, sm2] = sShiftStart.split(":").map(Number);
                        const [eh2, em2] = sShiftEnd.split(":").map(Number);
                        const shiftMins = Math.max(eh2 * 60 + em2 - (sh2 * 60 + sm2) - sShiftBreak, 1);
                        const pctRaw = Math.round((tm / shiftMins) * 100);
                        const cappedFill = Math.min((tm / shiftMins) * 100, 120);
                        const sTotal = sOfficeMins + sRemoteMins + sBreakMins || 1;
                        const ofPct = (sOfficeMins / sTotal) * cappedFill;
                        const rmPct = (sRemoteMins / sTotal) * cappedFill;
                        const bkPct = (sBreakMins / sTotal) * cappedFill;
                        let sIdleMins = 0;
                        if (!hasAct && sess?.firstEntry && sess?.lastExit) {
                          const span2 = (new Date(sess.lastExit).getTime() - new Date(sess.firstEntry).getTime()) / 60000;
                          sIdleMins = Math.max(0, Math.round(span2 - tm));
                        }
                        const pendingT = empTasks.filter((t) => (effectiveId ? employeeTaskStatus(t, effectiveId) : t.status) === "pending").length;
                        const inProgT = empTasks.filter((t) => (effectiveId ? employeeTaskStatus(t, effectiveId) : t.status) === "inProgress").length;
                        return (
                        <div className="space-y-3">
                          {/* Today's attendance — EmployeeCard style */}
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Today&apos;s attendance</p>
                            {sessL ? (
                              <div className="space-y-2"><Sh c="h-12 rounded-lg" /><Sh c="h-12 rounded-lg" /><Sh c="h-8 rounded-lg" /></div>
                            ) : (
                              <>
                                {/* Clock in / Hours today / Clock out */}
                                <div className="grid grid-cols-3 gap-1 text-[11px]" style={{ borderColor: "var(--border)" }}>
                                  <div>
                                    <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Clock in</p>
                                    <p className="font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{sFirstArrival}</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Hours today</p>
                                    <p className="font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{formatMinutes(tm)}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Clock out</p>
                                    <p className="font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{sClockOut}</p>
                                  </div>
                                </div>
                                {/* Office entry / Office hours / Office exit */}
                                <div className="mt-2 grid grid-cols-3 gap-1 text-[11px]" style={{ color: "var(--fg-secondary)" }}>
                                  <div>
                                    <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Office entry</p>
                                    <p className="font-semibold tabular-nums">{sOfficeIn}</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Office hours</p>
                                    <p className="font-semibold tabular-nums">{formatMinutes(sOfficeMins)}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Office exit</p>
                                    <p className="font-semibold tabular-nums">{sOfficeOut}</p>
                                  </div>
                                </div>
                                {/* Activity strip — progress bar */}
                                <div className="mt-3 space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                                      <motion.div className="flex h-full min-w-0" initial={{ width: 0 }} animate={{ width: `${cappedFill}%` }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
                                        {ofPct > 0 && <div className="h-full shrink-0" style={{ width: `${(ofPct / cappedFill) * 100}%`, background: "var(--status-office)" }} />}
                                        {rmPct > 0 && <div className="h-full shrink-0" style={{ width: `${(rmPct / cappedFill) * 100}%`, background: "var(--status-remote)" }} />}
                                        {bkPct > 0 && <div className="h-full shrink-0" style={{ width: `${(bkPct / cappedFill) * 100}%`, background: "var(--purple)" }} />}
                                      </motion.div>
                                    </div>
                                    <span className="shrink-0 text-[10px] font-bold tabular-nums" style={{ color: pctRaw >= 100 ? "var(--status-ontime)" : "var(--fg-secondary)" }}>{pctRaw}%</span>
                                  </div>
                                  {/* Detail chips */}
                                  <div className="flex flex-wrap items-center gap-1 text-[9px]">
                                    <span className="inline-flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 font-medium" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>
                                      {sSessions} {sSessions === 1 ? "session" : "sessions"}
                                    </span>
                                    {sRemoteMins > 0 && <span className="rounded-lg px-1.5 py-0.5 font-medium" style={{ background: "color-mix(in srgb, var(--status-remote) 7%, transparent)", color: "var(--status-remote)" }}>{formatMinutes(sRemoteMins)} remote</span>}
                                    {sBreakMins > 0 && <span className="rounded-lg px-1.5 py-0.5 font-medium" style={{ background: "color-mix(in srgb, var(--purple) 7%, transparent)", color: "var(--purple)" }}>{formatMinutes(sBreakMins)} break</span>}
                                    {(sess?.lateBy ?? 0) > 0 && <span className="rounded-lg px-1.5 py-0.5 font-medium" style={{ background: "color-mix(in srgb, var(--status-late) 7%, transparent)", color: "var(--status-late)" }}>+{formatMinutes(sess!.lateBy!)} late</span>}
                                    {sess?.isLateToOffice && (sess.lateToOfficeBy ?? 0) > 0 && <span className="rounded-lg px-1.5 py-0.5 font-medium" style={{ background: "color-mix(in srgb, var(--status-late) 7%, transparent)", color: "var(--status-late)" }}>+{formatMinutes(sess.lateToOfficeBy!)} late to office</span>}
                                    {sIdleMins > 5 && <span className="rounded-lg px-1.5 py-0.5 font-medium" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>{formatMinutes(sIdleMins)} idle</span>}
                                  </div>
                                </div>
                                {/* Location flag alert */}
                                {sess?.locationFlagged && (
                                  <div className="mt-2 rounded-lg border p-2 text-[9px] space-y-1" style={{ borderColor: "color-mix(in srgb, var(--rose) 30%, transparent)", background: "color-mix(in srgb, var(--rose) 4%, transparent)" }}>
                                    <div className="flex items-center gap-1">
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                      <span className="font-bold" style={{ color: "var(--rose)" }}>Location Flagged</span>
                                    </div>
                                    {sess.flagReason && <p className="leading-snug" style={{ color: "var(--rose)" }}>{sess.flagReason}</p>}
                                    {sess.flagCoords && (
                                      <a
                                        href={`https://www.google.com/maps?q=${sess.flagCoords.lat},${sess.flagCoords.lng}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors"
                                        style={{ background: "color-mix(in srgb, var(--rose) 8%, transparent)", color: "var(--rose)" }}
                                      >
                                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                        {sess.flagCoords.lat.toFixed(5)}, {sess.flagCoords.lng.toFixed(5)}
                                      </a>
                                    )}
                                  </div>
                                )}
                                {/* Monthly summary pills + today-vs-avg + shift adherence */}
                                {(monL || overviewAttendancePct != null || monthlyRaw?.averageDailyHours != null || tm > 0) && (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {monL ? <><Sh c="h-6 w-24 rounded-full" /><Sh c="h-6 w-28 rounded-full" /></> : (
                                      <>
                                        {overviewAttendancePct != null && <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: overviewAttendancePct >= 90 ? "var(--status-present)" : "var(--status-absent)" }}>Attendance {overviewAttendancePct}%</span>}
                                        {monthlyRaw?.averageDailyHours != null && <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--primary)" }}>Avg {monthlyRaw.averageDailyHours}h / day</span>}
                                        {typeof monthlyRaw?.onTimePercentage === "number" && <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: monthlyRaw.onTimePercentage >= 80 ? "var(--status-ontime)" : "var(--status-late)" }}>On-Time {Math.round(monthlyRaw.onTimePercentage)}%</span>}
                                        {tm > 0 && monthlyRaw?.averageDailyHours != null && <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: (tm / 60) >= monthlyRaw.averageDailyHours ? "var(--green)" : "var(--amber)" }}>Today {(tm / 60).toFixed(1)}h vs avg {monthlyRaw.averageDailyHours.toFixed(1)}h</span>}
                                        {pctRaw > 0 && <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: pctRaw >= 100 ? "var(--status-ontime)" : "var(--fg-secondary)" }}>Shift {pctRaw}% done</span>}
                                      </>
                                    )}
                                  </div>
                                )}
                                {/* Weekly snapshot — last 5 days */}
                                {weeklyDots.length > 0 && (
                                  <div className="mt-2 flex items-center gap-1.5">
                                    <span className="text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>Week</span>
                                    {weeklyDots.map((d, i) => (
                                      <div key={i} className="flex flex-col items-center gap-0.5">
                                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                                        <span className="text-[8px] font-medium" style={{ color: "var(--fg-tertiary)" }}>{d.date}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {/* Streaks */}
                                {personalInsights && (personalInsights.longestPresentStreak > 1 || personalInsights.onTimeStreak > 1) && (
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {personalInsights.longestPresentStreak > 1 && <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ background: "color-mix(in srgb, var(--status-present) 10%, transparent)", color: "var(--status-present)" }}>{personalInsights.longestPresentStreak}d present streak</span>}
                                    {personalInsights.onTimeStreak > 1 && <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ background: "color-mix(in srgb, var(--status-ontime) 10%, transparent)", color: "var(--status-ontime)" }}>{personalInsights.onTimeStreak}d on-time streak</span>}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                          {/* Tasks & Campaigns — EmployeeCard style */}
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Workload</p>
                            {taskL || campL ? <div className="flex gap-2"><Sh c="h-8 w-28" /><Sh c="h-8 w-32" /></div> : (() => {
                              const overdueT = empTasks.filter((t) => t.deadline && new Date(t.deadline) < new Date() && (effectiveId ? employeeTaskStatus(t, effectiveId) : t.status) !== "completed").length;
                              const completedT = empTasks.filter((t) => (effectiveId ? employeeTaskStatus(t, effectiveId) : t.status) === "completed").length;
                              return (
                              <div className="flex flex-wrap gap-1.5 text-[9px]">
                                <span className="rounded-full border px-1.5 py-0.5 font-semibold" style={{ background: pendingT > 0 ? "color-mix(in srgb, var(--amber) 8%, transparent)" : "var(--bg-grouped)", color: pendingT > 0 ? "var(--amber)" : "var(--fg-tertiary)", borderColor: pendingT > 0 ? "color-mix(in srgb, var(--amber) 19%, transparent)" : "var(--border)" }}>{pendingT} tasks pending</span>
                                <span className="rounded-full border px-1.5 py-0.5 font-semibold" style={{ background: inProgT > 0 ? "var(--primary-light)" : "var(--bg-grouped)", color: inProgT > 0 ? "var(--primary)" : "var(--fg-tertiary)", borderColor: inProgT > 0 ? "color-mix(in srgb, var(--primary) 20%, transparent)" : "var(--border)" }}>{inProgT} in progress</span>
                                {completedT > 0 && <span className="rounded-full border px-1.5 py-0.5 font-semibold" style={{ background: "color-mix(in srgb, var(--green) 8%, transparent)", color: "var(--green)", borderColor: "color-mix(in srgb, var(--green) 20%, transparent)" }}>{completedT} completed</span>}
                                {overdueT > 0 && <span className="rounded-full border px-1.5 py-0.5 font-semibold" style={{ background: "color-mix(in srgb, var(--rose) 8%, transparent)", color: "var(--rose)", borderColor: "color-mix(in srgb, var(--rose) 20%, transparent)" }}>{overdueT} overdue</span>}
                                <span className="rounded-full border px-1.5 py-0.5 font-semibold" style={{ background: campCount > 0 ? "color-mix(in srgb, var(--teal) 10%, transparent)" : "var(--bg-grouped)", color: campCount > 0 ? "var(--teal)" : "var(--fg-tertiary)", borderColor: campCount > 0 ? "color-mix(in srgb, var(--teal) 20%, transparent)" : "var(--border)" }}>{campCount} campaign{campCount !== 1 ? "s" : ""}</span>
                              </div>
                              );
                            })()}
                            {canViewLeaves && (
                              <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2" style={{ borderColor: "var(--border)" }}>
                                {balL ? <Sh c="h-7 w-full max-w-xs rounded-lg" /> : !leaveBalance ? (
                                  <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>Leave balance unavailable.</p>
                                ) : (
                                  <>
                                    <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>Leave balance</span>
                                    <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-bold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--green)" }}>{leaveBalance.remaining} remaining</span>
                                    <span className="text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>of {leaveBalance.total} · used {leaveBalance.used}</span>
                                    {leaveExtras.onLeaveToday && <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: "color-mix(in srgb, var(--teal) 12%, transparent)", color: "var(--teal)" }}>On Leave Today</span>}
                                    {leaveExtras.nextLeave && <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>Next: {new Date(leaveExtras.nextLeave).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                                    {leaveExtras.daysSinceLast != null && <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>{leaveExtras.daysSinceLast}d since last</span>}
                                    {leaveExtras.runoutDays != null && <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>~{leaveExtras.runoutDays}d until runout</span>}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          {/* Memberships */}
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
                        );
                      })()}

                      {tab === "attendance" && (
                        <div className="space-y-3">
                          <MiniCalendar
                            year={calYear}
                            month={calMonth}
                            onPrevMonth={() => { if (calMonth === 1) { setCalMonth(12); setCalYear((y) => y - 1); } else setCalMonth((m) => m - 1); }}
                            onNextMonth={() => { if (calMonth === 12) { setCalMonth(1); setCalYear((y) => y + 1); } else setCalMonth((m) => m + 1); }}
                            loading={dayL}
                            getDayMeta={(day) => {
                              const key = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                              const rec = dailyMap.get(key);
                              const dot = !rec || !rec.isPresent ? "var(--status-absent)" : !rec.isOnTime || (rec.lateBy ?? 0) > 0 ? "var(--status-late)" : "var(--status-ontime)";
                              return { dotColor: dot };
                            }}
                            showLegend
                            legendItems={[
                              { label: "On Time", color: "var(--status-ontime)" },
                              { label: "Late", color: "var(--status-late)" },
                              { label: "Absent", color: "var(--status-absent)" },
                            ]}
                          />
                          {/* Monthly stats — full StatChip grid matching insights-desk */}
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Monthly stats</p>
                            {monL ? <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[1, 2, 3, 4, 5, 6].map((i) => <Sh key={i} c="h-14 rounded-lg" />)}</div>
                            : !ms ? <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No stats for this month.</p>
                            : (
                              <>
                                {/* Row 1: Working Days · Total Hours · Avg Daily · On-Time % */}
                                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                                  {(
                                    [
                                      ["Working Days", `${ms.presentDays ?? 0} / ${ms.totalWorkingDays ?? 0}`, "var(--status-present)"],
                                      ["Total Hours", `${Math.round(ms.totalWorkingHours ?? 0)}h`, "var(--teal)"],
                                      ["Avg Daily", `${(ms.averageDailyHours ?? 0).toFixed(1)}h`, "var(--primary)"],
                                      ["On-Time %", `${Math.round(ms.onTimePercentage ?? 0)}%`, (ms.onTimePercentage ?? 0) >= 80 ? "var(--status-ontime)" : "var(--status-late)"],
                                    ] as const
                                  ).map(([k, v, c]) => (
                                    <div key={k} className="rounded-xl p-2.5 text-center space-y-1" style={{ background: "var(--bg-grouped)" }}>
                                      <p className="text-[9px] font-semibold uppercase" style={{ color: c }}>{k}</p>
                                      <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{v}</p>
                                    </div>
                                  ))}
                                </div>
                                {/* Row 2: Attendance · Absent · Office / Remote */}
                                <div className="mt-2 grid grid-cols-3 gap-2">
                                  <div className="rounded-xl p-2.5 text-center space-y-1" style={{ background: "var(--bg-grouped)" }}>
                                    <p className="text-[9px] font-semibold uppercase" style={{ color: (ms.attendancePercentage ?? 0) >= 90 ? "var(--status-present)" : "var(--status-absent)" }}>Attendance</p>
                                    <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{Math.round(ms.attendancePercentage ?? 0)}%</p>
                                  </div>
                                  <div className="rounded-xl p-2.5 text-center space-y-1" style={{ background: "var(--bg-grouped)" }}>
                                    <p className="text-[9px] font-semibold uppercase" style={{ color: (ms.absentDays ?? 0) > 0 ? "var(--status-absent)" : "var(--fg-tertiary)" }}>Absent</p>
                                    <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{ms.absentDays ?? 0}d</p>
                                  </div>
                                  <div className="rounded-xl p-2.5 text-center space-y-1" style={{ background: "var(--bg-grouped)" }}>
                                    <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--status-office)" }}>Office / Remote</p>
                                    <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{Math.round(ms.totalOfficeHours ?? 0)}h / {Math.round(ms.totalRemoteHours ?? 0)}h</p>
                                  </div>
                                </div>
                                {/* Row 3: On-Time Arrivals · Late Arrivals */}
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  <div className="rounded-xl p-2.5 text-center space-y-1" style={{ background: "var(--bg-grouped)" }}>
                                    <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--status-ontime)" }}>On-Time Arrivals</p>
                                    <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{ms.onTimeArrivals ?? 0}</p>
                                  </div>
                                  <div className="rounded-xl p-2.5 text-center space-y-1" style={{ background: "var(--bg-grouped)" }}>
                                    <p className="text-[9px] font-semibold uppercase" style={{ color: (ms.lateArrivals ?? 0) > 0 ? "var(--status-late)" : "var(--fg-tertiary)" }}>Late Arrivals</p>
                                    <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{ms.lateArrivals ?? 0}</p>
                                  </div>
                                </div>
                                {/* Row 4: Avg office entry · Avg office exit */}
                                {(ms.averageOfficeInTime || ms.averageOfficeOutTime) && (
                                  <div className="mt-2 grid grid-cols-2 gap-2">
                                    {ms.averageOfficeInTime && (
                                      <div className="rounded-xl p-2.5 text-center space-y-1" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--status-office)" }}>Avg office entry</p>
                                        <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{ms.averageOfficeInTime}</p>
                                      </div>
                                    )}
                                    {ms.averageOfficeOutTime && (
                                      <div className="rounded-xl p-2.5 text-center space-y-1" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--status-office)" }}>Avg office exit</p>
                                        <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{ms.averageOfficeOutTime}</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {/* Office / Remote bar */}
                                <div className="mt-3 space-y-1">
                                  <div className="flex justify-between text-[10px]" style={{ color: "var(--fg-secondary)" }}>
                                    <span>Office / remote split</span>
                                    <span className="tabular-nums">{Math.round(ms.totalOfficeHours ?? 0)}h · {Math.round(ms.totalRemoteHours ?? 0)}h</span>
                                  </div>
                                  <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                                    <motion.div className="h-full" style={{ background: "var(--status-office)" }} initial={{ width: 0 }} animate={{ width: `${offPct}%` }} transition={{ duration: 0.5, ease }} />
                                    <motion.div className="h-full" style={{ background: "var(--status-remote)" }} initial={{ width: 0 }} animate={{ width: `${100 - offPct}%` }} transition={{ duration: 0.5, delay: 0.04, ease }} />
                                  </div>
                                </div>
                                {/* Extra stat row: Break / Late / Remote % / Overtime */}
                                {(() => {
                                  const present = dailyList.filter((r) => r.isPresent);
                                  const totalBreak = present.reduce((s, r) => s + (r.breakMinutes ?? 0), 0);
                                  const avgBreak = present.length ? Math.round(totalBreak / present.length) : 0;
                                  const totalLate = present.reduce((s, r) => s + (r.lateBy ?? 0), 0);
                                  const lateDays = present.filter((r) => (r.lateBy ?? 0) > 0);
                                  const avgLate = lateDays.length ? Math.round(totalLate / lateDays.length) : 0;
                                  const totalOff = present.reduce((s, r) => s + (r.officeMinutes ?? 0), 0);
                                  const totalRem = present.reduce((s, r) => s + (r.remoteMinutes ?? 0), 0);
                                  const remotePct = totalOff + totalRem > 0 ? Math.round((totalRem / (totalOff + totalRem)) * 100) : 0;
                                  const schedMins = week ? ALL_WEEKDAYS.reduce((s, d) => s + (week[d]?.isWorking ? (() => { const [sh, sm2] = (week[d].start ?? "10:00").split(":").map(Number); const [eh, em2] = (week[d].end ?? "19:00").split(":").map(Number); return Math.max(eh * 60 + em2 - (sh * 60 + sm2) - (week[d].breakMinutes ?? 0), 0); })() : 0), 0) : 0;
                                  const weeklyScheduleMins = schedMins > 0 ? schedMins / ALL_WEEKDAYS.filter((d) => week?.[d]?.isWorking).length : 0;
                                  const overtimeMins = weeklyScheduleMins > 0 ? present.reduce((s, r) => { const extra = (r.totalWorkingMinutes ?? 0) - weeklyScheduleMins; return s + (extra > 0 ? extra : 0); }, 0) : 0;
                                  return present.length > 0 ? (
                                    <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-3">
                                      <div className="rounded-xl p-2.5 text-center space-y-1" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--purple)" }}>Total Break</p>
                                        <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{fmtHours(totalBreak)}</p>
                                        <p className="text-[8px]" style={{ color: "var(--fg-tertiary)" }}>avg {avgBreak}m/day</p>
                                      </div>
                                      <div className="rounded-xl p-2.5 text-center space-y-1" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--status-late)" }}>Total Late</p>
                                        <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{fmtHours(totalLate)}</p>
                                        <p className="text-[8px]" style={{ color: "var(--fg-tertiary)" }}>{lateDays.length}d · avg {avgLate}m</p>
                                      </div>
                                      <div className="rounded-xl p-2.5 text-center space-y-1" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--status-remote)" }}>Remote %</p>
                                        <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{remotePct}%</p>
                                        <p className="text-[8px]" style={{ color: "var(--fg-tertiary)" }}>{fmtHours(totalRem)} of {fmtHours(totalOff + totalRem)}</p>
                                      </div>
                                      {overtimeMins > 0 && (
                                        <div className="rounded-xl p-2.5 text-center space-y-1" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--status-ontime)" }}>Overtime</p>
                                          <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{fmtHours(overtimeMins)}</p>
                                        </div>
                                      )}
                                    </div>
                                  ) : null;
                                })()}
                              </>
                            )}
                          </div>
                          {/* Personal insights */}
                          {!dayL && personalInsights && (
                            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Personal insights</p>
                              <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                                {personalInsights.perfectDays > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--status-ontime) 10%, transparent)", color: "var(--status-ontime)" }}>{personalInsights.perfectDays} perfect days</span>}
                                {personalInsights.totalLateMins > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--status-late) 12%, transparent)", color: "var(--status-late)" }}>{fmtHours(personalInsights.totalLateMins)} total late</span>}
                                {personalInsights.avgLateMins > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>avg {personalInsights.avgLateMins}m when late</span>}
                                {personalInsights.avgBreakMins > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>avg {personalInsights.avgBreakMins}m break</span>}
                                {personalInsights.bestDay && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--primary)" }}>Best: {personalInsights.bestDay} ({fmtHours(personalInsights.bestAvg)})</span>}
                                {personalInsights.worstDay && personalInsights.worstDay !== personalInsights.bestDay && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>Least: {personalInsights.worstDay} ({fmtHours(personalInsights.worstAvg)})</span>}
                                {personalInsights.longestPresentStreak > 1 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{personalInsights.longestPresentStreak}d present streak</span>}
                                {personalInsights.maxHoursDay && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--primary)" }}>Best: {fmtHours(personalInsights.maxHoursMins)} on {new Date(personalInsights.maxHoursDay).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                                {personalInsights.minHoursDay && personalInsights.minHoursDay !== personalInsights.maxHoursDay && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>Min: {fmtHours(personalInsights.minHoursMins)} on {new Date(personalInsights.minHoursDay).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                                {personalInsights.remoteOnlyDays > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{personalInsights.remoteOnlyDays} remote-only</span>}
                                {personalInsights.officeOnlyDays > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{personalInsights.officeOnlyDays} office-only</span>}
                                {personalInsights.onTimeStreak > 1 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--status-ontime) 10%, transparent)", color: "var(--status-ontime)" }}>{personalInsights.onTimeStreak}d on-time streak</span>}
                                {(() => {
                                  const present = dailyList.filter((r) => r.isPresent);
                                  if (present.length < 3) return null;
                                  const hours = present.map((r) => (r.totalWorkingMinutes ?? 0) / 60);
                                  const mean = hours.reduce((s, v) => s + v, 0) / hours.length;
                                  const variance = hours.reduce((s, v) => s + (v - mean) ** 2, 0) / hours.length;
                                  const stdDev = Math.sqrt(variance);
                                  const consistency = Math.max(0, Math.round(100 - stdDev * 15));
                                  return <span className="rounded-full px-2 py-0.5" style={{ background: consistency >= 80 ? "color-mix(in srgb, var(--status-present) 10%, transparent)" : "var(--bg-grouped)", color: consistency >= 80 ? "var(--status-present)" : "var(--fg-tertiary)" }}>Consistency {consistency}%</span>;
                                })()}
                                {(() => {
                                  const present = dailyList.filter((r) => r.isPresent);
                                  const totalBreakMins = present.reduce((s, r) => s + (r.breakMinutes ?? 0), 0);
                                  return totalBreakMins > 0 ? <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--purple) 10%, transparent)", color: "var(--purple)" }}>{fmtHours(totalBreakMins)} total break</span> : null;
                                })()}
                              </div>
                            </div>
                          )}
                          {/* Leave balance — matching insights-desk */}
                          {canViewLeaves && (
                            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Leave balance</p>
                              {balL ? <Sh c="h-10 rounded-lg" />
                              : !leaveBalance ? <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>Leave balance unavailable.</p>
                              : (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold" style={{ color: leaveBalance.remaining > 0 ? "var(--teal)" : "var(--rose)" }}>
                                      {leaveBalance.remaining} / {leaveBalance.total} left
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                                    <motion.div className="h-full rounded-full" style={{ background: leaveBalance.total > 0 && (leaveBalance.used / leaveBalance.total) > 0.8 ? "var(--rose)" : "var(--teal)" }} initial={{ width: 0 }} animate={{ width: leaveBalance.total > 0 ? `${Math.round((leaveBalance.used / leaveBalance.total) * 100)}%` : "0%" }} transition={{ duration: 0.6 }} />
                                  </div>
                                  <div className="flex justify-between text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
                                    <span>{leaveBalance.used} used</span>
                                    <span>{leaveBalance.remaining} remaining</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
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
                                {/* Pay composition bar */}
                                {(() => {
                                  const base = payEstimate.baseSalary ?? 0;
                                  const ot = payEstimate.overtimePay ?? 0;
                                  const ded = totalDeductionsAmount(payEstimate);
                                  const total = base + ot;
                                  if (total <= 0) return null;
                                  const basePct = Math.round((base / total) * 100);
                                  const otPct = Math.round((ot / total) * 100);
                                  const dedPct = total > 0 ? Math.round((ded / total) * 100) : 0;
                                  return (
                                    <div className="mt-3 space-y-1">
                                      <div className="flex justify-between text-[10px]" style={{ color: "var(--fg-secondary)" }}>
                                        <span>Pay composition</span>
                                        <span className="tabular-nums">Base {basePct}%{ot > 0 ? ` · OT ${otPct}%` : ""} · Ded {dedPct}%</span>
                                      </div>
                                      <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                                        <motion.div className="h-full" style={{ background: "var(--green)" }} initial={{ width: 0 }} animate={{ width: `${basePct}%` }} transition={{ duration: 0.5, ease }} />
                                        {ot > 0 && <motion.div className="h-full" style={{ background: "var(--teal)" }} initial={{ width: 0 }} animate={{ width: `${otPct}%` }} transition={{ duration: 0.5, delay: 0.04, ease }} />}
                                        {ded > 0 && <motion.div className="h-full" style={{ background: "var(--rose)" }} initial={{ width: 0 }} animate={{ width: `${dedPct}%` }} transition={{ duration: 0.5, delay: 0.08, ease }} />}
                                      </div>
                                      <div className="flex gap-3 text-[9px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
                                        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--green)" }} />Base</span>
                                        {ot > 0 && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--teal)" }} />Overtime</span>}
                                        {ded > 0 && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--rose)" }} />Deductions</span>}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </>
                            )}
                          </div>
                          {/* Rate Insights */}
                          {!payL && payEstimate && !payEstimate.exempt && (payEstimate.presentDays ?? 0) > 0 && (
                            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Rate insights</p>
                              {(() => {
                                const netPay = payEstimate.netPay ?? 0;
                                const base = payEstimate.baseSalary ?? 0;
                                const wd2 = payEstimate.workingDays ?? 1;
                                const pd = payEstimate.presentDays ?? 1;
                                const totalHrs = payEstimate.dailyBreakdown ? payEstimate.dailyBreakdown.reduce((s, d) => s + d.workingMinutes, 0) / 60 : 0;
                                const effectiveHourly = totalHrs > 0 ? Math.round(netPay / totalHrs) : 0;
                                const dailyRate = Math.round(base / wd2);
                                const payPerPresent = Math.round(netPay / pd);
                                const otHourly = (payEstimate.overtimeHours ?? 0) > 0 ? Math.round((payEstimate.overtimePay ?? 0) / payEstimate.overtimeHours!) : 0;
                                const netDailyRate = Math.round(netPay / wd2);
                                const costPerAbsent = (payEstimate.absentDays ?? 0) > 0 ? Math.round(base / wd2) : 0;
                                const tiles: [string, string, string][] = [
                                  ...(effectiveHourly > 0 ? [["Effective/hr", effectiveHourly.toLocaleString(), "var(--primary)"] as [string, string, string]] : []),
                                  ["Daily Rate", dailyRate.toLocaleString(), "var(--fg-secondary)"],
                                  ["Pay/Present Day", payPerPresent.toLocaleString(), "var(--green)"],
                                  ...(otHourly > 0 ? [["OT/hr", otHourly.toLocaleString(), "var(--teal)"] as [string, string, string]] : []),
                                  ["Net Daily Rate", netDailyRate.toLocaleString(), "var(--primary)"],
                                  ...(costPerAbsent > 0 ? [["Cost/Absent Day", costPerAbsent.toLocaleString(), "var(--rose)"] as [string, string, string]] : []),
                                ];
                                return (
                                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                                    {tiles.map(([k, v, c]) => (
                                      <div key={k} className="rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--border)" }}>
                                        <p className="text-[9px] font-semibold uppercase" style={{ color: c }}>{k}</p>
                                        <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{v}</p>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          {/* Deduction Analysis */}
                          {!payL && payEstimate && !payEstimate.exempt && payEstimate.dailyBreakdown && payEstimate.dailyBreakdown.length > 0 && (
                            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Deduction analysis</p>
                              {(() => {
                                const bd = payEstimate.dailyBreakdown!;
                                const withDed = bd.filter((d) => d.deduction > 0);
                                const zeroDed = bd.filter((d) => d.status === "present" && d.deduction === 0).length;
                                const maxDed = withDed.length > 0 ? Math.max(...withDed.map((d) => d.deduction)) : 0;
                                const sorted = [...withDed.map((d) => d.deduction)].sort((a, b) => a - b);
                                const medDed = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
                                const totalLateMins = bd.reduce((s, d) => s + d.lateMinutes, 0);
                                const totalOff = bd.reduce((s, d) => s + d.officeMinutes, 0);
                                const totalRem = bd.reduce((s, d) => s + d.remoteMinutes, 0);
                                const tiles: [string, string, string][] = [
                                  ["Days w/ Deductions", `${withDed.length}`, withDed.length > 0 ? "var(--rose)" : "var(--green)"],
                                  ["Zero Deduction", `${zeroDed}`, "var(--green)"],
                                  ...(maxDed > 0 ? [["Max Deduction", maxDed.toLocaleString(), "var(--rose)"] as [string, string, string]] : []),
                                  ...(medDed > 0 ? [["Median Deduction", medDed.toLocaleString(), "var(--amber)"] as [string, string, string]] : []),
                                  ["Total Late", fmtHours(totalLateMins), "var(--amber)"],
                                  ["Office / Remote", `${fmtHours(totalOff)} / ${fmtHours(totalRem)}`, "var(--teal)"],
                                ];
                                return (
                                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                                    {tiles.map(([k, v, c]) => (
                                      <div key={k} className="rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--border)" }}>
                                        <p className="text-[9px] font-semibold uppercase" style={{ color: c }}>{k}</p>
                                        <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{v}</p>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          {/* Deduction Breakdown */}
                          {!payL && payEstimate && !payEstimate.exempt && Array.isArray(payEstimate.deductions) && payEstimate.deductions.length > 0 && (
                            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Deduction breakdown</p>
                              <div className="space-y-1">
                                {(payEstimate.deductions as { name: string; amount: number }[]).map((d, i) => (
                                  <div key={i} className="flex items-center justify-between rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-grouped)" }}>
                                    <span className="text-[11px] font-medium" style={{ color: "var(--fg)" }}>{d.name}</span>
                                    <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--rose)" }}>{d.amount.toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Year to Date — upgraded */}
                          {!payL && payEstimate && !payEstimate.exempt && payEstimate.ytd && (
                            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Year to date</p>
                              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                                {(() => {
                                  const y = payEstimate.ytd!;
                                  const avgNet = y.months > 0 ? Math.round(y.netPay / y.months) : 0;
                                  const dedPct = y.earned > 0 ? Math.round((y.deductions / y.earned) * 100) : 0;
                                  const tiles: [string, string, string][] = [
                                    ["Earned", y.earned.toLocaleString(), "var(--green)"],
                                    ["Deductions", y.deductions.toLocaleString(), "var(--rose)"],
                                    ["Net Pay", y.netPay.toLocaleString(), "var(--primary)"],
                                    ["Months", `${y.months}`, "var(--fg-secondary)"],
                                    ["Avg Monthly Net", avgNet.toLocaleString(), "var(--teal)"],
                                    ["Deduction %", `${dedPct}%`, dedPct > 10 ? "var(--rose)" : "var(--fg-secondary)"],
                                  ];
                                  return tiles.map(([k, v, c]) => (
                                    <div key={k} className="rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--border)" }}>
                                      <p className="text-[9px] font-semibold uppercase" style={{ color: c }}>{k}</p>
                                      <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{v}</p>
                                    </div>
                                  ));
                                })()}
                              </div>
                            </div>
                          )}
                          {!payL && payEstimate && !payEstimate.exempt && payEstimate.dailyBreakdown && payEstimate.dailyBreakdown.length > 0 && (
                            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Daily breakdown</p>
                              <div className="max-h-[200px] overflow-y-auto">
                                <table className="w-full text-[10px]">
                                  <thead>
                                    <tr style={{ color: "var(--fg-tertiary)" }}>
                                      <th className="py-1 text-left font-semibold">Day</th>
                                      <th className="py-1 text-left font-semibold">Attendance</th>
                                      <th className="py-1 text-right font-semibold">Hours worked</th>
                                      <th className="py-1 text-right font-semibold">Late</th>
                                      <th className="py-1 text-right font-semibold">Deduction</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {payEstimate.dailyBreakdown.map((d) => (
                                      <tr key={d.day} style={{ color: "var(--fg)" }}>
                                        <td className="py-1 tabular-nums">{d.dayOfWeek} {d.day}</td>
                                        <td className="py-1">{{ present: "Present", late: "Late", absent: "Absent", leave: "Leave", holiday: "Holiday", weekend: "Weekend", off: "Day off" }[d.status] ?? d.status}</td>
                                        <td className="py-1 text-right tabular-nums">{((d.workingMinutes ?? 0) / 60).toFixed(1)}h</td>
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
                          {/* Balance + progress bar */}
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Balance</p>
                            {balL ? (
                              <div className="grid grid-cols-3 gap-2">{[1, 2, 3].map((i) => <Sh key={i} c="h-14 rounded-lg" />)}</div>
                            ) : !leaveBalance ? (
                              <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>Leave balance not available.</p>
                            ) : (
                              <>
                                <div className="grid grid-cols-3 gap-2">
                                  {(
                                    [
                                      ["Total days", `${leaveBalance.total}`, "var(--primary)"],
                                      ["Days used", `${leaveBalance.used}`, "var(--amber)"],
                                      ["Days left", `${leaveBalance.remaining}`, leaveBalance.remaining > 0 ? "var(--green)" : "var(--rose)"],
                                    ] as [string, string, string][]
                                  ).map(([k, v, c]) => (
                                    <div key={k} className="rounded-lg border px-2 py-1.5 text-center" style={{ borderColor: "var(--border)" }}>
                                      <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>{k}</p>
                                      <p className="text-sm font-bold tabular-nums" style={{ color: c }}>{v}</p>
                                    </div>
                                  ))}
                                </div>
                                {/* Balance progress bar */}
                                {leaveBalance.total > 0 && (
                                  <div className="mt-2 space-y-1">
                                    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                                      <motion.div className="h-full rounded-full" style={{ background: (leaveBalance.used / leaveBalance.total) > 0.8 ? "var(--rose)" : (leaveBalance.used / leaveBalance.total) > 0.5 ? "var(--amber)" : "var(--green)" }} initial={{ width: 0 }} animate={{ width: `${Math.round((leaveBalance.used / leaveBalance.total) * 100)}%` }} transition={{ duration: 0.6 }} />
                                    </div>
                                    <p className="text-[9px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{Math.round((leaveBalance.used / leaveBalance.total) * 100)}% used</p>
                                  </div>
                                )}
                              </>
                            )}
                            {!balL && leaveBalance && leaveInsights && leavesList.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-2" style={{ borderColor: "var(--border)" }}>
                                {leaveInsights.approvalRate != null && (
                                  <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold" style={{ borderColor: "var(--border)", color: "var(--fg)" }}>Approval {leaveInsights.approvalRate}%</span>
                                )}
                                <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg)" }}>Avg duration {leaveInsights.avgDur.toFixed(1)} days</span>
                                <span className="rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--amber)" }}>{leaveInsights.halfDays} half-day leaves</span>
                                {Object.entries(leaveInsights.byType).map(([typ, n2]) => (
                                  <span key={typ} className="rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}>{typ}: {n2}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Quick Insights */}
                          {!balL && leaveBalance && (
                            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Quick insights</p>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-lg border px-2 py-1.5 text-center" style={{ borderColor: "var(--border)" }}>
                                  <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>On Leave Today</p>
                                  <p className="text-sm font-bold" style={{ color: leaveExtras.onLeaveToday ? "var(--teal)" : "var(--fg-secondary)" }}>{leaveExtras.onLeaveToday ? "Yes" : "No"}</p>
                                </div>
                                <div className="rounded-lg border px-2 py-1.5 text-center" style={{ borderColor: "var(--border)" }}>
                                  <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>Next Leave</p>
                                  <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{leaveExtras.nextLeave ? new Date(leaveExtras.nextLeave).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}</p>
                                </div>
                                <div className="rounded-lg border px-2 py-1.5 text-center" style={{ borderColor: "var(--border)" }}>
                                  <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>Since Last Leave</p>
                                  <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{leaveExtras.daysSinceLast != null ? `${leaveExtras.daysSinceLast}d` : "—"}</p>
                                </div>
                                <div className="rounded-lg border px-2 py-1.5 text-center" style={{ borderColor: "var(--border)" }}>
                                  <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>Est. Balance Runout</p>
                                  <p className="text-sm font-bold tabular-nums" style={{ color: leaveExtras.runoutDays != null && leaveExtras.runoutDays < 60 ? "var(--amber)" : "var(--fg)" }}>{leaveExtras.runoutDays != null ? `~${leaveExtras.runoutDays}d` : "—"}</p>
                                </div>
                              </div>
                            </div>
                          )}
                          {/* Monthly distribution */}
                          {!leaveL && leavesList.length > 0 && (
                            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Monthly distribution</p>
                              {(() => {
                                const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                                const byMonth = Array(12).fill(0) as number[];
                                for (const l of leavesList.filter((x) => x.status === "approved")) {
                                  const s = new Date(l.startDate);
                                  const e = new Date(l.endDate);
                                  const days = l.isHalfDay ? 0.5 : Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
                                  byMonth[s.getMonth()] += days;
                                }
                                const maxVal = Math.max(...byMonth, 1);
                                const curMonth = new Date().getMonth();
                                return (
                                  <div className="flex items-end gap-1">
                                    {MONTHS.map((m, i) => (
                                      <div key={m} className="flex flex-1 flex-col items-center gap-0.5">
                                        <div className="w-full rounded-sm" style={{ height: `${Math.max(byMonth[i] / maxVal * 32, 2)}px`, background: i === curMonth ? "var(--primary)" : byMonth[i] > 0 ? "var(--teal)" : "var(--border)" }} />
                                        <span className="text-[7px] font-medium" style={{ color: i === curMonth ? "var(--primary)" : "var(--fg-tertiary)" }}>{m}</span>
                                        {byMonth[i] > 0 && <span className="text-[7px] font-bold tabular-nums" style={{ color: "var(--fg-secondary)" }}>{byMonth[i]}</span>}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          {/* Leave type breakdown */}
                          {!leaveL && leaveInsights && Object.keys(leaveInsights.byType).length > 0 && (
                            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>By type</p>
                              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                                {Object.entries(leaveInsights.byType).map(([typ, cnt]) => {
                                  const typeColors: Record<string, string> = { Sick: "var(--rose)", Casual: "var(--amber)", Annual: "var(--teal)", Unpaid: "var(--fg-tertiary)", General: "var(--primary)" };
                                  return (
                                    <div key={typ} className="rounded-lg border px-2 py-1.5 text-center" style={{ borderColor: "var(--border)" }}>
                                      <p className="text-[9px] font-semibold uppercase" style={{ color: typeColors[typ] ?? "var(--fg-secondary)" }}>{typ}</p>
                                      <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{cnt}d</p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {/* History — show all with "show more" */}
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>History</p>
                            {leaveL ? (
                              <div className="space-y-2">{[1, 2, 3].map((i) => <Sh key={i} c="h-10 w-full rounded-lg" />)}</div>
                            ) : leavesList.length === 0 ? (
                              <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No leave records found.</p>
                            ) : (
                              <div className="max-h-[350px] space-y-1.5 overflow-y-auto">
                                {leavesList.map((l) => {
                                  const sc: Record<string, string> = { approved: "var(--green)", pending: "var(--amber)", rejected: "var(--rose)", cancelled: "var(--fg-tertiary)" };
                                  const col = sc[l.status] ?? "var(--fg-secondary)";
                                  const start = new Date(l.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                                  const end = new Date(l.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                                  const same = l.startDate === l.endDate;
                                  const days = l.isHalfDay ? 0.5 : Math.max(1, Math.round((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / 86400000) + 1);
                                  return (
                                    <div key={l._id} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-grouped)" }}>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: col }} />
                                          <span className="truncate text-[11px] font-semibold" style={{ color: "var(--fg)" }}>{l.type || "Leave"}{l.isHalfDay ? " (½)" : ""}</span>
                                          <span className="shrink-0 text-[9px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{days}d</span>
                                        </div>
                                        <p className="mt-0.5 truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{same ? start : `${start} – ${end}`}{l.reason ? ` · ${l.reason}` : ""}</p>
                                      </div>
                                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `color-mix(in srgb, ${col} 12%, transparent)`, color: col }}>{{ pending: "Pending approval", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" }[l.status] ?? l.status}</span>
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
                          {/* Task summary stats */}
                          {!taskL && empTasks.length > 0 && (() => {
                            const total = empTasks.length;
                            const ets = (t: TaskRow) => effectiveId ? employeeTaskStatus(t, effectiveId) : t.status;
                            const completed = empTasks.filter((t) => ets(t) === "completed").length;
                            const inProg = empTasks.filter((t) => ets(t) === "inProgress").length;
                            const pending = empTasks.filter((t) => ets(t) === "pending").length;
                            const overdue = empTasks.filter((t) => t.deadline && new Date(t.deadline) < new Date() && ets(t) !== "completed").length;
                            const compRate = total > 0 ? Math.round((completed / total) * 100) : 0;
                            const tiles: [string, string, string][] = [
                              ["Total tasks", `${total}`, "var(--fg-secondary)"],
                              ["Completed tasks", `${completed}`, "var(--green)"],
                              ["Tasks in progress", `${inProg}`, "var(--primary)"],
                              ["Tasks pending", `${pending}`, "var(--amber)"],
                              ...(overdue > 0 ? [["Tasks overdue", `${overdue}`, "var(--rose)"] as [string, string, string]] : []),
                              ["Completion rate", `${compRate}%`, compRate >= 80 ? "var(--green)" : "var(--fg-secondary)"],
                            ];
                            return (
                              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Summary</p>
                                <div className="grid grid-cols-3 gap-2">
                                  {tiles.map(([k, v, c]) => (
                                    <div key={k} className="rounded-lg border px-2 py-1.5 text-center" style={{ borderColor: "var(--border)" }}>
                                      <p className="text-[9px] font-semibold uppercase" style={{ color: c }}>{k}</p>
                                      <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{v}</p>
                                    </div>
                                  ))}
                                </div>
                                {/* Priority breakdown pills */}
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {(["urgent", "high", "medium", "low"] as const).map((p) => {
                                    const cnt = empTasks.filter((t) => t.priority === p).length;
                                    if (cnt === 0) return null;
                                    return <span key={p} className="rounded-full px-2 py-0.5 text-[9px] font-semibold capitalize tabular-nums" style={{ background: `color-mix(in srgb, ${PRIORITY_COLORS[p]} 12%, transparent)`, color: PRIORITY_COLORS[p] }}>{cnt} {p}</span>;
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                          {/* Task list */}
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Tasks</p>
                            {taskL ? (
                              <div className="space-y-1.5">{[1, 2, 3, 4].map((i) => <Sh key={i} c="h-12 w-full rounded-lg" />)}</div>
                            ) : empTasks.length === 0 ? (
                              <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No tasks assigned.</p>
                            ) : (
                              <div className="max-h-[280px] space-y-1.5 overflow-y-auto">
                                {empTasks.map((t) => {
                                  const empSt = effectiveId ? employeeTaskStatus(t, effectiveId) : t.status;
                                  const stCol2 = TASK_STATUS_COLORS[empSt] ?? "var(--fg-secondary)";
                                  const prCol2 = PRIORITY_COLORS[t.priority] ?? "var(--fg-tertiary)";
                                  const overdue2 = t.deadline && new Date(t.deadline) < new Date() && empSt !== "completed";
                                  return (
                                    <div key={t._id} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-grouped)" }}>
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-[11px] font-semibold" style={{ color: "var(--fg)" }}>{t.title || "Untitled"}</p>
                                        <div className="mt-0.5 flex flex-wrap gap-1.5">
                                          {t.campaign?.name && <span className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>{t.campaign.name}</span>}
                                          {t.deadline && (
                                            <span className="text-[9px] tabular-nums" style={{ color: overdue2 ? "var(--rose)" : "var(--fg-tertiary)" }}>
                                              Due {new Date(t.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-1.5">
                                        <span className="rounded-full px-2 py-0.5 text-[9px] font-bold capitalize" style={{ background: `color-mix(in srgb, ${prCol2} 14%, transparent)`, color: prCol2 }}>{t.priority || "—"}</span>
                                        <span className="rounded-full px-2 py-0.5 text-[9px] font-bold capitalize" style={{ background: `color-mix(in srgb, ${stCol2} 14%, transparent)`, color: stCol2 }}>{{ pending: "Pending", inProgress: "In progress", completed: "Completed" }[empSt] ?? empSt}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          {/* Campaigns with task progress */}
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Campaigns</p>
                            {campL ? (
                              <div className="space-y-1.5">{[1, 2, 3].map((i) => <Sh key={i} c="h-10 w-full rounded-lg" />)}</div>
                            ) : empCampaigns.length === 0 ? (
                              <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No campaign involvement.</p>
                            ) : (
                              <div className="max-h-[260px] space-y-1.5 overflow-y-auto">
                                {empCampaigns.map((c) => {
                                  const campTasks = empTasks.filter((t) => t.campaign?._id === c._id);
                                  const campDone = campTasks.filter((t) => (effectiveId ? employeeTaskStatus(t, effectiveId) : t.status) === "completed").length;
                                  return (
                                    <div key={c._id} className="rounded-lg px-2.5 py-2" style={{ background: "var(--bg-grouped)" }}>
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="min-w-0 flex-1 truncate text-[11px] font-semibold" style={{ color: "var(--fg)" }}>{c.name}</p>
                                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold capitalize" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" }}>{{ active: "Active", paused: "Paused", completed: "Completed", cancelled: "Cancelled" }[c.status] ?? c.status}</span>
                                      </div>
                                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                                        {c.startDate && <span>Start {new Date(c.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                                        {c.endDate && <span>End {new Date(c.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                                        {campTasks.length > 0 && (
                                          <span className="font-semibold" style={{ color: campDone === campTasks.length ? "var(--green)" : "var(--fg-secondary)" }}>
                                            {campDone}/{campTasks.length} tasks done
                                          </span>
                                        )}
                                      </div>
                                      {campTasks.length > 0 && (
                                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((campDone / campTasks.length) * 100)}%`, background: campDone === campTasks.length ? "var(--green)" : "var(--primary)" }} />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {tab === "location" && canAtt && (
                        <div className="space-y-3">
                          {/* ── Date navigation + summary ── */}
                          <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
                            {/* Daily timeline */}
                            <div className="space-y-3">
                              {/* Day header with quick nav */}
                              <div className="flex items-center justify-between gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                                <button type="button" onClick={() => {
                                  const d = new Date(locYear, locMonth - 1, (locDay ?? 1) - 1);
                                  setLocYear(d.getFullYear()); setLocMonth(d.getMonth() + 1); setLocDay(d.getDate());
                                }} className="rounded-lg p-1 hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-secondary)" }}>
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                                </button>
                                <div className="text-center">
                                  <p className="text-xs font-bold" style={{ color: "var(--fg)" }}>
                                    {locDay ? new Date(locYear, locMonth - 1, locDay).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "Select a day"}
                                  </p>
                                  {locDetail && locDay && (
                                    <div className="mt-0.5 flex items-center justify-center gap-2">
                                      {locDetail.isPresent && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "color-mix(in srgb, var(--status-present) 12%, transparent)", color: "var(--status-present)" }}>Present</span>}
                                      {locDetail.officeMinutes != null && locDetail.officeMinutes > 0 && <span className="text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{Math.round(locDetail.officeMinutes)}m office</span>}
                                      {locDetail.remoteMinutes != null && locDetail.remoteMinutes > 0 && <span className="text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{Math.round(locDetail.remoteMinutes)}m remote</span>}
                                      {locDayFlags.length > 0 && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "color-mix(in srgb, var(--rose) 12%, transparent)", color: "var(--rose)" }}>{locDayFlags.length} flag{locDayFlags.length > 1 ? "s" : ""}</span>}
                                    </div>
                                  )}
                                </div>
                                <button type="button" onClick={() => {
                                  const d = new Date(locYear, locMonth - 1, (locDay ?? 1) + 1);
                                  if (d <= new Date()) { setLocYear(d.getFullYear()); setLocMonth(d.getMonth() + 1); setLocDay(d.getDate()); }
                                }} className="rounded-lg p-1 hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-secondary)" }}>
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                </button>
                              </div>

                              {/* Timeline */}
                              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Timeline</p>
                                {locDetailL ? (
                                  <div className="space-y-3">{[1, 2, 3].map((i) => <Sh key={i} c="h-14 w-full rounded-lg" />)}</div>
                                ) : locTimeline.length === 0 ? (
                                  <p className="py-4 text-center text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No activity recorded for this day.</p>
                                ) : (
                                  <div className="relative pl-5">
                                    <div className="absolute left-[7px] top-1 bottom-1 w-px" style={{ background: "var(--border)" }} />
                                    <div className="space-y-0.5">
                                      {locTimeline.map((item, idx) => (
                                        <motion.div
                                          key={idx}
                                          className="relative flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--bg-grouped)]"
                                          initial={{ opacity: 0, x: -8 }}
                                          animate={{ opacity: 1, x: 0 }}
                                          transition={{ delay: idx * 0.03 }}
                                        >
                                          <div className="absolute -left-[13px] top-3 flex h-4 w-4 items-center justify-center rounded-full" style={{ background: "var(--bg-elevated)", border: `2px solid ${item.color}` }}>
                                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                              <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--fg-secondary)" }}>{item.time}</span>
                                              <span className="text-[11px] font-semibold" style={{ color: item.color }}>{item.label}</span>
                                              {item.sublabel && <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{item.sublabel}</span>}
                                            </div>
                                            {item.lat != null && item.lng != null && (
                                              <div className="mt-1 flex items-center gap-2">
                                                <span className="text-[9px] tabular-nums font-mono" style={{ color: "var(--fg-tertiary)" }}>{item.lat.toFixed(5)}, {item.lng.toFixed(5)}</span>
                                                <a
                                                  href={`https://www.google.com/maps?q=${item.lat},${item.lng}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold transition-colors hover:opacity-80"
                                                  style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--primary)" }}
                                                  onClick={(e) => e.stopPropagation()}
                                                >
                                                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                  Map
                                                </a>
                                              </div>
                                            )}
                                          </div>
                                        </motion.div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Overall flag summary */}
                              {!flagsL && flags.length > 0 && (
                                <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>All-time summary</p>
                                  {(() => {
                                    const total = flagsPayload?.total ?? flags.length;
                                    const warns = flags.filter((f) => f.severity === "warning").length;
                                    const viols = flags.filter((f) => f.severity === "violation").length;
                                    const acked = flags.filter((f) => f.acknowledged).length;
                                    const ackRate = total > 0 ? Math.round((acked / total) * 100) : 0;
                                    return (
                                      <div className="grid grid-cols-3 gap-2">
                                        {([
                                          ["Warnings", `${warns}`, "var(--amber)"],
                                          ["Violations", `${viols}`, "var(--rose)"],
                                          ["Ack Rate", `${ackRate}%`, ackRate >= 80 ? "var(--green)" : "var(--amber)"],
                                        ] as const).map(([k, v, c]) => (
                                          <div key={k} className="rounded-lg border px-2 py-1.5 text-center" style={{ borderColor: "var(--border)" }}>
                                            <p className="text-[9px] font-semibold uppercase" style={{ color: c }}>{k}</p>
                                            <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{v}</p>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>

                            {/* Calendar sidebar */}
                            <div className="hidden lg:block">
                              <MiniCalendar
                                year={locYear}
                                month={locMonth}
                                onPrevMonth={() => { if (locMonth === 1) { setLocMonth(12); setLocYear((y) => y - 1); } else setLocMonth((m) => m - 1); }}
                                onNextMonth={() => { if (locMonth === 12) { setLocMonth(1); setLocYear((y) => y + 1); } else setLocMonth((m) => m + 1); }}
                                selectedDay={locDay}
                                onSelectDay={(d) => setLocDay(d)}
                                compact
                                getDayMeta={(day) => {
                                  const ds = `${locYear}-${String(locMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                  const dayFlags = flags.filter((f) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(f.createdAt)) === ds);
                                  if (dayFlags.length === 0) return undefined;
                                  const hasViol = dayFlags.some((f) => f.severity === "violation");
                                  return { dotColor: hasViol ? "var(--rose)" : "var(--amber)" };
                                }}
                                showLegend
                                legendItems={[
                                  { label: "Warning", color: "var(--amber)" },
                                  { label: "Violation", color: "var(--rose)" },
                                ]}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {tab === "schedule" && (
                        <div className="space-y-3">
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Shift & Schedule</p>
                            {empL || !employee ? (
                              <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Sh key={i} c="h-10 w-full rounded-lg" />)}</div>
                            ) : editing && editForm ? (
                              <>
                                {/* Editable shift type + grace */}
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                  <div>
                                    <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--fg-secondary)" }}>Shift Type</label>
                                    <select className="input text-xs" value={editForm.shiftType} onChange={(e) => setEditForm({ ...editForm, shiftType: e.target.value })}>
                                      <option value="fullTime">Full Time</option>
                                      <option value="partTime">Part Time</option>
                                      <option value="contract">Contract</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--fg-secondary)" }}>Grace Minutes</label>
                                    <input className="input text-xs" type="number" min={0} value={editForm.graceMinutes} onChange={(e) => setEditForm({ ...editForm, graceMinutes: Number(e.target.value) || 0 })} />
                                  </div>
                                </div>
                                {/* Editable weekly schedule */}
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Weekly Schedule</p>
                                  <button type="button" onClick={copyMondayToAll} className="text-[10px] font-semibold px-2 py-1 rounded-lg" style={{ color: "var(--primary)", background: "var(--bg-grouped)" }}>Copy Mon → All</button>
                                </div>
                                <div className="space-y-1.5">
                                  {ALL_WEEKDAYS.map((day) => {
                                    const ds = editForm.weeklySchedule[day];
                                    return (
                                      <div key={day} className="rounded-lg px-2.5 py-2" style={{ background: "var(--bg-grouped)" }}>
                                        <div className="flex items-center justify-between mb-1.5">
                                          <span className="text-[11px] font-semibold" style={{ color: ds.isWorking ? "var(--fg)" : "var(--fg-tertiary)" }}>{WEEKDAY_LABELS[day]}</span>
                                          <ToggleSwitch checked={ds.isWorking} onChange={() => updateEditDay(day, { isWorking: !ds.isWorking })} size="md" />
                                        </div>
                                        {ds.isWorking && (
                                          <div className="grid grid-cols-3 gap-2">
                                            <div>
                                              <label className="block text-[9px] mb-0.5" style={{ color: "var(--fg-tertiary)" }}>Start</label>
                                              <input className="input text-xs py-1" type="time" value={ds.start} onChange={(e) => updateEditDay(day, { start: e.target.value })} />
                                            </div>
                                            <div>
                                              <label className="block text-[9px] mb-0.5" style={{ color: "var(--fg-tertiary)" }}>End</label>
                                              <input className="input text-xs py-1" type="time" value={ds.end} onChange={(e) => updateEditDay(day, { end: e.target.value })} />
                                            </div>
                                            <div>
                                              <label className="block text-[9px] mb-0.5" style={{ color: "var(--fg-tertiary)" }}>Break</label>
                                              <input className="input text-xs py-1" type="number" min={0} value={ds.breakMinutes} onChange={(e) => updateEditDay(day, { breakMinutes: Number(e.target.value) || 0 })} />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
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
                                {week && (() => {
                                  const workDays = ALL_WEEKDAYS.filter((d) => week[d]?.isWorking);
                                  const workDayCount = workDays.length;
                                  let weeklyMins = 0, weeklyBreakMins = 0;
                                  for (const d of workDays) {
                                    const wd2 = week[d];
                                    if (!wd2.isWorking) continue;
                                    const [sh3, sm3] = (wd2.start ?? "10:00").split(":").map(Number);
                                    const [eh3, em3] = (wd2.end ?? "19:00").split(":").map(Number);
                                    const dayMins = Math.max(eh3 * 60 + em3 - (sh3 * 60 + sm3), 0);
                                    weeklyMins += dayMins;
                                    weeklyBreakMins += wd2.breakMinutes ?? 0;
                                  }
                                  const netWeeklyMins = weeklyMins - weeklyBreakMins;
                                  const avgDaily = ms?.averageDailyHours;
                                  const scheduledDailyHrs = workDayCount > 0 ? netWeeklyMins / workDayCount / 60 : 0;
                                  const adherence = avgDaily && scheduledDailyHrs > 0 ? Math.round((avgDaily / scheduledDailyHrs) * 100) : null;
                                  return (
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                      <div className="rounded-lg border px-2 py-1.5 text-center" style={{ borderColor: "var(--border)" }}>
                                        <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--primary)" }}>Weekly Hours</p>
                                        <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{fmtHours(netWeeklyMins)}</p>
                                      </div>
                                      <div className="rounded-lg border px-2 py-1.5 text-center" style={{ borderColor: "var(--border)" }}>
                                        <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--fg-secondary)" }}>Working Days</p>
                                        <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{workDayCount}/wk</p>
                                      </div>
                                      <div className="rounded-lg border px-2 py-1.5 text-center" style={{ borderColor: "var(--border)" }}>
                                        <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--purple)" }}>Weekly Break</p>
                                        <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{fmtHours(weeklyBreakMins)}</p>
                                      </div>
                                      {adherence != null && (
                                        <div className="rounded-lg border px-2 py-1.5 text-center" style={{ borderColor: "var(--border)" }}>
                                          <p className="text-[9px] font-semibold uppercase" style={{ color: adherence >= 90 ? "var(--green)" : "var(--amber)" }}>Adherence</p>
                                          <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{adherence}%</p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                                {week && (
                                  <div className="mt-3">
                                    <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Weekly schedule</p>
                                    <div className="space-y-1">
                                      {ALL_WEEKDAYS.map((d) => {
                                        const wd3 = week[d];
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
                                            <span className="text-[11px] font-bold tabular-nums" style={{ color: wd3.isWorking ? "var(--fg)" : "var(--fg-tertiary)" }}>
                                              {wd3.isWorking ? `${wd3.start} – ${wd3.end} · ${wd3.breakMinutes}m break` : "Off"}
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
                        <div className="space-y-3">
                          {/* ── Editable Personal Info ── */}
                          {editing && editForm ? (
                            <section className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Personal Information</p>
                              <div className="space-y-3">
                                <div>
                                  <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--fg-secondary)" }}>Full Name</label>
                                  <input className="input text-xs" placeholder="Full Name" value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--fg-secondary)" }}>New Password (optional)</label>
                                  <input className="input text-xs" type="password" placeholder="Leave blank to keep current" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
                                </div>
                              </div>
                            </section>
                          ) : (
                            <section className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Identity & Account</p>
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
                                      {employee.isVerified === true && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: "color-mix(in srgb, var(--green) 18%, transparent)", color: "var(--green)" }}>Verified</span>}
                                      {employee.isVerified === false && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: "color-mix(in srgb, var(--amber) 18%, transparent)", color: "var(--amber)" }}>Unverified</span>}
                                    </dd>
                                  </div>
                                  <ProfRow k="Department" v={employee.department?.title ?? "—"} />
                                  <ProfRow k="Designation" v={designation} />
                                  <ProfRow k="Joined" v={employee.createdAt ? new Date(employee.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"} />
                                  <ProfRow k="Account status" v={employee.isActive === false ? "Inactive" : "Active"} />
                                  <ProfRow k="Account Age" v={(() => {
                                    if (!employee.createdAt) return "—";
                                    const diff = Date.now() - new Date(employee.createdAt).getTime();
                                    const days = Math.floor(diff / 86400000);
                                    if (days < 30) return `${days}d`;
                                    const months = Math.floor(days / 30.44);
                                    if (months < 12) return `${months}mo`;
                                    const years = Math.floor(months / 12);
                                    const rem = months % 12;
                                    return rem > 0 ? `${years}y ${rem}mo` : `${years}y`;
                                  })()} />
                                  {employee.createdBy && <ProfRow k="Invited By" v={employee.createdBy} />}
                                  <ProfRow k="Last Active" v={(() => {
                                    const le = sess?.lastExit;
                                    if (!le) return hasAct ? "Now" : "—";
                                    if (hasAct) return "Now";
                                    const d = new Date(le);
                                    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
                                  })()} />
                                </dl>
                              )}
                            </section>
                          )}

                          {/* ── Editable Department Assignment ── */}
                          {editing && editForm && departments.length > 0 ? (
                            <section className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                                {multiDeptUi ? "Managed Departments" : "Department"}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {departments.map((d) => {
                                  const active = multiDeptUi ? editForm.managedDepartments.includes(d._id) : editForm.department === d._id;
                                  return (
                                    <button
                                      key={d._id}
                                      type="button"
                                      onClick={() => {
                                        if (multiDeptUi) { toggleManagedDept(d._id); }
                                        else { setEditForm((f) => f ? { ...f, department: f.department === d._id ? "" : d._id } : f); }
                                      }}
                                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all ${active ? "text-white shadow-sm" : "text-[var(--fg-secondary)]"}`}
                                      style={active ? { background: "var(--primary)" } : { background: "var(--bg-grouped)" }}
                                    >
                                      {d.title}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="mt-2">
                                {!multiDeptUi ? (
                                  <button type="button" className="text-[10px] font-medium hover:underline" style={{ color: "var(--primary)" }} onClick={() => {
                                    setMultiDeptUi(true);
                                    setEditForm((f) => f ? { ...f, managedDepartments: f.department ? [f.department] : f.managedDepartments } : f);
                                  }}>Manage multiple departments</button>
                                ) : (
                                  <button type="button" className="text-[10px] font-medium hover:underline" style={{ color: "var(--fg-secondary)" }} onClick={() => {
                                    setMultiDeptUi(false);
                                    setEditForm((f) => f ? { ...f, department: f.department || f.managedDepartments[0] || "", managedDepartments: [] } : f);
                                  }}>Use single department</button>
                                )}
                              </div>
                            </section>
                          ) : null}

                          {/* ── Editable Salary ── */}
                          {editing && editForm && canPerm("payroll_manageSalary") ? (
                            <section className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Salary</p>
                              <div>
                                <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--fg-secondary)" }}>Base Salary (Monthly)</label>
                                <input className="input text-xs" type="number" min={0} placeholder="e.g. 50000" value={editForm.salary} onChange={(e) => setEditForm({ ...editForm, salary: e.target.value })} />
                              </div>
                            </section>
                          ) : !editing && employee?.salary != null && canPerm("payroll_manageSalary") ? (
                            <section className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
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
                            </section>
                          ) : null}

                          {/* Memberships (read-only) */}
                          <section className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
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
                          </section>
                        </div>
                      )}
                  </motion.div>
                  </AnimatePresence>
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
