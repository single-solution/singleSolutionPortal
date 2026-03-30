"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SessionState {
  active: boolean;
  inOffice: boolean;
  startTime: string | null;
  todayMinutes: number;
}

type DeviceRole = "primary" | "secondary" | "unknown";

function formatElapsed(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTodayHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function getDeviceId(): string {
  let id = localStorage.getItem("ss-device-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("ss-device-id", id);
  }
  return id;
}

function detectMobile(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)
    || ("ontouchstart" in window && window.innerWidth < 768);
}

const SYNC_INTERVAL_MS = 30_000;

export default function SessionTracker() {
  const [session, setSession] = useState<SessionState>({
    active: false,
    inOffice: false,
    startTime: null,
    todayMinutes: 0,
  });
  const [elapsed, setElapsed] = useState(0);
  const [booting, setBooting] = useState(true);
  const [geoError, setGeoError] = useState(false);
  const [idle, setIdle] = useState(false);
  const [deviceRole, setDeviceRole] = useState<DeviceRole>("unknown");
  const isMobileRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latRef = useRef<number | undefined>(undefined);
  const lngRef = useRef<number | undefined>(undefined);
  const checkedInRef = useRef(false);
  const deviceIdRef = useRef("");
  const IDLE_MS = 5 * 60 * 1000;

  const fetchSession = useCallback(async (): Promise<{
    active: boolean;
    primaryDeviceId: string | null;
    startTime: string | null;
    inOffice: boolean;
    todayMinutes: number;
  }> => {
    try {
      const res = await fetch("/api/attendance/session");
      const data = await res.json();
      const activeSession = data.activeSession;
      const primaryDeviceId: string | null = data.primaryDeviceId ?? null;
      if (activeSession) {
        const state: SessionState = {
          active: true,
          inOffice: activeSession.location?.inOffice ?? false,
          startTime: activeSession.sessionTime?.start,
          todayMinutes: data.todayMinutes ?? 0,
        };
        setSession(state);
        checkedInRef.current = true;
        return {
          active: true,
          primaryDeviceId,
          startTime: state.startTime,
          inOffice: state.inOffice,
          todayMinutes: state.todayMinutes,
        };
      }
      return { active: false, primaryDeviceId: null, startTime: null, inOffice: false, todayMinutes: data.todayMinutes ?? 0 };
    } catch {
      return { active: false, primaryDeviceId: null, startTime: null, inOffice: false, todayMinutes: 0 };
    }
  }, []);

  const doCheckIn = useCallback(async () => {
    if (checkedInRef.current) return;
    checkedInRef.current = true;
    try {
      const res = await fetch("/api/attendance/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "checkin",
          latitude: latRef.current,
          longitude: lngRef.current,
          platform: navigator.platform,
          userAgent: navigator.userAgent,
          deviceId: deviceIdRef.current,
          isMobile: isMobileRef.current,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSession({
          active: true,
          inOffice: data.session?.inOffice ?? false,
          startTime: data.session?.startTime ?? new Date().toISOString(),
          todayMinutes: 0,
        });
        setDeviceRole("primary");
      } else if (data.error?.includes("Already checked in")) {
        const freshData = await fetchSession();
        if (freshData.active && freshData.primaryDeviceId === deviceIdRef.current) {
          setDeviceRole("primary");
        } else {
          setDeviceRole("secondary");
        }
      } else {
        checkedInRef.current = false;
      }
    } catch {
      checkedInRef.current = false;
    }
  }, [fetchSession]);

  const doCheckOut = useCallback(async () => {
    if (!checkedInRef.current) return;
    checkedInRef.current = false;
    try {
      const res = await fetch("/api/attendance/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkout", deviceId: deviceIdRef.current }),
      });
      if (res.ok) {
        setSession((s) => ({ ...s, active: false, startTime: null }));
      }
    } catch { /* ignore */ }
  }, []);

  // Secondary devices: periodically sync session state from server
  const startSyncPolling = useCallback(() => {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    syncIntervalRef.current = setInterval(async () => {
      await fetchSession();
    }, SYNC_INTERVAL_MS);
  }, [fetchSession]);

  useEffect(() => {
    const myDeviceId = getDeviceId();
    deviceIdRef.current = myDeviceId;
    isMobileRef.current = detectMobile();

    async function initSession() {
      const freshData = await fetchSession();
      setBooting(false);

      if (freshData.active && freshData.primaryDeviceId) {
        if (freshData.primaryDeviceId === myDeviceId) {
          setDeviceRole("primary");
        } else {
          setDeviceRole("secondary");
          startSyncPolling();
          return;
        }
      }

      // Mobile devices never initiate check-in — always read-only
      if (isMobileRef.current) {
        setDeviceRole(freshData.active ? "secondary" : "secondary");
        if (freshData.active) startSyncPolling();
        return;
      }

      // Desktop device with no active session → attempt check-in with geolocation
      if (!freshData.active) {
        await initGeoAndCheckIn();
      } else {
        // Desktop device IS the primary — run geo watcher
        initGeoWatcher();
      }
    }

    async function initGeoAndCheckIn() {
      if (!("geolocation" in navigator)) {
        if (!checkedInRef.current) doCheckIn();
        return;
      }

      let permState: PermissionState | null = null;
      try {
        const perm = await navigator.permissions.query({ name: "geolocation" });
        permState = perm.state;
      } catch { /* permissions API not available */ }

      if (permState === "denied") {
        setGeoError(true);
        if (!checkedInRef.current) doCheckIn();
        return;
      }

      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
          });
        });
        latRef.current = pos.coords.latitude;
        lngRef.current = pos.coords.longitude;
        setGeoError(false);
      } catch {
        setGeoError(true);
      }

      if (!checkedInRef.current) doCheckIn();

      initGeoWatcher();
    }

    function initGeoWatcher() {
      if (!("geolocation" in navigator)) return;
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          latRef.current = pos.coords.latitude;
          lngRef.current = pos.coords.longitude;
          setGeoError(false);
          if (checkedInRef.current) {
            fetch("/api/attendance/session", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                deviceId: deviceIdRef.current,
              }),
            })
              .then((r) => r.json())
              .then((data) => {
                if (data.updated && data.transitioned) {
                  setSession((s) => ({ ...s, inOffice: data.inOffice }));
                }
              })
              .catch(() => {});
          }
        },
        () => setGeoError(true),
        { enableHighAccuracy: true, maximumAge: 30000 },
      );
    }

    initSession();

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [fetchSession, doCheckIn, startSyncPolling]);

  // Only primary desktop devices send checkout on unload
  useEffect(() => {
    function handleBeforeUnload() {
      if (checkedInRef.current && deviceRole === "primary" && !isMobileRef.current) {
        navigator.sendBeacon(
          "/api/attendance/session",
          new Blob(
            [JSON.stringify({ action: "checkout", deviceId: deviceIdRef.current })],
            { type: "application/json" },
          ),
        );
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [deviceRole]);

  // Elapsed timer — works on all devices (purely display, based on startTime from server)
  useEffect(() => {
    if (session.active && session.startTime) {
      const start = new Date(session.startTime).getTime();
      const tick = () => setElapsed(Date.now() - start);
      tick();
      intervalRef.current = setInterval(tick, 1000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else {
      setElapsed(0);
    }
  }, [session.active, session.startTime]);

  // Idle detection (only for primary devices)
  useEffect(() => {
    if (deviceRole !== "primary") return;

    function resetIdle() {
      setIdle(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setIdle(true), IDLE_MS);
    }
    const events = ["mousemove", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }));
    resetIdle();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdle));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [IDLE_MS, deviceRole]);

  if (booting) return null;

  const statusGrad = session.active
    ? session.inOffice
      ? "linear-gradient(135deg, #10b981, #059669)"
      : "linear-gradient(135deg, #3b82f6, #2563eb)"
    : "linear-gradient(135deg, #6b7280, #4b5563)";

  const statusLabel = session.active
    ? session.inOffice ? "In Office" : "Remote"
    : "Offline";

  const isSecondary = deviceRole === "secondary";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: idle && session.active ? 0.65 : 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 25 }}
        className="mx-auto flex w-fit items-center gap-3 rounded-full px-3 py-1.5 text-white shadow-lg"
        style={{ background: statusGrad }}
      >
        {session.active && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
        )}
        <span className="text-[11px] font-semibold whitespace-nowrap">{statusLabel}</span>
        {isSecondary && session.active && (
          <span className="text-[9px] font-medium opacity-70">synced</span>
        )}
        {idle && session.active && !isSecondary && (
          <span className="text-[9px] font-medium opacity-70 animate-pulse">idle</span>
        )}
        <span className="h-3 w-px bg-white/30" />
        <span className="font-mono text-xs font-bold tabular-nums">
          {session.active ? formatElapsed(elapsed) : "--:--:--"}
        </span>
        <span className="h-3 w-px bg-white/30" />
        <span className="text-[11px] font-bold tabular-nums whitespace-nowrap opacity-90">
          {formatTodayHours(session.todayMinutes + (session.active ? Math.floor(elapsed / 60000) : 0))}
        </span>
        {geoError && session.active && !isSecondary && (
          <span className="text-[9px] opacity-60">no GPS</span>
        )}
        {isSecondary && isMobileRef.current && (
          <span className="text-[9px] opacity-60">📱</span>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
