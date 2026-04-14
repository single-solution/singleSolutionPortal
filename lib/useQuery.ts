"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════
   Module-level cache shared by all useQuery / useCachedState
   instances across the entire app lifecycle.
   ═══════════════════════════════════════════════════════════════ */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const DEFAULT_STALE_MS = 30_000;

const cache = new Map<string, CacheEntry<unknown>>();
const inflightRequests = new Map<string, Promise<unknown>>();
const subscribers = new Map<string, Set<() => void>>();

function notifySubscribers(key: string) {
  subscribers.get(key)?.forEach((fn) => fn());
}

function subscribe(key: string, cb: () => void): () => void {
  if (!subscribers.has(key)) subscribers.set(key, new Set());
  subscribers.get(key)!.add(cb);
  return () => {
    subscribers.get(key)?.delete(cb);
    if (subscribers.get(key)?.size === 0) subscribers.delete(key);
  };
}

/* ═══════ Public cache utilities ═══════ */

export function getCached<T>(key: string): T | undefined {
  return (cache.get(key) as CacheEntry<T> | undefined)?.data;
}

export function setQueryData<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
  notifySubscribers(key);
}

export function invalidateQueries(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    subscribers.forEach((_, k) => notifySubscribers(k));
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      notifySubscribers(key);
    }
  }
}

export async function prefetch<T = unknown>(url: string): Promise<T> {
  const existing = inflightRequests.get(url);
  if (existing) return existing as Promise<T>;

  const entry = cache.get(url);
  if (entry && Date.now() - entry.timestamp < DEFAULT_STALE_MS) {
    return entry.data as T;
  }

  const promise = fetch(url).then(async (res) => {
    if (!res.ok) throw new Error(`${res.status}`);
    const json = await res.json();
    cache.set(url, { data: json, timestamp: Date.now() });
    notifySubscribers(url);
    return json;
  });
  inflightRequests.set(url, promise);
  try {
    return (await promise) as T;
  } finally {
    inflightRequests.delete(url);
  }
}

/* ═══════════════════════════════════════════════════════════════
   useQuery — SWR-style hook with configurable staleTime
   ═══════════════════════════════════════════════════════════════ */

export interface UseQueryOptions {
  enabled?: boolean;
  staleTime?: number;
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
  _channel?: string,
  options?: UseQueryOptions,
): UseQueryResult<T> {
  const enabled = options?.enabled !== false && url !== null;
  const staleMs = options?.staleTime ?? DEFAULT_STALE_MS;

  const cached = url ? (cache.get(url) as CacheEntry<T> | undefined) : undefined;
  const [data, setData] = useState<T | null>(cached?.data ?? null);
  const [loading, setLoading] = useState(!cached && enabled);
  const [error, setError] = useState<string | null>(null);

  const urlRef = useRef(url);
  urlRef.current = url;
  const staleMsRef = useRef(staleMs);
  staleMsRef.current = staleMs;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!url) return;
    return subscribe(url, () => {
      const entry = cache.get(url) as CacheEntry<T> | undefined;
      if (entry && mountedRef.current) setData(entry.data);
    });
  }, [url]);

  const fetchData = useCallback(
    async (showLoading = false) => {
      if (!urlRef.current) return;
      const currentUrl = urlRef.current;
      if (showLoading) setLoading(true);

      const inflight = inflightRequests.get(currentUrl);
      if (inflight) {
        try {
          const json = (await inflight) as T;
          if (mountedRef.current && urlRef.current === currentUrl) {
            setData(json);
            setError(null);
          }
        } catch (err) {
          if (mountedRef.current && urlRef.current === currentUrl) {
            setError(err instanceof Error ? err.message : "Fetch failed");
          }
        } finally {
          if (mountedRef.current && urlRef.current === currentUrl) setLoading(false);
        }
        return;
      }

      const promise = fetch(currentUrl).then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        cache.set(currentUrl, { data: json, timestamp: Date.now() });
        notifySubscribers(currentUrl);
        return json;
      });
      inflightRequests.set(currentUrl, promise);
      try {
        const json = (await promise) as T;
        if (mountedRef.current && urlRef.current === currentUrl) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (mountedRef.current && urlRef.current === currentUrl) {
          setError(err instanceof Error ? err.message : "Fetch failed");
        }
      } finally {
        inflightRequests.delete(currentUrl);
        if (mountedRef.current && urlRef.current === currentUrl) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!enabled || !url) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    const entry = cache.get(url) as CacheEntry<T> | undefined;
    if (entry) {
      setData(entry.data);
      setLoading(false);
      if (Date.now() - entry.timestamp > staleMsRef.current) fetchData(false);
    } else {
      fetchData(true);
    }
  }, [url, enabled, fetchData]);

  const mutate = useCallback(
    (updater?: T | ((prev: T | null) => T | null)) => {
      if (updater === undefined) { fetchData(false); return; }
      const newData = typeof updater === "function"
        ? (updater as (prev: T | null) => T | null)(data)
        : updater;
      setData(newData);
      if (url && newData !== null) {
        cache.set(url, { data: newData, timestamp: Date.now() });
        notifySubscribers(url);
      }
    },
    [data, url, fetchData],
  );

  const refetch = useCallback(async () => {
    if (url) cache.delete(url);
    await fetchData(false);
  }, [fetchData, url]);

  return { data, loading, error, mutate, refetch };
}

/* ═══════════════════════════════════════════════════════════════
   useCachedState — drop-in replacement for useState that
   persists across page navigations via the same module cache.

   Usage:  const [data, setData] = useCachedState<T>(cacheKey, initialValue);

   On first mount: returns initialValue (or cached if exists).
   On re-mount: instantly returns cached data (no loading flash).
   setData writes to both React state AND the module cache.
   ═══════════════════════════════════════════════════════════════ */

export function useCachedState<T>(
  key: string | null,
  initial: T,
): [T, (val: T | ((prev: T) => T)) => void] {
  const entry = key ? (cache.get(key) as CacheEntry<T> | undefined) : undefined;
  const [state, setState] = useState<T>(entry?.data ?? initial);

  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    if (!key) return;
    return subscribe(key, () => {
      const e = cache.get(key) as CacheEntry<T> | undefined;
      if (e) setState(e.data);
    });
  }, [key]);

  useEffect(() => {
    if (!key) return;
    const e = cache.get(key) as CacheEntry<T> | undefined;
    if (e) setState(e.data);
  }, [key]);

  const set = useCallback(
    (val: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof val === "function" ? (val as (p: T) => T)(prev) : val;
        if (keyRef.current) cache.set(keyRef.current, { data: next, timestamp: Date.now() });
        return next;
      });
    },
    [],
  );

  return [state, set];
}
