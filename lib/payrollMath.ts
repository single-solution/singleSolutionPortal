/** Shared payroll calculation utilities. */

import type { DaySchedule, Weekday } from "@/lib/models/User";

export const DAY_OF_WEEK: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function roundMoney(n: number, decimals = 2): number {
  const power = 10 ** decimals;
  return Math.round(n * power) / power;
}

export function dayExpectedMinutes(day: DaySchedule): number {
  if (!day.isWorking) return 0;
  const [startHour, startMin] = day.start.split(":").map(Number);
  const [endHour, endMin] = day.end.split(":").map(Number);
  return Math.max(0, (endHour * 60 + endMin) - (startHour * 60 + startMin) - day.breakMinutes);
}
