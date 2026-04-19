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
import { EmployeeTasksModal } from "./EmployeeTasksModal";
import toast from "react-hot-toast";

interface Holiday {
  _id: string;
  name: string;
  date: string;
  year: number;
  isRecurring: boolean;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ── Pill type for child pages to register header pills ── */
export interface InsightsPill {
  key: string;
  label: string;
  value: string | number;
  dotColor: string;
}

/* ── Context so child pages can open Leaves / Payroll / Tasks modals with a pre-selected user ── */
interface InsightsContext {
  openLeavesModal: (userId?: string) => void;
  openPayrollModal: (userId?: string) => void;
  openTasksModal: (userId?: string) => void;
  leavesOpen: boolean;
  payrollOpen: boolean;
  tasksOpen: boolean;
  leavesUserId: string;
  payrollUserId: string;
  tasksUserId: string;
  closeLeavesModal: () => void;
  closePayrollModal: () => void;
  closeTasksModal: () => void;
  teamCount: number;
  setTeamCount: (n: number) => void;
  setPagePills: (pills: InsightsPill[]) => void;
}

const InsightsCtx = createContext<InsightsContext>({
  openLeavesModal: () => {},
  openPayrollModal: () => {},
  openTasksModal: () => {},
  leavesOpen: false,
  payrollOpen: false,
  tasksOpen: false,
  leavesUserId: "",
  payrollUserId: "",
  tasksUserId: "",
  closeLeavesModal: () => {},
  closePayrollModal: () => {},
  closeTasksModal: () => {},
  teamCount: 0,
  setTeamCount: () => {},
  setPagePills: () => {},
});

export function useInsightsContext() {
  return useContext(InsightsCtx);
}

export default function InsightsDeskLayout({ children }: { children: React.ReactNode }) {
  const { registerTour } = useGuide();
  const { can: canPerm } = usePermissions();
  const canCreateHoliday = canPerm("holidays_create");
  const canToggleRecurring = canPerm("holidays_toggleRecurring");
  const canDeleteHoliday = canPerm("holidays_delete");

  useEffect(() => { registerTour("insights-desk", insightsDeskTour); }, [registerTour]);

  /* ── Team count (set by attendance page) ── */
  const [teamCount, setTeamCount] = useState(0);

  /* ── Page-level pills (set by child pages) ── */
  const [pagePills, setPagePills] = useState<InsightsPill[]>([]);

  /* ── Leaves / Payroll / Tasks modal state ── */
  const [leavesOpen, setLeavesOpen] = useState(false);
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [leavesUserId, setLeavesUserId] = useState("");
  const [payrollUserId, setPayrollUserId] = useState("");
  const [tasksUserId, setTasksUserId] = useState("");

  const openLeavesModal = useCallback((userId?: string) => {
    setLeavesUserId(userId ?? "");
    setLeavesOpen(true);
  }, []);
  const openPayrollModal = useCallback((userId?: string) => {
    setPayrollUserId(userId ?? "");
    setPayrollOpen(true);
  }, []);
  const openTasksModal = useCallback((userId?: string) => {
    setTasksUserId(userId ?? "");
    setTasksOpen(true);
  }, []);
  const closeLeavesModal = useCallback(() => setLeavesOpen(false), []);
  const closePayrollModal = useCallback(() => setPayrollOpen(false), []);
  const closeTasksModal = useCallback(() => setTasksOpen(false), []);

  const ctxValue = useMemo(() => ({
    openLeavesModal, openPayrollModal, openTasksModal,
    leavesOpen, payrollOpen, tasksOpen,
    leavesUserId, payrollUserId, tasksUserId,
    closeLeavesModal, closePayrollModal, closeTasksModal,
    teamCount, setTeamCount,
    setPagePills,
  }), [openLeavesModal, openPayrollModal, openTasksModal, leavesOpen, payrollOpen, tasksOpen, leavesUserId, payrollUserId, tasksUserId, closeLeavesModal, closePayrollModal, closeTasksModal, teamCount]);

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
    const newVal = !h.isRecurring;
    setHolidays((prev) => prev.map((x) => x._id === h._id ? { ...x, isRecurring: newVal } : x));
    try {
      const res = await fetch("/api/payroll/holidays", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: h._id, isRecurring: newVal }),
      });
      if (!res.ok) { setHolidays((prev) => prev.map((x) => x._id === h._id ? { ...x, isRecurring: !newVal } : x)); toast.error("Failed to update"); }
    } catch { setHolidays((prev) => prev.map((x) => x._id === h._id ? { ...x, isRecurring: !newVal } : x)); toast.error("Something went wrong"); }
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
        <div data-tour="insights-header" className="mb-4 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-headline text-lg font-bold" style={{ color: "var(--fg)" }}>Insights Desk</h1>
            {teamCount > 0 && (
              <HeaderStatPill label={teamCount === 1 ? "employee" : "employees"} value={teamCount} dotColor="var(--primary)" />
            )}
            {holidays.length > 0 && (
              <>
                {upcoming.length > 0 && <HeaderStatPill label={upcoming.length === 1 ? "upcoming holiday" : "upcoming holidays"} value={upcoming.length} dotColor="var(--purple)" />}
                <HeaderStatPill label={holidays.length === 1 ? "holiday this year" : "holidays this year"} value={holidays.length} dotColor="var(--fg-tertiary)" />
              </>
            )}
            {pagePills.map((p) => (
              <HeaderStatPill key={p.key} label={p.label} value={p.value} dotColor={p.dotColor} />
            ))}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <motion.button type="button" onClick={() => openTasksModal()} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg)" }}>
                <svg className="h-3.5 w-3.5" style={{ color: "var(--amber)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Progress
              </motion.button>
              <motion.button type="button" onClick={() => openLeavesModal()} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg)" }}>
                <svg className="h-3.5 w-3.5" style={{ color: "var(--teal)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Leaves
              </motion.button>
              <motion.button type="button" onClick={() => openPayrollModal()} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg)" }}>
                <svg className="h-3.5 w-3.5" style={{ color: "var(--green)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Payroll
              </motion.button>
              <motion.button type="button" onClick={() => setHolidaysOpen(true)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg)" }}>
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
                  className="relative w-full max-w-lg mx-4 max-h-[85vh] flex flex-col rounded-xl border shadow-xl overflow-hidden"
                  style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                  initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                    <div>
                      <h3 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>Company Holidays</h3>
                      <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
                        {holidays.length} holiday{holidays.length !== 1 ? "s" : ""} in {displayYear}
                        {upcoming.length > 0 && <> · {upcoming.length} upcoming</>}
                      </p>
                    </div>
                    <button type="button" onClick={() => setHolidaysOpen(false)} className="rounded-lg p-1 transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-secondary)" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 space-y-3">
                    {canCreateHoliday && (
                      <AnimatePresence mode="wait">
                        {!showForm ? (
                          <motion.button
                            key="add-btn"
                            type="button"
                            onClick={() => setShowForm(true)}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="flex items-center gap-1.5 text-[11px] font-semibold transition-colors"
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
                              <input type="text" className="input text-[11px]" placeholder="Holiday name" value={formName} onChange={(e) => setFormName(e.target.value)} autoFocus />
                              <input type="date" className="input text-[11px]" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
                            </div>
                            <div className="flex items-center justify-between">
                              <ToggleSwitch checked={formRecurring} onChange={setFormRecurring} color="var(--purple)" label="Recurring yearly" />
                              <div className="flex gap-2">
                                <button type="button" onClick={() => { setShowForm(false); setFormName(""); setFormDate(""); setFormRecurring(false); }} className="rounded-lg px-3 py-1.5 text-[11px] font-semibold" style={{ color: "var(--fg-secondary)" }}>Cancel</button>
                                <button type="button" disabled={saving || !formName.trim() || !formDate} onClick={handleAdd} className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--primary)" }}>{saving ? "Saving…" : "Add holiday"}</button>
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
                        <p className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>No holidays declared for {displayYear}.</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {holidays.map((h) => {
                          const d = new Date(h.date);
                          const isPast = d < new Date();
                          return (
                            <div key={h._id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors" style={{ background: "var(--bg-grouped)", opacity: isPast ? 0.55 : 1 }}>
                              <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-white" style={{ background: h.isRecurring ? "var(--purple)" : "var(--primary)" }}>
                                <span className="text-[10px] font-semibold leading-none uppercase">{SHORT_MONTHS[d.getUTCMonth()]}</span>
                                <span className="text-[11px] font-bold leading-tight">{d.getUTCDate()}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-semibold truncate" style={{ color: "var(--fg)" }}>{h.name}</p>
                                <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {canToggleRecurring ? (
                                  <ToggleSwitch
                                    checked={h.isRecurring}
                                    onChange={() => handleToggleRecurring(h)}
                                    disabled={togglingId === h._id}
                                    color="var(--purple)"
                                    title={h.isRecurring ? "Recurring — click to make one-time" : "One-time — click to make recurring"}
                                  />
                                ) : h.isRecurring ? (
                                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--purple)", background: "color-mix(in srgb, var(--purple) 12%, transparent)" }}>Recurring</span>
                                ) : null}
                                {canDeleteHoliday && (
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

        {/* Leaves / Payroll / Tasks Modals */}
        <LeavesModal open={leavesOpen} onClose={closeLeavesModal} selectedUserId={leavesUserId} />
        <PayrollModal open={payrollOpen} onClose={closePayrollModal} selectedUserId={payrollUserId} />
        <EmployeeTasksModal open={tasksOpen} onClose={closeTasksModal} userId={tasksUserId} />
      </div>
    </InsightsCtx.Provider>
  );
}
