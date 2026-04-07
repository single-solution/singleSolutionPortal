"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { ease } from "@/lib/motion";

/* ─── helpers ─── */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number) { return String(n).padStart(2, "0"); }
function dateKey(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}`; }
function fmtMins(m: number) { const h = Math.floor(m / 60); return `${h}h ${Math.round(m - h * 60)}m`; }

function calendarDays(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const daysInMonth = last.getDate();
  const startDay = first.getDay();
  const grid: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(d);
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

/* ─── types ─── */

interface DailyRecord {
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
}

interface LeaveRecord {
  _id: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  user?: { about?: { firstName?: string; lastName?: string }; username?: string };
}

interface HolidayRecord {
  _id: string;
  name: string;
  date: string;
  isRecurring: boolean;
}

type DayType = "present" | "absent" | "late" | "holiday" | "leave" | "weekend" | "future" | "empty";

/* ─── main component ─── */

export default function CalendarPage() {
  const { data: session } = useSession();

  const today = useMemo(() => {
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() + 1, day: t.getDate() };
  }, []);

  const [year, setYear] = useState(today.year);
  const [month, setMonth] = useState(today.month);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [direction, setDirection] = useState(0);

  const [attendance, setAttendance] = useState<DailyRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const [attRes, leavesRes, holRes] = await Promise.all([
        fetch(`/api/attendance?type=daily&year=${y}&month=${m}`),
        fetch(`/api/leaves?year=${y}&month=${m}`),
        fetch(`/api/payroll/holidays?year=${y}`),
      ]);
      const [attData, leavesData, holData] = await Promise.all([
        attRes.ok ? attRes.json() : [],
        leavesRes.ok ? leavesRes.json() : [],
        holRes.ok ? holRes.json() : [],
      ]);
      setAttendance(Array.isArray(attData) ? attData : []);
      setLeaves(Array.isArray(leavesData) ? leavesData : []);
      setHolidays(Array.isArray(holData) ? holData : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(year, month); }, [year, month, fetchData]);

  const goMonth = useCallback((delta: number) => {
    setDirection(delta);
    setSelectedDay(null);
    setMonth((prev) => {
      let m = prev + delta;
      if (m < 1) { setYear((y) => y - 1); m = 12; }
      if (m > 12) { setYear((y) => y + 1); m = 1; }
      return m;
    });
  }, []);

  const goToday = useCallback(() => {
    setDirection(0);
    setYear(today.year);
    setMonth(today.month);
    setSelectedDay(today.day);
  }, [today]);

  /* build lookup maps */
  const attMap = useMemo(() => {
    const m = new Map<string, DailyRecord>();
    for (const r of attendance) {
      const d = new Date(r.date);
      m.set(dateKey(d.getFullYear(), d.getMonth() + 1, d.getDate()), r);
    }
    return m;
  }, [attendance]);

  const holidayMap = useMemo(() => {
    const m = new Map<string, HolidayRecord>();
    for (const h of holidays) {
      const d = new Date(h.date);
      if (d.getMonth() + 1 === month) {
        m.set(dateKey(d.getFullYear(), d.getMonth() + 1, d.getDate()), h);
      }
    }
    return m;
  }, [holidays, month]);

  const leaveMap = useMemo(() => {
    const m = new Map<string, LeaveRecord[]>();
    for (const l of leaves) {
      if (l.status !== "approved" && l.status !== "pending") continue;
      const start = new Date(l.startDate);
      const end = new Date(l.endDate);
      const cur = new Date(start);
      cur.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      while (cur <= end) {
        if (cur.getMonth() + 1 === month && cur.getFullYear() === year) {
          const k = dateKey(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());
          const arr = m.get(k) ?? [];
          arr.push(l);
          m.set(k, arr);
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
    return m;
  }, [leaves, month, year]);

  const grid = useMemo(() => calendarDays(year, month), [year, month]);

  function getDayType(day: number): DayType {
    const k = dateKey(year, month, day);
    const d = new Date(year, month - 1, day);
    const dow = d.getDay();
    const isFuture = year > today.year || (year === today.year && month > today.month) || (year === today.year && month === today.month && day > today.day);

    if (isFuture) return "future";
    if (holidayMap.has(k)) return "holiday";

    const lvs = leaveMap.get(k);
    if (lvs && lvs.some((l) => l.status === "approved")) return "leave";

    if (dow === 0 || dow === 6) return "weekend";

    const att = attMap.get(k);
    if (att) {
      if (!att.isOnTime || att.lateBy || att.isLateToOffice) return "late";
      if (att.isPresent) return "present";
    }

    return "absent";
  }

  const dayColors: Record<DayType, { bg: string; text: string; dot: string }> = {
    present: { bg: "rgba(34,197,94,0.12)", text: "var(--fg)", dot: "#22c55e" },
    late: { bg: "rgba(245,158,11,0.12)", text: "var(--fg)", dot: "#f59e0b" },
    absent: { bg: "rgba(239,68,68,0.12)", text: "var(--fg)", dot: "#ef4444" },
    holiday: { bg: "rgba(59,130,246,0.12)", text: "var(--fg)", dot: "#3b82f6" },
    leave: { bg: "rgba(168,85,247,0.12)", text: "var(--fg)", dot: "#a855f7" },
    weekend: { bg: "transparent", text: "var(--fg-tertiary)", dot: "transparent" },
    future: { bg: "transparent", text: "var(--fg-tertiary)", dot: "transparent" },
    empty: { bg: "transparent", text: "transparent", dot: "transparent" },
  };

  /* detail for selected day */
  const selectedKey = selectedDay ? dateKey(year, month, selectedDay) : null;
  const selectedAtt = selectedKey ? attMap.get(selectedKey) : null;
  const selectedHoliday = selectedKey ? holidayMap.get(selectedKey) : null;
  const selectedLeaves = selectedKey ? leaveMap.get(selectedKey) ?? [] : [];
  const selectedType = selectedDay ? getDayType(selectedDay) : null;

  if (!session) return null;

  return (
    <div className="space-y-6">
      {/* month nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => goMonth(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--hover-bg)]"
            style={{ color: "var(--fg-secondary)" }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-base font-bold min-w-[160px] text-center" style={{ color: "var(--fg)" }}>
            {MONTHS[month - 1]} {year}
          </h2>
          <button
            type="button"
            onClick={() => goMonth(1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--hover-bg)]"
            style={{ color: "var(--fg-secondary)" }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          onClick={goToday}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
          style={{ background: "var(--primary-light)", color: "var(--primary)" }}
        >
          Today
        </button>
      </div>

      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {([
          ["Present", "#22c55e"],
          ["Late", "#f59e0b"],
          ["Absent", "#ef4444"],
          ["Holiday", "#3b82f6"],
          ["Leave", "#a855f7"],
        ] as [string, string][]).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: "var(--fg-secondary)" }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {label}
          </div>
        ))}
      </div>

      {/* calendar grid */}
      <div className="frosted rounded-2xl p-3 sm:p-4" style={{ borderColor: "var(--border)" }}>
        {/* weekday headers */}
        <div className="grid grid-cols-7 mb-2">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[10px] sm:text-xs font-semibold py-1" style={{ color: "var(--fg-tertiary)" }}>
              {d}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${year}-${month}`}
            initial={{ opacity: 0, x: direction > 0 ? 40 : direction < 0 ? -40 : 0 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction > 0 ? -40 : direction < 0 ? 40 : 0 }}
            transition={{ duration: 0.2, ease }}
          >
            <div className="grid grid-cols-7 gap-1">
              {grid.map((day, i) => {
                if (day === null) return <div key={`e-${i}`} className="aspect-square" />;
                const type = getDayType(day);
                const colors = dayColors[type];
                const isToday = year === today.year && month === today.month && day === today.day;
                const isSelected = selectedDay === day;
                const k = dateKey(year, month, day);
                const hasLeave = leaveMap.has(k);
                const hasHoliday = holidayMap.has(k);

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className="relative aspect-square flex flex-col items-center justify-center rounded-xl transition-all duration-150"
                    style={{
                      background: isSelected ? "var(--primary)" : colors.bg,
                      color: isSelected ? "#fff" : colors.text,
                      boxShadow: isToday && !isSelected ? "inset 0 0 0 2px var(--primary)" : undefined,
                    }}
                  >
                    <span className="text-xs sm:text-sm font-semibold leading-none">{day}</span>
                    {/* dots */}
                    {type !== "future" && type !== "weekend" && (
                      <div className="flex gap-0.5 mt-0.5">
                        {colors.dot !== "transparent" && (
                          <span
                            className="h-1 w-1 rounded-full"
                            style={{ background: isSelected ? "#fff" : colors.dot }}
                          />
                        )}
                        {hasLeave && type !== "leave" && (
                          <span className="h-1 w-1 rounded-full" style={{ background: isSelected ? "#fff" : "#a855f7" }} />
                        )}
                        {hasHoliday && type !== "holiday" && (
                          <span className="h-1 w-1 rounded-full" style={{ background: isSelected ? "#fff" : "#3b82f6" }} />
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {loading && (
              <div className="flex justify-center py-4">
                <div className="h-5 w-5 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* monthly summary */}
      <MonthSummary attendance={attendance} holidays={holidays} leaves={leaves} month={month} year={year} today={today} />

      {/* detail panel */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div
            key={`detail-${selectedDay}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease }}
            className="frosted rounded-2xl p-4 sm:p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold" style={{ color: "var(--fg)" }}>
                {MONTHS[month - 1]} {selectedDay}, {year}
              </h3>
              {selectedType && (
                <span
                  className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: dayColors[selectedType].bg, color: dayColors[selectedType].dot }}
                >
                  {selectedType}
                </span>
              )}
            </div>

            {/* holiday */}
            {selectedHoliday && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(59,130,246,0.08)" }}>
                <svg className="h-4 w-4 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                <div>
                  <p className="text-xs font-semibold text-blue-600">{selectedHoliday.name}</p>
                  {selectedHoliday.isRecurring && (
                    <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>Recurring holiday</p>
                  )}
                </div>
              </div>
            )}

            {/* leaves */}
            {selectedLeaves.length > 0 && (
              <div className="space-y-1.5">
                {selectedLeaves.map((l) => (
                  <div key={l._id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(168,85,247,0.08)" }}>
                    <svg className="h-4 w-4 shrink-0 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-purple-600 capitalize">
                        {l.type} Leave
                        <span
                          className="ml-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                          style={{
                            background: l.status === "approved" ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
                            color: l.status === "approved" ? "#16a34a" : "#d97706",
                          }}
                        >
                          {l.status}
                        </span>
                      </p>
                      {l.reason && <p className="text-[10px] truncate" style={{ color: "var(--fg-tertiary)" }}>{l.reason}</p>}
                      {l.user?.about && (
                        <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
                          {l.user.about.firstName} {l.user.about.lastName}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>{l.days}d</span>
                  </div>
                ))}
              </div>
            )}

            {/* attendance detail */}
            {selectedAtt && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <StatMini label="Total" value={fmtMins(selectedAtt.totalWorkingMinutes)} />
                  <StatMini label="Office" value={fmtMins(selectedAtt.officeMinutes)} />
                  <StatMini label="Remote" value={fmtMins(selectedAtt.remoteMinutes)} />
                  <StatMini
                    label="Status"
                    value={selectedAtt.isOnTime && !selectedAtt.lateBy ? "On Time" : `Late ${selectedAtt.lateBy ?? 0}m`}
                    color={selectedAtt.isOnTime && !selectedAtt.lateBy ? "#22c55e" : "#f59e0b"}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {selectedAtt.firstStart && (
                    <StatMini label="Clock In" value={new Date(selectedAtt.firstStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
                  )}
                  {selectedAtt.lastEnd && (
                    <StatMini label="Clock Out" value={new Date(selectedAtt.lastEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
                  )}
                  {selectedAtt.firstOfficeEntry && (
                    <StatMini label="Arrived" value={new Date(selectedAtt.firstOfficeEntry).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
                  )}
                  {selectedAtt.lastOfficeExit && (
                    <StatMini label="Left" value={new Date(selectedAtt.lastOfficeExit).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
                  )}
                </div>
                {selectedAtt.isLateToOffice && (
                  <p className="text-[10px] font-medium" style={{ color: "#f59e0b" }}>
                    Late to office by {selectedAtt.lateToOfficeBy ?? 0} minutes
                  </p>
                )}
              </div>
            )}

            {!selectedAtt && !selectedHoliday && selectedLeaves.length === 0 && selectedType !== "future" && selectedType !== "weekend" && (
              <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>No attendance record for this day.</p>
            )}
            {selectedType === "weekend" && (
              <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>Weekend — no working day.</p>
            )}
            {selectedType === "future" && (
              <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>Future date.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── sub-components ─── */

function StatMini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "var(--bg-grouped)" }}>
      <p className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <p className="text-xs font-bold" style={{ color: color ?? "var(--fg)" }}>{value}</p>
    </div>
  );
}

function MonthSummary({
  attendance, holidays, leaves, month, year, today,
}: {
  attendance: DailyRecord[];
  holidays: HolidayRecord[];
  leaves: LeaveRecord[];
  month: number;
  year: number;
  today: { year: number; month: number; day: number };
}) {
  const stats = useMemo(() => {
    const presentDays = attendance.filter((r) => r.isPresent).length;
    const lateDays = attendance.filter((r) => r.isPresent && (r.lateBy || r.isLateToOffice || !r.isOnTime)).length;
    const totalMinutes = attendance.reduce((s, r) => s + (r.totalWorkingMinutes ?? 0), 0);
    const officeMinutes = attendance.reduce((s, r) => s + (r.officeMinutes ?? 0), 0);
    const remoteMinutes = attendance.reduce((s, r) => s + (r.remoteMinutes ?? 0), 0);

    const monthHolidays = holidays.filter((h) => {
      const d = new Date(h.date);
      return d.getMonth() + 1 === month && d.getFullYear() === year;
    }).length;

    const approvedLeaves = leaves.filter((l) => l.status === "approved").reduce((s, l) => s + l.days, 0);

    const lastDay = year > today.year || (year === today.year && month > today.month)
      ? 0
      : year === today.year && month === today.month
        ? today.day
        : new Date(year, month, 0).getDate();

    let workingDays = 0;
    for (let d = 1; d <= lastDay; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      if (dow !== 0 && dow !== 6) workingDays++;
    }
    const absentDays = Math.max(0, workingDays - presentDays - monthHolidays);

    return { presentDays, lateDays, absentDays, totalMinutes, officeMinutes, remoteMinutes, monthHolidays, approvedLeaves, workingDays };
  }, [attendance, holidays, leaves, month, year, today]);

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      <SummaryCard label="Present" value={String(stats.presentDays)} sub={`/ ${stats.workingDays}`} color="#22c55e" />
      <SummaryCard label="Late" value={String(stats.lateDays)} color="#f59e0b" />
      <SummaryCard label="Absent" value={String(stats.absentDays)} color="#ef4444" />
      <SummaryCard label="Hours" value={fmtMins(stats.totalMinutes)} color="var(--primary)" />
      <SummaryCard label="Leaves" value={String(stats.approvedLeaves)} sub={`day${stats.approvedLeaves !== 1 ? "s" : ""}`} color="#a855f7" />
    </div>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="frosted rounded-xl px-3 py-2.5 text-center">
      <p className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <p className="text-sm font-bold" style={{ color }}>
        {value}
        {sub && <span className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}> {sub}</span>}
      </p>
    </div>
  );
}
