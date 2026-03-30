"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SessionState {
  active: boolean;
  inOffice: boolean;
  startTime: string | null;
  todayMinutes: number;
}

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
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latRef = useRef<number | undefined>(undefined);
  const lngRef = useRef<number | undefined>(undefined);
  const checkedInRef = useRef(false);
  const IDLE_MS = 5 * 60 * 1000;

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance/session");
      const data = await res.json();
      if (data.activeSession) {
        setSession({
          active: true,
          inOffice: data.activeSession.location?.inOffice ?? false,
          startTime: data.activeSession.sessionTime?.start,
          todayMinutes: data.todayMinutes ?? 0,
        });
        checkedInRef.current = true;
      }
    } catch { /* ignore */ }
    setBooting(false);
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
          deviceId: getDeviceId(),
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
      } else if (data.error?.includes("Already checked in")) {
        await fetchSession();
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
        body: JSON.stringify({ action: "checkout" }),
      });
      if (res.ok) {
        setSession((s) => ({ ...s, active: false, startTime: null }));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    async function initGeoAndCheckIn() {
      await fetchSession();

      if (!("geolocation" in navigator)) {
        if (!checkedInRef.current) doCheckIn();
        return;
      }

      // Check permission state first so we know if we need to prompt
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

      // Request position — this will trigger the browser permission prompt if "prompt"
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

      // Start continuous watching
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          latRef.current = pos.coords.latitude;
          lngRef.current = pos.coords.longitude;
          setGeoError(false);
          if (checkedInRef.current) {
            fetch("/api/attendance/session", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
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

    initGeoAndCheckIn();

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [fetchSession, doCheckIn]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        doCheckOut();
      } else if (document.visibilityState === "visible") {
        fetchSession().then(() => {
          if (!checkedInRef.current) doCheckIn();
        });
      }
    }

    function handleBeforeUnload() {
      if (checkedInRef.current) {
        navigator.sendBeacon(
          "/api/attendance/session",
          new Blob(
            [JSON.stringify({ action: "checkout" })],
            { type: "application/json" },
          ),
        );
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [doCheckIn, doCheckOut, fetchSession]);

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

  useEffect(() => {
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
  }, [IDLE_MS]);

  if (booting) return null;

  const statusGrad = session.active
    ? session.inOffice
      ? "linear-gradient(135deg, #10b981, #059669)"
      : "linear-gradient(135deg, #3b82f6, #2563eb)"
    : "linear-gradient(135deg, #6b7280, #4b5563)";

  const statusLabel = session.active
    ? session.inOffice ? "In Office" : "Remote"
    : "Offline";

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
        {idle && session.active && (
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
        {geoError && session.active && (
          <span className="text-[9px] opacity-60">no GPS</span>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
