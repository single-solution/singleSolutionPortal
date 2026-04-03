/**
 * Attendance day boundary — 6 AM instead of midnight.
 *
 * Work done between midnight and 6 AM counts toward the PREVIOUS day.
 * A new attendance day starts at 6 AM. This prevents employees who
 * stay late past midnight from appearing as "early arrivals" the next
 * day, and ensures the actual morning arrival is recorded correctly.
 */

const DAY_START_HOUR = 6;

/**
 * Returns the start of the logical attendance day for a given date.
 * If the time is before 6 AM, the day is considered to be the
 * previous calendar day (e.g., 2 AM on April 2nd → April 1st 6 AM).
 */
export function startOfDay(d: Date): Date {
  if (d.getHours() < DAY_START_HOUR) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, DAY_START_HOUR, 0, 0, 0);
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_START_HOUR, 0, 0, 0);
}

/**
 * Checks whether two dates fall on the same logical attendance day.
 */
export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}
