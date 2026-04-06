"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { ScopeStrip } from "../components/ScopeStrip";

/* ───── Types ───── */

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
  managerId: string | null;
  managerName: string | null;
  presentDays: number;
  onTimeDays: number;
  lateDays: number;
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
}

type GroupMode = "flat" | "manager" | "department";

/* ───── Constants ───── */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* ───── Helpers ───── */

function fmtTime(dateStr?: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/* ───── Page ───── */

export default function AttendancePage() {
  const { data: authSession } = useSession();
  const isSuperAdmin = authSession?.user?.role === "superadmin";
  const isAdmin = isSuperAdmin || authSession?.user?.role === "manager" || authSession?.user?.role === "teamLead";

  /* ── Team overview state ── */
  const [teamSummary, setTeamSummary] = useState<TeamMonthlySummary[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [scopeDept, setScopeDept] = useState("all");
  const [groupMode, setGroupMode] = useState<GroupMode>("flat");

  /* ── Individual state ── */
  const [viewingUserId, setViewingUserId] = useState<string>("");
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());
  const [detailData, setDetailData] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null);
  const [todaySession, setTodaySession] = useState<{ active: boolean; inOffice: boolean; startTime: string | null; todayMinutes: number }>({
    active: false, inOffice: false, startTime: null, todayMinutes: 0,
  });

  /* ── Team date state ── */
  const [teamDateData, setTeamDateData] = useState<TeamDateRecord[]>([]);
  const [teamDateLoading, setTeamDateLoading] = useState(false);

  const userIdParam = viewingUserId || "";
  const hasSelectedEmployee = !!viewingUserId;
  const isAggregateMode = isAdmin && !hasSelectedEmployee;

  /* ── Data loaders ── */

  const loadTeamSummary = useCallback(async () => {
    if (!isAdmin) { setTeamLoading(false); return; }
    setTeamLoading(true);
    try {
      const res = await fetch(`/api/attendance?type=team-monthly&year=${year}&month=${month}`).then((r) => r.json());
      setTeamSummary(Array.isArray(res) ? res : []);
    } catch { setTeamSummary([]); }
    setTeamLoading(false);
  }, [isAdmin, year, month]);

  const loadRecords = useCallback(async () => {
    if (!userIdParam && isAdmin) return;
    setLoading(true);
    const qs = `type=daily&year=${year}&month=${month}${userIdParam ? `&userId=${userIdParam}` : ""}`;
    const res = await fetch(`/api/attendance?${qs}`).then((r) => r.json());
    setRecords(Array.isArray(res) ? res : []);
    setLoading(false);
  }, [year, month, userIdParam, isAdmin]);

  const loadMonthlyStats = useCallback(async () => {
    if (!userIdParam && isAdmin) return;
    const qs = `type=monthly&year=${year}&month=${month}${userIdParam ? `&userId=${userIdParam}` : ""}`;
    try {
      const res = await fetch(`/api/attendance?${qs}`).then((r) => r.json());
      setMonthlyStats(res ?? null);
    } catch { setMonthlyStats(null); }
  }, [year, month, userIdParam, isAdmin]);

  const loadTodaySession = useCallback(async () => {
    if (viewingUserId && viewingUserId !== authSession?.user?.id) return;
    if (isAdmin && !viewingUserId) return;
    try {
      const res = await fetch("/api/attendance/session").then((r) => r.json());
      setTodaySession({
        active: !!res.activeSession,
        inOffice: res.activeSession?.location?.inOffice ?? false,
        startTime: res.activeSession?.sessionTime?.start ?? null,
        todayMinutes: res.todayMinutes ?? 0,
      });
    } catch { /* ignore */ }
  }, [viewingUserId, authSession?.user?.id, isAdmin]);

  const loadDetail = useCallback(async (day: number) => {
    setDetailLoading(true);
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const qs = `type=detail&date=${dateStr}${userIdParam ? `&userId=${userIdParam}` : ""}`;
    try {
      const res = await fetch(`/api/attendance?${qs}`).then((r) => r.json());
      setDetailData(res ?? null);
    } catch { setDetailData(null); }
    setDetailLoading(false);
  }, [year, month, userIdParam]);

  const loadTeamDate = useCallback(async (day: number) => {
    if (!isAdmin) return;
    setTeamDateLoading(true);
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    try {
      const res = await fetch(`/api/attendance?type=team-date&date=${dateStr}`).then((r) => r.json());
      setTeamDateData(Array.isArray(res) ? res : []);
    } catch { setTeamDateData([]); }
    setTeamDateLoading(false);
  }, [isAdmin, year, month]);

  /* ── Effects ── */

  useEffect(() => { loadTeamSummary(); }, [loadTeamSummary]);
  useEffect(() => { loadRecords(); loadMonthlyStats(); }, [loadRecords, loadMonthlyStats]);
  useEffect(() => { loadTodaySession(); }, [loadTodaySession]);

  const mountRef = useRef(true);
  useEffect(() => {
    if (mountRef.current) { mountRef.current = false; return; }
    setSelectedDay(null);
    setDetailData(null);
    setTeamDateData([]);
  }, [year, month, viewingUserId]);

  useEffect(() => {
    if (selectedDay === null) {
      setDetailData(null);
      setTeamDateData([]);
      return;
    }
    if (isAggregateMode) {
      loadTeamDate(selectedDay);
    } else {
      loadDetail(selectedDay);
    }
  }, [selectedDay, isAggregateMode, loadDetail, loadTeamDate]);

  /* ── Derived state ── */

  const myId = authSession?.user?.id;
  const filteredSummary = useMemo(
    () => {
      let list = teamSummary.filter((m) => m._id !== myId);
      if (scopeDept !== "all") list = list.filter((m) => m.departmentId === scopeDept);
      return list;
    },
    [teamSummary, scopeDept, myId],
  );

  const grouped = useMemo(() => {
    if (groupMode === "flat") return [{ key: "all", label: "All Employees", items: filteredSummary }];
    const map = new Map<string, { label: string; items: TeamMonthlySummary[] }>();
    for (const emp of filteredSummary) {
      const key = groupMode === "manager"
        ? (emp.managerId ?? "unassigned")
        : (emp.departmentId ?? "unassigned");
      const label = groupMode === "manager"
        ? (emp.managerName ?? "No Manager")
        : emp.department;
      if (!map.has(key)) map.set(key, { label, items: [] });
      map.get(key)!.items.push(emp);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, label: v.label, items: v.items }));
  }, [filteredSummary, groupMode]);

  const viewingMember = teamSummary.find((m) => m._id === viewingUserId);

  const recordMap = useMemo(() => {
    const map = new Map<number, DailyRecord>();
    records.forEach((r) => map.set(new Date(r.date).getDate(), r));
    return map;
  }, [records]);

  const filteredTeamDate = useMemo(
    () => scopeDept === "all" ? teamDateData : teamDateData.filter((e) => e.departmentId === scopeDept),
    [teamDateData, scopeDept],
  );

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const isViewingSelf = !viewingUserId || viewingUserId === authSession?.user?.id;

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1);
  }

  const presentDays = records.filter((r) => r.isPresent).length;
  const onTimeDays = records.filter((r) => r.isOnTime).length;
  const totalMins = records.reduce((s, r) => s + r.totalWorkingMinutes, 0);

  const aggPresentDays = filteredSummary.reduce((s, e) => s + e.presentDays, 0);
  const aggOnTimeDays = filteredSummary.reduce((s, e) => s + e.onTimeDays, 0);
  const aggTotalMins = filteredSummary.reduce((s, e) => s + e.totalMinutes, 0);
  const aggAvgDaily = filteredSummary.length > 0 ? filteredSummary.reduce((s, e) => s + e.averageDailyHours, 0) / filteredSummary.length : 0;
  const aggAvgOnTime = filteredSummary.length > 0 ? filteredSummary.reduce((s, e) => s + e.onTimePercentage, 0) / filteredSummary.length : 0;
  const aggAvgAttendance = filteredSummary.length > 0 ? filteredSummary.reduce((s, e) => s + e.attendancePercentage, 0) / filteredSummary.length : 0;

  const statPresent = isAggregateMode ? aggPresentDays : presentDays;
  const statOnTime = isAggregateMode ? aggOnTimeDays : onTimeDays;
  const statTotalMins = isAggregateMode ? aggTotalMins : totalMins;

  const selectedDate = selectedDay ? new Date(year, month - 1, selectedDay) : null;
  const isSelectedToday = selectedDay !== null && isCurrentMonth && selectedDay === today.getDate();

  const teamDatePresent = filteredTeamDate.filter((e) => e.isPresent).length;
  const teamDateLate = filteredTeamDate.filter((e) => e.isPresent && !e.isOnTime).length;

  function toggleEmployee(id: string) {
    setViewingUserId((prev) => prev === id ? "" : id);
  }

  /* ────────────────── RENDER ────────────────── */

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-title">{isAdmin ? "Team Attendance" : "Attendance"}</h1>
          <p className="text-subhead">
            {isAdmin
              ? (hasSelectedEmployee && viewingMember ? viewingMember.name : `${filteredSummary.length} employee${filteredSummary.length !== 1 ? "s" : ""}`)
              : `${MONTH_NAMES[month - 1]} ${year}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isAdmin && <ScopeStrip value={scopeDept} onChange={setScopeDept} />}
          {isAdmin && (
            <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
              {(["flat", "manager", "department"] as GroupMode[]).map((g) => (
                <motion.button
                  key={g}
                  type="button"
                  onClick={() => setGroupMode(g)}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    groupMode === g
                      ? "bg-[var(--primary)] text-white shadow-sm"
                      : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                  }`}
                >
                  {g === "flat" ? "Flat" : g === "manager" ? "By Manager" : "By Dept"}
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Employee pills (admins) */}
      {isAdmin && (
        teamLoading ? (
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6].map((j) => <div key={j} className="shimmer h-9 w-32 rounded-full" />)}
          </div>
        ) : filteredSummary.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-callout" style={{ color: "var(--fg-secondary)" }}>No employees found for this period</p>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map((group) => (
              <div key={group.key}>
                {groupMode !== "flat" && (
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                    {group.label} <span style={{ color: "var(--fg-quaternary)" }}>· {group.items.length}</span>
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {!isSuperAdmin && groupMode === "flat" && (
                    <motion.button
                      type="button"
                      onClick={() => toggleEmployee(authSession?.user?.id ?? "")}
                      className="flex items-center gap-2 rounded-full border px-3 py-2 text-left transition-all"
                      style={{
                        borderColor: viewingUserId === authSession?.user?.id ? "var(--primary)" : "var(--border)",
                        background: viewingUserId === authSession?.user?.id ? "color-mix(in srgb, var(--primary) 10%, var(--bg))" : "var(--bg)",
                      }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--primary)" }} />
                      <p className="text-xs font-semibold leading-tight" style={{ color: "var(--fg)" }}>My Attendance</p>
                    </motion.button>
                  )}
                  {group.items.map((emp) => {
                    const isSelected = viewingUserId === emp._id;
                    const attendColor = emp.attendancePercentage >= 90 ? "var(--green)" : emp.attendancePercentage >= 70 ? "var(--amber)" : "var(--rose)";
                    const statusDot = emp.presentDays > 0
                      ? (emp.lateDays > emp.onTimeDays ? "var(--amber)" : "var(--green)")
                      : "var(--fg-tertiary)";
                    return (
                      <motion.button
                        key={emp._id}
                        type="button"
                        onClick={() => toggleEmployee(emp._id)}
                        className="flex items-center gap-2 rounded-full border px-3 py-2 text-left transition-all"
                        style={{
                          borderColor: isSelected ? "var(--primary)" : "var(--border)",
                          background: isSelected ? "color-mix(in srgb, var(--primary) 10%, var(--bg))" : "var(--bg)",
                        }}
                        whileHover={!isSelected ? { y: -1 } : undefined}
                        whileTap={{ scale: 0.97 }}
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: statusDot }} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold leading-tight" style={{ color: isSelected ? "var(--primary)" : "var(--fg)" }}>{emp.name}</p>
                          <p className="text-[10px] leading-tight" style={{ color: "var(--fg-tertiary)" }}>
                            {emp.presentDays}d · {fmtHours(emp.totalMinutes)} · <span style={{ color: attendColor }}>{Math.round(emp.attendancePercentage)}%</span>
                          </p>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Today's Session — only for self in individual mode */}
      {!isAggregateMode && isViewingSelf && !isSuperAdmin && (
        <motion.div className="card-xl flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{
              background: todaySession.active
                ? todaySession.inOffice ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #3b82f6, #2563eb)"
                : "linear-gradient(135deg, var(--fg-tertiary), var(--fg-secondary))",
            }}>
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <p className="text-headline" style={{ color: "var(--fg)" }}>
                {todaySession.active ? (todaySession.inOffice ? "Working from Office" : "Working Remotely") : "Session Inactive"}
              </p>
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>
                {todaySession.active && todaySession.startTime
                  ? `Since ${new Date(todaySession.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — auto-tracked`
                  : "Your session starts automatically when you open the app"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Today Total</p>
              <p className="text-lg font-bold" style={{ color: "var(--primary)" }}>{fmtHours(todaySession.todayMinutes)}</p>
            </div>
            <span className="flex h-3 w-3 shrink-0">
              <span className="relative inline-flex h-3 w-3 rounded-full" style={{ background: todaySession.active ? (todaySession.inOffice ? "#10b981" : "#3b82f6") : "var(--fg-tertiary)" }}>
                {todaySession.active && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ background: todaySession.inOffice ? "#10b981" : "#3b82f6" }} />}
              </span>
            </span>
          </div>
        </motion.div>
      )}

      {/* 3 Stat Cards — always visible */}
      <motion.div className="grid grid-cols-3 gap-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        {(isAggregateMode && teamLoading) || (!isAggregateMode && loading) ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="card-static p-3 text-center space-y-1.5">
              <span className="shimmer block mx-auto h-2.5 w-16 rounded" />
              <span className="shimmer block mx-auto h-5 w-10 rounded" />
            </div>
          ))
        ) : (
          [
            { label: "Present Days", value: String(statPresent), color: "var(--green)" },
            { label: "On Time", value: String(statOnTime), color: "var(--primary)" },
            { label: "Total Hours", value: fmtHours(statTotalMins), color: "var(--teal)" },
          ].map((s) => (
            <div key={s.label} className="card-static p-3 text-center">
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>{s.label}</p>
              <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))
        )}
      </motion.div>

      {/* Monthly Insights — always visible */}
      <div className="card-static p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Monthly Insights</p>
        {isAggregateMode ? (
          !teamLoading && filteredSummary.length > 0 ? (
            <motion.div
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              initial="hidden" animate="visible"
              variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } }}
            >
              {[
                { label: "Avg Daily", value: `${aggAvgDaily.toFixed(1)}h`, color: "var(--primary)" },
                { label: "Avg On-Time", value: `${Math.round(aggAvgOnTime)}%`, color: aggAvgOnTime >= 80 ? "var(--green)" : "var(--amber)" },
                { label: "Avg Attendance", value: `${Math.round(aggAvgAttendance)}%`, color: aggAvgAttendance >= 90 ? "var(--green)" : "var(--rose)" },
                { label: "Total Hours", value: `${Math.round(aggTotalMins / 60)}h`, color: "var(--teal)" },
              ].map((chip) => (
                <motion.div key={chip.label} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.25 } } }}>
                  <AnalyticChip label={chip.label} value={chip.value} color={chip.color} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[1, 2, 3, 4].map((i) => <div key={i} className="card-static rounded-xl p-3 space-y-1.5"><span className="shimmer block h-2.5 w-14 rounded" /><span className="shimmer block h-4 w-10 rounded" /></div>)}
            </div>
          )
        ) : monthlyStats ? (
          <motion.div
            className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6"
            initial="hidden" animate="visible"
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } }}
          >
            {[
              { label: "Avg Daily", value: `${monthlyStats.averageDailyHours.toFixed(1)}h`, color: "var(--primary)" },
              { label: "Avg Arrival", value: monthlyStats.averageOfficeInTime ?? "—", color: "var(--green)" },
              { label: "Avg Departure", value: monthlyStats.averageOfficeOutTime ?? "—", color: "var(--amber)" },
              { label: "On-Time %", value: `${Math.round(monthlyStats.onTimePercentage)}%`, color: monthlyStats.onTimePercentage >= 80 ? "var(--green)" : "var(--amber)" },
              { label: "Attendance %", value: `${Math.round(monthlyStats.attendancePercentage)}%`, color: monthlyStats.attendancePercentage >= 90 ? "var(--green)" : "var(--rose)" },
              { label: "Office / Remote", value: `${Math.round(monthlyStats.totalOfficeHours)}h / ${Math.round(monthlyStats.totalRemoteHours)}h`, color: "var(--teal)" },
            ].map((chip) => (
              <motion.div key={chip.label} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.25 } } }}>
                <AnalyticChip label={chip.label} value={chip.value} color={chip.color} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="card-static rounded-xl p-3 space-y-1.5"><span className="shimmer block h-2.5 w-14 rounded" /><span className="shimmer block h-4 w-10 rounded" /></div>)}
          </div>
        )}
      </div>

      {/* Calendar + Detail panel */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-5">
        {/* Calendar */}
        <motion.div className="card-static p-3 sm:p-4 lg:col-span-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={prevMonth} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-secondary)" }}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <AnimatePresence mode="wait">
              <motion.span key={`${month}-${year}`} className="text-headline" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.2 }}>
                {MONTH_NAMES[month - 1]} {year}
              </motion.span>
            </AnimatePresence>
            <button type="button" onClick={nextMonth} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-secondary)" }}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="py-1 text-center text-[11px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>{d}</div>
            ))}
            <AnimatePresence mode="wait">
              <motion.div key={`${year}-${month}-${viewingUserId}`} className="col-span-7 grid grid-cols-7 gap-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                {Array.from({ length: firstDayOfWeek }, (_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const rec = recordMap.get(day);
                  const isToday = isCurrentMonth && day === today.getDate();
                  const isSelected = selectedDay === day;
                  const isFuture = isCurrentMonth ? day > today.getDate() : new Date(year, month - 1, day) > today;
                  let dotColor = "transparent";
                  if (!isAggregateMode) {
                    if (rec?.isPresent) dotColor = rec.isOnTime ? "var(--green)" : "var(--amber)";
                    else if (rec) dotColor = "var(--rose)";
                  }

                  return (
                    <motion.button key={day} type="button" onClick={() => !isFuture && setSelectedDay(isSelected ? null : day)} disabled={isFuture}
                      className="flex flex-col items-center gap-0.5 rounded-lg py-1.5 transition-all outline-none"
                      style={{
                        ...(isSelected ? { background: "var(--primary)", borderRadius: "0.5rem" } : isToday ? { boxShadow: "0 0 0 2px var(--primary)", borderRadius: "0.5rem" } : {}),
                        cursor: isFuture ? "default" : "pointer", opacity: isFuture ? 0.35 : 1,
                      }}
                      whileHover={!isFuture ? { scale: 1.08 } : undefined} whileTap={!isFuture ? { scale: 0.92 } : undefined}
                      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: isFuture ? 0.35 : 1, scale: 1 }} transition={{ duration: 0.2, delay: Math.min(i * 0.01, 0.3) }}
                    >
                      <span className="text-[13px] font-medium" style={{ color: isSelected ? "white" : isToday ? "var(--primary)" : "var(--fg)" }}>{day}</span>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: isSelected ? (dotColor === "transparent" ? "rgba(255,255,255,0.3)" : "white") : dotColor }} />
                    </motion.button>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>

          {!isAggregateMode && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-caption" style={{ color: "var(--fg-tertiary)" }}>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--green)" }} /> On Time</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--amber)" }} /> Late</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--rose)" }} /> Absent</span>
            </div>
          )}
        </motion.div>

        {/* Right panel — context-dependent */}
        <div className="flex flex-col lg:col-span-2">
          <AnimatePresence mode="wait">
            {/* ── Aggregate mode: team date cards ── */}
            {isAggregateMode && selectedDay !== null ? (
              <motion.div key={`team-date-${selectedDay}`} className="card-xl flex flex-1 flex-col overflow-hidden"
                initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
              >
                <div className="border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-headline" style={{ color: "var(--fg)" }}>
                        {selectedDate?.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                      </p>
                      <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>
                        {teamDatePresent} present · {teamDateLate} late · {filteredTeamDate.length - teamDatePresent} absent
                      </p>
                    </div>
                    <button type="button" onClick={() => setSelectedDay(null)} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-tertiary)" }}>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>

                {teamDateLoading ? (
                  <div className="flex-1 space-y-2 overflow-y-auto p-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="rounded-xl p-3 space-y-2" style={{ background: "var(--bg-grouped)" }}>
                        <div className="flex items-center gap-3">
                          <div className="shimmer h-2.5 w-2.5 shrink-0 rounded-full" />
                          <div className="flex-1 space-y-1"><div className="shimmer h-3.5 w-24 rounded" /><div className="shimmer h-2.5 w-16 rounded" /></div>
                          <div className="space-y-1 text-right"><div className="shimmer ml-auto h-3.5 w-12 rounded" /><div className="shimmer ml-auto h-4 w-14 rounded-full" /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                          {[1, 2, 3, 4].map((j) => <div key={j} className="shimmer h-2.5 rounded" />)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 space-y-2 overflow-y-auto p-4">
                    {filteredTeamDate.length === 0 ? (
                      <p className="py-8 text-center text-callout" style={{ color: "var(--fg-secondary)" }}>No employee data for this date</p>
                    ) : (
                      filteredTeamDate.map((emp, idx) => {
                        const statusColor = emp.isPresent ? (emp.isOnTime ? "var(--green)" : "var(--amber)") : "var(--rose)";
                        const locLabel = emp.officeMinutes > 0 && emp.remoteMinutes > 0 ? "Split" : emp.officeMinutes > 0 ? "Office" : emp.remoteMinutes > 0 ? "Remote" : "";
                        const locColor = emp.officeMinutes > 0 ? "var(--green)" : "var(--teal)";
                        return (
                          <motion.div
                            key={emp._id}
                            className="rounded-xl p-3 space-y-2"
                            style={{ background: "var(--bg-grouped)" }}
                            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: Math.min(idx * 0.04, 0.3) }}
                          >
                            <div className="flex items-center gap-3">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: statusColor }} />
                              <div className="min-w-0 flex-1">
                                <p className="text-callout font-semibold truncate" style={{ color: "var(--fg)" }}>{emp.name}</p>
                                <p className="text-caption truncate" style={{ color: "var(--fg-tertiary)" }}>{emp.department}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{fmtHours(emp.totalWorkingMinutes)}</p>
                                <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{
                                  background: `color-mix(in srgb, ${statusColor} 15%, transparent)`,
                                  color: statusColor,
                                }}>
                                  {emp.isPresent ? (emp.isOnTime ? "On Time" : "Late") : "Absent"}
                                </span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
                              <div className="flex justify-between">
                                <span className="font-semibold">Arrived</span>
                                <span style={{ color: emp.firstStart ? "var(--fg-secondary)" : "var(--fg-tertiary)" }}>{fmtTime(emp.firstStart)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-semibold">Left</span>
                                <span style={{ color: emp.lastEnd ? "var(--fg-secondary)" : "var(--fg-tertiary)" }}>{fmtTime(emp.lastEnd)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-semibold">Office In</span>
                                <span style={{ color: emp.firstOfficeEntry ? "var(--green)" : "var(--fg-tertiary)" }}>{fmtTime(emp.firstOfficeEntry)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-semibold">Office Out</span>
                                <span style={{ color: emp.lastOfficeExit ? "var(--green)" : "var(--fg-tertiary)" }}>{fmtTime(emp.lastOfficeExit)}</span>
                              </div>
                            </div>
                            {locLabel && (
                              <div className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: locColor }}>
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: locColor }} />
                                {locLabel}{emp.officeMinutes > 0 && emp.remoteMinutes > 0 ? ` — ${fmtHours(emp.officeMinutes)} office, ${fmtHours(emp.remoteMinutes)} remote` : ""}
                              </div>
                            )}
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                )}
              </motion.div>

            ) : !isAggregateMode && selectedDay !== null ? (
              /* ── Individual mode: session detail ── */
              <motion.div key={`detail-${selectedDay}`} className="card-xl flex flex-1 flex-col overflow-hidden"
                initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
              >
                <div className="border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-headline" style={{ color: "var(--fg)" }}>
                        {selectedDate?.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                      </p>
                      {isSelectedToday && <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--primary)" }}>Today</span>}
                    </div>
                    <button type="button" onClick={() => setSelectedDay(null)} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-tertiary)" }}>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>

                {detailLoading ? (
                  <div className="flex-1 space-y-5 overflow-y-auto p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="shimmer h-6 w-20 rounded-full" />
                      <div className="shimmer h-6 w-24 rounded-full" />
                    </div>
                    <div className="shimmer h-4 w-full max-w-md rounded" />
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3].map((i) => <div key={i} className="shimmer h-14 rounded-xl" />)}
                    </div>
                  </div>
                ) : detailData ? (
                  (() => {
                    const sorted = [...(detailData.activitySessions ?? [])].sort((a, b) => new Date(a.sessionTime.start).getTime() - new Date(b.sessionTime.start).getTime());
                    const clockIn = sorted[0]?.sessionTime.start ?? detailData.firstStart;
                    const lastSess = sorted[sorted.length - 1];
                    const clockOut = lastSess?.sessionTime.end ?? lastSess?.lastActivity ?? detailData.lastEnd;
                    return (
                  <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill color={detailData.isPresent ? (detailData.isOnTime ? "var(--green)" : "var(--amber)") : "var(--rose)"} label={detailData.isPresent ? (detailData.isOnTime ? "On Time" : "Late") : "Absent"} />
                      {(detailData.lateBy ?? 0) > 0 && <Pill color="var(--amber)" label={`Late by ${fmtHours(detailData.lateBy!)}`} variant="outline" />}
                      {(detailData.breakMinutes ?? 0) > 0 && <Pill color="var(--fg-tertiary)" label={`${fmtHours(detailData.breakMinutes!)} break`} variant="outline" />}
                      <Pill color="var(--fg-tertiary)" label={`${detailData.activitySessions?.length ?? 0} session${(detailData.activitySessions?.length ?? 0) !== 1 ? "s" : ""}`} variant="outline" />
                    </div>

                    <p className="text-caption" style={{ color: "var(--fg-secondary)" }}>
                      {detailData.isPresent
                        ? `Worked ${fmtHours(detailData.totalWorkingMinutes)} across ${detailData.activitySessions?.length ?? 0} session${(detailData.activitySessions?.length ?? 0) !== 1 ? "s" : ""}${detailData.officeMinutes > 0 && detailData.remoteMinutes > 0 ? " — split between office and remote" : detailData.officeMinutes > 0 ? " — from office" : " — remotely"}`
                        : "No work sessions recorded for this day"}
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <StatChip label="Arrived" value={fmtTime(clockIn)} color="var(--primary)" />
                      <StatChip label="Left" value={fmtTime(clockOut)} color="var(--primary)" />
                      <StatChip label="Office In" value={fmtTime(detailData.firstOfficeEntry)} color="var(--green)" />
                      <StatChip label="Office Out" value={fmtTime(detailData.lastOfficeExit)} color="var(--green)" />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <StatChip label="Total" value={fmtHours(detailData.totalWorkingMinutes)} color="var(--primary)" />
                      <StatChip label="Office" value={fmtHours(detailData.officeMinutes)} color="var(--green)" />
                      <StatChip label="Remote" value={fmtHours(detailData.remoteMinutes)} color="var(--teal)" />
                    </div>

                    {detailData.totalWorkingMinutes > 0 && (
                      <div>
                        <div className="mb-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                          <span>Work Split</span>
                          <span>{fmtTime(clockIn)} → {fmtTime(clockOut)}</span>
                        </div>
                        <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                          {detailData.officeMinutes > 0 && <motion.div className="h-full" style={{ background: "var(--green)" }} initial={{ width: 0 }} animate={{ width: `${(detailData.officeMinutes / detailData.totalWorkingMinutes) * 100}%` }} transition={{ duration: 0.6, delay: 0.15 }} />}
                          {detailData.remoteMinutes > 0 && <motion.div className="h-full" style={{ background: "var(--teal)" }} initial={{ width: 0 }} animate={{ width: `${(detailData.remoteMinutes / detailData.totalWorkingMinutes) * 100}%` }} transition={{ duration: 0.6, delay: 0.25 }} />}
                        </div>
                        <div className="mt-1.5 flex gap-3 text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
                          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--green)" }} />Office {Math.round((detailData.officeMinutes / detailData.totalWorkingMinutes) * 100)}%</span>
                          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--teal)" }} />Remote {Math.round((detailData.remoteMinutes / detailData.totalWorkingMinutes) * 100)}%</span>
                        </div>
                      </div>
                    )}

                    {detailData.activitySessions && detailData.activitySessions.length > 0 && (
                      <div>
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Session Timeline</p>
                        <div className="relative pl-5">
                          <div className="absolute left-[7px] top-1 bottom-1 w-[2px] rounded-full" style={{ background: "var(--border)" }} />
                          <motion.div className="space-y-4" initial="hidden" animate="visible" variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } } }}>
                            {detailData.activitySessions
                              .sort((a, b) => new Date(a.sessionTime.start).getTime() - new Date(b.sessionTime.start).getTime())
                              .map((sess) => {
                                const device = detectDevice(sess.platform);
                                const statusConf = sess.status === "active" ? { color: "var(--green)", label: "Active" } : sess.status === "timeout" ? { color: "var(--amber)", label: "Timed Out" } : { color: "var(--fg-tertiary)", label: "Ended" };
                                return (
                                  <motion.div key={sess._id} className="relative" variants={{ hidden: { opacity: 0, x: -12 }, visible: { opacity: 1, x: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } } }}>
                                    <div className="absolute -left-5 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full" style={{ background: "var(--bg)", border: `2px solid ${sess.location.inOffice ? "var(--green)" : "var(--teal)"}` }}>
                                      {sess.status === "active" && <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--green)" }} />}
                                    </div>
                                    <div className="rounded-xl p-3 transition-colors" style={{ background: "var(--bg-grouped)" }}>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-callout font-semibold" style={{ color: "var(--fg)" }}>
                                          {fmtTime(sess.sessionTime.start)}
                                          <span style={{ color: "var(--fg-tertiary)" }}> → </span>
                                          {sess.sessionTime.end ? fmtTime(sess.sessionTime.end) : "now"}
                                        </span>
                                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" }}>
                                          {fmtHours(sess.durationMinutes)}
                                        </span>
                                      </div>
                                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        <Pill color={sess.location.inOffice ? "var(--green)" : "var(--teal)"} label={sess.location.inOffice ? "Office" : "Remote"} size="sm" />
                                        <Pill color={statusConf.color} label={statusConf.label} size="sm" variant="outline" />
                                        <Pill color="var(--fg-tertiary)" label={device.label} size="sm" variant="outline" icon={device.icon} />
                                        {sess.isFirstOfficeEntry && <Pill color="var(--primary)" label="First In" size="sm" />}
                                        {sess.isLastOfficeExit && <Pill color="var(--amber)" label="Last Out" size="sm" />}
                                      </div>
                                      {sess.status === "active" && sess.lastActivity && (
                                        <p className="mt-1.5 text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>Last heartbeat {timeAgo(sess.lastActivity)}</p>
                                      )}
                                      {sess.ipAddress && (
                                        <p className="mt-1 text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>IP {sess.ipAddress}</p>
                                      )}
                                      {sess.officeSegments && sess.officeSegments.length > 0 && (
                                        <div className="mt-2.5 border-t pt-2.5" style={{ borderColor: "color-mix(in srgb, var(--border) 60%, transparent)" }}>
                                          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--fg-tertiary)" }}>Office Segments</p>
                                          <motion.div className="space-y-1" initial="hidden" animate="visible" variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } }}>
                                            {sess.officeSegments.map((seg, si) => (
                                              <motion.div key={si} className="flex items-center justify-between text-[10px]" variants={{ hidden: { opacity: 0, x: -10 }, visible: { opacity: 1, x: 0 } }}>
                                                <div className="flex items-center gap-1.5">
                                                  <span className="h-1 w-1 rounded-full" style={{ background: "var(--green)" }} />
                                                  <span style={{ color: "var(--fg-secondary)" }}>{fmtTime(seg.entryTime)} → {seg.exitTime ? fmtTime(seg.exitTime) : "now"}</span>
                                                </div>
                                                <span className="font-semibold" style={{ color: "var(--green)" }}>{fmtHours(seg.durationMinutes)}</span>
                                              </motion.div>
                                            ))}
                                          </motion.div>
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                );
                              })}
                          </motion.div>
                        </div>
                      </div>
                    )}
                  </div>
                    );
                  })()
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center p-5 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "var(--bg-grouped)" }}>
                      <svg className="h-6 w-6" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                    <p className="text-callout font-medium" style={{ color: "var(--fg-secondary)" }}>
                      {isSelectedToday ? "No data yet — session in progress" : "No attendance recorded"}
                    </p>
                  </div>
                )}
              </motion.div>
            ) : (
              /* ── Placeholder ── */
              <motion.div key="placeholder" className="card-xl flex flex-1 flex-col items-center justify-center p-8 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--bg-grouped)" }}>
                  <svg className="h-7 w-7" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                </div>
                <p className="text-callout font-medium" style={{ color: "var(--fg-secondary)" }}>
                  {isAggregateMode ? "Select a date to view team attendance" : "Select a date"}
                </p>
                <p className="text-caption mt-1" style={{ color: "var(--fg-tertiary)" }}>Tap any day on the calendar to see details</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Monthly records list — individual mode only */}
      {!isAggregateMode && (
        loading ? (
          <motion.div className="card-static overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <div className="shimmer h-5 w-40 rounded" />
            </div>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex w-full items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="shimmer h-2.5 w-2.5 shrink-0 rounded-full" />
                    <div className="space-y-1.5"><div className="shimmer h-4 w-28 rounded" /><div className="shimmer h-3 w-36 rounded" /></div>
                  </div>
                  <div className="text-right"><div className="shimmer ml-auto h-4 w-12 rounded" /><div className="mt-1.5 flex justify-end"><div className="shimmer h-5 w-16 rounded-full" /></div></div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : records.length > 0 ? (
          <motion.div className="card-static overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <h3 className="text-headline text-sm">Monthly Records</h3>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {records.map((rec, i) => {
                const recDay = new Date(rec.date).getDate();
                const isHighlighted = selectedDay === recDay;
                return (
                  <motion.button key={rec._id} type="button" onClick={() => setSelectedDay(recDay)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors"
                    style={isHighlighted ? { background: "color-mix(in srgb, var(--primary) 8%, transparent)" } : {}}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }} whileHover={{ x: 3 }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: rec.isPresent ? (rec.isOnTime ? "var(--green)" : "var(--amber)") : "var(--rose)" }} />
                      <div>
                        <p className="text-callout font-medium" style={{ color: "var(--fg)" }}>{new Date(rec.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
                        <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>{fmtTime(rec.firstStart ?? rec.firstOfficeEntry)} → {fmtTime(rec.lastEnd ?? rec.lastOfficeExit)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{fmtHours(rec.totalWorkingMinutes)}</p>
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: rec.isPresent ? (rec.isOnTime ? "color-mix(in srgb, var(--green) 15%, transparent)" : "color-mix(in srgb, var(--amber) 15%, transparent)") : "color-mix(in srgb, var(--rose) 15%, transparent)", color: rec.isPresent ? (rec.isOnTime ? "var(--green)" : "var(--amber)") : "var(--rose)" }}>
                        {rec.isPresent ? (rec.isOnTime ? "On Time" : "Late") : "Absent"}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        ) : null
      )}
    </div>
  );
}

/* ───── Sub-components ───── */

function Pill({ color, label, variant = "filled", size = "md", icon }: {
  color: string; label: string; variant?: "filled" | "outline"; size?: "sm" | "md"; icon?: "laptop" | "phone" | "desktop";
}) {
  const isSm = size === "sm";
  const isOutline = variant === "outline";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${isSm ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"}`}
      style={{
        background: isOutline ? "transparent" : `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
        border: isOutline ? `1px solid color-mix(in srgb, ${color} 30%, transparent)` : "none",
      }}
    >
      {icon === "laptop" && <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
      {icon === "phone" && <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>}
      {icon === "desktop" && <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
      {!isOutline && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
      {label}
    </span>
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <p className="text-sm font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

function AnalyticChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-2.5" style={{ background: "var(--bg-grouped)" }}>
      <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <p className="mt-0.5 text-sm font-bold" style={{ color }}>{value}</p>
    </div>
  );
}
