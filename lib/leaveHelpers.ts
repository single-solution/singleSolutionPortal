/** Shared leave management utilities. */

import mongoose from "mongoose";
import LeaveBalance from "@/lib/models/LeaveBalance";
import Holiday from "@/lib/models/Holiday";
import type { LeaveType } from "@/lib/models/Leave";

export const LEAVE_TYPES: LeaveType[] = [
  "leave", "annual", "sick", "casual", "unpaid",
  "maternity", "paternity", "bereavement", "other",
];

export async function ensureLeaveBalance(userId: mongoose.Types.ObjectId, year: number) {
  const doc = await LeaveBalance.findOneAndUpdate(
    { user: userId, year },
    { $setOnInsert: { user: userId, year } },
    { upsert: true, new: true },
  );
  return doc!;
}

export async function countBusinessDays(start: Date, end: Date): Promise<number> {
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  if (e < s) return 0;

  const years = new Set<number>();
  const tmp = new Date(s);
  while (tmp <= e) {
    years.add(tmp.getFullYear());
    tmp.setDate(tmp.getDate() + 1);
  }

  const yearFilters = [...years].map((y) => ({ year: y }));
  const holidays = await Holiday.find({
    $or: [...yearFilters, { isRecurring: true }],
  }).lean();

  const holidayDateKeys = new Set<string>();
  for (const y of years) {
    for (const h of holidays) {
      const hd = new Date(h.date);
      const hm = hd.getUTCMonth();
      const hday = hd.getUTCDate();
      if (h.isRecurring || h.year === y) {
        holidayDateKeys.add(`${y}-${hm}-${hday}`);
      }
    }
  }

  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      const key = `${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`;
      if (!holidayDateKeys.has(key)) count += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
