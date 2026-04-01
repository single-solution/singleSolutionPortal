"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Channel } from "@/lib/models/EventBus";

type ChannelHandler = () => void;

/**
 * SSE-based event stream that replaces polling.
 * - Connects to /api/events
 * - Fires registered handlers only when data actually changes
 * - Pauses when tab is hidden, resumes when visible
 * - Auto-reconnects on disconnect
 */
export function useEventStream(
  handlers: Partial<Record<Channel, ChannelHandler>>,
  enabled = true,
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    if (!enabled) return;

    const es = new EventSource("/api/events");
    esRef.current = es;

    es.addEventListener("change", (e) => {
      try {
        const { channels } = JSON.parse(e.data) as { channels: Channel[] };
        for (const ch of channels) {
          handlersRef.current[ch]?.();
        }
      } catch { /* malformed event */ }
    });

    es.addEventListener("reconnect", () => {
      es.close();
      setTimeout(() => connect(), 1000);
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setTimeout(() => {
        if (!document.hidden && enabled) connect();
      }, 3000);
    };
  }, [enabled]);

  const disconnect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    connect();

    function handleVisibility() {
      if (document.hidden) {
        disconnect();
      } else {
        connect();
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [connect, disconnect, enabled]);
}
