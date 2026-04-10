"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const STALE_MS = 30_000;

const cache = new Map<string, CacheEntry<unknown>>();
const inflightRequests = new Map<string, Promise<unknown>>();

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
          if (mountedRef.current && urlRef.current === currentUrl) {
            setLoading(false);
          }
        }
        return;
      }

      const promise = fetch(currentUrl).then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        cache.set(currentUrl, { data: json, timestamp: Date.now() });
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
        if (mountedRef.current && urlRef.current === currentUrl) {
          setLoading(false);
        }
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
      if (Date.now() - entry.timestamp > STALE_MS) {
        fetchData(false);
      }
    } else {
      fetchData(true);
    }
  }, [url, enabled, fetchData]);

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
        cache.set(url, { data: newData, timestamp: Date.now() });
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
