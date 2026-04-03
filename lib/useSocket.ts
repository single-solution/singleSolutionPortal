"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

const listeners = new Map<string, Set<() => void>>();

export function useSocket(enabled: boolean, userId?: string) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled || !userId) return;

    const s = io({ auth: { userId }, transports: ["websocket"] });
    socketRef.current = s;

    s.emit("join-presence");

    for (const evt of ["presence", "activity", "ping"]) {
      s.on(evt, () => listeners.get(evt)?.forEach((fn) => fn()));
    }

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [enabled, userId]);
}

export function onSocketEvent(event: string, handler: () => void) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(handler);
  return () => {
    listeners.get(event)?.delete(handler);
  };
}
