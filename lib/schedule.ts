export type ShiftType = "fullTime" | "partTime" | "contract";
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const ALL_WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

export interface DaySchedule {
  isWorking: boolean;
  start: string;
  end: string;
  breakMinutes: number;
}

export type WeeklySchedule = Record<Weekday, DaySchedule>;

const DEFAULT_WORKING_DAY: DaySchedule = { isWorking: true, start: "10:00", end: "19:00", breakMinutes: 60 };
const DEFAULT_OFF_DAY: DaySchedule = { isWorking: false, start: "10:00", end: "19:00", breakMinutes: 60 };

export function makeDefaultWeeklySchedule(): WeeklySchedule {
  return {
    mon: { ...DEFAULT_WORKING_DAY },
    tue: { ...DEFAULT_WORKING_DAY },
    wed: { ...DEFAULT_WORKING_DAY },
    thu: { ...DEFAULT_WORKING_DAY },
    fri: { ...DEFAULT_WORKING_DAY },
    sat: { ...DEFAULT_OFF_DAY },
    sun: { ...DEFAULT_OFF_DAY },
  };
}

/** Resolve the weekly schedule from a user document, falling back to defaults. */
export function resolveWeeklySchedule(user: Record<string, unknown>): WeeklySchedule {
  if (user.weeklySchedule && typeof user.weeklySchedule === "object") {
    const ws = user.weeklySchedule as Record<string, unknown>;
    if (ws.mon && typeof ws.mon === "object") return ws as unknown as WeeklySchedule;
  }
  return makeDefaultWeeklySchedule();
}

/** Resolve per-employee grace minutes, falling back to 30. */
export function resolveGraceMinutes(user: Record<string, unknown>): number {
  if (typeof user.graceMinutes === "number") return user.graceMinutes;
  return 30;
}

/** Get today's day schedule for a user. */
export function getTodaySchedule(user: Record<string, unknown>, tz?: string): DaySchedule {
  const schedule = resolveWeeklySchedule(user);
  const dayIndex = tz ? new Date(new Date().toLocaleString("en-US", { timeZone: tz })).getDay() : new Date().getDay();
  const dayMap: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return schedule[dayMap[dayIndex]];
}
