"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { Pill, StatChip } from "../components/StatChips";
import { timeAgo } from "@/lib/formatters";
import { MiniCalendar } from "../components/MiniCalendar";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Portal } from "../components/Portal";
import { LeavesContent } from "./LeavesContent";
import { PayrollContent } from "./PayrollContent";
import { ProgressContent } from "./ProgressContent";
import toast from "react-hot-toast";
import { io, Socket } from "socket.io-client";

/* ───── Types ───── */

interface PresenceEmployee {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: "office" | "remote" | "absent";
  todayMinutes: number;
  officeMinutes: number;
  remoteMinutes: number;
  isLive: boolean;
  designation: string;
  department: string;
  departmentId: string | null;
  shiftStart: string;
  shiftEnd: string;
  firstEntry: string | null;
  lastExit: string | null;
  firstOfficeEntry: string | null;
  lastOfficeExit: string | null;
  reportsTo: string | null;
}

interface DailyRecord {
  _id: string;
  date: string;
  isPresent: boolean;
  isOnTime: boolean;
  totalWorkingMinutes: number;
  officeMinutes: number;
  remoteMinutes: number;
  firstOfficeEntry?: string;
  lastOfficeExit?: string;
  firstStart?: string;
  lastEnd?: string;
  lateBy?: number;
  isLateToOffice?: boolean;
  lateToOfficeBy?: number;
  breakMinutes?: number;
}

interface OfficeSegment {
  entryTime: string;
  exitTime?: string;
  durationMinutes: number;
}

interface SessionRecord {
  _id: string;
  sessionTime: { start: string; end?: string };
  location: { inOffice: boolean; latitude?: number; longitude?: number };
  platform?: string;
  userAgent?: string;
  deviceId?: string;
  ipAddress?: string;
  status: "active" | "disconnected" | "timeout";
  durationMinutes: number;
  lastActivity?: string;
  officeSegments?: OfficeSegment[];
  isFirstOfficeEntry?: boolean;
  isLastOfficeExit?: boolean;
}

interface DetailData extends DailyRecord {
  activitySessions: SessionRecord[];
}

interface MonthlyStats {
  averageOfficeInTime?: string;
  averageOfficeOutTime?: string;
  averageDailyHours: number;
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  onTimeArrivals: number;
  lateArrivals: number;
  onTimePercentage: number;
  totalWorkingHours: number;
  totalOfficeHours: number;
  totalRemoteHours: number;
  attendancePercentage: number;
}

interface TeamMonthlySummary {
  _id: string;
  name: string;
  role: string;
  department: string;
  departmentId: string | null;
  presentDays: number;
  onTimeDays: number;
  lateDays: number;
  lateToOfficeDays: number;
  totalMinutes: number;
  averageDailyHours: number;
  onTimePercentage: number;
  attendancePercentage: number;
}

interface TeamDateRecord {
  _id: string;
  name: string;
  role: string;
  department: string;
  departmentId: string | null;
  isPresent: boolean;
  isOnTime: boolean;
  totalWorkingMinutes: number;
  officeMinutes: number;
  remoteMinutes: number;
  firstOfficeEntry?: string;
  lastOfficeExit?: string;
  firstStart?: string;
  lastEnd?: string;
  lateBy?: number;
  isLateToOffice?: boolean;
  lateToOfficeBy?: number;
}

interface LeaveRecord {
  _id: string;
  startDate: string;
  endDate: string;
  days: number;
  isHalfDay?: boolean;
  status: string;
  reason?: string;
  user?: { _id?: string; about?: { firstName?: string; lastName?: string } };
}

interface Holiday {
  _id: string;
  name: string;
  date: string;
  year: number;
  isRecurring: boolean;
}

type TabId = "attendance" | "progress" | "leaves" | "payroll";

/* ───── Constants ───── */

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const AVATAR_COLORS = ["var(--primary)", "var(--teal)", "var(--purple)", "var(--amber)", "var(--rose)", "var(--green)", "var(--fg-secondary)"];
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const TAB_ITEMS: { id: TabId; label: string; icon: string; color: string }[] = [
  { id: "attendance", label: "Attendance", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", color: "var(--amber)" },
  { id: "progress", label: "Progress", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4", color: "var(--amber)" },
  { id: "leaves", label: "Leaves", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", color: "var(--teal)" },
  { id: "payroll", label: "Payroll", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", color: "var(--green)" },
];

/* ───── Helpers ───── */

function fmtTime(dateStr?: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtHours(mins: number) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function detectDevice(platform?: string): { label: string; icon: "laptop" | "phone" | "desktop" } {
  if (!platform) return { label: "Unknown", icon: "desktop" };
  const p = platform.toLowerCase();
  if (p.includes("iphone") || p.includes("android") || p.includes("mobile")) return { label: "Mobile", icon: "phone" };
  if (p.includes("mac") || p.includes("win")) return { label: p.includes("mac") ? "Mac" : "Windows", icon: "laptop" };
  return { label: "Desktop", icon: "desktop" };
}

function empName(e: PresenceEmployee) {
  return `${e.firstName} ${e.lastName}`.trim() || e.email || "—";
}
function empInitials(e: PresenceEmployee) {
  return ((e.firstName?.[0] ?? "") + (e.lastName?.[0] ?? "")).toUpperCase() || "?";
}

/* ───── Page ───── */

const TAB_IDS: TabId[] = ["attendance", "progress", "leaves", "payroll"];

export default function InsightsDeskCopyPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: authSession, status: sessionStatus } = useSession();
  const sessionReady = sessionStatus !== "loading";
  const { can: canPerm, isSuperAdmin } = usePermissions();
  const hasTeamAccess = canPerm("attendance_viewTeam") || canPerm("employees_viewAttendance");
  const canViewTeamLeaves = canPerm("leaves_viewTeam");
  const canViewLocation = canPerm("attendance_viewLocation");
  const canViewHolidays = canPerm("holidays_view");
  const canCreateHoliday = canPerm("holidays_create");
  const canToggleRecurring = canPerm("holidays_toggleRecurring");
  const canDeleteHoliday = canPerm("holidays_delete");

  /* ── Active tab ── */
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const t = searchParams.get("tab");
    return t && TAB_IDS.includes(t as TabId) ? (t as TabId) : "attendance";
  });

  /* ── Sidebar: presence data ── */
  const [presence, setPresence] = useState<PresenceEmployee[]>([]);
  const [presenceLoading, setPresenceLoading] = useState(true);
  const [sidebarSearch, setSidebarSearch] = useState("");

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!sessionReady) return;
    setPresenceLoading(true);
    fetch("/api/attendance/presence")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setPresence(Array.isArray(d) ? d : []))
      .catch(() => { setPresence([]); toast.error("Failed to load employees"); })
      .finally(() => setPresenceLoading(false));
  }, [sessionReady]);

  useEffect(() => {
    if (!sessionReady) return;
    const socket = io({ auth: { userId: authSession?.user?.id } });
    socketRef.current = socket;
    socket.emit("join-presence");
    socket.on("presence", () => {
      fetch("/api/attendance/presence")
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then((d) => setPresence(Array.isArray(d) ? d : []))
        .catch(() => {});
    });
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [sessionReady, authSession?.user?.id]);

  const filteredPresence = useMemo(() => {
    if (!sidebarSearch.trim()) return presence;
    const q = sidebarSearch.toLowerCase();
    return presence.filter((e) =>
      empName(e).toLowerCase().includes(q) ||
      (e.department ?? "").toLowerCase().includes(q) ||
      (e.designation ?? "").toLowerCase().includes(q)
    );
  }, [presence, sidebarSearch]);

  const deptGroups = useMemo(() => {
    const grouped = new Map<string, { dept: string; deptId: string | null; employees: PresenceEmployee[] }>();
    const ungrouped: PresenceEmployee[] = [];
    for (const emp of filteredPresence) {
      if (emp.department) {
        const key = emp.departmentId || emp.department;
        const ex = grouped.get(key);
        if (ex) ex.employees.push(emp);
        else grouped.set(key, { dept: emp.department, deptId: emp.departmentId, employees: [emp] });
      } else ungrouped.push(emp);
    }
    const groups = [...grouped.values()].sort((a, b) => a.dept.localeCompare(b.dept));
    if (ungrouped.length > 0) groups.push({ dept: "Unassigned", deptId: null, employees: ungrouped });
    for (const g of groups) g.employees.sort((a, b) => empName(a).localeCompare(empName(b)));
    return groups;
  }, [filteredPresence]);

  /* ── Attendance state (exact clone from original) ── */
  const [teamSummary, setTeamSummary] = useState<TeamMonthlySummary[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [viewingUserId, setViewingUserId] = useState(() => searchParams.get("emp") || "");
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(() => searchParams.get("dept") || null);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(() => { const y = parseInt(searchParams.get("year") || "", 10); return y > 2000 && y < 2100 ? y : new Date().getFullYear(); });
  const [month, setMonth] = useState(() => { const m = parseInt(searchParams.get("month") || "", 10); return m >= 1 && m <= 12 ? m : new Date().getMonth() + 1; });
  const [selectedDay, setSelectedDay] = useState<number | null>(() => { const d = parseInt(searchParams.get("day") || "", 10); return d >= 1 && d <= 31 ? d : null; });
  const [payrollTab, setPayrollTab] = useState(() => searchParams.get("payrollTab") || "");
  const [leavesTab, setLeavesTab] = useState(() => searchParams.get("leavesTab") || "");
  const [detailData, setDetailData] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null);
  const [teamDateData, setTeamDateData] = useState<TeamDateRecord[]>([]);
  const [teamDateLoading, setTeamDateLoading] = useState(false);
  const [calendarHolidays, setCalendarHolidays] = useState<{ date: string }[]>([]);
  const [calendarLeaves, setCalendarLeaves] = useState<LeaveRecord[]>([]);
  const [leaveBalance, setLeaveBalance] = useState<{ total: number; used: number; remaining: number } | null>(null);

  const isAggregateMode = hasTeamAccess && !viewingUserId;

  /* ── Sync state → URL query params ── */
  useEffect(() => {
    const now = new Date();
    const defaultYear = now.getFullYear();
    const defaultMonth = now.getMonth() + 1;
    const params = new URLSearchParams();
    if (activeTab !== "attendance") params.set("tab", activeTab);
    if (viewingUserId) params.set("emp", viewingUserId);
    if (selectedDeptId) params.set("dept", selectedDeptId);
    if (year !== defaultYear || month !== defaultMonth) { params.set("year", String(year)); params.set("month", String(month)); }
    if (selectedDay !== null) params.set("day", String(selectedDay));
    if (payrollTab) params.set("payrollTab", payrollTab);
    if (leavesTab) params.set("leavesTab", leavesTab);
    const qs = params.toString();
    const target = qs ? `?${qs}` : window.location.pathname;
    if (window.location.search !== (qs ? `?${qs}` : "")) {
      router.replace(target, { scroll: false });
    }
  }, [activeTab, viewingUserId, selectedDeptId, year, month, selectedDay, payrollTab, leavesTab, router]);

  /* ── Data loaders (exact clone) ── */
  const loadTeamSummary = useCallback(async () => {
    if (!sessionReady) return;
    if (!hasTeamAccess) { setTeamLoading(false); return; }
    setTeamLoading(true);
    try {
      const r = await fetch(`/api/attendance?type=team-monthly&year=${year}&month=${month}`);
      if (!r.ok) throw new Error();
      const res = await r.json();
      setTeamSummary(Array.isArray(res) ? res : []);
    } catch { setTeamSummary([]); toast.error("Failed to load team summary"); }
    setTeamLoading(false);
  }, [sessionReady, hasTeamAccess, year, month]);

  const loadRecords = useCallback(async (signal?: AbortSignal) => {
    if (!sessionReady) return;
    if (!viewingUserId && hasTeamAccess) { setRecords([]); setLoading(false); return; }
    setLoading(true);
    try {
      const qs = `type=daily&year=${year}&month=${month}${viewingUserId ? `&userId=${viewingUserId}` : ""}`;
      const r = await fetch(`/api/attendance?${qs}`, { signal });
      if (!r.ok) throw new Error();
      const res = await r.json();
      setRecords(Array.isArray(res) ? res : []);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setRecords([]); toast.error("Failed to load records");
    }
    setLoading(false);
  }, [sessionReady, year, month, viewingUserId, hasTeamAccess]);

  const loadMonthlyStats = useCallback(async (signal?: AbortSignal) => {
    if (!sessionReady) return;
    if (!viewingUserId && hasTeamAccess) { setMonthlyStats(null); return; }
    const qs = `type=monthly&year=${year}&month=${month}${viewingUserId ? `&userId=${viewingUserId}` : ""}`;
    try {
      const r = await fetch(`/api/attendance?${qs}`, { signal });
      if (!r.ok) throw new Error();
      const res = await r.json();
      setMonthlyStats(res ?? null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setMonthlyStats(null); toast.error("Failed to load monthly stats");
    }
  }, [sessionReady, year, month, viewingUserId, hasTeamAccess]);

  const loadDetail = useCallback(async (day: number, signal?: AbortSignal) => {
    setDetailLoading(true);
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const qs = `type=detail&date=${dateStr}${viewingUserId ? `&userId=${viewingUserId}` : ""}`;
    try {
      const r = await fetch(`/api/attendance?${qs}`, { signal });
      if (!r.ok) throw new Error();
      const res = await r.json();
      setDetailData(res ?? null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setDetailData(null); toast.error("Failed to load day details");
    }
    setDetailLoading(false);
  }, [year, month, viewingUserId]);

  const loadTeamDate = useCallback(async (day: number, signal?: AbortSignal) => {
    if (!hasTeamAccess) return;
    setTeamDateLoading(true);
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    try {
      const r = await fetch(`/api/attendance?type=team-date&date=${dateStr}`, { signal });
      if (!r.ok) throw new Error();
      const res = await r.json();
      setTeamDateData(Array.isArray(res) ? res : []);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setTeamDateData([]); toast.error("Failed to load team data");
    }
    setTeamDateLoading(false);
  }, [hasTeamAccess, year, month]);

  /* ── Effects (exact clone) ── */
  useEffect(() => { if (activeTab === "attendance") loadTeamSummary(); }, [activeTab, loadTeamSummary]);
  useEffect(() => {
    if (activeTab !== "attendance") {
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    loadRecords(ac.signal);
    loadMonthlyStats(ac.signal);
    return () => ac.abort();
  }, [activeTab, loadRecords, loadMonthlyStats]);

  useEffect(() => {
    if (activeTab !== "attendance") return;
    const selfId = authSession?.user?.id;
    const isSelf = !viewingUserId || viewingUserId === selfId;
    if (!isSelf && !canViewTeamLeaves) { setCalendarLeaves([]); return; }
    const q = new URLSearchParams({ year: String(year), month: String(month), status: "approved" });
    if (viewingUserId) q.set("userId", viewingUserId);
    else if (selfId) q.set("userId", selfId);
    const ac = new AbortController();
    fetch(`/api/leaves?${q}`, { signal: ac.signal })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: LeaveRecord[]) => setCalendarLeaves(Array.isArray(data) ? data : []))
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setCalendarLeaves([]); toast.error("Failed to load leaves");
      });
    return () => ac.abort();
  }, [activeTab, year, month, viewingUserId, canViewTeamLeaves, authSession?.user?.id]);

  useEffect(() => {
    if (activeTab !== "attendance") return;
    fetch(`/api/payroll/holidays?year=${year}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => setCalendarHolidays(Array.isArray(data) ? data : []))
      .catch(() => { setCalendarHolidays([]); toast.error("Failed to load holidays"); });
  }, [activeTab, year]);

  useEffect(() => {
    if (activeTab !== "attendance" || !sessionReady || isSuperAdmin) { setLeaveBalance(null); return; }
    const uid = viewingUserId || authSession?.user?.id;
    if (!uid) return;
    if (viewingUserId && viewingUserId !== authSession?.user?.id && !canViewTeamLeaves) { setLeaveBalance(null); return; }
    const q = new URLSearchParams({ year: String(new Date().getFullYear()) });
    if (viewingUserId) q.set("userId", viewingUserId);
    const ac = new AbortController();
    fetch(`/api/leaves/balance?${q}`, { signal: ac.signal })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => setLeaveBalance(data?.exempt ? null : data))
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setLeaveBalance(null); toast.error("Failed to load leave balance");
      });
    return () => ac.abort();
  }, [activeTab, sessionReady, isSuperAdmin, viewingUserId, canViewTeamLeaves, authSession?.user?.id]);

  const mountRef = useRef(true);
  useEffect(() => {
    if (mountRef.current) { mountRef.current = false; return; }
    setSelectedDay(null); setDetailData(null); setTeamDateData([]);
  }, [year, month, viewingUserId]);

  useEffect(() => {
    if (selectedDay === null) { setDetailData(null); setTeamDateData([]); return; }
    const ac = new AbortController();
    if (isAggregateMode) loadTeamDate(selectedDay, ac.signal);
    else loadDetail(selectedDay, ac.signal);
    return () => ac.abort();
  }, [selectedDay, isAggregateMode, loadDetail, loadTeamDate]);

  /* ── Derived state (exact clone) ── */
  const filteredSummary = teamSummary;

  const viewingMember = teamSummary.find((m) => m._id === viewingUserId);

  const recordMap = useMemo(() => {
    const map = new Map<number, DailyRecord>();
    records.forEach((r) => map.set(new Date(r.date).getUTCDate(), r));
    return map;
  }, [records]);

  const filteredTeamDate = teamDateData;

  const holidayDays = useMemo(() => {
    const days = new Set<number>();
    for (const h of calendarHolidays) {
      const d = new Date(h.date);
      if (d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month) days.add(d.getUTCDate());
    }
    return days;
  }, [calendarHolidays, year, month]);

  const leaveDays = useMemo(() => {
    const days = new Set<number>();
    for (const l of calendarLeaves) {
      const s = new Date(l.startDate);
      const e = new Date(l.endDate);
      const cur = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
      const end = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()));
      while (cur <= end) {
        if (cur.getUTCFullYear() === year && cur.getUTCMonth() + 1 === month) days.add(cur.getUTCDate());
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }
    return days;
  }, [calendarLeaves, year, month]);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  function prevMonth() { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  const aggPresentDays = filteredSummary.reduce((s, e) => s + e.presentDays, 0);
  const aggOnTimeDays = filteredSummary.reduce((s, e) => s + e.onTimeDays, 0);
  const aggTotalMins = filteredSummary.reduce((s, e) => s + e.totalMinutes, 0);
  const aggAvgDaily = filteredSummary.length > 0 ? filteredSummary.reduce((s, e) => s + e.averageDailyHours, 0) / filteredSummary.length : 0;
  const aggAvgOnTime = filteredSummary.length > 0 ? filteredSummary.reduce((s, e) => s + e.onTimePercentage, 0) / filteredSummary.length : 0;
  const aggAvgAttendance = filteredSummary.length > 0 ? filteredSummary.reduce((s, e) => s + e.attendancePercentage, 0) / filteredSummary.length : 0;
  const aggLateDays = filteredSummary.reduce((s, e) => s + e.lateDays, 0);
  const aggLateToOfficeDays = filteredSummary.reduce((s, e) => s + e.lateToOfficeDays, 0);

  const selectedDate = selectedDay ? new Date(year, month - 1, selectedDay) : null;
  const isSelectedToday = selectedDay !== null && isCurrentMonth && selectedDay === today.getDate();
  const teamDatePresent = filteredTeamDate.filter((e) => e.isPresent).length;
  const teamDateLate = filteredTeamDate.filter((e) => e.isPresent && !e.isOnTime).length;
  const teamDateAvgMins = teamDatePresent > 0 ? Math.round(filteredTeamDate.filter((e) => e.isPresent).reduce((s, e) => s + e.totalWorkingMinutes, 0) / teamDatePresent) : 0;
  const teamDateEarliestIn = useMemo(() => {
    const starts = filteredTeamDate.filter((e) => e.firstStart).map((e) => new Date(e.firstStart!).getTime());
    return starts.length > 0 ? new Date(Math.min(...starts)).toISOString() : null;
  }, [filteredTeamDate]);
  const teamDateLatestOut = useMemo(() => {
    const ends = filteredTeamDate.filter((e) => e.lastEnd).map((e) => new Date(e.lastEnd!).getTime());
    return ends.length > 0 ? new Date(Math.max(...ends)).toISOString() : null;
  }, [filteredTeamDate]);
  const teamDateExtras = useMemo(() => {
    const present = filteredTeamDate.filter((e) => e.isPresent);
    const pctPresent = filteredTeamDate.length > 0 ? Math.round((present.length / filteredTeamDate.length) * 100) : 0;
    const totalMins = present.reduce((s, e) => s + e.totalWorkingMinutes, 0);
    const totalOfficeMins = present.reduce((s, e) => s + (e.officeMinutes ?? 0), 0);
    const totalRemoteMins = present.reduce((s, e) => s + (e.remoteMinutes ?? 0), 0);
    const lateList = present.filter((e) => (e.lateBy ?? 0) > 0);
    const avgLateBy = lateList.length > 0 ? Math.round(lateList.reduce((s, e) => s + (e.lateBy ?? 0), 0) / lateList.length) : 0;
    let mostHoursName = "", leastHoursName = "", mostHoursMins = 0, leastHoursMins = Infinity;
    for (const e of present) {
      if (e.totalWorkingMinutes > mostHoursMins) { mostHoursMins = e.totalWorkingMinutes; mostHoursName = e.name; }
      if (e.totalWorkingMinutes < leastHoursMins) { leastHoursMins = e.totalWorkingMinutes; leastHoursName = e.name; }
    }
    if (!present.length) leastHoursMins = 0;
    const lateToOffice = present.filter((e) => e.isLateToOffice).length;
    const onTimePct = present.length > 0 ? Math.round((present.filter((e) => e.isOnTime).length / present.length) * 100) : 0;
    return { pctPresent, totalMins, totalOfficeMins, totalRemoteMins, avgLateBy, mostHoursName, leastHoursName, mostHoursMins, leastHoursMins, lateToOffice, onTimePct };
  }, [filteredTeamDate]);


  /* ── Holidays modal state ── */
  const [holidaysOpen, setHolidaysOpen] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidaysLoading, setHolidaysLoading] = useState(false);
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formRecurring, setFormRecurring] = useState(false);
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [holidayTogglingId, setHolidayTogglingId] = useState<string | null>(null);
  const [holidayDeleteTarget, setHolidayDeleteTarget] = useState<Holiday | null>(null);
  const [holidayDeleting, setHolidayDeleting] = useState(false);
  const displayYear = new Date().getFullYear();

  const fetchHolidays = useCallback(async () => {
    setHolidaysLoading(true);
    try {
      const res = await fetch(`/api/payroll/holidays?year=${displayYear}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setHolidays(Array.isArray(data) ? data : []);
    } catch { setHolidays([]); toast.error("Failed to load holidays"); }
    setHolidaysLoading(false);
  }, [displayYear]);

  useEffect(() => { if (canViewHolidays) fetchHolidays(); }, [canViewHolidays, fetchHolidays]);
  useEffect(() => { if (holidaysOpen) fetchHolidays(); }, [holidaysOpen, fetchHolidays]);

  async function handleAddHoliday() {
    if (!formName.trim() || !formDate) return;
    setHolidaySaving(true);
    try {
      const res = await fetch("/api/payroll/holidays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: formName.trim(), date: formDate, isRecurring: formRecurring }) });
      if (res.ok) { toast.success("Holiday added"); setFormName(""); setFormDate(""); setFormRecurring(false); setShowHolidayForm(false); await fetchHolidays(); }
      else { const d = await res.json(); toast.error(d.error || "Failed to add holiday"); }
    } catch { toast.error("Something went wrong"); }
    setHolidaySaving(false);
  }

  async function handleToggleRecurring(h: Holiday) {
    setHolidayTogglingId(h._id);
    const newVal = !h.isRecurring;
    setHolidays((prev) => prev.map((x) => x._id === h._id ? { ...x, isRecurring: newVal } : x));
    try {
      const res = await fetch("/api/payroll/holidays", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: h._id, isRecurring: newVal }) });
      if (res.ok) { toast.success("Holiday updated"); }
      else { setHolidays((prev) => prev.map((x) => x._id === h._id ? { ...x, isRecurring: !newVal } : x)); toast.error("Failed to update"); }
    } catch { setHolidays((prev) => prev.map((x) => x._id === h._id ? { ...x, isRecurring: !newVal } : x)); toast.error("Something went wrong"); }
    setHolidayTogglingId(null);
  }

  async function handleDeleteHoliday() {
    if (!holidayDeleteTarget) return;
    setHolidayDeleting(true);
    try {
      const res = await fetch(`/api/payroll/holidays?id=${holidayDeleteTarget._id}`, { method: "DELETE" });
      if (res.ok) { toast.success("Holiday removed"); setHolidayDeleteTarget(null); setHolidays((prev) => prev.filter((x) => x._id !== holidayDeleteTarget._id)); }
      else toast.error("Failed to remove holiday");
    } catch { toast.error("Something went wrong"); }
    setHolidayDeleting(false);
  }

  const upcomingHolidays = useMemo(() => holidays.filter((h) => new Date(h.date) >= new Date()), [holidays]);


  /* ────────────────── RENDER ────────────────── */

  const statusColor = (s: string) => s === "office" ? "var(--status-office)" : s === "remote" ? "var(--status-remote)" : "var(--fg-tertiary)";

  return (
    <div className="flex flex-col" style={{ height: "calc(93dvh - 80px)" }}>
      {/* Header */}
      <div className="mb-3 shrink-0 flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-bold" style={{ color: "var(--fg)" }}>Insights Desk</h1>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {canViewHolidays && (
            <motion.button type="button" onClick={() => setHolidaysOpen(true)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg)" }}>
              <svg className="h-3.5 w-3.5" style={{ color: "var(--purple)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              Holidays
              {upcomingHolidays.length > 0 && !holidaysOpen && (
                <span className="ml-0.5 rounded-full px-2 py-0.5 text-[12px] font-bold text-white" style={{ background: "var(--purple)" }}>
                  {upcomingHolidays.length}
                </span>
              )}
            </motion.button>
          )}
        </div>
      </div>

      {/* Main layout: Sidebar + Content */}
      <div className="flex min-h-0 flex-1 gap-4">

        {/* ═══ Left Sidebar ═══ */}
        <aside className="hidden sm:flex w-[280px] shrink-0 flex-col gap-3 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          <div className="shrink-0 p-2.5 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" /></svg>
              <input type="text" value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} placeholder="Search employees…"
                className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-[12px] outline-none transition-colors focus:border-[var(--primary)]"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--fg)" }}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {presenceLoading ? (
              <div className="space-y-2 p-3">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="flex items-center gap-2.5 px-3 py-1.5"><div className="shimmer h-7 w-7 rounded-full shrink-0" /><div className="flex-1 min-w-0 space-y-1"><div className="shimmer h-3 w-20 rounded" /><div className="shimmer h-2.5 w-28 rounded" /></div><div className="shrink-0 flex items-center gap-1.5"><div className="shimmer h-2.5 w-8 rounded" /><div className="shimmer h-2 w-2 rounded-full" /></div></div>)}</div>
            ) : (
              <>
                {!sidebarSearch && (
                  <button type="button" onClick={() => { setViewingUserId(""); setSelectedDeptId(null); }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${!viewingUserId && !selectedDeptId ? "bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]" : "hover:bg-[var(--hover-bg)]"}`}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary)" }}>All</span>
                    <span className="text-[12px] font-semibold" style={{ color: !viewingUserId && !selectedDeptId ? "var(--primary)" : "var(--fg-secondary)" }}>All Employees</span>
                  </button>
                )}
                {!sidebarSearch && presence.length > 0 && <div className="mx-3 my-1 border-b" style={{ borderColor: "var(--border)" }} />}
                {deptGroups.map((g) => {
                  const deptKey = g.deptId || g.dept;
                  const isDeptSel = selectedDeptId === deptKey;
                  const isDeptCollapsed = selectedDeptId !== null && !isDeptSel;
                  return (
                  <div key={g.dept}>
                    <button type="button" onClick={() => setSelectedDeptId((prev) => prev === deptKey ? null : deptKey)}
                      className="flex w-full items-center gap-1.5 px-2 py-1 transition-colors rounded-md hover:bg-[var(--hover-bg)]"
                      style={{ background: isDeptSel ? "color-mix(in srgb, var(--primary) 6%, transparent)" : "transparent" }}>
                      <svg className="h-2.5 w-2.5 shrink-0 transition-transform" style={{ color: "var(--fg-tertiary)", transform: isDeptCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M19 9l-7 7-7-7" /></svg>
                      <span className="text-[10px] font-bold uppercase tracking-wider flex-1 text-left" style={{ color: isDeptSel ? "var(--primary)" : "var(--fg-tertiary)" }}>{g.dept} ({g.employees.length})</span>
                    </button>
                    {!isDeptCollapsed && g.employees.map((emp) => {
                      const isSel = viewingUserId === emp._id;
                      const sc = statusColor(emp.status);
                      return (
                        <button key={emp._id} type="button" onClick={() => setViewingUserId(emp._id)}
                          className="flex w-full items-center gap-2.5 px-3 py-1.5 pl-4 text-left transition-colors"
                          style={{ background: isSel ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent" }}>
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: avatarColor(emp._id) }}>{empInitials(emp)}</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-[12px] font-semibold truncate block" style={{ color: isSel ? "var(--primary)" : "var(--fg)" }}>{empName(emp)}</span>
                            <span className="text-[10px] truncate block" style={{ color: "var(--fg-tertiary)" }}>{emp.designation || emp.department || "—"}</span>
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5">
                            {emp.todayMinutes > 0 && <span className="text-[10px] font-semibold tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{fmtHours(emp.todayMinutes)}</span>}
                            <span className="relative flex h-2 w-2">
                              {emp.isLive && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ background: sc }} />}
                              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: sc }} />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  );
                })}
                {filteredPresence.length === 0 && sidebarSearch && <p className="px-3 py-4 text-center text-[10px]" style={{ color: "var(--fg-tertiary)" }}>No matches</p>}
              </>
            )}
          </div>
          </div>
          <div className="shrink-0 rounded-xl border px-1.5 py-1.5 space-y-1" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
            {/* ── Coming up ── */}
            {upcomingHolidays.length > 0 && (
              <button type="button" onClick={() => setHolidaysOpen(true)} className="flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--hover-bg)]" style={{ background: "color-mix(in srgb, var(--purple) 6%, transparent)" }}>
                <div className="flex items-center gap-1.5">
                  <svg className="h-3 w-3 shrink-0" style={{ color: "var(--purple)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--purple)" }}>Coming up</span>
                  {upcomingHolidays.length > 1 && <span className="ml-auto shrink-0 text-[10px] font-semibold" style={{ color: "var(--purple)" }}>+{upcomingHolidays.length - 1}</span>}
                </div>
                <div className="flex items-baseline justify-between gap-2 pl-[18px]">
                  <span className="text-[11px] font-semibold truncate" style={{ color: "var(--fg)" }}>{upcomingHolidays[0].name}</span>
                  <span className="shrink-0 text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{(() => {
                    const d = Math.ceil((new Date(upcomingHolidays[0].date).getTime() - Date.now()) / 86400_000);
                    const dateStr = new Date(upcomingHolidays[0].date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
                    return d <= 0 ? `${dateStr} · Today` : d === 1 ? `${dateStr} · Tomorrow` : `${dateStr} · ${d}d`;
                  })()}</span>
                </div>
              </button>
            )}
            {/* ── Clear date ── */}
            {selectedDay !== null && activeTab === "attendance" && (
              <button type="button" onClick={() => setSelectedDay(null)}
                className="flex w-full items-center justify-center gap-1 rounded-lg py-1 text-[10px] font-semibold transition-colors hover:bg-[var(--hover-bg)]"
                style={{ color: "var(--fg-tertiary)" }}>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
                Clear date
              </button>
            )}
            {/* ── Calendar ── */}
            <MiniCalendar compact year={year} month={month} onPrevMonth={prevMonth} onNextMonth={nextMonth} selectedDay={selectedDay} onSelectDay={setSelectedDay}
              getDayMeta={(day) => {
                const rec = recordMap.get(day);
                const isHoliday = holidayDays.has(day);
                const isLeave = leaveDays.has(day);
                let dotColor = "transparent";
                if (!isAggregateMode) {
                  if (rec?.isPresent) dotColor = rec.isOnTime ? "var(--status-ontime)" : "var(--status-late)";
                  else if (rec) dotColor = "var(--status-absent)";
                }
                return { dotColor, isHoliday, isLeave };
              }}
              showLegend={sessionReady}
              legendItems={[
                ...(!isAggregateMode ? [
                  { label: "On Time", color: "var(--status-ontime)" },
                  { label: "Late", color: "var(--status-late)" },
                  { label: "Absent", color: "var(--status-absent)" },
                ] : []),
                ...(holidayDays.size > 0 ? [{ label: "Holiday", color: "var(--purple)" }] : []),
                ...(leaveDays.size > 0 ? [{ label: "Leave", color: "var(--teal)" }] : []),
              ]}
            />
          </div>
        </aside>

        {/* ═══ Content Area ═══ */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
          {/* Tab bar */}
          <div className="shrink-0 flex items-center w-fit rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
            {TAB_ITEMS.map((t) => {
              const isAct = activeTab === t.id;
              return (
                <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                  className="relative flex items-center justify-center gap-1.5 whitespace-nowrap px-5 py-2 transition-colors"
                  style={{ color: isAct ? t.color : "var(--fg-tertiary)" }}>
                  {isAct && <motion.span layoutId="insights-tab-active" className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: t.color }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />}
                  <svg className="relative h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isAct ? 2 : 1.5}><path strokeLinecap="round" strokeLinejoin="round" d={t.icon} /></svg>
                  <span className="relative text-[10px] font-semibold">{t.label}</span>
                </button>
              );
            })}
          </div>
          {/* Content body */}
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          {activeTab === "attendance" && (
          <div className="flex flex-1 flex-col overflow-y-auto p-3">
          <div className="flex flex-col gap-3">

            {/* Detail panel (right panel from original, now full width since calendar is in sidebar) */}
            <div className="lg:max-h-[min(70vh,600px)]">
              <AnimatePresence mode="wait">
                {isAggregateMode && selectedDay !== null ? (
                  <motion.div key={`team-date-${selectedDay}`} className="rounded-xl border flex flex-col overflow-hidden" style={{ background: "var(--bg)", borderColor: "var(--border)" }}
                    initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 400, damping: 28 }}>
                    <div className="shrink-0 px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>{selectedDate?.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</h3>
                          <p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>
                            {teamDatePresent} present · {teamDateLate} late · {filteredTeamDate.length - teamDatePresent} absent
                            {teamDateAvgMins > 0 && <> · avg {fmtHours(teamDateAvgMins)}</>}
                            {teamDateEarliestIn && <> · first in {fmtTime(teamDateEarliestIn)}</>}
                            {teamDateLatestOut && <> · last out {fmtTime(teamDateLatestOut)}</>}
                          </p>
                          {!teamDateLoading && filteredTeamDate.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: "color-mix(in srgb, var(--status-present) 10%, transparent)", color: "var(--status-present)" }}>{teamDateExtras.pctPresent}% present</span>
                              {teamDatePresent > 0 && <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--primary)" }}>{teamDateExtras.onTimePct}% on-time</span>}
                              {teamDateExtras.totalMins > 0 && <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>team {fmtHours(teamDateExtras.totalMins)} total</span>}
                            </div>
                          )}
                        </div>
                        <button type="button" onClick={() => setSelectedDay(null)} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-tertiary)" }}>
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                    {teamDateLoading ? (
                      <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <div key={i} className="rounded-xl p-3 space-y-2" style={{ background: "var(--bg-grouped)" }}><div className="flex items-center gap-3"><div className="shimmer h-2.5 w-2.5 rounded-full shrink-0" /><div className="flex-1 min-w-0 space-y-1"><div className="shimmer h-3 w-28 rounded" /><div className="shimmer h-2.5 w-20 rounded" /></div><div className="shrink-0 space-y-1 text-right"><div className="shimmer h-3 w-10 rounded ml-auto" /><div className="shimmer h-5 w-14 rounded-full ml-auto" /></div></div><div className="grid grid-cols-2 gap-x-3 gap-y-1"><div className="shimmer h-3 w-full rounded" /><div className="shimmer h-3 w-full rounded" /><div className="shimmer h-3 w-full rounded" /><div className="shimmer h-3 w-full rounded" /></div></div>)}</div>
                    ) : (
                      <div className="space-y-2 p-4 max-h-[50vh] overflow-y-auto">
                        {filteredTeamDate.length === 0 ? (
                          <p className="py-8 text-center text-[12px]" style={{ color: "var(--fg-secondary)" }}>No employee data for this date</p>
                        ) : filteredTeamDate.map((emp, idx) => {
                          const sc = emp.isPresent ? (emp.isOnTime ? "var(--status-ontime)" : "var(--status-late)") : "var(--status-absent)";
                          return (
                            <motion.div key={emp._id} className="rounded-xl p-3 space-y-2" style={{ background: "var(--bg-grouped)" }}
                              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: Math.min(idx * 0.04, 0.3) }}>
                              <div className="flex items-center gap-3">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: sc }} />
                                <div className="min-w-0 flex-1">
                                  <p className="text-[12px] font-semibold truncate" style={{ color: "var(--fg)" }}>{emp.name}</p>
                                  <p className="text-[12px] truncate" style={{ color: "var(--fg-tertiary)" }}>{emp.department}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>{fmtHours(emp.totalWorkingMinutes)}</p>
                                  <span className="rounded-full px-1.5 py-0.5 text-[12px] font-medium" style={{ background: `color-mix(in srgb, ${sc} 15%, transparent)`, color: sc }}>{emp.isPresent ? (emp.isOnTime ? "On Time" : "Late") : "Absent"}</span>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]" style={{ color: "var(--fg-tertiary)" }}>
                                <div className="flex justify-between"><span className="font-semibold">Clock in</span><span>{fmtTime(emp.firstStart)}</span></div>
                                <div className="flex justify-between"><span className="font-semibold">Clock out</span><span>{fmtTime(emp.lastEnd)}</span></div>
                                <div className="flex justify-between"><span className="font-semibold">Office entry</span><span>{fmtTime(emp.firstOfficeEntry)}</span></div>
                                <div className="flex justify-between"><span className="font-semibold">Office exit</span><span>{fmtTime(emp.lastOfficeExit)}</span></div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                ) : !isAggregateMode && selectedDay !== null ? (
                  <motion.div key={`detail-${selectedDay}`} className="rounded-xl border flex flex-col overflow-hidden" style={{ background: "var(--bg)", borderColor: "var(--border)" }}
                    initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 400, damping: 28 }}>
                    <div className="shrink-0 px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                      <div>
                        <h3 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>{selectedDate?.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</h3>
                        {isSelectedToday && <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--primary)" }}>Today</span>}
                      </div>
                      <button type="button" onClick={() => setSelectedDay(null)} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-tertiary)" }}>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    {detailLoading ? (
                      <div className="space-y-3 p-3">
                        <div className="flex flex-wrap items-center gap-2"><div className="shimmer h-6 w-20 rounded-full" /><div className="shimmer h-6 w-24 rounded-full" /><div className="shimmer h-6 w-16 rounded-full" /></div>
                        <div className="shimmer h-3 w-3/4 rounded" />
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">{[1, 2, 3, 4].map((i) => <div key={i} className="shimmer h-12 rounded-xl" />)}</div>
                        <div className="grid grid-cols-3 gap-1.5">{[1, 2, 3].map((i) => <div key={i} className="shimmer h-12 rounded-xl" />)}</div>
                        <div className="space-y-1.5"><div className="shimmer h-2.5 w-20 rounded" /><div className="shimmer h-2.5 w-full rounded-full" /><div className="flex gap-3"><div className="shimmer h-2.5 w-16 rounded" /><div className="shimmer h-2.5 w-16 rounded" /></div></div>
                      </div>
                    ) : detailData ? (() => {
                      const sorted = [...(detailData.activitySessions ?? [])].sort((a, b) => new Date(a.sessionTime.start).getTime() - new Date(b.sessionTime.start).getTime());
                      const clockIn = sorted[0]?.sessionTime.start ?? detailData.firstStart;
                      const lastSess = sorted[sorted.length - 1];
                      const clockOut = lastSess?.sessionTime.end ?? lastSess?.lastActivity ?? detailData.lastEnd;
                      return (
                        <div className="overflow-y-auto p-3 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Pill color={detailData.isPresent ? (detailData.isOnTime ? "var(--status-ontime)" : "var(--status-late)") : "var(--status-absent)"} label={detailData.isPresent ? (detailData.isOnTime ? "On Time" : "Late") : "Absent"} />
                            {(detailData.lateBy ?? 0) > 0 && <Pill color="var(--status-late)" label={`Late by ${fmtHours(detailData.lateBy!)}`} variant="outline" />}
                            {detailData.isLateToOffice && (detailData.lateToOfficeBy ?? 0) > 0 && <Pill color="var(--status-absent)" label={`Late to office by ${fmtHours(detailData.lateToOfficeBy!)}`} variant="outline" />}
                            {(detailData.breakMinutes ?? 0) > 0 && <Pill color="var(--fg-tertiary)" label={`${fmtHours(detailData.breakMinutes!)} break`} variant="outline" />}
                            <Pill color="var(--fg-tertiary)" label={`${detailData.activitySessions?.length ?? 0} session${(detailData.activitySessions?.length ?? 0) !== 1 ? "s" : ""}`} variant="outline" />
                          </div>
                          <p className="text-[12px]" style={{ color: "var(--fg-secondary)" }}>
                            {detailData.isPresent
                              ? `Worked ${fmtHours(detailData.totalWorkingMinutes)} across ${detailData.activitySessions?.length ?? 0} session${(detailData.activitySessions?.length ?? 0) !== 1 ? "s" : ""}${detailData.officeMinutes > 0 && detailData.remoteMinutes > 0 ? " — split between office and remote" : detailData.officeMinutes > 0 ? " — from office" : " — remotely"}`
                              : "No work sessions recorded for this day"}
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            <StatChip label="Clock in" value={fmtTime(clockIn)} color="var(--primary)" />
                            <StatChip label="Clock out" value={fmtTime(clockOut)} color="var(--primary)" />
                            <StatChip label="Office entry" value={fmtTime(detailData.firstOfficeEntry)} color="var(--status-office)" />
                            <StatChip label="Office exit" value={fmtTime(detailData.lastOfficeExit)} color="var(--status-office)" />
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <StatChip label="Total hours" value={fmtHours(detailData.totalWorkingMinutes)} color="var(--primary)" />
                            <StatChip label="Office hours" value={fmtHours(detailData.officeMinutes)} color="var(--status-office)" />
                            <StatChip label="Remote hours" value={fmtHours(detailData.remoteMinutes)} color="var(--status-remote)" />
                          </div>
                          {detailData.totalWorkingMinutes > 0 && (
                            <div>
                              <div className="mb-1.5 flex justify-between text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                                <span>Work Split</span>
                                <span>{fmtTime(clockIn)} → {fmtTime(clockOut)}</span>
                              </div>
                              <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                                {detailData.officeMinutes > 0 && <motion.div className="h-full" style={{ background: "var(--status-office)" }} initial={{ width: 0 }} animate={{ width: `${(detailData.officeMinutes / detailData.totalWorkingMinutes) * 100}%` }} transition={{ duration: 0.6, delay: 0.15 }} />}
                                {detailData.remoteMinutes > 0 && <motion.div className="h-full" style={{ background: "var(--status-remote)" }} initial={{ width: 0 }} animate={{ width: `${(detailData.remoteMinutes / detailData.totalWorkingMinutes) * 100}%` }} transition={{ duration: 0.6, delay: 0.25 }} />}
                              </div>
                              <div className="mt-1.5 flex gap-3 text-[12px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
                                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--status-office)" }} />Office {Math.round((detailData.officeMinutes / detailData.totalWorkingMinutes) * 100)}%</span>
                                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--status-remote)" }} />Remote {Math.round((detailData.remoteMinutes / detailData.totalWorkingMinutes) * 100)}%</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })() : (
                      <div className="flex flex-col items-center justify-center p-3 py-8 text-center">
                        <p className="text-[12px] font-medium" style={{ color: "var(--fg-secondary)" }}>{isSelectedToday ? "No data yet — session in progress" : "No attendance recorded"}</p>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div key={isAggregateMode ? "agg-summary" : "ind-summary"} className="rounded-xl border flex flex-col overflow-hidden" style={{ background: "var(--bg)", borderColor: "var(--border)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="shrink-0 px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                      <h3 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>{MONTH_NAMES[month - 1]} Summary</h3>
                      {isAggregateMode ? (
                        <p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>{filteredSummary.length} employees · select a date for details</p>
                      ) : (
                        <p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>{viewingMember ? viewingMember.name : "Your attendance"} · select a date for details</p>
                      )}
                    </div>
                    <div className="overflow-y-auto p-2 space-y-1.5">
                      {isAggregateMode ? (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            <StatChip label="Working Days" value={`${aggPresentDays}`} color="var(--status-present)" />
                            <StatChip label="Total Hours" value={fmtHours(aggTotalMins)} color="var(--status-office)" />
                            <StatChip label="Avg hrs/day" value={`${aggAvgDaily.toFixed(1)}h`} color="var(--primary)" />
                            <StatChip label="On-time rate" value={`${Math.round(aggAvgOnTime)}%`} color={aggAvgOnTime >= 80 ? "var(--status-ontime)" : "var(--status-late)"} />
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <StatChip label="Attendance" value={`${Math.round(aggAvgAttendance)}%`} color={aggAvgAttendance >= 90 ? "var(--status-present)" : "var(--status-absent)"} />
                            <StatChip label="On-time days" value={`${aggOnTimeDays}`} color="var(--status-ontime)" />
                            <StatChip label="Late days" value={`${aggLateDays}`} color={aggLateDays > 0 ? "var(--status-late)" : "var(--fg-tertiary)"} />
                          </div>
                          {aggLateToOfficeDays > 0 && <div className="grid grid-cols-3 gap-1.5"><StatChip label="Late to office" value={`${aggLateToOfficeDays}d`} color="var(--status-absent)" /></div>}
                        </>
                      ) : monthlyStats ? (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            <StatChip label="Working Days" value={`${monthlyStats.presentDays}/${monthlyStats.totalWorkingDays}`} color="var(--status-present)" />
                            <StatChip label="Total Hours" value={`${Math.round(monthlyStats.totalWorkingHours)}h`} color="var(--status-office)" />
                            <StatChip label="Avg hrs/day" value={`${(monthlyStats.averageDailyHours ?? 0).toFixed(1)}h`} color="var(--primary)" />
                            <StatChip label="On-time rate" value={`${Math.round(monthlyStats.onTimePercentage)}%`} color={monthlyStats.onTimePercentage >= 80 ? "var(--status-ontime)" : "var(--status-late)"} />
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            <StatChip label="Attendance" value={`${Math.round(monthlyStats.attendancePercentage)}%`} color={monthlyStats.attendancePercentage >= 90 ? "var(--status-present)" : "var(--status-absent)"} />
                            <StatChip label="Absent days" value={`${monthlyStats.absentDays}d`} color={monthlyStats.absentDays > 0 ? "var(--status-absent)" : "var(--fg-tertiary)"} />
                            <StatChip label="On-time" value={`${monthlyStats.onTimeArrivals}`} color="var(--status-ontime)" />
                            <StatChip label="Late" value={`${monthlyStats.lateArrivals}`} color={monthlyStats.lateArrivals > 0 ? "var(--status-late)" : "var(--fg-tertiary)"} />
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <StatChip label="Office hrs" value={`${Math.round(monthlyStats.totalOfficeHours)}h`} color="var(--status-office)" />
                            <StatChip label="Remote hrs" value={`${Math.round(monthlyStats.totalRemoteHours)}h`} color="var(--status-remote)" />
                            {leaveBalance ? (
                              <div className="rounded-xl p-1.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Leaves</p>
                                <p className="text-[12px] font-bold tabular-nums" style={{ color: leaveBalance.remaining > 0 ? "var(--teal)" : "var(--rose)" }}>{leaveBalance.used}/{leaveBalance.total}</p>
                              </div>
                            ) : monthlyStats.averageOfficeInTime ? <StatChip label="Avg entry" value={fmtTime(monthlyStats.averageOfficeInTime)} color="var(--status-office)" /> : null}
                          </div>
                          {(monthlyStats.averageOfficeInTime || monthlyStats.averageOfficeOutTime) && (
                            <div className="grid grid-cols-3 gap-1.5">
                              {leaveBalance && monthlyStats.averageOfficeInTime && <StatChip label="Avg entry" value={fmtTime(monthlyStats.averageOfficeInTime)} color="var(--status-office)" />}
                              {monthlyStats.averageOfficeOutTime && <StatChip label="Avg exit" value={fmtTime(monthlyStats.averageOfficeOutTime)} color="var(--status-office)" />}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <p className="text-[12px] font-medium" style={{ color: "var(--fg-secondary)" }}>No attendance records for this month</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Session timeline — individual mode, date selected */}
            {sessionReady && !isAggregateMode && selectedDay !== null && detailData?.activitySessions && detailData.activitySessions.length > 0 && (
              <motion.div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg)", borderColor: "var(--border)" }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                  <h3 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>Session Timeline</h3>
                </div>
                <div className="relative p-3 pl-8">
                  <div className="absolute left-[18px] top-1 bottom-1 w-[2px] rounded-full" style={{ background: "var(--border)" }} />
                  <motion.div className="space-y-4" initial="hidden" animate="visible" variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } } }}>
                    {[...detailData.activitySessions].sort((a, b) => new Date(a.sessionTime.start).getTime() - new Date(b.sessionTime.start).getTime()).map((sess) => {
                      const device = detectDevice(sess.platform);
                      const statusConf = sess.status === "active" ? { color: "var(--status-present)", label: "Session open" } : sess.status === "timeout" ? { color: "var(--status-late)", label: "Timed out" } : { color: "var(--fg-tertiary)", label: "Session ended" };
                      return (
                        <motion.div key={sess._id} className="relative" variants={{ hidden: { opacity: 0, x: -12 }, visible: { opacity: 1, x: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } } }}>
                          <div className="absolute -left-5 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full" style={{ background: "var(--bg)", border: `2px solid ${sess.location.inOffice ? "var(--status-office)" : "var(--status-remote)"}` }}>
                            {sess.status === "active" && <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--status-present)" }} />}
                          </div>
                          <div className="rounded-xl p-3 transition-colors" style={{ background: "var(--bg-grouped)" }}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>{fmtTime(sess.sessionTime.start)}<span style={{ color: "var(--fg-tertiary)" }}> → </span>{sess.sessionTime.end ? fmtTime(sess.sessionTime.end) : "now"}</span>
                              <span className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" }}>{fmtHours(sess.durationMinutes)}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <Pill color={sess.location.inOffice ? "var(--status-office)" : "var(--status-remote)"} label={sess.location.inOffice ? "In office" : "Remote"} size="sm" />
                              <Pill color={statusConf.color} label={statusConf.label} size="sm" variant="outline" />
                              <Pill color="var(--fg-tertiary)" label={device.label} size="sm" variant="outline" icon={device.icon} />
                              {sess.isFirstOfficeEntry && <Pill color="var(--primary)" label="First office entry" size="sm" />}
                              {sess.isLastOfficeExit && <Pill color="var(--amber)" label="Last office exit" size="sm" />}
                            </div>
                            {sess.status === "active" && sess.lastActivity && <p className="mt-1.5 text-[12px] font-medium" style={{ color: "var(--fg-tertiary)" }}>Last heartbeat {timeAgo(sess.lastActivity)}</p>}
                            {sess.ipAddress && <p className="mt-1 text-[12px] font-medium" style={{ color: "var(--fg-tertiary)" }}>IP {sess.ipAddress}</p>}
                            {canViewLocation && sess.location.latitude != null && sess.location.longitude != null && (
                              <p className="mt-1 text-[12px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
                                <a href={`https://www.google.com/maps?q=${sess.location.latitude},${sess.location.longitude}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline" style={{ color: "var(--primary)" }} onClick={(e) => e.stopPropagation()}>
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                  {sess.location.latitude.toFixed(5)}, {sess.location.longitude.toFixed(5)}
                                </a>
                              </p>
                            )}
                            {sess.officeSegments && sess.officeSegments.length > 0 && (
                              <div className="mt-2.5 border-t pt-2.5" style={{ borderColor: "color-mix(in srgb, var(--border) 60%, transparent)" }}>
                                <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Office Segments</p>
                                <div className="space-y-1">
                                  {sess.officeSegments.map((seg, si) => (
                                    <div key={si} className="flex items-center justify-between text-[12px]">
                                      <div className="flex items-center gap-1.5"><span className="h-1 w-1 rounded-full" style={{ background: "var(--status-office)" }} /><span style={{ color: "var(--fg-secondary)" }}>{fmtTime(seg.entryTime)} → {seg.exitTime ? fmtTime(seg.exitTime) : "now"}</span></div>
                                      <span className="font-semibold" style={{ color: "var(--status-office)" }}>{fmtHours(seg.durationMinutes)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                </div>
              </motion.div>
            )}

            {/* Employee monthly stats cards — aggregate mode */}
            {isAggregateMode && !teamLoading && filteredSummary.length > 0 && (
              <div>
                <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Employee Overview · {filteredSummary.length}</p>
                <motion.div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" initial="hidden" animate="visible" variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.04 } } }}>
                  {filteredSummary.map((emp) => {
                    const attendColor = emp.attendancePercentage >= 90 ? "var(--status-present)" : emp.attendancePercentage >= 70 ? "var(--status-late)" : "var(--status-absent)";
                    const onTimeColor = emp.onTimePercentage >= 80 ? "var(--status-ontime)" : emp.onTimePercentage >= 50 ? "var(--status-late)" : "var(--status-absent)";
                    const absentDays = Math.max(0, Math.round((emp.presentDays / (emp.attendancePercentage / 100 || 1)) - emp.presentDays));
                    return (
                      <motion.div key={emp._id} className="rounded-xl border group relative cursor-pointer overflow-visible transition-all hover:shadow-md" style={{ background: "var(--bg)", borderColor: "var(--border)" }}
                        onClick={() => { setViewingUserId(emp._id); setSelectedDay(null); }}
                        variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.25 } } }}
                        whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                        <div className="pointer-events-none absolute right-1 z-20 flex items-center gap-1" style={{ top: -10 }}>
                          <span className="pill-glass rounded-full border px-2 py-0.5 text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${attendColor} 15%, var(--dock-frosted-bg))`, borderColor: `color-mix(in srgb, ${attendColor} 30%, var(--border))`, color: attendColor }}>{Math.round(emp.attendancePercentage)}% attendance</span>
                          {emp.lateDays > 0 && <span className="pill-glass rounded-full border px-2 py-0.5 text-[12px] font-bold" style={{ background: "color-mix(in srgb, var(--status-late) 15%, var(--dock-frosted-bg))", borderColor: "color-mix(in srgb, var(--status-late) 30%, var(--border))", color: "var(--status-late)" }}>{emp.lateDays}d late</span>}
                        </div>
                        <div className="flex flex-col gap-1.5 p-2 sm:p-2.5">
                          <div className="pr-1 pt-0.5">
                            <p className="text-[12px] font-semibold truncate" style={{ color: "var(--fg)" }}>{emp.name}</p>
                            <p className="text-[12px] truncate" style={{ color: "var(--fg-secondary)" }}>{emp.department}{emp.role ? ` · ${emp.role}` : ""}</p>
                          </div>
                          <div className="grid grid-cols-3 gap-1 border-t pt-1.5 text-[12px]" style={{ borderColor: "var(--border)" }}>
                            <div><p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>Days present</p><p className="font-semibold tabular-nums" style={{ color: "var(--status-present)" }}>{emp.presentDays}d</p></div>
                            <div className="text-center"><p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>Total hours</p><p className="font-semibold tabular-nums" style={{ color: "var(--status-office)" }}>{fmtHours(emp.totalMinutes)}</p></div>
                            <div className="text-right"><p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>Avg hours/day</p><p className="font-semibold tabular-nums" style={{ color: "var(--primary)" }}>{(emp.averageDailyHours ?? 0).toFixed(1)}h</p></div>
                          </div>
                          <div className="grid grid-cols-3 gap-1 text-[12px]">
                            <div><p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>On-time rate</p><p className="font-semibold tabular-nums" style={{ color: onTimeColor }}>{Math.round(emp.onTimePercentage)}%</p></div>
                            <div className="text-center"><p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>Late days</p><p className="font-semibold tabular-nums" style={{ color: emp.lateDays > 0 ? "var(--status-late)" : "var(--fg-tertiary)" }}>{emp.lateDays}d</p></div>
                            <div className="text-right"><p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>Absent</p><p className="font-semibold tabular-nums" style={{ color: absentDays > 0 ? "var(--status-absent)" : "var(--fg-tertiary)" }}>{absentDays}d</p></div>
                          </div>
                          <div className="flex flex-wrap gap-1 border-t pt-1.5" style={{ borderColor: "var(--border)" }}>
                            <span className="rounded-lg px-1.5 py-0.5 text-[12px] font-semibold" style={{ background: "var(--bg-grouped)", color: "var(--status-ontime)" }}>{emp.onTimeDays}d on-time</span>
                            {emp.lateToOfficeDays > 0 && <span className="rounded-lg px-1.5 py-0.5 text-[12px] font-semibold" style={{ background: "color-mix(in srgb, var(--status-absent) 10%, transparent)", color: "var(--status-absent)" }}>{emp.lateToOfficeDays}d late to office</span>}
                            <span className="ml-auto text-[12px] font-medium" style={{ color: "var(--primary)" }}>View →</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              </div>
            )}

            {/* Leave list for selected employee */}
            {sessionReady && !isAggregateMode && calendarLeaves.length > 0 && (
              <motion.div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg)", borderColor: "var(--border)" }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                  <h3 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>Leaves · {calendarLeaves.length}</h3>
                  <button type="button" onClick={() => setActiveTab("leaves")} className="text-[12px] font-semibold" style={{ color: "var(--primary)" }}>+ Apply Leave</button>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {calendarLeaves.map((l) => {
                    const sc = l.status === "approved" ? "var(--green)" : l.status === "pending" ? "var(--amber)" : "var(--rose)";
                    return (
                      <div key={l._id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: sc }} />
                          <div>
                            <p className="text-[12px] font-medium" style={{ color: "var(--fg)" }}>{new Date(l.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{l.startDate !== l.endDate && ` – ${new Date(l.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}</p>
                            {l.reason && <p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>{l.reason}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[12px] font-medium" style={{ color: "var(--fg-tertiary)" }}>{l.isHalfDay ? "Half day" : `${l.days}d`}</span>
                          <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold capitalize" style={{ background: `color-mix(in srgb, ${sc} 12%, transparent)`, color: sc }}>{{ pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" }[l.status] ?? l.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Monthly records cards — individual mode */}
            {sessionReady && !isAggregateMode && selectedDay === null && (
              loading ? (
                <div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[1, 2, 3, 4].map((i) => <div key={i} className="rounded-xl border p-2.5 space-y-1.5" style={{ borderColor: "var(--border)", background: "var(--bg)" }}><div className="shimmer h-3 w-32 rounded" /><div className="grid grid-cols-3 gap-1 border-t pt-1.5" style={{ borderColor: "var(--border)" }}><div className="space-y-1"><div className="shimmer h-2.5 w-10 rounded" /><div className="shimmer h-3 w-12 rounded" /></div><div className="space-y-1 flex flex-col items-center"><div className="shimmer h-2.5 w-14 rounded" /><div className="shimmer h-3 w-10 rounded" /></div><div className="space-y-1 flex flex-col items-end"><div className="shimmer h-2.5 w-12 rounded" /><div className="shimmer h-3 w-12 rounded" /></div></div><div className="flex gap-1 border-t pt-1.5" style={{ borderColor: "var(--border)" }}><div className="shimmer h-5 w-16 rounded-lg" /><div className="shimmer h-5 w-14 rounded-lg" /><div className="shimmer h-3 w-14 rounded ml-auto" /></div></div>)}</div>
                </div>
              ) : records.length > 0 ? (
                <div>
                  <motion.div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" initial="hidden" animate="visible" variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.03 } } }}>
                    {records.map((rec) => {
                      const recDay = new Date(rec.date).getUTCDate();
                      const sc = rec.isPresent ? (rec.isOnTime ? "var(--status-ontime)" : "var(--status-late)") : "var(--status-absent)";
                      const statusLabel = rec.isPresent ? (rec.isOnTime ? "On Time" : "Late") : "Absent";
                      return (
                        <motion.button key={rec._id} type="button" onClick={() => setSelectedDay(recDay)}
                          className="rounded-xl border group relative cursor-pointer overflow-visible p-2 sm:p-2.5 text-left transition-all hover:shadow-md space-y-1.5"
                          style={{ background: "var(--bg)", borderColor: "var(--border)" }}
                          variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.2 } } }}
                          whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                          <div className="pointer-events-none absolute right-1 z-20 flex items-center gap-1" style={{ top: -10 }}>
                            <span className="pill-glass rounded-full border px-1.5 py-0.5 text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${sc} 15%, var(--dock-frosted-bg))`, borderColor: `color-mix(in srgb, ${sc} 30%, var(--border))`, color: sc }}>{statusLabel}</span>
                            {(rec.lateBy ?? 0) > 0 && <span className="pill-glass rounded-full border px-1.5 py-0.5 text-[12px] font-bold" style={{ background: "color-mix(in srgb, var(--status-late) 15%, var(--dock-frosted-bg))", borderColor: "color-mix(in srgb, var(--status-late) 30%, var(--border))", color: "var(--status-late)" }}>{rec.lateBy}m late</span>}
                          </div>
                          <p className="text-[12px] font-semibold truncate pr-16" style={{ color: "var(--fg)" }}>{new Date(rec.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
                          <div className="grid grid-cols-3 gap-1 border-t pt-1.5 text-[12px]" style={{ borderColor: "var(--border)" }}>
                            <div><p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>Clock in</p><p className="font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{fmtTime(rec.firstStart ?? rec.firstOfficeEntry)}</p></div>
                            <div className="text-center"><p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>Hours worked</p><p className="font-semibold tabular-nums" style={{ color: "var(--primary)" }}>{fmtHours(rec.totalWorkingMinutes)}</p></div>
                            <div className="text-right"><p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>Clock out</p><p className="font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{fmtTime(rec.lastEnd ?? rec.lastOfficeExit)}</p></div>
                          </div>
                          {rec.isPresent && (rec.firstOfficeEntry || rec.officeMinutes > 0) && (
                            <div className="grid grid-cols-3 gap-1 text-[12px]" style={{ color: "var(--fg-secondary)" }}>
                              <div><p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>Office entry</p><p className="font-semibold tabular-nums">{fmtTime(rec.firstOfficeEntry)}</p></div>
                              <div className="text-center"><p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>Office hours</p><p className="font-semibold tabular-nums" style={{ color: "var(--status-office)" }}>{fmtHours(rec.officeMinutes)}</p></div>
                              <div className="text-right"><p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>Office exit</p><p className="font-semibold tabular-nums">{fmtTime(rec.lastOfficeExit)}</p></div>
                            </div>
                          )}
                          {rec.isPresent && (
                            <div className="flex flex-wrap gap-1 border-t pt-1.5" style={{ borderColor: "var(--border)" }}>
                              {rec.remoteMinutes > 0 && <span className="rounded-lg px-1.5 py-0.5 text-[12px] font-semibold" style={{ background: "var(--bg-grouped)", color: "var(--status-remote)" }}>{fmtHours(rec.remoteMinutes)} remote</span>}
                              {(rec.breakMinutes ?? 0) > 0 && <span className="rounded-lg px-1.5 py-0.5 text-[12px] font-semibold" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>{rec.breakMinutes}m break</span>}
                              <span className="ml-auto text-[12px] font-medium" style={{ color: "var(--primary)" }}>Details →</span>
                            </div>
                          )}
                          {!rec.isPresent && <div className="flex items-center justify-end pt-1"><span className="text-[12px] font-medium" style={{ color: "var(--primary)" }}>Details →</span></div>}
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--fg-tertiary)" }}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></svg>
                  <p className="text-sm font-medium" style={{ color: "var(--fg-secondary)" }}>No attendance records for this month</p>
                  <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>Records will appear here as days are logged</p>
                </div>
              )
            )}

          </div>
        </div>
          )}

          {/* Leaves tab — inline content */}
          {activeTab === "leaves" && (
            <div className="flex-1 overflow-hidden">
              <LeavesContent selectedUserId={viewingUserId || undefined} year={year} initialTab={leavesTab} onTabChange={setLeavesTab} />
            </div>
          )}

          {/* Payroll tab — inline content */}
          {activeTab === "payroll" && (
            <div className="flex-1 overflow-hidden">
              <PayrollContent selectedUserId={viewingUserId || undefined} year={year} month={month} initialTab={payrollTab} onTabChange={setPayrollTab} />
            </div>
          )}

          {/* Progress tab — inline content */}
          {activeTab === "progress" && (
            <div className="flex-1 overflow-hidden">
              <ProgressContent userId={viewingUserId} year={year} month={month} />
            </div>
          )}

          </div>
        </div>
      </div>

      {/* ── Holidays Modal ── */}
      <Portal>
        <AnimatePresence>
          {holidaysOpen && (
            <motion.div className="fixed inset-0 z-[60] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setHolidaysOpen(false)} />
              <motion.div
                className="relative w-full max-w-lg mx-3 sm:mx-4 max-h-[min(85vh,900px)] flex flex-col rounded-xl border shadow-xl overflow-hidden"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                  <div>
                    <h3 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>Company Holidays</h3>
                    <p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>
                      {holidays.length} holiday{holidays.length !== 1 ? "s" : ""} in {displayYear}
                      {upcomingHolidays.length > 0 && <> · {upcomingHolidays.length} upcoming</>}
                    </p>
                  </div>
                  <button type="button" onClick={() => setHolidaysOpen(false)} className="rounded-lg p-1 transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-secondary)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-3">
                  {canCreateHoliday && (
                    <AnimatePresence mode="wait">
                      {!showHolidayForm ? (
                        <motion.button key="add-btn" type="button" onClick={() => setShowHolidayForm(true)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--primary)" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                          Declare Holiday
                        </motion.button>
                      ) : (
                        <motion.div key="add-form" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="rounded-xl p-3 space-y-3" style={{ background: "var(--bg-grouped)" }}>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input type="text" className="input text-[12px]" placeholder="Holiday name" value={formName} onChange={(e) => setFormName(e.target.value)} autoFocus />
                            <input type="date" className="input text-[12px]" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
                          </div>
                          <div className="flex items-center justify-between">
                            <ToggleSwitch checked={formRecurring} onChange={setFormRecurring} color="var(--purple)" label="Recurring yearly" />
                            <div className="flex gap-2">
                              <button type="button" onClick={() => { setShowHolidayForm(false); setFormName(""); setFormDate(""); setFormRecurring(false); }} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={{ color: "var(--fg-secondary)" }}>Cancel</button>
                              <button type="button" disabled={holidaySaving || !formName.trim() || !formDate} onClick={handleAddHoliday} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--primary)" }}>{holidaySaving ? "Saving…" : "Add holiday"}</button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}
                  {holidaysLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--bg-grouped)" }}>
                          <div className="shimmer h-10 w-10 rounded-lg" />
                          <div className="flex-1 space-y-1.5"><div className="shimmer h-3.5 w-32 rounded" /><div className="shimmer h-2.5 w-24 rounded" /></div>
                          <div className="shimmer h-4 w-7 rounded-full" />
                        </div>
                      ))}
                    </div>
                  ) : holidays.length === 0 ? (
                    <div className="py-8 text-center">
                      <svg className="mx-auto mb-2 h-8 w-8" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                      <p className="text-[12px] font-medium" style={{ color: "var(--fg-tertiary)" }}>No holidays declared for {displayYear}.</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {holidays.map((h) => {
                        const d = new Date(h.date);
                        const isPast = d < new Date();
                        return (
                          <div key={h._id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors" style={{ background: "var(--bg-grouped)", opacity: isPast ? 0.55 : 1 }}>
                            <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-white" style={{ background: h.isRecurring ? "var(--purple)" : "var(--primary)" }}>
                              <span className="text-[12px] font-semibold leading-none uppercase">{SHORT_MONTHS[d.getUTCMonth()]}</span>
                              <span className="text-[12px] font-bold leading-tight">{d.getUTCDate()}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-semibold truncate" style={{ color: "var(--fg)" }}>{h.name}</p>
                              <p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>{d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {canToggleRecurring ? (
                                <ToggleSwitch checked={h.isRecurring} onChange={() => handleToggleRecurring(h)} disabled={holidayTogglingId === h._id} color="var(--purple)" title={h.isRecurring ? "Recurring — click to make one-time" : "One-time — click to make recurring"} />
                              ) : h.isRecurring ? (
                                <span className="rounded-full px-1.5 py-0.5 text-[12px] font-semibold" style={{ color: "var(--purple)", background: "color-mix(in srgb, var(--purple) 12%, transparent)" }}>Recurring</span>
                              ) : null}
                              {canDeleteHoliday && (
                                <button type="button" onClick={() => setHolidayDeleteTarget(h)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-tertiary)" }} title="Remove holiday">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>

      <ConfirmDialog open={!!holidayDeleteTarget} title="Remove Holiday" description={`Remove "${holidayDeleteTarget?.name}"? Attendance and payroll will no longer treat this date as a holiday.`} confirmLabel="Remove" variant="danger" loading={holidayDeleting} onConfirm={handleDeleteHoliday} onCancel={() => setHolidayDeleteTarget(null)} />
    </div>
  );
}
