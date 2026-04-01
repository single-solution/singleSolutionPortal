import { connectDB } from "@/lib/db";
import EventBus, { type Channel } from "@/lib/models/EventBus";

/**
 * Bump one or more channel timestamps on the global EventBus document.
 * Fire-and-forget — never blocks the caller.
 */
export async function notifyChange(channels: Channel | Channel[]): Promise<void> {
  try {
    await connectDB();
    const arr = Array.isArray(channels) ? channels : [channels];
    const now = new Date();
    const $set: Record<string, Date> = {};
    for (const ch of arr) $set[ch] = now;
    await EventBus.findOneAndUpdate(
      { _id: "global" },
      { $set },
      { upsert: true },
    );
  } catch {
    // Fire-and-forget
  }
}
