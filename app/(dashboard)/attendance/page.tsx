"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";

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

interface TeamMember {
  _id: string;
  name: string;
  role: string;
  department: string;
}

/* ───── Constants ───── */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* ───── Helpers ───── */

function fmtTime(dateStr?: string) {
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
  const isAdmin = authSession?.user?.role === "superadmin" || authSession?.user?.role === "manager";

  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [detailData, setDetailData] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [viewingUserId, setViewingUserId] = useState<string>("");
  const [todaySession, setTodaySession] = useState<{ active: boolean; inOffice: boolean; startTime: string | null; todayMinutes: number }>({
    active: false, inOffice: false, startTime: null, todayMinutes: 0,
  });

  const userIdParam = viewingUserId || "";

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const qs = `type=daily&year=${year}&month=${month}${userIdParam ? `&userId=${userIdParam}` : ""}`;
    const res = await fetch(`/api/attendance?${qs}`).then((r) => r.json());
    setRecords(Array.isArray(res) ? res : []);
    setLoading(false);
  }, [year, month, userIdParam]);

  const loadMonthlyStats = useCallback(async () => {
    const qs = `type=monthly&year=${year}&month=${month}${userIdParam ? `&userId=${userIdParam}` : ""}`;
    try {
      const res = await fetch(`/api/attendance?${qs}`).then((r) => r.json());
      setMonthlyStats(res ?? null);
    } catch { setMonthlyStats(null); }
  }, [year, month, userIdParam]);

  const loadTodaySession = useCallback(async () => {
    if (viewingUserId && viewingUserId !== authSession?.user?.id) return;
    try {
      const res = await fetch("/api/attendance/session").then((r) => r.json());
      setTodaySession({
        active: !!res.activeSession,
        inOffice: res.activeSession?.location?.inOffice ?? false,
        startTime: res.activeSession?.sessionTime?.start ?? null,
        todayMinutes: res.todayMinutes ?? 0,
      });
    } catch { /* ignore */ }
  }, [viewingUserId, authSession?.user?.id]);

  const loadTeam = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/attendance?type=team").then((r) => r.json());
      setTeamMembers(Array.isArray(res) ? res : []);
    } catch { /* ignore */ }
  }, [isAdmin]);

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

  useEffect(() => { loadRecords(); loadMonthlyStats(); }, [loadRecords, loadMonthlyStats]);
  useEffect(() => { loadTodaySession(); }, [loadTodaySession]);
  useEffect(() => { loadTeam(); }, [loadTeam]);

  useEffect(() => {
    setSelectedDay(null);
    setDetailData(null);
  }, [year, month, viewingUserId]);

  useEffect(() => {
    if (selectedDay !== null) loadDetail(selectedDay);
    else setDetailData(null);
  }, [selectedDay, loadDetail]);

  const recordMap = useMemo(() => {
    const map = new Map<number, DailyRecord>();
    records.forEach((r) => map.set(new Date(r.date).getDate(), r));
    return map;
  }, [records]);

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

  const selectedRecord = selectedDay ? recordMap.get(selectedDay) : null;
  const selectedDate = selectedDay ? new Date(year, month - 1, selectedDay) : null;
  const isSelectedToday = selectedDay !== null && isCurrentMonth && selectedDay === today.getDate();

  const viewingMember = teamMembers.find((m) => m._id === viewingUserId);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <motion.div className="flex items-start justify-between gap-3" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div>
          <h1 className="text-title">Attendance</h1>
          <p className="text-subhead hidden sm:block">
            {viewingMember ? `${viewingMember.name} · ` : ""}{MONTH_NAMES[month - 1]} {year} · {presentDays} day{presentDays !== 1 ? "s" : ""} present
          </p>
        </div>
        {/* Team member selector */}
        {isAdmin && teamMembers.length > 0 && (
          <select
            value={viewingUserId}
            onChange={(e) => setViewingUserId(e.target.value)}
            className="input text-sm"
            style={{ maxWidth: 220, paddingLeft: 12, paddingRight: 12 }}
          >
            <option value="">My Attendance</option>
            {teamMembers.map((m) => (
              <option key={m._id} value={m._id}>{m.name} — {m.department}</option>
            ))}
          </select>
        )}
      </motion.div>

      {/* Today's Session — only for self */}
      {isViewingSelf && (
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

      {/* Basic stats */}
      <motion.div className="grid grid-cols-3 gap-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        {[
          { label: "Present Days", value: String(presentDays), color: "var(--green)" },
          { label: "On Time", value: String(onTimeDays), color: "var(--primary)" },
          { label: "Total Hours", value: fmtHours(totalMins), color: "var(--teal)" },
        ].map((s) => (
          <div key={s.label} className="card-static p-3 text-center">
            <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>{s.label}</p>
            <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </motion.div>

      {/* Monthly analytics from MonthlyAttendanceStats */}
      <AnimatePresence>
        {monthlyStats && (
          <motion.div
            className="card-static p-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Monthly Insights</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              <AnalyticChip label="Avg Daily" value={`${monthlyStats.averageDailyHours.toFixed(1)}h`} color="var(--primary)" />
              <AnalyticChip label="Avg Arrival" value={monthlyStats.averageOfficeInTime ?? "—"} color="var(--green)" />
              <AnalyticChip label="Avg Departure" value={monthlyStats.averageOfficeOutTime ?? "—"} color="var(--amber)" />
              <AnalyticChip label="On-Time %" value={`${Math.round(monthlyStats.onTimePercentage)}%`} color={monthlyStats.onTimePercentage >= 80 ? "var(--green)" : "var(--amber)"} />
              <AnalyticChip label="Attendance %" value={`${Math.round(monthlyStats.attendancePercentage)}%`} color={monthlyStats.attendancePercentage >= 90 ? "var(--green)" : "var(--rose)"} />
              <AnalyticChip label="Office / Remote" value={`${Math.round(monthlyStats.totalOfficeHours)}h / ${Math.round(monthlyStats.totalRemoteHours)}h`} color="var(--teal)" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calendar + Detail */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-5">
        {/* Calendar */}
        <motion.div className="card-static p-3 sm:p-4 lg:col-span-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={prevMonth} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-secondary)" }}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h2 className="text-headline">{MONTH_NAMES[month - 1]} {year}</h2>
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
                  if (rec?.isPresent) dotColor = rec.isOnTime ? "var(--green)" : "var(--amber)";
                  else if (rec) dotColor = "var(--rose)";

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

          <div className="mt-3 flex flex-wrap items-center gap-3 text-caption" style={{ color: "var(--fg-tertiary)" }}>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--green)" }} /> On Time</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--amber)" }} /> Late</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--rose)" }} /> Absent</span>
          </div>
        </motion.div>

        {/* Day detail panel */}
        <div className="flex flex-col lg:col-span-2">
          <AnimatePresence mode="wait">
            {selectedDay !== null ? (
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
                  <div className="flex-1 space-y-3 p-5">{[1,2,3,4].map(i => <div key={i} className="shimmer h-10 rounded-xl" />)}</div>
                ) : detailData ? (
                  <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Status pills */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill color={detailData.isPresent ? (detailData.isOnTime ? "var(--green)" : "var(--amber)") : "var(--rose)"} label={detailData.isPresent ? (detailData.isOnTime ? "On Time" : "Late") : "Absent"} />
                      {(detailData.lateBy ?? 0) > 0 && <Pill color="var(--amber)" label={`Late by ${fmtHours(detailData.lateBy!)}`} variant="outline" />}
                      {(detailData.breakMinutes ?? 0) > 0 && <Pill color="var(--fg-tertiary)" label={`${fmtHours(detailData.breakMinutes!)} break`} variant="outline" />}
                      <Pill color="var(--fg-tertiary)" label={`${detailData.activitySessions?.length ?? 0} session${(detailData.activitySessions?.length ?? 0) !== 1 ? "s" : ""}`} variant="outline" />
                    </div>

                    {/* Summary text */}
                    <p className="text-caption" style={{ color: "var(--fg-secondary)" }}>
                      {detailData.isPresent
                        ? `Worked ${fmtHours(detailData.totalWorkingMinutes)} across ${detailData.activitySessions?.length ?? 0} session${(detailData.activitySessions?.length ?? 0) !== 1 ? "s" : ""}${detailData.officeMinutes > 0 && detailData.remoteMinutes > 0 ? " — split between office and remote" : detailData.officeMinutes > 0 ? " — from office" : " — remotely"}`
                        : "No work sessions recorded for this day"}
                    </p>

                    {/* Stat chips */}
                    <div className="grid grid-cols-3 gap-2">
                      <StatChip label="Total" value={fmtHours(detailData.totalWorkingMinutes)} color="var(--primary)" />
                      <StatChip label="Office" value={fmtHours(detailData.officeMinutes)} color="var(--green)" />
                      <StatChip label="Remote" value={fmtHours(detailData.remoteMinutes)} color="var(--teal)" />
                    </div>

                    {/* Work split bar */}
                    {detailData.totalWorkingMinutes > 0 && (
                      <div>
                        <div className="mb-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                          <span>Work Split</span>
                          <span>{fmtTime(detailData.firstOfficeEntry)} → {fmtTime(detailData.lastOfficeExit)}</span>
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

                    {/* Session timeline */}
                    {detailData.activitySessions && detailData.activitySessions.length > 0 && (
                      <div>
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Session Timeline</p>
                        <div className="relative pl-5">
                          <div className="absolute left-[7px] top-1 bottom-1 w-[2px] rounded-full" style={{ background: "var(--border)" }} />
                          <div className="space-y-4">
                            {detailData.activitySessions
                              .sort((a, b) => new Date(a.sessionTime.start).getTime() - new Date(b.sessionTime.start).getTime())
                              .map((sess, idx) => {
                                const device = detectDevice(sess.platform);
                                const statusConf = sess.status === "active"
                                  ? { color: "var(--green)", label: "Active" }
                                  : sess.status === "timeout"
                                    ? { color: "var(--amber)", label: "Timed Out" }
                                    : { color: "var(--fg-tertiary)", label: "Ended" };

                                return (
                                  <motion.div key={sess._id} className="relative" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: idx * 0.08 }}>
                                    {/* Timeline dot */}
                                    <div className="absolute -left-5 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full" style={{ background: "var(--bg)", border: `2px solid ${sess.location.inOffice ? "var(--green)" : "var(--teal)"}` }}>
                                      {sess.status === "active" && <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--green)" }} />}
                                    </div>

                                    <div className="rounded-xl p-3 transition-colors" style={{ background: "var(--glass-bg)" }}>
                                      {/* Time range + duration */}
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

                                      {/* Pills: location, status, device, first-in/last-out badges */}
                                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        <Pill color={sess.location.inOffice ? "var(--green)" : "var(--teal)"} label={sess.location.inOffice ? "Office" : "Remote"} size="sm" />
                                        <Pill color={statusConf.color} label={statusConf.label} size="sm" variant="outline" />
                                        <Pill color="var(--fg-tertiary)" label={device.label} size="sm" variant="outline" icon={device.icon} />
                                        {sess.isFirstOfficeEntry && <Pill color="var(--primary)" label="First In" size="sm" />}
                                        {sess.isLastOfficeExit && <Pill color="var(--amber)" label="Last Out" size="sm" />}
                                      </div>

                                      {/* Last heartbeat for active sessions */}
                                      {sess.status === "active" && sess.lastActivity && (
                                        <p className="mt-1.5 text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
                                          Last heartbeat {timeAgo(sess.lastActivity)}
                                        </p>
                                      )}

                                      {/* IP address for audit */}
                                      {sess.ipAddress && (
                                        <p className="mt-1 text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
                                          IP {sess.ipAddress}
                                        </p>
                                      )}

                                      {/* Office segments sub-timeline */}
                                      {sess.officeSegments && sess.officeSegments.length > 0 && (
                                        <div className="mt-2.5 border-t pt-2.5" style={{ borderColor: "color-mix(in srgb, var(--border) 60%, transparent)" }}>
                                          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--fg-tertiary)" }}>Office Segments</p>
                                          <div className="space-y-1">
                                            {sess.officeSegments.map((seg, si) => (
                                              <div key={si} className="flex items-center justify-between text-[10px]">
                                                <div className="flex items-center gap-1.5">
                                                  <span className="h-1 w-1 rounded-full" style={{ background: "var(--green)" }} />
                                                  <span style={{ color: "var(--fg-secondary)" }}>
                                                    {fmtTime(seg.entryTime)} → {seg.exitTime ? fmtTime(seg.exitTime) : "now"}
                                                  </span>
                                                </div>
                                                <span className="font-semibold" style={{ color: "var(--green)" }}>
                                                  {fmtHours(seg.durationMinutes)}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                );
                              })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center p-5 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "var(--glass-bg)" }}>
                      <svg className="h-6 w-6" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                    <p className="text-callout font-medium" style={{ color: "var(--fg-secondary)" }}>
                      {isSelectedToday ? "No data yet — session in progress" : "No attendance recorded"}
                    </p>
                    <p className="text-caption mt-1" style={{ color: "var(--fg-tertiary)" }}>
                      {isSelectedToday ? "Data appears after your first session closes" : "This day has no tracked sessions"}
                    </p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div key="placeholder" className="card-xl flex flex-1 flex-col items-center justify-center p-8 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--glass-bg)" }}>
                  <svg className="h-7 w-7" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                </div>
                <p className="text-callout font-medium" style={{ color: "var(--fg-secondary)" }}>Select a date</p>
                <p className="text-caption mt-1" style={{ color: "var(--fg-tertiary)" }}>Tap any day on the calendar to see details</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Monthly records list */}
      {loading ? (
        <div className="animate-pulse space-y-2">{[1,2,3,4].map(i => <div key={i} className="shimmer h-14 rounded-xl" />)}</div>
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
                      <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>{fmtTime(rec.firstOfficeEntry)} → {fmtTime(rec.lastOfficeExit)}</p>
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
      ) : (
        <motion.div className="card p-12 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <p style={{ color: "var(--fg-secondary)" }}>No attendance records for this month yet.</p>
        </motion.div>
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
    <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--glass-bg)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <p className="text-sm font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

function AnalyticChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-2.5" style={{ background: "var(--glass-bg)" }}>
      <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <p className="mt-0.5 text-sm font-bold" style={{ color }}>{value}</p>
    </div>
  );
}
