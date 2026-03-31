"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  slideUpItem,
  staggerContainer,
  tabIndicatorTransition,
  dockEntrance,
} from "@/lib/motion";
import type { UserRole } from "@/lib/models/User";
import SessionTracker from "./SessionTracker";

interface NavLink {
  href: string;
  label: string;
  icon: string;
  roles?: UserRole[];
}

const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Home", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { href: "/employees", label: "Employees", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z", roles: ["superadmin"] },
  { href: "/departments", label: "Depts", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4", roles: ["superadmin"] },
  { href: "/tasks", label: "Tasks", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { href: "/attendance", label: "Attendance", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
];

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light", icon: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" },
  { value: "dark" as const, label: "Dark", icon: "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" },
  { value: "system" as const, label: "System", icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
];


const notifPanelVariants = {
  hidden: { opacity: 0, y: -12, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 400, damping: 32 } },
  exit: { opacity: 0, y: -8, scale: 0.98 },
};

interface LogEntry {
  _id: string;
  userEmail: string;
  userName: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  createdAt: string;
}

const ENTITY_COLORS: Record<string, string> = {
  employee: "bg-blue-500",
  department: "bg-emerald-500",
  task: "bg-amber-500",
  attendance: "bg-purple-500",
  settings: "bg-gray-500",
  auth: "bg-rose-500",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface DashboardShellProps {
  user: {
    id: string;
    email: string;
    role: UserRole;
    firstName: string;
    lastName: string;
    username: string;
    profileImage?: string;
  };
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [themeOpen, setThemeOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const lastSeenRef = useRef<string | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const [logsRes, seenRes] = await Promise.all([
        fetch("/api/activity-logs?limit=20"),
        fetch("/api/user/last-seen"),
      ]);
      if (!logsRes.ok) return;
      const data = await logsRes.json();
      const fetched: LogEntry[] = data.logs || [];
      setLogs(fetched);

      const stored = seenRes.ok ? (await seenRes.json()).lastSeenLogId : null;
      lastSeenRef.current = stored;

      if (stored && fetched.length) {
        const idx = fetched.findIndex((l) => l._id === stored);
        setUnseenCount(idx === -1 ? fetched.length : idx);
      } else if (fetched.length) {
        setUnseenCount(fetched.length);
      } else {
        setUnseenCount(0);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 30_000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  useEffect(() => {
    function handleBIP(e: Event) {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handleBIP);
    if ((window.matchMedia?.("(display-mode: standalone)").matches) || (navigator as unknown as { standalone?: boolean }).standalone) {
      setInstallDismissed(true);
    }
    return () => window.removeEventListener("beforeinstallprompt", handleBIP);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("ss-theme");
    const fromDom = document.documentElement.getAttribute("data-theme");
    const resolved = (
      stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : fromDom === "light" || fromDom === "dark"
          ? fromDom
          : "light"
    ) as typeof theme;
    setTheme(resolved);
    const actual =
      resolved === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : resolved;
    document.documentElement.setAttribute("data-theme", actual);
  }, []);

  const applyTheme = useCallback((next: typeof theme) => {
    setTheme(next);
    const actual =
      next === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : next;
    document.documentElement.setAttribute("data-theme", actual);
    localStorage.setItem("ss-theme", next);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const t = e.target as Node;
      if (themeRef.current && !themeRef.current.contains(t)) setThemeOpen(false);
      if (notifRef.current && !notifRef.current.contains(t)) setNotificationsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    const AUTO_LOGOUT_MS = 30 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    function resetLogoutTimer() {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (user.role !== "superadmin") {
          try { await fetch("/api/attendance/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "checkout" }) }); } catch { /* best effort */ }
        }
        signOut({ callbackUrl: "/login" });
      }, AUTO_LOGOUT_MS);
    }
    const events = ["mousemove", "keydown", "touchstart", "scroll", "click"] as const;
    events.forEach((e) => window.addEventListener(e, resetLogoutTimer, { passive: true }));
    resetLogoutTimer();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, resetLogoutTimer));
    };
  }, []);

  const visibleLinks = NAV_LINKS.filter(
    (l) => !l.roles || l.roles.includes(user.role),
  );
  const currentTheme =
    THEME_OPTIONS.find((o) => o.value === theme) ?? THEME_OPTIONS[0];

  function isActive(href: string) {
    return href === "/"
      ? pathname === "/"
      : pathname.startsWith(href);
  }

  return (
    <div className="min-h-screen gradient-mesh">
      {/* ── Floating Install App pill ── */}
      <AnimatePresence>
        {!installDismissed && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{
              delay: 2,
              type: "spring",
              stiffness: 200,
              damping: 22,
            }}
            className="fixed z-50 flex items-center gap-1.5"
            style={{ top: "0.75rem", right: "0.75rem" }}
          >
            <motion.button
              type="button"
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white shadow-lg"
              style={{
                background: "linear-gradient(135deg, #2d9cff, #0055cc)",
              }}
              whileTap={{ scale: 0.9 }}
              onClick={async () => {
                if (installPrompt) {
                  await installPrompt.prompt();
                  const { outcome } = await installPrompt.userChoice;
                  if (outcome === "accepted") setInstallDismissed(true);
                  setInstallPrompt(null);
                }
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12l7 7 7-7" />
                <rect
                  x="3"
                  y="20"
                  width="18"
                  height="2"
                  rx="1"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
              Install App
            </motion.button>
            <motion.button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
              style={{ background: "rgba(0,0,0,0.35)", color: "white" }}
              whileTap={{ scale: 0.8 }}
              title="Dismiss"
              onClick={() => setInstallDismissed(true)}
            >
              ✕
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <header className="frosted sticky top-0 z-30">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between gap-3 px-4 sm:h-14 sm:px-6">
          <Link
            href="/"
            className="gradient-text shrink-0 text-[15px] font-bold tracking-tight sm:text-lg"
          >
            Single Solution Sync
          </Link>

          <nav className="flex items-center gap-1">
            {/* Theme toggle */}
            <div className="relative" ref={themeRef}>
              <button
                type="button"
                onClick={() => { setThemeOpen((o) => !o); setNotificationsOpen(false); }}
                className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[var(--fg-secondary)] transition-colors hover:bg-[var(--hover-bg)]"
                aria-label="Theme"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={currentTheme.icon} />
                </svg>
                <span className="hidden text-xs font-medium sm:inline">{currentTheme.label}</span>
              </button>
              <AnimatePresence>
                {themeOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full z-50 mt-2 min-w-[140px] overflow-hidden rounded-2xl border shadow-lg"
                    style={{ background: "var(--glass-bg-heavy)", borderColor: "var(--glass-border)", backdropFilter: "saturate(200%) blur(40px)", WebkitBackdropFilter: "saturate(200%) blur(40px)" }}
                  >
                    {THEME_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { applyTheme(opt.value); setThemeOpen(false); }}
                        className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors ${theme === opt.value ? "bg-[var(--primary-light)] font-medium text-[var(--primary)]" : "text-[var(--fg-secondary)] hover:bg-[var(--hover-bg)]"}`}
                      >
                        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={opt.icon} />
                        </svg>
                        {opt.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Notification bell */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => {
                  const wasOpen = notificationsOpen;
                  setNotificationsOpen((o) => !o);
                  setThemeOpen(false);
                  if (!wasOpen && logs.length > 0) {
                    setUnseenCount(0);
                    fetch("/api/user/last-seen", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ lastSeenLogId: logs[0]._id }),
                    }).catch(() => {});
                    lastSeenRef.current = logs[0]._id;
                  }
                }}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl text-[var(--fg-secondary)] transition-colors hover:bg-[var(--hover-bg)]"
                aria-label="Notifications"
              >
                <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.082A8.25 8.25 0 0021.75 8.25a8.25 8.25 0 00-16.5 0 8.25 8.25 0 001.439 8.75 23.848 23.848 0 005.454 1.082m-5.454-1.082A2.25 2.25 0 0012 19.5a2.25 2.25 0 002.25-2.418" />
                </svg>
                {unseenCount > 0 && (
                  <motion.span
                    className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                    style={{ background: "var(--rose)" }}
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  >
                    {unseenCount > 9 ? "9+" : unseenCount}
                  </motion.span>
                )}
              </button>
              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div
                    className="card-static absolute right-0 top-full z-40 mt-2 w-[min(calc(100vw-2rem),22rem)] overflow-hidden"
                    style={{ background: "var(--glass-bg-heavy)", backdropFilter: "var(--glass-blur)", WebkitBackdropFilter: "var(--glass-blur)" }}
                    variants={notifPanelVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
                      <span className="text-headline text-sm">Activity Log</span>
                      {logs.length > 0 && (
                        <button
                          type="button"
                          className="text-footnote font-medium"
                          style={{ color: "var(--primary)" }}
                          onClick={() => {
                            if (logs.length > 0) {
                              setUnseenCount(0);
                              fetch("/api/user/last-seen", {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ lastSeenLogId: logs[0]._id }),
                              }).catch(() => {});
                              lastSeenRef.current = logs[0]._id;
                            }
                            setNotificationsOpen(false);
                          }}
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <motion.ul className="max-h-[min(60vh,360px)] overflow-y-auto p-2" variants={staggerContainer} initial="hidden" animate="visible">
                      {logs.length === 0 ? (
                        <li className="py-6 text-center text-callout" style={{ color: "var(--fg-tertiary)" }}>No activity yet</li>
                      ) : logs.map((log, i) => {
                        const isSeen = lastSeenRef.current
                          ? i >= logs.findIndex((l) => l._id === lastSeenRef.current) && logs.findIndex((l) => l._id === lastSeenRef.current) !== -1
                          : false;
                        return (
                          <motion.li
                            key={log._id}
                            variants={slideUpItem}
                            className="flex gap-2.5 rounded-lg px-2 py-2.5 text-callout transition-colors"
                            style={{ color: "var(--fg)", opacity: isSeen ? 0.55 : 1 }}
                            whileHover={{ x: 4 }}
                          >
                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ENTITY_COLORS[log.entity] || "bg-gray-400"}`} />
                            <div className="min-w-0 flex-1">
                              <p className="leading-snug">
                                <span className="font-semibold">{log.userName || log.userEmail}</span>{" "}
                                {log.action}
                              </p>
                              {log.details && (
                                <p className="text-footnote mt-0.5 line-clamp-1" style={{ color: "var(--fg-secondary)" }}>{log.details}</p>
                              )}
                              <p className="text-footnote mt-0.5" style={{ color: "var(--fg-tertiary)" }}>
                                {timeAgo(log.createdAt)} · {log.entity}
                              </p>
                            </div>
                          </motion.li>
                        );
                      })}
                    </motion.ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Settings link */}
            <Link
              href="/settings"
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150 ${
                pathname.startsWith("/settings")
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "text-[var(--fg-secondary)] hover:text-[var(--fg)] hover:bg-[var(--hover-bg)]"
              }`}
            >
              Settings
            </Link>

            {/* Sign out */}
            <button
              type="button"
              onClick={async () => {
                if (user.role !== "superadmin") {
                  try { await fetch("/api/attendance/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "checkout" }) }); } catch { /* best effort */ }
                }
                signOut({ callbackUrl: "/login" });
              }}
              className="btn-signout px-3 py-1.5 rounded-full text-sm font-medium text-[var(--fg-secondary)] hover:text-[var(--rose)] transition-all duration-150"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>

      {/* ── Main content with page transition ── */}
      <main className="mx-auto max-w-7xl px-4 py-4 pb-40 sm:px-6 sm:py-5 sm:pb-40">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Floating bottom navigation dock ── */}
      <motion.div
        initial={dockEntrance.initial}
        animate={dockEntrance.animate}
        transition={dockEntrance.transition}
        className="fixed bottom-0 left-0 right-0 z-50 sm:bottom-5 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-3 mb-2 sm:mx-0">
          {/* Session timer bar — superadmin doesn't track attendance */}
          {user.role !== "superadmin" && (
            <div className="mb-2">
              <SessionTracker />
            </div>
          )}
          <LayoutGroup>
            <nav
              className="dock-glass flex items-stretch justify-around rounded-2xl sm:justify-center sm:gap-1 sm:rounded-full"
              style={{ padding: "8px 12px" }}
            >
              {visibleLinks.map((link) => {
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="relative flex flex-1 flex-col items-center justify-center py-2 sm:flex-initial sm:flex-row sm:h-11 sm:px-4 sm:py-0 sm:rounded-full"
                    style={{ gap: 4 }}
                  >
                    {active && (
                      <motion.span
                        layoutId="dock-active"
                        className="absolute inset-x-1.5 inset-y-1 rounded-xl sm:inset-0 sm:rounded-full"
                        style={{
                          background: "var(--primary-light)",
                          border: "0.5px solid var(--glass-border)",
                          boxShadow:
                            "inset 0 0.5px 0 var(--glass-border-inner)",
                        }}
                        transition={tabIndicatorTransition}
                      />
                    )}
                    <svg
                      className="relative"
                      style={{
                        width: 20,
                        height: 20,
                        color: active
                          ? "var(--primary)"
                          : "var(--fg-tertiary)",
                      }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={active ? 2 : 1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d={link.icon}
                      />
                    </svg>
                    <span
                      className="relative font-semibold"
                      style={{
                        fontSize: 10,
                        lineHeight: 1,
                        color: active
                          ? "var(--primary)"
                          : "var(--fg-tertiary)",
                      }}
                    >
                      {link.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </LayoutGroup>
        </div>
      </motion.div>
    </div>
  );
}
