"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  modalContent,
  modalOverlay,
  slideUpItem,
  staggerContainer,
} from "@/lib/motion";
import { AVATAR_GRADIENTS, initials } from "@/lib/mockData";

interface PreviewHeaderProps {
  currentRole: string;
  roleUser: {
    firstName: string;
    lastName: string;
    email: string;
    designation: string;
  };
}

const THEME_KEY = "ss-theme";

const notifPanelVariants = {
  hidden: { ...modalOverlay.hidden, y: -12, scale: 0.98 },
  visible: {
    ...modalOverlay.visible,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 400, damping: 32 },
  },
  exit: { ...modalOverlay.exit, y: -8, scale: 0.98 },
};

const notificationsMock = [
  { id: "1", text: "Bilal Hassan is absent today", time: "2m ago", dotClass: "bg-rose-500" },
  { id: "2", text: "Hamza Malik arrived late (+18 min)", time: "28m ago", dotClass: "bg-amber-500" },
  { id: "3", text: "Zara Shah is in overtime (+30 min)", time: "1h ago", dotClass: "bg-purple-500" },
  { id: "4", text: "Monthly report ready for March", time: "3h ago", dotClass: "bg-blue-500" },
];

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light", icon: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" },
  { value: "dark" as const, label: "Dark", icon: "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" },
  { value: "system" as const, label: "System", icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
];

export default function PreviewHeader({ currentRole, roleUser }: PreviewHeaderProps) {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [themeOpen, setThemeOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const themeRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(THEME_KEY) : null;
    const fromDom = typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme") : null;
    const resolved = (stored === "light" || stored === "dark" || stored === "system" ? stored : fromDom === "light" || fromDom === "dark" ? fromDom : null) ?? "light";
    setTheme(resolved as "light" | "dark" | "system");
    const actual = resolved === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : resolved;
    document.documentElement.setAttribute("data-theme", actual);
  }, []);

  const applyTheme = useCallback((next: "light" | "dark" | "system") => {
    setTheme(next);
    const actual = next === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : next;
    document.documentElement.setAttribute("data-theme", actual);
    localStorage.setItem(THEME_KEY, next);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | PointerEvent) {
      const target = event.target as Node;
      if (themeRef.current?.contains(target)) return;
      if (notifRef.current?.contains(target)) return;
      if (userRef.current?.contains(target)) return;
      setThemeOpen(false);
      setNotificationsOpen(false);
      setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const fullName = `${roleUser.firstName} ${roleUser.lastName}`.trim();
  const avatarInitials = initials(roleUser.firstName, roleUser.lastName);
  const avatarGradient = AVATAR_GRADIENTS[0];
  const currentThemeOpt = THEME_OPTIONS.find((o) => o.value === theme) ?? THEME_OPTIONS[0];

  return (
    <>
      {/* Floating Install App pill — matches inventory app */}
      <motion.div
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 2, type: "spring", stiffness: 200, damping: 22 }}
        className="fixed z-50 flex items-center gap-1.5"
        style={{ top: "0.75rem", right: "0.75rem" }}
      >
        <motion.button
          type="button"
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white shadow-lg"
          style={{ background: "linear-gradient(135deg, #2d9cff, #0055cc)" }}
          whileTap={{ scale: 0.9 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12l7 7 7-7" />
            <rect x="3" y="20" width="18" height="2" rx="1" fill="currentColor" stroke="none" />
          </svg>
          Install App
        </motion.button>
        <motion.button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
          style={{ background: "rgba(0,0,0,0.35)", color: "white" }}
          whileTap={{ scale: 0.8 }}
          title="Dismiss"
        >
          ✕
        </motion.button>
      </motion.div>

      <header className="frosted sticky top-0 z-30">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between gap-3 px-4 sm:h-14 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="gradient-text truncate text-[15px] font-bold tracking-tight sm:text-lg">
              Single Solution Sync
            </span>
            <span
              className="badge shrink-0 border text-caption"
              style={{
                background: "var(--glass-bg-heavy)",
                borderColor: "var(--glass-border)",
                color: "var(--fg-secondary)",
              }}
            >
              {currentRole}
            </span>
          </div>

          <div className="relative flex shrink-0 items-center gap-1">
            {/* Theme dropdown — matches inventory app */}
            <div className="relative" ref={themeRef}>
              <button
                type="button"
                onClick={() => { setThemeOpen((o) => !o); setNotificationsOpen(false); setUserMenuOpen(false); }}
                className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[var(--fg-secondary)] transition-colors hover:bg-black/5"
                aria-label="Theme"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={currentThemeOpt.icon} />
                </svg>
                <span className="hidden text-xs font-medium sm:inline">{currentThemeOpt.label}</span>
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
                        className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors ${theme === opt.value ? "bg-[var(--primary-light)] font-medium text-[var(--primary)]" : "text-[var(--fg-secondary)] hover:bg-[var(--bg)]"}`}
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
                onClick={() => { setNotificationsOpen((o) => !o); setUserMenuOpen(false); setThemeOpen(false); }}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl text-[var(--fg-secondary)] transition-colors hover:bg-black/5"
                aria-expanded={notificationsOpen}
                aria-label="Notifications"
              >
                <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.082A2.25 2.25 0 0021.75 14.25v-2.5a8.25 8.25 0 00-16.5 0v2.5a2.25 2.25 0 001.632 2.163 23.848 23.848 0 005.454 1.082m-5.454-1.082A2.25 2.25 0 0012 19.5h.008M12 19.5a2.25 2.25 0 002.25-2.25h-4.5A2.25 2.25 0 0012 19.5z" />
                </svg>
                <motion.span
                  className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                  style={{ background: "var(--rose)" }}
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                >
                  3
                </motion.span>
              </button>

              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div
                    className="card-static absolute right-0 top-full z-40 mt-2 w-[min(calc(100vw-2rem),20rem)] overflow-hidden"
                    style={{ background: "var(--glass-bg-heavy)", backdropFilter: "var(--glass-blur)", WebkitBackdropFilter: "var(--glass-blur)" }}
                    variants={notifPanelVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
                      <span className="text-headline text-sm">Notifications</span>
                      <button type="button" className="text-footnote font-medium" style={{ color: "var(--primary)" }}>Mark all read</button>
                    </div>
                    <motion.ul className="max-h-[min(60vh,320px)] overflow-y-auto p-2" variants={staggerContainer} initial="hidden" animate="visible">
                      {notificationsMock.map((n) => (
                        <motion.li key={n.id} variants={slideUpItem} className="flex cursor-default gap-2 rounded-lg px-2 py-2.5 text-callout" style={{ color: "var(--fg)" }} whileHover={{ x: 4 }}>
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.dotClass}`} />
                          <div className="min-w-0 flex-1">
                            <p className="leading-snug">{n.text}</p>
                            <p className="text-footnote mt-0.5" style={{ color: "var(--fg-tertiary)" }}>{n.time}</p>
                          </div>
                        </motion.li>
                      ))}
                    </motion.ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* User avatar menu */}
            <div className="relative" ref={userRef}>
              <button
                type="button"
                onClick={() => { setUserMenuOpen((o) => !o); setNotificationsOpen(false); setThemeOpen(false); }}
                className={`relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white ${avatarGradient}`}
                aria-expanded={userMenuOpen}
                aria-label="User menu"
              >
                {avatarInitials}
              </button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    className="card-static absolute right-0 top-full z-50 mt-2 w-[min(calc(100vw-2rem),16rem)] origin-top-right overflow-hidden p-1"
                    style={{ background: "var(--glass-bg-heavy)", backdropFilter: "var(--glass-blur)", WebkitBackdropFilter: "var(--glass-blur)" }}
                    variants={modalContent}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    <div className="px-3 py-3">
                      <p className="text-headline text-sm leading-tight">{fullName}</p>
                      <p className="text-footnote mt-1 truncate" style={{ color: "var(--fg-secondary)" }}>{roleUser.email}</p>
                      <p className="text-caption mt-0.5" style={{ color: "var(--fg-tertiary)" }}>{roleUser.designation}</p>
                    </div>
                    <hr className="divider" />
                    <nav className="py-1">
                      {[
                        { label: "My Profile", icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" },
                        { label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
                        { label: "Change Password", icon: "M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H3v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-callout transition-colors hover:bg-[var(--primary-light)]"
                          style={{ color: "var(--fg)" }}
                        >
                          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                          </svg>
                          {item.label}
                        </button>
                      ))}
                    </nav>
                    <hr className="divider" />
                    <div className="p-1">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-callout font-medium transition-colors hover:bg-[var(--primary-light)]"
                        style={{ color: "var(--rose)" }}
                      >
                        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                        </svg>
                        Sign Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
