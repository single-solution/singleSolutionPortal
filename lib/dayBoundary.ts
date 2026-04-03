/**
 * Attendance day boundary — 6 AM instead of midnight.
 *
 * Work done between midnight and 6 AM counts toward the PREVIOUS day.
 * A new attendance day starts at 6 AM. This prevents employees who
 * stay late past midnight from appearing as "early arrivals" the next
 * day, and ensures the actual morning arrival is recorded correctly.
 *
 * When `tz` is provided the hour check uses the company IANA timezone
 * (e.g. "Asia/Karachi") so results are correct regardless of where the
 * server is hosted.
 */

import { dateParts, dateInTz } from "./tz";

const DAY_START_HOUR = 6;

export function startOfDay(d: Date, tz?: string): Date {
  if (tz) {
    const p = dateParts(d, tz);
    if (p.hour < DAY_START_HOUR) {
      return dateInTz(p.year, p.month, p.day - 1, DAY_START_HOUR, 0, 0, tz);
    }
    return dateInTz(p.year, p.month, p.day, DAY_START_HOUR, 0, 0, tz);
  }
  if (d.getHours() < DAY_START_HOUR) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, DAY_START_HOUR, 0, 0, 0);
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_START_HOUR, 0, 0, 0);
}

export function isSameDay(a: Date, b: Date, tz?: string): boolean {
  return startOfDay(a, tz).getTime() === startOfDay(b, tz).getTime();
}
