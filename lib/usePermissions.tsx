"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { SELF_PERMISSIONS, type IPermissions } from "@/lib/permissions.shared";

interface PermissionsState {
  isSuperAdmin: boolean;
  hasSubordinates: boolean;
  subordinateIds: string[];
  permissions: Partial<Record<keyof IPermissions, boolean>>;
  loading: boolean;
  can: (key: keyof IPermissions) => boolean;
  canAny: (...keys: (keyof IPermissions)[]) => boolean;
  refresh: () => Promise<void>;
}

interface PermissionsInitialData {
  isSuperAdmin: boolean;
  permissions: Partial<Record<keyof IPermissions, boolean>>;
  hasSubordinates: boolean;
  subordinateIds: string[];
}

const PermissionsContext = createContext<PermissionsState>({
  isSuperAdmin: false,
  hasSubordinates: false,
  subordinateIds: [],
  permissions: {},
  loading: true,
  can: () => false,
  canAny: () => false,
  refresh: async () => {},
});

interface ProviderProps {
  children: ReactNode;
  initialData?: PermissionsInitialData;
}

export function PermissionsProvider({ children, initialData }: ProviderProps) {
  const hasInitial = !!initialData;
  const [isSuperAdmin, setIsSuperAdmin] = useState(initialData?.isSuperAdmin ?? false);
  const [hasSubordinates, setHasSubordinates] = useState(initialData?.hasSubordinates ?? false);
  const [subordinateIds, setSubordinateIds] = useState<string[]>(initialData?.subordinateIds ?? []);
  const [permissions, setPermissions] = useState<Partial<Record<keyof IPermissions, boolean>>>(initialData?.permissions ?? {});
  const [loading, setLoading] = useState(!hasInitial);
  const mounted = useRef(true);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch("/api/me/permissions");
      if (!res.ok) return;
      const data = await res.json();
      if (!mounted.current) return;
      setIsSuperAdmin(data.isSuperAdmin === true);
      setHasSubordinates(data.hasSubordinates === true);
      setSubordinateIds(data.subordinateIds ?? []);
      setPermissions(data.permissions ?? {});
    } catch { /* silent */ }
    if (mounted.current) setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!hasInitial) fetchPermissions();
    return () => { mounted.current = false; };
  }, [fetchPermissions, hasInitial]);

  const can = useCallback(
    (key: keyof IPermissions) => SELF_PERMISSIONS.has(key) || isSuperAdmin || permissions[key] === true,
    [isSuperAdmin, permissions],
  );

  const canAny = useCallback(
    (...keys: (keyof IPermissions)[]) => isSuperAdmin || keys.some((k) => SELF_PERMISSIONS.has(k) || permissions[k] === true),
    [isSuperAdmin, permissions],
  );

  return (
    <PermissionsContext.Provider value={{ isSuperAdmin, hasSubordinates, subordinateIds, permissions, loading, can, canAny, refresh: fetchPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
