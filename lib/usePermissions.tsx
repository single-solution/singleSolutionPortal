"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { IPermissions } from "@/lib/permissions.shared";

interface PermissionsState {
  isSuperAdmin: boolean;
  permissions: Partial<Record<keyof IPermissions, boolean>>;
  loading: boolean;
  can: (key: keyof IPermissions) => boolean;
  canAny: (...keys: (keyof IPermissions)[]) => boolean;
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsState>({
  isSuperAdmin: false,
  permissions: {},
  loading: true,
  can: () => false,
  canAny: () => false,
  refresh: async () => {},
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [permissions, setPermissions] = useState<Partial<Record<keyof IPermissions, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch("/api/me/permissions");
      if (!res.ok) return;
      const data = await res.json();
      if (!mounted.current) return;
      setIsSuperAdmin(data.isSuperAdmin === true);
      setPermissions(data.permissions ?? {});
    } catch { /* silent */ }
    if (mounted.current) setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchPermissions();
    return () => { mounted.current = false; };
  }, [fetchPermissions]);

  const can = useCallback(
    (key: keyof IPermissions) => isSuperAdmin || permissions[key] === true,
    [isSuperAdmin, permissions],
  );

  const canAny = useCallback(
    (...keys: (keyof IPermissions)[]) => isSuperAdmin || keys.some((k) => permissions[k] === true),
    [isSuperAdmin, permissions],
  );

  return (
    <PermissionsContext.Provider value={{ isSuperAdmin, permissions, loading, can, canAny, refresh: fetchPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
