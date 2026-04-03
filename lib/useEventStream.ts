"use client";

import { useEffect, useRef } from "react";
import type { Channel } from "@/lib/models/EventBus";
import { subscribeChannel } from "@/lib/eventPoll";

type ChannelHandler = () => void;

/**
 * Subscribes to EventBus channel changes via shared polling.
 * Fires registered handlers only when data actually changes.
 * Pauses when tab is hidden, resumes when visible.
 */
export function useEventStream(
  handlers: Partial<Record<Channel, ChannelHandler>>,
  enabled = true,
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    const unsubs: (() => void)[] = [];

    for (const [ch, handler] of Object.entries(handlersRef.current)) {
      if (handler) {
        unsubs.push(subscribeChannel(ch as Channel, handler));
      }
    }

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [enabled]);
}
