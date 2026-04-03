import { connectDB } from "@/lib/db";
import { getVerifiedSession } from "@/lib/permissions";
import EventBus, { type Channel } from "@/lib/models/EventBus";

const ALL_CHANNELS: Channel[] = [
  "presence",
  "employees",
  "tasks",
  "departments",
  "teams",
  "campaigns",
  "activity",
  "settings",
  "ping",
];

export async function GET(request: Request) {
  const actor = await getVerifiedSession();
  if (!actor) {
    return new Response("Unauthorized", { status: 401 });
  }

  await connectDB();

  const url = new URL(request.url);
  const since = parseInt(url.searchParams.get("since") || "0", 10) || 0;

  const bus = await EventBus.findById("global").lean();

  const changed: Channel[] = [];
  for (const ch of ALL_CHANNELS) {
    const ts = bus
      ? new Date(
          (bus as unknown as Record<string, unknown>)[ch] as string,
        ).getTime()
      : 0;
    if (ts > since) changed.push(ch);
  }

  return Response.json({ changed, ts: Date.now() });
}
