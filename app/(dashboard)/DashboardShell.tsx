"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { dockEntrance, tabIndicatorTransition } from "@/lib/motion";
import type { UserRole } from "@/lib/models/User";
import SessionTracker from "./SessionTracker";

interface NavLink {
  href: string;
  label: string;
  icon: string;
  roles?: UserRole[];
}

const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Overview", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { href: "/employees", label: "Employees", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z", roles: ["superadmin", "manager", "teamLead"] },
  { href: "/departments", label: "Depts", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4", roles: ["superadmin", "manager", "teamLead"] },
  { href: "/campaigns", label: "Campaigns", icon: "M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" },
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

const ENTITY_ICONS: Record<string, string> = {
  employee: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  department: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  task: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  team: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  campaign: "M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z",
  attendance: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
  auth: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  security: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
};

const ENTITY_COLORS: Record<string, string> = {
  employee: "text-blue-500",
  department: "text-emerald-500",
  task: "text-amber-500",
  team: "text-teal-500",
  campaign: "text-indigo-500",
  attendance: "text-purple-500",
  settings: "text-gray-500",
  auth: "text-rose-500",
  security: "text-red-500",
};

function getEntityHref(entity: string, entityId?: string): string | null {
  switch (entity) {
    case "employee": return entityId ? `/employees/${entityId}/edit` : "/employees";
    case "department": return "/departments";
    case "team": return "/campaigns";
    case "campaign": return "/campaigns";
    case "task": return "/tasks";
    case "attendance": return "/attendance";
    case "settings": return "/settings";
    case "security": return "/employees";
    default: return null;
  }
}

function getEntityPageHref(entity: string): string | null {
  switch (entity) {
    case "employee": return "/employees";
    case "department": return "/departments";
    case "team": return "/campaigns";
    case "campaign": return "/campaigns";
    case "task": return "/tasks";
    case "attendance": return "/attendance";
    case "settings": return "/settings";
    default: return null;
  }
}

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function RefreshBtn({ onRefresh }: { onRefresh: () => void }) {
  const [spinning, setSpinning] = useState(false);
  return (
    <motion.button
      type="button"
      onClick={() => { setSpinning(true); onRefresh(); setTimeout(() => setSpinning(false), 800); }}
      animate={{ rotate: spinning ? 360 : 0 }}
      transition={{ duration: 0.6 }}
      className="ml-2 p-1 rounded-full hover:bg-[var(--bg-secondary)] transition-colors"
      style={{ color: "var(--fg-tertiary)" }}
      title="Refresh"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
    </motion.button>
  );
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
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [themeOpen, setThemeOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const lastSeenRef = useRef<string | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const themeRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  /* ── Ping inbox state ── */
  const [pingsOpen, setPingsOpen] = useState(false);
  const [pings, setPings] = useState<{ _id: string; from: { about: { firstName: string; lastName: string }; userRole?: string }; message: string; read: boolean; createdAt: string }[]>([]);
  const [pingUnread, setPingUnread] = useState(0);
  const [pingsLoaded, setPingsLoaded] = useState(false);
  const pingRef = useRef<HTMLDivElement>(null);

  const fetchPings = useCallback(async () => {
    try {
      const res = await fetch("/api/ping");
      if (!res.ok) return;
      const data = await res.json();
      setPings(data.pings ?? []);
      setPingUnread(data.unreadCount ?? 0);
    } catch { /* silent */ }
    setPingsLoaded(true);
  }, []);

  useEffect(() => { fetchPings(); }, [fetchPings]);

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
    setLogsLoaded(true);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

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
      if (pingRef.current && !pingRef.current.contains(t)) setPingsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
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
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
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
        <div className="mx-auto max-w-[1600px] flex h-12 items-center justify-between gap-3 px-4 sm:h-14 sm:px-6 lg:px-10">
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0"
          >
            <span className="text-[15px] font-bold tracking-tight sm:text-lg" style={{ color: "var(--primary)" }}>
            Single Solution Sync
            </span>
          </Link>

          {/* Hamburger — mobile only */}
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors sm:hidden"
            style={{ color: "var(--fg-secondary)" }}
            aria-label="Menu"
            onClick={() => setMobileMenuOpen(true)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <nav className="hidden items-center gap-1 sm:flex">
            {/* Theme toggle */}
            <div className="relative" ref={themeRef}>
              <button
                type="button"
                onClick={() => { setThemeOpen((o) => !o); setNotificationsOpen(false); setPingsOpen(false); }}
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
                    className="absolute right-0 top-full z-50 mt-2 min-w-[140px] overflow-hidden rounded-xl border shadow-lg"
                    style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
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

            {/* Ping inbox */}
            <div className="relative" ref={pingRef}>
              <button
                type="button"
                onClick={() => { setPingsOpen((o) => !o); setNotificationsOpen(false); setThemeOpen(false); }}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl text-[var(--fg-secondary)] transition-colors hover:bg-[var(--hover-bg)]"
                aria-label="Pings"
              >
                <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
                {pingUnread > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white notif-badge-pulse" style={{ background: "var(--primary)" }}>
                    {pingUnread > 9 ? "9+" : pingUnread}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {pingsOpen && (
                  <motion.div
                    className="card-static absolute right-0 top-full z-40 mt-2 w-[min(calc(100vw-2rem),22rem)] overflow-hidden"
                    style={{ background: "var(--bg-elevated)" }}
                    variants={notifPanelVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center min-w-0">
                        <span className="text-headline text-sm">Pings</span>
                        <RefreshBtn onRefresh={fetchPings} />
                      </div>
                      {pingUnread > 0 && (
                        <button
                          type="button"
                          className="text-footnote font-medium"
                          style={{ color: "var(--primary)" }}
                          onClick={async () => {
                            await fetch("/api/ping", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }).catch(() => {});
                            setPingUnread(0);
                            setPings((prev) => prev.map((p) => ({ ...p, read: true })));
                          }}
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-[min(60vh,380px)] overflow-y-auto divide-y divide-[var(--border)]">
                      {!pingsLoaded ? (
                        <div className="divide-y divide-[var(--border)]">
                          {[1, 2, 3].map((i) => <div key={i} className="flex items-start gap-2.5 px-3 py-2.5"><span className="shimmer mt-0.5 h-7 w-7 shrink-0 rounded-full" /><div className="flex-1 space-y-1.5"><span className="shimmer block h-3 w-28 rounded" /><span className="shimmer block h-2.5 w-16 rounded" /></div></div>)}
                        </div>
                      ) : pings.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--fg-tertiary)" }}>No pings yet</div>
                      ) : pings.map((ping) => {
                        const senderName = ping.from?.about ? `${ping.from.about.firstName} ${ping.from.about.lastName}`.trim() : "Unknown";
                        return (
                          <div key={ping._id} className="px-3 py-2.5 transition-colors" style={{ opacity: ping.read ? 0.5 : 1, background: "transparent" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                            <div className="flex items-start gap-2.5">
                              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)" }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium leading-snug" style={{ color: "var(--fg)" }}>
                                  <span className="font-semibold">{senderName}</span> pinged you
                                </p>
                                {ping.message && <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: "var(--fg-secondary)" }}>{ping.message}</p>}
                                <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-tertiary)" }}>{timeAgo(ping.createdAt)}</p>
                              </div>
                              {!ping.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--primary)" }} />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
                  setPingsOpen(false);
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                {unseenCount > 0 && (
                    <span
                      className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white notif-badge-pulse"
                      style={{ background: "var(--rose)" }}
                    >
                    {unseenCount > 9 ? "9+" : unseenCount}
                    </span>
                  )}
                </button>
                <AnimatePresence>
                  {notificationsOpen && (
                    <motion.div
                    className="card-static absolute right-0 top-full z-40 mt-2 w-[min(calc(100vw-2rem),22rem)] overflow-hidden"
                      style={{ background: "var(--bg-elevated)" }}
                      variants={notifPanelVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center min-w-0">
                        <span className="text-headline text-sm">Activity Log</span>
                        <RefreshBtn onRefresh={fetchLogs} />
                      </div>
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
                    <div className="max-h-[min(60vh,380px)] overflow-y-auto divide-y divide-[var(--border)]">
                      {!logsLoaded ? (
                        <div className="divide-y divide-[var(--border)]">
                          {[1, 2, 3, 4].map((i) => <div key={i} className="flex items-start gap-2.5 px-3 py-2.5"><span className="shimmer mt-0.5 h-4 w-4 shrink-0 rounded" /><div className="flex-1 space-y-1.5"><span className="shimmer block h-3 w-36 rounded" /><span className="shimmer block h-2.5 w-20 rounded" /></div></div>)}
                        </div>
                      ) : logs.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--fg-tertiary)" }}>No activity yet</div>
                      ) : logs.map((log, i) => {
                        const seenIdx = lastSeenRef.current ? logs.findIndex((l) => l._id === lastSeenRef.current) : -1;
                        const isSeen = seenIdx !== -1 && i >= seenIdx;
                        const href = getEntityHref(log.entity, log.entityId) || getEntityPageHref(log.entity);
                        const isSecurity = log.entity === "security";
                        let secMeta: { severity?: string; totalCount?: number; latitude?: number; longitude?: number; accuracy?: number | null; reasons?: string[]; windowDays?: number } | null = null;
                        if (isSecurity && log.details) {
                          try { secMeta = JSON.parse(log.details); } catch { /* not JSON — legacy entry */ }
                        }
                        return (
                          <div
                            key={log._id}
                            className="px-3 py-2.5 transition-colors group"
                            style={{ opacity: isSeen ? 0.5 : 1, background: "transparent" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${isSecurity ? "" : ""}`} style={isSecurity ? { background: secMeta?.severity === "violation" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)" } : undefined}>
                                <svg className={`w-4 h-4 shrink-0 ${ENTITY_COLORS[log.entity] || "text-[var(--fg-tertiary)]"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d={ENTITY_ICONS[log.entity] || ENTITY_ICONS.employee} />
                                </svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                {(() => {
                                  const isSelf = log.userEmail === user.email;
                                  const displayName = isSelf ? "You" : (log.userName || log.userEmail.split("@")[0]);

                                  if (isSecurity && secMeta) {
                                    const isViolation = secMeta.severity === "violation";
                                    const mapsUrl = secMeta.latitude != null && secMeta.longitude != null
                                      ? `https://www.google.com/maps?q=${secMeta.latitude},${secMeta.longitude}`
                                      : null;
                                    return (
                                      <>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <p className="text-xs font-semibold leading-snug" style={{ color: "var(--fg)" }}>
                                            {displayName}
                                          </p>
                                          <span
                                            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                                            style={{
                                              background: isViolation ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
                                              color: isViolation ? "#ef4444" : "#d97706",
                                            }}
                                          >
                                            {isViolation ? "Violation" : "Warning"}
                                          </span>
                                          <span className="text-[9px] font-semibold tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                                            #{secMeta.totalCount ?? "?"} in {secMeta.windowDays ?? 30}d
                                          </span>
                                        </div>
                                        {secMeta.reasons && secMeta.reasons.length > 0 && (
                                          <div className="mt-1 space-y-0.5">
                                            {secMeta.reasons.map((r, ri) => (
                                              <p key={ri} className="text-[10px] leading-snug" style={{ color: isViolation ? "#ef4444" : "#d97706" }}>
                                                {r}
                                              </p>
                                            ))}
                                          </div>
                                        )}
                                        {mapsUrl && (
                                          <a
                                            href={mapsUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors"
                                            style={{ background: "var(--primary-light)", color: "var(--primary)" }}
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                                              <circle cx="12" cy="10" r="3" />
                                            </svg>
                                            {secMeta.latitude?.toFixed(5)}, {secMeta.longitude?.toFixed(5)}
                                            {secMeta.accuracy != null && <span className="opacity-60">(±{Math.round(secMeta.accuracy)}m)</span>}
                                          </a>
                                        )}
                                        <p className="text-[10px] mt-1" style={{ color: "var(--fg-tertiary)" }}>
                                          {isSelf ? "you" : log.userEmail.split("@")[0]} · {timeAgo(log.createdAt)}
                                        </p>
                                      </>
                                    );
                                  }

                                  return (
                                    <>
                                      <p className="text-xs font-medium leading-snug" style={{ color: "var(--fg)" }}>
                                        {href ? (
                                          <button
                                            type="button"
                                            onClick={() => { setNotificationsOpen(false); router.push(href); }}
                                            className="hover:underline transition-colors text-left"
                                            style={{ color: "var(--fg)" }}
                                            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--primary)"; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fg)"; }}
                                          >
                                            <span className="font-semibold">{displayName}</span>{" "}
                                            {log.action}
                                          </button>
                                        ) : (
                                          <>
                                            <span className="font-semibold">{displayName}</span>{" "}
                                            {log.action}
                                          </>
                                        )}
                                      </p>
                                      {log.details && (
                                        <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--fg-tertiary)" }}>{log.details}</p>
                                      )}
                                      <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-tertiary)" }}>
                                        {isSelf ? "you" : log.userEmail.split("@")[0]} · {timeAgo(log.createdAt)}
                                      </p>
                                    </>
                                  );
                                })()}
                      </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
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

      {/* ── Mobile drawer ── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="fixed inset-0 z-[70] sm:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
            <motion.aside
              className="absolute right-0 top-0 bottom-0 w-[min(80vw,300px)] flex flex-col overflow-y-auto"
              style={{ background: "var(--bg-elevated)", borderLeft: "1px solid var(--border)" }}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 36 }}
            >
              {/* Close */}
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                <span className="text-[13px] font-bold" style={{ color: "var(--primary)" }}>Menu</span>
                <button type="button" onClick={() => setMobileMenuOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ color: "var(--fg-secondary)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Profile */}
              <Link
                href={`/employees/${user.username}`}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 transition-colors"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                {user.profileImage ? (
                  <img src={user.profileImage} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-red-400 text-xs font-semibold text-white">
                    {user.firstName?.[0]}{user.lastName?.[0]}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold truncate" style={{ color: "var(--fg)" }}>{user.firstName} {user.lastName}</p>
                  <p className="text-[10px] truncate" style={{ color: "var(--fg-tertiary)" }}>{user.email}</p>
                </div>
              </Link>

              {/* Theme */}
              <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>Theme</p>
                <div className="flex gap-1.5">
                  {THEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => applyTheme(opt.value)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors ${
                        theme === opt.value
                          ? "bg-[var(--primary)] text-white"
                          : "text-[var(--fg-secondary)]"
                      }`}
                      style={theme !== opt.value ? { background: "var(--bg-grouped)" } : undefined}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={opt.icon} />
                      </svg>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Links */}
              <div className="flex-1 py-2">
                <button
                  type="button"
                  onClick={() => { setMobileMenuOpen(false); setPingsOpen(true); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-[12px] font-medium transition-colors"
                  style={{ color: "var(--fg-secondary)" }}
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                  Pings
                  {pingUnread > 0 && (
                    <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white" style={{ background: "var(--primary)" }}>
                      {pingUnread > 9 ? "9+" : pingUnread}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => { setMobileMenuOpen(false); setNotificationsOpen(true); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-[12px] font-medium transition-colors"
                  style={{ color: "var(--fg-secondary)" }}
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  Notifications
                  {unseenCount > 0 && (
                    <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white" style={{ background: "var(--rose)" }}>
                      {unseenCount > 9 ? "9+" : unseenCount}
                    </span>
                  )}
                </button>

                <Link
                  href="/settings"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-[12px] font-medium transition-colors"
                  style={{ color: pathname.startsWith("/settings") ? "var(--primary)" : "var(--fg-secondary)" }}
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  </svg>
                  Settings
                </Link>
              </div>

              {/* Sign out */}
              <div className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
                <button
                  type="button"
                  onClick={async () => {
                    setMobileMenuOpen(false);
                    if (user.role !== "superadmin") {
                      try { await fetch("/api/attendance/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "checkout" }) }); } catch { /* best effort */ }
                    }
                    signOut({ callbackUrl: "/login" });
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors"
                  style={{ color: "var(--rose)", background: "color-mix(in srgb, var(--rose) 8%, transparent)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                  Sign out
                </button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content with page transition ── */}
      <main className="mx-auto max-w-[1600px] px-5 py-4 pb-40 sm:px-8 sm:py-5 sm:pb-40 lg:px-14">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
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
