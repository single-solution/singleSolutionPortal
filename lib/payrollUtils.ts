import type { IHoliday } from "@/lib/models/Holiday";

/** YYYY-MM-DD in UTC for a calendar day. */
export function utcDateKey(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isWeekendUtc(y: number, m0: number, d: number): boolean {
  const day = new Date(Date.UTC(y, m0, d)).getUTCDay();
  return day === 0 || day === 6;
}

/** Holiday calendar-day keys that fall inside the given month (1–12). */
export function holidayKeysInMonth(
  year: number,
  month1to12: number,
  rows: Pick<IHoliday, "date" | "year" | "isRecurring">[],
): Set<string> {
  const m0 = month1to12 - 1;
  const keys = new Set<string>();
  const last = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();

  for (const h of rows) {
    const src = new Date(h.date);
    const sm = src.getUTCMonth();
    const sd = src.getUTCDate();
    if (h.isRecurring) {
      if (sm === m0) {
        if (sd >= 1 && sd <= last) keys.add(utcDateKey(year, m0, sd));
      }
    } else if (h.year === year && sm === m0) {
      keys.add(utcDateKey(year, m0, sd));
    }
  }
  return keys;
}

/** Count calendar days in month that are holidays. */
export function countHolidayDaysInMonth(
  year: number,
  month1to12: number,
  rows: Pick<IHoliday, "date" | "year" | "isRecurring">[],
): number {
  return holidayKeysInMonth(year, month1to12, rows).size;
}

export function workingDayKeysInMonth(
  year: number,
  month1to12: number,
  holidayKeys: Set<string>,
): Set<string> {
  const m0 = month1to12 - 1;
  const last = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  const set = new Set<string>();
  for (let d = 1; d <= last; d++) {
    if (isWeekendUtc(year, m0, d)) continue;
    if (holidayKeys.has(utcDateKey(year, m0, d))) continue;
    set.add(utcDateKey(year, m0, d));
  }
  return set;
}

export function monthUtcBounds(month1to12: number, year: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month1to12, 0, 23, 59, 59, 999));
  return { start, end };
}

/** Working days in the month that fall inside any approved leave range. */
export function leaveWorkingDayKeys(
  year: number,
  month1to12: number,
  workingKeys: Set<string>,
  leaveRanges: { startDate: Date; endDate: Date }[],
): Set<string> {
  const m0 = month1to12 - 1;
  const last = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  const out = new Set<string>();

  for (let d = 1; d <= last; d++) {
    const key = utcDateKey(year, m0, d);
    if (!workingKeys.has(key)) continue;
    const dayStart = new Date(Date.UTC(year, m0, d, 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(year, m0, d, 23, 59, 59, 999));
    for (const range of leaveRanges) {
      const rs = new Date(range.startDate);
      const re = new Date(range.endDate);
      if (dayEnd >= rs && dayStart <= re) {
        out.add(key);
        break;
      }
    }
  }
  return out;
}
