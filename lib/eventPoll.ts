"use client";

import type { Channel } from "@/lib/models/EventBus";

const POLL_INTERVAL_MS = 10_000;

let polling = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastTs = 0;
let subscriberCount = 0;
let visibilityBound = false;

const channelListeners = new Map<Channel, Set<() => void>>();
const staleSet = new Set<Channel>();

async function poll() {
  if (typeof window === "undefined" || document.hidden) return;
  try {
    const res = await fetch(`/api/events?since=${lastTs}`);
    if (!res.ok) return;
    const data = (await res.json()) as { changed: Channel[]; ts: number };
    lastTs = data.ts;
    for (const ch of data.changed) {
      staleSet.add(ch);
      channelListeners.get(ch)?.forEach((fn) => fn());
    }
  } catch {
    /* network error — retry next interval */
  }
}

function startPolling() {
  if (polling) return;
  polling = true;
  if (lastTs === 0) lastTs = Date.now();
  poll();
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
}

function stopPolling() {
  polling = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function handleVisibility() {
  if (document.hidden) {
    stopPolling();
  } else if (subscriberCount > 0) {
    startPolling();
  }
}

function ensureVisibilityListener() {
  if (visibilityBound || typeof window === "undefined") return;
  document.addEventListener("visibilitychange", handleVisibility);
  visibilityBound = true;
}

export function subscribeChannel(
  channel: Channel,
  handler: () => void,
): () => void {
  if (!channelListeners.has(channel))
    channelListeners.set(channel, new Set());
  channelListeners.get(channel)!.add(handler);
  subscriberCount++;
  ensureVisibilityListener();
  startPolling();

  return () => {
    channelListeners.get(channel)?.delete(handler);
    subscriberCount--;
    if (subscriberCount <= 0) {
      subscriberCount = 0;
      stopPolling();
    }
  };
}

export function isChannelStale(channel: Channel): boolean {
  return staleSet.has(channel);
}

export function clearChannelStale(channel: Channel): void {
  staleSet.delete(channel);
}
