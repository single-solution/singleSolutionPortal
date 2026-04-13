"use client";

import { useEffect, useState, useCallback, useMemo, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGuide } from "@/lib/useGuide";
import { insightsDeskTour } from "@/lib/tourConfigs";
import { usePermissions } from "@/lib/usePermissions";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Portal } from "../components/Portal";
import { HeaderStatPill } from "../components/StatChips";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { LeavesModal } from "./LeavesModal";
import { PayrollModal } from "./PayrollModal";
import toast from "react-hot-toast";

interface Holiday {
  _id: string;
  name: string;
  date: string;
  year: number;
  isRecurring: boolean;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ── Context so child pages can open Leaves / Payroll modals with a pre-selected user ── */
interface InsightsContext {
  openLeavesModal: (userId?: string) => void;
  openPayrollModal: (userId?: string) => void;
  leavesOpen: boolean;
  payrollOpen: boolean;
  leavesUserId: string;
  payrollUserId: string;
  closeLeavesModal: () => void;
  closePayrollModal: () => void;
  teamCount: number;
  setTeamCount: (n: number) => void;
}

const InsightsCtx = createContext<InsightsContext>({
  openLeavesModal: () => {},
  openPayrollModal: () => {},
  leavesOpen: false,
  payrollOpen: false,
  leavesUserId: "",
  payrollUserId: "",
  closeLeavesModal: () => {},
  closePayrollModal: () => {},
  teamCount: 0,
  setTeamCount: () => {},
});

export function useInsightsContext() {
  return useContext(InsightsCtx);
}

export default function InsightsDeskLayout({ children }: { children: React.ReactNode }) {
  const { registerTour } = useGuide();
  const { can: canPerm } = usePermissions();
  const canManageHolidays = canPerm("holidays_manage");

  useEffect(() => { registerTour("insights-desk", insightsDeskTour); }, [registerTour]);

  /* ── Team count (set by attendance page) ── */
  const [teamCount, setTeamCount] = useState(0);

  /* ── Leaves / Payroll modal state ── */
  const [leavesOpen, setLeavesOpen] = useState(false);
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [leavesUserId, setLeavesUserId] = useState("");
  const [payrollUserId, setPayrollUserId] = useState("");

  const openLeavesModal = useCallback((userId?: string) => {
    setLeavesUserId(userId ?? "");
    setLeavesOpen(true);
  }, []);
  const openPayrollModal = useCallback((userId?: string) => {
    setPayrollUserId(userId ?? "");
    setPayrollOpen(true);
  }, []);
  const closeLeavesModal = useCallback(() => setLeavesOpen(false), []);
  const closePayrollModal = useCallback(() => setPayrollOpen(false), []);

  const ctxValue = useMemo(() => ({
    openLeavesModal, openPayrollModal,
    leavesOpen, payrollOpen,
    leavesUserId, payrollUserId,
    closeLeavesModal, closePayrollModal,
    teamCount, setTeamCount,
  }), [openLeavesModal, openPayrollModal, leavesOpen, payrollOpen, leavesUserId, payrollUserId, closeLeavesModal, closePayrollModal, teamCount]);

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

  useEffect(() => { fetchHolidays(); }, [fetchHolidays]);
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
    <InsightsCtx.Provider value={ctxValue}>
      <div>
        <div data-tour="insights-header" className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-headline text-lg font-bold" style={{ color: "var(--fg)" }}>Insights Desk</h1>
            {teamCount > 0 && (
              <HeaderStatPill label={teamCount === 1 ? "employee" : "employees"} value={teamCount} dotColor="var(--primary)" />
            )}
            {holidays.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {upcoming.length > 0 && <HeaderStatPill label={upcoming.length === 1 ? "upcoming holiday" : "upcoming holidays"} value={upcoming.length} dotColor="var(--purple)" />}
                <HeaderStatPill label={holidays.length === 1 ? "holiday this year" : "holidays this year"} value={holidays.length} dotColor="var(--fg-tertiary)" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Leaves — modal handles SuperAdmin exempt state internally */}
            <motion.button
                type="button"
                onClick={() => openLeavesModal()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg)" }}
              >
                <svg className="h-3.5 w-3.5" style={{ color: "var(--teal)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Leaves
              </motion.button>

            {/* Payroll — modal handles SuperAdmin exempt state internally */}
            <motion.button
                type="button"
                onClick={() => openPayrollModal()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg)" }}
              >
                <svg className="h-3.5 w-3.5" style={{ color: "var(--green)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Payroll
              </motion.button>

            <motion.button
                type="button"
                onClick={() => setHolidaysOpen(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg)" }}
              >
                <svg className="h-3.5 w-3.5" style={{ color: "var(--purple)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                Holidays
                {upcoming.length > 0 && !holidaysOpen && (
                  <span className="ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: "var(--purple)" }}>
                    {upcoming.length}
                  </span>
                )}
              </motion.button>
          </div>
        </div>

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

                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
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
                              <input type="text" className="input text-xs" placeholder="Holiday name" value={formName} onChange={(e) => setFormName(e.target.value)} autoFocus />
                              <input type="date" className="input text-xs" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
                            </div>
                            <div className="flex items-center justify-between">
                              <ToggleSwitch checked={formRecurring} onChange={setFormRecurring} color="var(--purple)" label="Recurring yearly" />
                              <div className="flex gap-2">
                                <button type="button" onClick={() => { setShowForm(false); setFormName(""); setFormDate(""); setFormRecurring(false); }} className="rounded-lg px-3 py-1.5 text-[11px] font-semibold" style={{ color: "var(--fg-secondary)" }}>Cancel</button>
                                <button type="button" disabled={saving || !formName.trim() || !formDate} onClick={handleAdd} className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--primary)" }}>{saving ? "Saving…" : "Add"}</button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    )}

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
                            <div key={h._id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors" style={{ background: "var(--bg-grouped)", opacity: isPast ? 0.55 : 1 }}>
                              <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-white" style={{ background: h.isRecurring ? "var(--purple)" : "var(--primary)" }}>
                                <span className="text-[8px] font-semibold leading-none uppercase">{SHORT_MONTHS[d.getUTCMonth()]}</span>
                                <span className="text-sm font-bold leading-tight">{d.getUTCDate()}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate" style={{ color: "var(--fg)" }}>{h.name}</p>
                                <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {canManageHolidays ? (
                                  <ToggleSwitch
                                    checked={h.isRecurring}
                                    onChange={() => handleToggleRecurring(h)}
                                    disabled={togglingId === h._id}
                                    color="var(--purple)"
                                    title={h.isRecurring ? "Recurring — click to make one-time" : "One-time — click to make recurring"}
                                  />
                                ) : h.isRecurring ? (
                                  <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ color: "var(--purple)", background: "color-mix(in srgb, var(--purple) 12%, transparent)" }}>Recurring</span>
                                ) : null}
                                {canManageHolidays && (
                                  <button type="button" onClick={() => setDeleteTarget(h)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-tertiary)" }} title="Remove holiday">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
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

        {/* Leaves / Payroll Modals */}
        <LeavesModal open={leavesOpen} onClose={closeLeavesModal} selectedUserId={leavesUserId} />
        <PayrollModal open={payrollOpen} onClose={closePayrollModal} selectedUserId={payrollUserId} />
      </div>
    </InsightsCtx.Provider>
  );
}
