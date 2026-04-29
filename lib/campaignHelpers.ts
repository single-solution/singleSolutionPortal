/** Shared campaign and task date utilities. */

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const CAMPAIGN_STATUSES = ["active", "paused", "completed", "cancelled"] as const;

export function parseRecurrence(
  input: { frequency?: string; days?: number[] } | null | undefined,
): { frequency: string; days: number[] } | null {
  if (!input?.frequency) return null;
  const validFreqs = ["weekly", "monthly"];
  if (!validFreqs.includes(input.frequency)) return null;
  if (!Array.isArray(input.days) || input.days.length === 0) return null;
  const maxVal = input.frequency === "weekly" ? 6 : 31;
  const minVal = input.frequency === "weekly" ? 0 : 1;
  const days = input.days.filter((d) => typeof d === "number" && d >= minVal && d <= maxVal);
  return days.length > 0 ? { frequency: input.frequency, days } : null;
}
