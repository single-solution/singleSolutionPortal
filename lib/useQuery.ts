"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

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

      try {
        const res = await fetch(currentUrl);
        if (!res.ok) throw new Error(`${res.status}`);
        const json = (await res.json()) as T;
        cache.set(currentUrl, { data: json, timestamp: Date.now() });
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
    [],
  );

  useEffect(() => {
    if (!enabled || !url) return;

    if (cache.has(url)) {
      setData((cache.get(url) as CacheEntry<T>).data);
      setLoading(false);
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
    await fetchData(false);
  }, [fetchData]);

  return { data, loading, error, mutate, refetch };
}
