"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { tabIndicatorTransition } from "@/lib/motion";
import { useGuide } from "@/lib/useGuide";
import { insightsDeskTour } from "@/lib/tourConfigs";
import { usePermissions } from "@/lib/usePermissions";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Portal } from "../components/Portal";
import { HeaderStatPill } from "../components/StatChips";
import toast from "react-hot-toast";

type Tab = "attendance" | "leaves" | "payroll";

const TABS: { id: Tab; label: string; href: string; icon: string }[] = [
  { id: "attendance", label: "Attendance", href: "/insights-desk/attendance", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { id: "leaves", label: "Leaves", href: "/insights-desk/leaves", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "payroll", label: "Payroll", href: "/insights-desk/payroll", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
];

function resolveTab(pathname: string): Tab {
  for (const t of TABS) {
    if (pathname.startsWith(t.href)) return t.id;
  }
  return "attendance";
}

interface Holiday {
  _id: string;
  name: string;
  date: string;
  year: number;
  isRecurring: boolean;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function InsightsDeskLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = resolveTab(pathname);
  const { registerTour } = useGuide();
  const { can: canPerm } = usePermissions();
  const canViewAttendance = canPerm("attendance_viewTeam");
  const canViewLeaves = canPerm("leaves_viewTeam");
  const canViewPayroll = canPerm("payroll_viewTeam");
  const canViewHolidays = canPerm("holidays_view");
  const canManageHolidays = canPerm("holidays_manage");

  const tabPermissions: Record<Tab, boolean> = {
    attendance: canViewAttendance,
    leaves: canViewLeaves,
    payroll: canViewPayroll,
  };
  const visibleTabs = TABS.filter((t) => tabPermissions[t.id]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => { registerTour("insights-desk", insightsDeskTour); }, [registerTour]);

  /* ── Holidays modal state ── */
  const [holidaysOpen, setHolidaysOpen] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidaysLoading, setHolidaysLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formRecurring, setFormRecurring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);
  const [deleting, setDeleting] = useState(false);

  const displayYear = new Date().getFullYear();

  const fetchHolidays = useCallback(async () => {
    setHolidaysLoading(true);
    try {
      const res = await fetch(`/api/payroll/holidays?year=${displayYear}`);
      const data = res.ok ? await res.json() : [];
      setHolidays(Array.isArray(data) ? data : []);
    } catch { setHolidays([]); }
    setHolidaysLoading(false);
  }, [displayYear]);

  useEffect(() => { if (canViewHolidays) fetchHolidays(); }, [canViewHolidays, fetchHolidays]);
  useEffect(() => { if (holidaysOpen) fetchHolidays(); }, [holidaysOpen, fetchHolidays]);

  async function handleAdd() {
    if (!formName.trim() || !formDate) return;
    setSaving(true);
    try {
      const res = await fetch("/api/payroll/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), date: formDate, isRecurring: formRecurring }),
      });
      if (res.ok) {
        toast.success("Holiday added");
        setFormName(""); setFormDate(""); setFormRecurring(false); setShowForm(false);
        await fetchHolidays();
      } else {
        const d = await res.json();
        toast.error(d.error || "Failed to add holiday");
      }
    } catch { toast.error("Something went wrong"); }
    setSaving(false);
  }

  async function handleToggleRecurring(h: Holiday) {
    setTogglingId(h._id);
    try {
      const res = await fetch("/api/payroll/holidays", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: h._id, isRecurring: !h.isRecurring }),
      });
      if (res.ok) {
        setHolidays((prev) => prev.map((x) => x._id === h._id ? { ...x, isRecurring: !x.isRecurring } : x));
      } else toast.error("Failed to update");
    } catch { toast.error("Something went wrong"); }
    setTogglingId(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/payroll/holidays?id=${deleteTarget._id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Holiday removed");
        setDeleteTarget(null);
        setHolidays((prev) => prev.filter((x) => x._id !== deleteTarget._id));
      } else toast.error("Failed to remove holiday");
    } catch { toast.error("Something went wrong"); }
    setDeleting(false);
  }

  const upcoming = useMemo(() => holidays.filter((h) => new Date(h.date) >= new Date()), [holidays]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-headline text-lg font-bold" style={{ color: "var(--fg)" }}>Insights Desk</h1>
          {holidays.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {upcoming.length > 0 && <HeaderStatPill label={upcoming.length === 1 ? "upcoming holiday" : "upcoming holidays"} value={upcoming.length} dotColor="#8b5cf6" />}
              <HeaderStatPill label={holidays.length === 1 ? "holiday this year" : "holidays this year"} value={holidays.length} dotColor="var(--fg-tertiary)" />
            </div>
          )}
        </div>

        {canViewHolidays && (
          <motion.button
            type="button"
            onClick={() => setHolidaysOpen(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg)" }}
          >
            <svg className="h-3.5 w-3.5" style={{ color: "#8b5cf6" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            Holidays
            {upcoming.length > 0 && holidaysOpen === false && (
              <span className="ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: "#8b5cf6" }}>
                {upcoming.length}
              </span>
            )}
          </motion.button>
        )}
      </div>

      <LayoutGroup>
        <div data-tour="insights-tabs" className="flex gap-1 rounded-xl p-1 mb-6" style={{ background: "var(--bg-grouped)" }}>
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => router.push(tab.href)}
              className="relative flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
              style={{ color: activeTab === tab.id ? "var(--primary)" : "var(--fg-tertiary)" }}
            >
              {mounted && activeTab === tab.id && (
                <motion.span
                  layoutId="insights-tab-pill"
                  className="absolute inset-0 rounded-lg"
                  style={{ background: "var(--primary-light)" }}
                  transition={tabIndicatorTransition}
                />
              )}
              <svg className="relative h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
              </svg>
              <span className="relative">{tab.label}</span>
            </button>
          ))}
        </div>
      </LayoutGroup>

      {children}

      {/* ── Holidays Modal ── */}
      <Portal>
        <AnimatePresence>
          {holidaysOpen && (
            <motion.div
              className="fixed inset-0 z-[60] flex items-center justify-center"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setHolidaysOpen(false)} />
              <motion.div
                className="relative w-full max-w-lg mx-4 max-h-[85vh] flex flex-col rounded-2xl border shadow-xl overflow-hidden"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                  <div>
                    <h2 className="text-base font-bold" style={{ color: "var(--fg)" }}>Company Holidays</h2>
                    <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                      {holidays.length} holiday{holidays.length !== 1 ? "s" : ""} in {displayYear}
                      {upcoming.length > 0 && <> · {upcoming.length} upcoming</>}
                    </p>
                  </div>
                  <button type="button" onClick={() => setHolidaysOpen(false)} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-secondary)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                  {/* Add holiday form */}
                  {canManageHolidays && (
                    <AnimatePresence mode="wait">
                      {!showForm ? (
                        <motion.button
                          key="add-btn"
                          type="button"
                          onClick={() => setShowForm(true)}
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
                          style={{ color: "var(--primary)" }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          Declare Holiday
                        </motion.button>
                      ) : (
                        <motion.div
                          key="add-form"
                          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                          className="rounded-xl p-3 space-y-3"
                          style={{ background: "var(--bg-grouped)" }}
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              className="input text-xs"
                              placeholder="Holiday name"
                              value={formName}
                              onChange={(e) => setFormName(e.target.value)}
                              autoFocus
                            />
                            <input
                              type="date"
                              className="input text-xs"
                              value={formDate}
                              onChange={(e) => setFormDate(e.target.value)}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={formRecurring}
                                onClick={() => setFormRecurring(!formRecurring)}
                                className="relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                                style={{ backgroundColor: formRecurring ? "#8b5cf6" : "var(--bg-tertiary)" }}
                              >
                                <span className="pointer-events-none inline-block h-2.5 w-2.5 rounded-full bg-white shadow transform transition-transform" style={{ transform: formRecurring ? "translateX(0.75rem)" : "translateX(0)" }} />
                              </button>
                              <span className="text-[11px] font-medium" style={{ color: "var(--fg-secondary)" }}>Recurring yearly</span>
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => { setShowForm(false); setFormName(""); setFormDate(""); setFormRecurring(false); }}
                                className="rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                                style={{ color: "var(--fg-secondary)" }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={saving || !formName.trim() || !formDate}
                                onClick={handleAdd}
                                className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                style={{ background: "var(--primary)" }}
                              >
                                {saving ? "Saving…" : "Add"}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}

                  {/* Holiday list */}
                  {holidaysLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--bg-grouped)" }}>
                          <div className="shimmer h-10 w-10 rounded-lg" />
                          <div className="flex-1 space-y-1.5"><div className="shimmer h-3.5 w-32 rounded" /><div className="shimmer h-2.5 w-24 rounded" /></div>
                          <div className="shimmer h-4 w-7 rounded-full" />
                        </div>
                      ))}
                    </div>
                  ) : holidays.length === 0 ? (
                    <div className="py-8 text-center">
                      <svg className="mx-auto mb-2 h-8 w-8" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                      <p className="text-xs font-medium" style={{ color: "var(--fg-tertiary)" }}>No holidays declared for {displayYear}.</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {holidays.map((h) => {
                        const d = new Date(h.date);
                        const isPast = d < new Date();
                        return (
                          <div
                            key={h._id}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
                            style={{ background: "var(--bg-grouped)", opacity: isPast ? 0.55 : 1 }}
                          >
                            <div
                              className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-white"
                              style={{ background: h.isRecurring ? "#8b5cf6" : "var(--primary)" }}
                            >
                              <span className="text-[8px] font-semibold leading-none uppercase">{SHORT_MONTHS[d.getUTCMonth()]}</span>
                              <span className="text-sm font-bold leading-tight">{d.getUTCDate()}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate" style={{ color: "var(--fg)" }}>{h.name}</p>
                              <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
                                {d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {/* Recurring toggle */}
                              {canManageHolidays ? (
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={h.isRecurring}
                                  disabled={togglingId === h._id}
                                  onClick={() => handleToggleRecurring(h)}
                                  title={h.isRecurring ? "Recurring — click to make one-time" : "One-time — click to make recurring"}
                                  className="relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50"
                                  style={{ backgroundColor: h.isRecurring ? "#8b5cf6" : "var(--bg-tertiary)" }}
                                >
                                  <span className="pointer-events-none inline-block h-2.5 w-2.5 rounded-full bg-white shadow transform transition-transform" style={{ transform: h.isRecurring ? "translateX(0.75rem)" : "translateX(0)" }} />
                                </button>
                              ) : h.isRecurring ? (
                                <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ color: "#8b5cf6", background: "color-mix(in srgb, #8b5cf6 12%, transparent)" }}>
                                  Recurring
                                </span>
                              ) : null}
                              {/* Delete */}
                              {canManageHolidays && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(h)}
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--hover-bg)]"
                                  style={{ color: "var(--fg-tertiary)" }}
                                  title="Remove holiday"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove Holiday"
        description={`Remove "${deleteTarget?.name}"? Attendance and payroll will no longer treat this date as a holiday.`}
        confirmLabel="Remove"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
