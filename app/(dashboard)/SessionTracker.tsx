"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

type DeviceMode = "active" | "readonly" | "booting";

interface SessionData {
  active: boolean;
  inOffice: boolean;
  startTime: string | null;
  todayMinutes: number;
  isStale: boolean;
}

const HEARTBEAT_MS = 30_000;
const IDLE_MS = 60 * 60 * 1000;
const NUDGE_INTERVAL_MS = 5 * 60 * 1000;
const MAX_NUDGES = 3;
const MAX_CHECKIN_RETRIES = 3;
const RETRY_DELAY_MS = 5_000;

function formatElapsed(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTodayHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
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
  return (
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
    ("ontouchstart" in window && window.innerWidth < 768)
  );
}

function getGeo(): Promise<{ lat: number; lng: number } | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  });
}

export default function SessionTracker() {
  const [session, setSession] = useState<SessionData>({
    active: false,
    inOffice: false,
    startTime: null,
    todayMinutes: 0,
    isStale: false,
  });
  const [mode, setMode] = useState<DeviceMode>("booting");
  const [elapsed, setElapsed] = useState(0);
  const [idle, setIdle] = useState(false);

  const isMobileRef = useRef(false);
  const modeRef = useRef<DeviceMode>("booting");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const checkedInRef = useRef(false);

  const updateMode = useCallback((m: DeviceMode) => {
    modeRef.current = m;
    setMode(m);
  }, []);

  // ─── Fetch session state from server ──────────────────────────
  const fetchSession = useCallback(async (): Promise<{
    active: boolean;
    startTime: string | null;
    inOffice: boolean;
    todayMinutes: number;
    isStale: boolean;
  }> => {
    try {
      const res = await fetch("/api/attendance/session");
      const data = await res.json();
      const a = data.activeSession;
      if (a) {
        const state: SessionData = {
          active: true,
          inOffice: a.location?.inOffice ?? false,
          startTime: a.sessionTime?.start,
          todayMinutes: data.todayMinutes ?? 0,
          isStale: data.isStale ?? false,
        };
        setSession(state);
        checkedInRef.current = true;
        return state;
      }
      setSession((s) => ({ ...s, active: false, startTime: null, todayMinutes: data.todayMinutes ?? 0, isStale: false }));
      checkedInRef.current = false;
      return { active: false, startTime: null, inOffice: false, todayMinutes: data.todayMinutes ?? 0, isStale: false };
    } catch {
      return { active: false, startTime: null, inOffice: false, todayMinutes: 0, isStale: false };
    }
  }, []);

  // ─── Check-in ─────────────────────────────────────────────────
  const doCheckIn = useCallback(
    async (retries = 0): Promise<boolean> => {
      const geo = await getGeo();
      if (geo) lastCoordsRef.current = geo;
      try {
        const res = await fetch("/api/attendance/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "checkin",
            latitude: geo?.lat,
            longitude: geo?.lng,
            platform: navigator.platform,
            userAgent: navigator.userAgent,
            deviceId: getDeviceId(),
            isMobile: isMobileRef.current,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setSession({
            active: true,
            inOffice: data.session?.inOffice ?? false,
            startTime: data.session?.startTime ?? new Date().toISOString(),
            todayMinutes: data.todayMinutes ?? 0,
            isStale: false,
          });
          checkedInRef.current = true;
          return true;
        }
        if (retries < MAX_CHECKIN_RETRIES && res.status >= 500) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          return doCheckIn(retries + 1);
        }
        return false;
      } catch {
        if (retries < MAX_CHECKIN_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          return doCheckIn(retries + 1);
        }
        return false;
      }
    },
    [],
  );

  // ─── Heartbeat (active mode) ─────────────────────────────────
  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);

    const beat = async () => {
      if (modeRef.current !== "active") return;
      const geo = await getGeo();
      if (geo) lastCoordsRef.current = geo;
      try {
        const res = await fetch("/api/attendance/session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: geo?.lat ?? lastCoordsRef.current?.lat,
            longitude: geo?.lng ?? lastCoordsRef.current?.lng,
          }),
        });
        const data = await res.json();
        if (data.sessionClosed) {
          const ok = await doCheckIn();
          if (ok) {
            updateMode("active");
          } else {
            updateMode("readonly");
            startSyncPolling();
          }
          return;
        }
        if (data.transitioned) {
          setSession((s) => ({ ...s, inOffice: data.inOffice }));
        }
      } catch {
        /* network fail — skip this beat, retry next */
      }
    };

    heartbeatRef.current = setInterval(beat, HEARTBEAT_MS);
  }, [doCheckIn, updateMode]);

  // ─── Sync polling (readonly mode) ─────────────────────────────
  const startSyncPolling = useCallback(() => {
    if (syncRef.current) clearInterval(syncRef.current);

    const poll = async () => {
      const data = await fetchSession();

      if (!isMobileRef.current) {
        if (!data.active || data.isStale) {
          if (syncRef.current) clearInterval(syncRef.current);
          const ok = await doCheckIn();
          if (ok) {
            updateMode("active");
            startHeartbeat();
          } else {
            startSyncPolling();
          }
          return;
        }
      }
    };

    syncRef.current = setInterval(poll, HEARTBEAT_MS);
  }, [fetchSession, doCheckIn, updateMode, startHeartbeat]);

  // ─── Init on mount ────────────────────────────────────────────
  useEffect(() => {
    isMobileRef.current = detectMobile();

    async function init() {
      const data = await fetchSession();

      if (isMobileRef.current) {
        updateMode("readonly");
        startSyncPolling();
        return;
      }

      if (!data.active || data.isStale) {
        const ok = await doCheckIn();
        if (ok) {
          updateMode("active");
          startHeartbeat();
        } else {
          updateMode("readonly");
          startSyncPolling();
        }
      } else {
        updateMode("readonly");
        startSyncPolling();
      }
    }

    init();

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (syncRef.current) clearInterval(syncRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── beforeunload: best-effort checkout ───────────────────────
  useEffect(() => {
    function handleBeforeUnload() {
      if (modeRef.current === "active" && checkedInRef.current) {
        navigator.sendBeacon(
          "/api/attendance/session",
          new Blob([JSON.stringify({ action: "checkout" })], {
            type: "application/json",
          }),
        );
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // ─── Visibility change: handle OS user switch, tab hide/show ──
  useEffect(() => {
    async function handleVisibility() {
      if (document.hidden) {
        // Going hidden (OS user switch, tab switch, minimize):
        // fire one last heartbeat to push lastActivity forward
        if (modeRef.current === "active" && checkedInRef.current) {
          const coords = lastCoordsRef.current;
          try {
            await fetch("/api/attendance/session", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                latitude: coords?.lat,
                longitude: coords?.lng,
              }),
            });
          } catch {
            /* best-effort */
          }
        }
      } else {
        // Becoming visible again (switching back to this OS user/tab):
        // immediately re-check session instead of waiting for next interval
        if (isMobileRef.current) {
          await fetchSession();
          return;
        }

        const data = await fetchSession();

        if (modeRef.current === "active") {
          if (!data.active || data.isStale) {
            // Session died while we were away — re-check-in
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            const ok = await doCheckIn();
            if (ok) {
              updateMode("active");
              startHeartbeat();
            } else {
              updateMode("readonly");
              startSyncPolling();
            }
          }
          // else: still active and healthy, heartbeat will continue
        } else if (modeRef.current === "readonly") {
          if (!data.active || data.isStale) {
            // Primary device died — take over
            if (syncRef.current) clearInterval(syncRef.current);
            const ok = await doCheckIn();
            if (ok) {
              updateMode("active");
              startHeartbeat();
            } else {
              startSyncPolling();
            }
          }
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchSession, doCheckIn, updateMode, startHeartbeat, startSyncPolling]);

  // ─── Elapsed timer (pauses when idle) ────────────────────────
  const pausedAtRef = useRef<number>(0);
  useEffect(() => {
    if (session.active && session.startTime) {
      if (idle) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        pausedAtRef.current = elapsed;
        return;
      }
      const start = new Date(session.startTime).getTime();
      const tick = () => setElapsed(Date.now() - start);
      tick();
      intervalRef.current = setInterval(tick, 1000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
    setElapsed(0);
  }, [session.active, session.startTime, idle]);

  // ─── Idle detection (active mode, visibility-aware + nudges) ──
  const nudgeCountRef = useRef(0);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nudgeVisible, setNudgeVisible] = useState(false);

  const clearNudges = useCallback(() => {
    nudgeCountRef.current = 0;
    setNudgeVisible(false);
    if (nudgeTimerRef.current) { clearTimeout(nudgeTimerRef.current); nudgeTimerRef.current = null; }
  }, []);

  const scheduleNudge = useCallback(() => {
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
    nudgeTimerRef.current = setTimeout(() => {
      nudgeCountRef.current += 1;
      setNudgeVisible(true);
      if (nudgeCountRef.current >= MAX_NUDGES) {
        setIdle(true);
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      } else {
        scheduleNudge();
      }
    }, NUDGE_INTERVAL_MS);
  }, []);

  useEffect(() => {
    if (mode !== "active") return;

    let tabHidden = document.hidden;

    function handleActivity() {
      if (idle) {
      setIdle(false);
        startHeartbeat();
      }
      clearNudges();
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (!document.hidden) {
          nudgeCountRef.current = 0;
          scheduleNudge();
        }
      }, IDLE_MS);
    }

    function handleVisibilityForIdle() {
      if (document.hidden) {
        tabHidden = true;
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        clearNudges();
      } else {
        if (tabHidden) {
          tabHidden = false;
          handleActivity();
        }
      }
    }

    const events = ["mousemove", "keydown", "touchstart", "scroll", "click"] as const;
    events.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));
    document.addEventListener("visibilitychange", handleVisibilityForIdle);
    handleActivity();
    return () => {
      events.forEach((e) => window.removeEventListener(e, handleActivity));
      document.removeEventListener("visibilitychange", handleVisibilityForIdle);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
    };
  }, [mode, idle, startHeartbeat, clearNudges, scheduleNudge]);

  // ─── Render ───────────────────────────────────────────────────
  if (mode === "booting") return null;

  const isActive = session.active && !session.isStale;
  const isReadonly = mode === "readonly";

  const pillStyle: React.CSSProperties = isActive
    ? session.inOffice
      ? {
          background: "linear-gradient(135deg, #00c6a7 0%, #00d68f 50%, #34d399 100%)",
          boxShadow: "0 0 20px rgba(0,198,167,0.4), 0 0 60px rgba(0,214,143,0.15), inset 0 1px 0 rgba(255,255,255,0.25)",
        }
      : {
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 50%, #a855f7 100%)",
          boxShadow: "0 0 20px rgba(118,75,162,0.4), 0 0 60px rgba(168,85,247,0.15), inset 0 1px 0 rgba(255,255,255,0.25)",
        }
    : {
        background: "linear-gradient(135deg, #64748b 0%, #475569 100%)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
      };

  const statusLabel = isActive
    ? session.inOffice
      ? "In Office"
      : "Remote"
    : "Offline";

  const currentMinutes = isActive ? Math.floor(elapsed / 60000) : 0;
  const todayTotal = session.todayMinutes + currentMinutes;

  return (
    <>
      {/* Nudge toast (still working, gentle reminder) */}
      <AnimatePresence>
        {nudgeVisible && !idle && isActive && !isReadonly && (
          <motion.div
            key="nudge-toast"
            initial={{ y: -60, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -60, opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed left-1/2 top-4 z-[9999] -translate-x-1/2 cursor-pointer"
            onClick={() => { clearNudges(); setIdle(false); }}
          >
            <div
              className="flex items-center gap-3 rounded-2xl px-5 py-3 shadow-2xl"
              style={{
                background: "linear-gradient(135deg, rgba(255,159,10,0.9), rgba(245,158,11,0.85))",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <span className="text-2xl">\ud83d\udc4b</span>
              <div>
                <p className="text-sm font-bold text-white">Still there?</p>
                <p className="text-xs text-white/80">
                  Reminder {nudgeCountRef.current} of {MAX_NUDGES} — tap to dismiss
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full away overlay (after all nudges ignored) */}
      <AnimatePresence>
        {idle && isActive && !isReadonly && (
          <motion.div
            key="away-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[9998] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => { setIdle(false); clearNudges(); }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className="mx-4 flex max-w-sm flex-col items-center gap-4 rounded-3xl p-8 text-center"
              style={{
                background: "var(--bg-elevated, rgba(30,30,40,0.85))",
                border: "1px solid var(--border, rgba(255,255,255,0.1))",
                boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="text-5xl"
              >
                \ud83d\ude34
              </motion.div>
              <h3 className="text-lg font-bold" style={{ color: "var(--fg, #fff)" }}>
                Looks like you stepped away
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--fg-secondary, #aaa)" }}>
                Your session timer has been paused. Move your mouse, press a key, or tap anywhere to resume tracking.
              </p>
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="mt-1 rounded-full px-6 py-2.5 text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg, var(--primary, #007aff), var(--cyan, #00c6a7))" }}
              >
                {formatElapsed(pausedAtRef.current || elapsed)} paused
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timer pill */}
    <AnimatePresence>
      <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: idle && isActive ? 0.5 : 1, scale: 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 25 }}
          className="mx-auto flex w-fit items-center gap-3 rounded-full px-4 py-2 text-white "
          style={pillStyle}
        >
          {isActive && !idle && (
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
              </span>
            )}

            {idle && isActive && !isReadonly && (
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
          </span>
        )}

            <span className="text-[11px] font-bold tracking-wide whitespace-nowrap drop-shadow-sm">
              {idle && isActive && !isReadonly ? "Paused" : statusLabel}
            </span>

        {isReadonly && isActive && (
              <span className="text-[9px] font-semibold opacity-80 tracking-wide">
                {isMobileRef.current ? "synced" : "another device"}
          </span>
        )}

        {session.isStale && session.active && (
              <span className="text-[9px] font-semibold opacity-75 tracking-wide">inactive</span>
            )}

            <span className="h-3.5 w-px bg-white/40 rounded-full" />

            <span className="font-mono text-[13px] font-black tabular-nums drop-shadow-sm">
              {isActive ? (idle ? formatElapsed(pausedAtRef.current || elapsed) : formatElapsed(elapsed)) : "--:--:--"}
        </span>

            <span className="h-3.5 w-px bg-white/40 rounded-full" />

          <span className="text-[11px] font-bold tabular-nums whitespace-nowrap drop-shadow-sm">
          {formatTodayHours(todayTotal)}
        </span>
      </motion.div>
    </AnimatePresence>
    </>
  );
}
