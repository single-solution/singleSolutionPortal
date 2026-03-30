"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { slideUpItem, staggerContainer } from "@/lib/motion";

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
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatTime(dateStr?: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatHours(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function AttendancePage() {
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [todaySession, setTodaySession] = useState<{ active: boolean; inOffice: boolean; startTime: string | null; todayMinutes: number }>({
    active: false, inOffice: false, startTime: null, todayMinutes: 0,
  });

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/attendance?type=daily&year=${year}&month=${month}`).then((r) => r.json());
    setRecords(Array.isArray(res) ? res : []);
    setLoading(false);
  }, [year, month]);

  const loadTodaySession = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance/session").then((r) => r.json());
      setTodaySession({
        active: !!res.activeSession,
        inOffice: res.activeSession?.location?.inOffice ?? false,
        startTime: res.activeSession?.sessionTime?.start ?? null,
        todayMinutes: res.todayMinutes ?? 0,
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadRecords(); }, [loadRecords]);
  useEffect(() => { loadTodaySession(); }, [loadTodaySession]);

  const recordMap = useMemo(() => {
    const map = new Map<number, DailyRecord>();
    records.forEach((r) => {
      const d = new Date(r.date).getDate();
      map.set(d, r);
    });
    return map;
  }, [records]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1);
  }

  const presentDays = records.filter((r) => r.isPresent).length;
  const onTimeDays = records.filter((r) => r.isOnTime).length;
  const totalMins = records.reduce((s, r) => s + r.totalWorkingMinutes, 0);

  return (
    <motion.div className="flex flex-col gap-4" variants={staggerContainer} initial="hidden" animate="visible">
      <motion.div className="flex items-start justify-between gap-3" variants={slideUpItem}>
        <div>
          <h1 className="text-title"><span className="gradient-text">Attendance</span></h1>
          <p className="text-subhead mt-1">{MONTH_NAMES[month - 1]} {year} · {presentDays} day{presentDays !== 1 ? "s" : ""} present</p>
        </div>
      </motion.div>

      {/* Today's Session Info (auto-managed) */}
      <motion.div className="card-xl flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" variants={slideUpItem}>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{
            background: todaySession.active
              ? todaySession.inOffice
                ? "linear-gradient(135deg, #10b981, #059669)"
                : "linear-gradient(135deg, #3b82f6, #2563eb)"
              : "linear-gradient(135deg, var(--fg-tertiary), var(--fg-secondary))",
          }}>
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-headline" style={{ color: "var(--fg)" }}>
              {todaySession.active
                ? todaySession.inOffice ? "Working from Office" : "Working Remotely"
                : "Session Inactive"}
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
            <p className="text-lg font-bold" style={{ color: "var(--primary)" }}>{formatHours(todaySession.todayMinutes)}</p>
          </div>
          <span className="flex h-3 w-3 shrink-0">
            <span className="relative inline-flex h-3 w-3 rounded-full" style={{
              background: todaySession.active ? (todaySession.inOffice ? "#10b981" : "#3b82f6") : "var(--fg-tertiary)",
            }}>
              {todaySession.active && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ background: todaySession.inOffice ? "#10b981" : "#3b82f6" }} />}
            </span>
          </span>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div className="grid grid-cols-3 gap-3" variants={slideUpItem}>
        {[
          { label: "Present Days", value: presentDays, color: "var(--green)" },
          { label: "On Time", value: onTimeDays, color: "var(--primary)" },
          { label: "Total Hours", value: formatHours(totalMins), color: "var(--teal)" },
        ].map((s) => (
          <div key={s.label} className="card-static p-3 text-center">
            <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>{s.label}</p>
            <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </motion.div>

      {/* Calendar */}
      <motion.div className="card-static p-3 sm:p-4" variants={slideUpItem}>
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
          {Array.from({ length: firstDayOfWeek }, (_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const rec = recordMap.get(day);
            const isToday = isCurrentMonth && day === today.getDate();
            let dotColor = "transparent";
            if (rec?.isPresent) dotColor = rec.isOnTime ? "var(--green)" : "var(--amber)";
            else if (rec) dotColor = "var(--rose)";

            return (
              <motion.div key={day} className="flex flex-col items-center gap-0.5 rounded-lg py-1.5 transition-colors" style={isToday ? { boxShadow: "0 0 0 2px var(--primary)", borderRadius: "0.5rem" } : {}} whileHover={{ scale: 1.05 }}>
                <span className="text-[13px] font-medium" style={{ color: isToday ? "var(--primary)" : "var(--fg)" }}>{day}</span>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
              </motion.div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-caption" style={{ color: "var(--fg-tertiary)" }}>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--green)" }} /> On Time</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--amber)" }} /> Late</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--rose)" }} /> Absent</span>
        </div>
      </motion.div>

      {/* Recent records */}
      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="shimmer h-14 rounded-xl" />)}
        </div>
      ) : records.length > 0 ? (
        <motion.div className="card-static overflow-hidden" variants={slideUpItem}>
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <h3 className="text-headline text-sm">Recent Records</h3>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {records.slice(0, 10).map((rec) => (
              <motion.div key={rec._id} className="flex items-center justify-between px-4 py-3" whileHover={{ x: 3 }}>
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: rec.isPresent ? (rec.isOnTime ? "var(--green)" : "var(--amber)") : "var(--rose)" }} />
                  <div>
                    <p className="text-callout font-medium" style={{ color: "var(--fg)" }}>{new Date(rec.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>
                    <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>{formatTime(rec.firstOfficeEntry)} → {formatTime(rec.lastOfficeExit)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{formatHours(rec.totalWorkingMinutes)}</p>
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: rec.isPresent ? (rec.isOnTime ? "color-mix(in srgb, var(--green) 15%, transparent)" : "color-mix(in srgb, var(--amber) 15%, transparent)") : "color-mix(in srgb, var(--rose) 15%, transparent)", color: rec.isPresent ? (rec.isOnTime ? "var(--green)" : "var(--amber)") : "var(--rose)" }}>
                    {rec.isPresent ? (rec.isOnTime ? "On Time" : "Late") : "Absent"}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      ) : (
        <motion.div className="card-static p-8 text-center" variants={slideUpItem}>
          <p className="text-callout" style={{ color: "var(--fg-tertiary)" }}>No attendance records for this month yet. Records will appear once presence tracking begins.</p>
        </motion.div>
      )}
    </motion.div>
  );
}
