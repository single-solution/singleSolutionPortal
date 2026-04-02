import { connectDB } from "@/lib/db";
import { getVerifiedSession } from "@/lib/permissions";
import EventBus, { type Channel } from "@/lib/models/EventBus";

const POLL_MS = 4_000;
const MAX_DURATION_MS = 55_000;
const HEARTBEAT_MS = 15_000;

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

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) {
    return new Response("Unauthorized", { status: 401 });
  }

  await connectDB();

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          closed = true;
        }
      };

      const bus = await EventBus.findById("global").lean();
      const last: Record<string, number> = {};
      for (const ch of ALL_CHANNELS) {
        last[ch] = bus ? new Date((bus as unknown as Record<string, unknown>)[ch] as string).getTime() : 0;
      }

      enqueue("connected", JSON.stringify({ channels: ALL_CHANNELS }));

      const startTime = Date.now();
      let lastHeartbeat = Date.now();

      const poll = async () => {
        if (closed) return;

        if (Date.now() - startTime > MAX_DURATION_MS) {
          enqueue("reconnect", "{}");
          closed = true;
          controller.close();
          return;
        }

        if (Date.now() - lastHeartbeat > HEARTBEAT_MS) {
          enqueue("heartbeat", "{}");
          lastHeartbeat = Date.now();
        }

        try {
          const current = await EventBus.findById("global").lean();
          if (!current) return;

          const changed: Channel[] = [];
          for (const ch of ALL_CHANNELS) {
            const ts = new Date((current as unknown as Record<string, unknown>)[ch] as string).getTime();
            if (ts > last[ch]) {
              changed.push(ch);
              last[ch] = ts;
            }
          }

          if (changed.length > 0) {
            enqueue("change", JSON.stringify({ channels: changed }));
          }
        } catch {
          // DB read failed — skip this cycle
        }
      };

      const interval = setInterval(poll, POLL_MS);

      const cleanup = () => {
        closed = true;
        clearInterval(interval);
      };

      // Timeout safety
      setTimeout(() => {
        if (!closed) {
          try { enqueue("reconnect", "{}"); } catch { /* */ }
          cleanup();
          try { controller.close(); } catch { /* */ }
        }
      }, MAX_DURATION_MS + 1000);

      // Controller cancel
      controller.enqueue(encoder.encode(""));
      (controller as unknown as { signal?: AbortSignal }).signal?.addEventListener?.("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
