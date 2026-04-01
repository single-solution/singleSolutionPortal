"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Channel } from "@/lib/models/EventBus";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  channel: Channel;
}

const cache = new Map<string, CacheEntry<unknown>>();
const staleChannels = new Set<Channel>();

let sharedES: EventSource | null = null;
let subscriberCount = 0;
const channelListeners = new Map<Channel, Set<() => void>>();

function connectSharedSSE() {
  if (sharedES) return;
  if (typeof window === "undefined") return;

  const es = new EventSource("/api/events");
  sharedES = es;

  es.addEventListener("change", (e) => {
    try {
      const { channels } = JSON.parse(e.data) as { channels: Channel[] };
      for (const ch of channels) {
        staleChannels.add(ch);
        channelListeners.get(ch)?.forEach((fn) => fn());
      }
    } catch {
      /* malformed */
    }
  });

  es.addEventListener("reconnect", () => {
    es.close();
    sharedES = null;
    setTimeout(connectSharedSSE, 1000);
  });

  es.onerror = () => {
    es.close();
    sharedES = null;
    setTimeout(() => {
      if (!document.hidden && subscriberCount > 0) connectSharedSSE();
    }, 3000);
  };
}

function disconnectSharedSSE() {
  if (sharedES) {
    sharedES.close();
    sharedES = null;
  }
}

function handleVisibility() {
  if (document.hidden) {
    disconnectSharedSSE();
  } else if (subscriberCount > 0) {
    connectSharedSSE();
  }
}

let visibilityBound = false;
function ensureVisibilityListener() {
  if (visibilityBound || typeof window === "undefined") return;
  document.addEventListener("visibilitychange", handleVisibility);
  visibilityBound = true;
}

function subscribeChannel(channel: Channel, handler: () => void) {
  if (!channelListeners.has(channel))
    channelListeners.set(channel, new Set());
  channelListeners.get(channel)!.add(handler);
  subscriberCount++;
  ensureVisibilityListener();
  connectSharedSSE();

  return () => {
    channelListeners.get(channel)?.delete(handler);
    subscriberCount--;
    if (subscriberCount <= 0) {
      subscriberCount = 0;
      disconnectSharedSSE();
    }
  };
}

export interface UseQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  mutate: (updater?: T | ((prev: T | null) => T | null)) => void;
  refetch: () => Promise<void>;
}

export function useQuery<T>(
  url: string | null,
  channel: Channel,
  options?: { enabled?: boolean },
): UseQueryResult<T> {
  const enabled = options?.enabled !== false && url !== null;

  const cached = url
    ? (cache.get(url) as CacheEntry<T> | undefined)
    : undefined;
  const [data, setData] = useState<T | null>(cached?.data ?? null);
  const [loading, setLoading] = useState(!cached && enabled);
  const [error, setError] = useState<string | null>(null);

  const urlRef = useRef(url);
  urlRef.current = url;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(
    async (showLoading = false) => {
      if (!urlRef.current) return;
      const currentUrl = urlRef.current;
      if (showLoading) setLoading(true);

      try {
        const res = await fetch(currentUrl);
        if (!res.ok) throw new Error(`${res.status}`);
        const json = (await res.json()) as T;
        cache.set(currentUrl, {
          data: json,
          timestamp: Date.now(),
          channel,
        });
        staleChannels.delete(channel);
        if (mountedRef.current && urlRef.current === currentUrl) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (mountedRef.current && urlRef.current === currentUrl) {
          setError(err instanceof Error ? err.message : "Fetch failed");
        }
      } finally {
        if (mountedRef.current && urlRef.current === currentUrl) {
          setLoading(false);
        }
      }
    },
    [channel],
  );

  useEffect(() => {
    if (!enabled || !url) return;

    if (cache.has(url)) {
      setData((cache.get(url) as CacheEntry<T>).data);
      setLoading(false);
      if (staleChannels.has(channel)) fetchData();
    } else {
      fetchData(true);
    }
  }, [url, enabled, fetchData, channel]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeChannel(channel, () => fetchData());
  }, [channel, enabled, fetchData]);

  const mutate = useCallback(
    (updater?: T | ((prev: T | null) => T | null)) => {
      if (updater === undefined) {
        fetchData(false);
        return;
      }
      const newData =
        typeof updater === "function"
          ? (updater as (prev: T | null) => T | null)(data)
          : updater;
      setData(newData);
      if (url && newData !== null) {
        cache.set(url, { data: newData, timestamp: Date.now(), channel });
      }
    },
    [data, url, fetchData, channel],
  );

  const refetch = useCallback(async () => {
    await fetchData(false);
  }, [fetchData]);

  return { data, loading, error, mutate, refetch };
}
