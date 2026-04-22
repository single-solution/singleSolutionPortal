"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface CalendarDayMeta {
  dotColor?: string;
  isHoliday?: boolean;
  isLeave?: boolean;
}

export interface MiniCalendarProps {
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  selectedDay?: number | null;
  onSelectDay?: (day: number | null) => void;
  getDayMeta?: (day: number) => CalendarDayMeta | undefined;
  loading?: boolean;
  className?: string;
  showLegend?: boolean;
  legendItems?: { label: string; color: string; type?: "dot" | "bg" }[];
  compact?: boolean;
}

export function MiniCalendar({
  year,
  month,
  onPrevMonth,
  onNextMonth,
  selectedDay,
  onSelectDay,
  getDayMeta,
  loading,
  className = "",
  showLegend = false,
  legendItems,
  compact = false,
}: MiniCalendarProps) {
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  const { daysInMonth, firstDayOfWeek } = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    return { daysInMonth: last.getDate(), firstDayOfWeek: first.getDay() };
  }, [year, month]);

  return (
    <div className={`flex flex-col rounded-xl border p-3 ${className}`} style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={onPrevMonth} className="rounded-lg p-1 transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-secondary)" }}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <AnimatePresence mode="wait">
          <motion.span
            key={`${month}-${year}`}
            className={compact ? "text-[11px] font-bold" : "text-xs font-bold"}
            style={{ color: "var(--fg)" }}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
          >
            {MONTH_NAMES[month - 1]} {year}
          </motion.span>
        </AnimatePresence>
        <button type="button" onClick={onNextMonth} className="rounded-lg p-1 transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-secondary)" }}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAY_NAMES.map((d) => {
          const isWeekendCol = d === "Sat" || d === "Sun";
          return (
            <div key={d} className="py-0.5 text-center text-[11px] font-semibold uppercase" style={{ color: isWeekendCol ? "var(--fg-quaternary, var(--fg-tertiary))" : "var(--fg-tertiary)" }}>
              {compact ? d[0] : d}
            </div>
          );
        })}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${year}-${month}`}
            className="col-span-7 grid grid-cols-7 gap-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {Array.from({ length: firstDayOfWeek }, (_, i) => <div key={`e-${i}`} className="py-1" />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const meta = getDayMeta?.(day);
              const dateObj = new Date(year, month - 1, day);
              const dayOfWeek = dateObj.getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const isHoliday = meta?.isHoliday ?? false;
              const isLeave = meta?.isLeave ?? false;
              const isOff = isWeekend || isHoliday;
              const isToday = isCurrentMonth && day === today.getDate();
              const isSelected = selectedDay === day;
              const isFuture = isCurrentMonth ? day > today.getDate() : dateObj > today;
              let dotColor = loading ? "transparent" : (meta?.dotColor ?? "transparent");
              if (isOff && dotColor === "transparent" && !loading) dotColor = "color-mix(in srgb, var(--fg-tertiary) 25%, transparent)";

              const offBg = isLeave
                ? "color-mix(in srgb, var(--teal) 10%, transparent)"
                : isHoliday
                  ? "color-mix(in srgb, var(--purple) 8%, transparent)"
                  : isWeekend
                    ? "color-mix(in srgb, var(--fg-tertiary) 6%, transparent)"
                    : undefined;

              return (
                <motion.button
                  key={day}
                  type="button"
                  onClick={() => !isFuture && !loading && onSelectDay?.(isSelected ? null : day)}
                  disabled={isFuture || !onSelectDay || loading}
                  className="flex flex-col items-center gap-0.5 rounded-lg py-1 transition-all outline-none"
                  style={{
                    ...(isSelected
                      ? { background: "var(--primary)", borderRadius: "0.5rem" }
                      : isToday
                        ? { boxShadow: "0 0 0 1.5px var(--primary)", borderRadius: "0.5rem", background: offBg }
                        : offBg ? { background: offBg } : {}),
                    cursor: isFuture || !onSelectDay ? "default" : "pointer",
                    opacity: isFuture ? 0.35 : 1,
                  }}
                  whileHover={!isFuture && onSelectDay ? { scale: 1.08 } : undefined}
                  whileTap={!isFuture && onSelectDay ? { scale: 0.92 } : undefined}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: isFuture ? 0.35 : 1, scale: 1 }}
                  transition={{ duration: 0.15, delay: Math.min(i * 0.008, 0.25) }}
                >
                  <span className={compact ? "text-[11px] font-medium" : "text-[12px] font-medium"} style={{ color: isSelected ? "white" : isToday ? "var(--primary)" : isOff ? "var(--fg-tertiary)" : "var(--fg)" }}>
                    {day}
                  </span>
                  <span className={`h-1.5 w-1.5 rounded-full${loading && !isFuture ? " shimmer" : ""}`} style={{ background: loading && !isFuture ? undefined : isSelected ? (dotColor === "transparent" ? "rgba(255,255,255,0.3)" : "white") : dotColor }} />
                </motion.button>
              );
            })}
            {Array.from({ length: 42 - firstDayOfWeek - daysInMonth }, (_, i) => <div key={`t-${i}`} className="py-1" />)}
          </motion.div>
        </AnimatePresence>
      </div>

      {showLegend && legendItems && legendItems.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
          {legendItems.map((item) => (
            <span key={item.label} className="flex items-center gap-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: item.color }}
              />
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function useCalendarNav(initialYear?: number, initialMonth?: number) {
  const now = new Date();
  const y = initialYear ?? now.getFullYear();
  const m = initialMonth ?? now.getMonth() + 1;

  return {
    defaultYear: y,
    defaultMonth: m,
    prevMonth: (year: number, month: number) => {
      if (month === 1) return { year: year - 1, month: 12 };
      return { year, month: month - 1 };
    },
    nextMonth: (year: number, month: number) => {
      if (month === 12) return { year: year + 1, month: 1 };
      return { year, month: month + 1 };
    },
  };
}
