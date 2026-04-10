"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { Portal } from "../components/Portal";
import { ToggleSwitch } from "../components/ToggleSwitch";
import toast from "react-hot-toast";

interface DropdownEmp {
  _id: string;
  about?: { firstName?: string; lastName?: string };
  email?: string;
}

interface BalancePayload {
  total: number;
  used: number;
  remaining: number;
}

function nameOf(u: DropdownEmp): string {
  const f = u.about?.firstName ?? "";
  const l = u.about?.lastName ?? "";
  const n = `${f} ${l}`.trim();
  return n || u.email || "—";
}

interface Props {
  open: boolean;
  onClose: () => void;
  selectedUserId?: string;
}

export function LeavesModal({ open, onClose, selectedUserId }: Props) {
  const { data: session } = useSession();
  const { can: canPerm, isSuperAdmin } = usePermissions();
  const canViewTeam = canPerm("leaves_viewTeam");

  const [employees, setEmployees] = useState<DropdownEmp[]>([]);
  const [userId, setUserId] = useState(selectedUserId || "");
  const [balance, setBalance] = useState<BalancePayload | null>(null);
  const [balLoading, setBalLoading] = useState(false);

  const [isHalfDay, setIsHalfDay] = useState(false);
  const [multiDay, setMultiDay] = useState(false);
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (selectedUserId) setUserId(selectedUserId);
  }, [selectedUserId]);

  useEffect(() => {
    if (!open || !canViewTeam) return;
    fetch("/api/employees/dropdown")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setEmployees(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [open, canViewTeam]);

  const loadBalance = useCallback(async () => {
    if (isSuperAdmin && !userId) { setBalance(null); return; }
    const uid = userId || session?.user?.id;
    if (!uid) return;
    setBalLoading(true);
    try {
      const q = new URLSearchParams({ year: String(new Date().getFullYear()) });
      if (userId) q.set("userId", userId);
      const res = await fetch(`/api/leaves/balance?${q}`);
      if (res.ok) setBalance(await res.json());
    } catch { /* ignore */ }
    setBalLoading(false);
  }, [userId, session?.user?.id, isSuperAdmin]);

  useEffect(() => {
    if (open) loadBalance();
  }, [open, loadBalance]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        date,
        isHalfDay,
        reason,
      };
      if (multiDay && endDate) body.endDate = endDate;
      if (canViewTeam && userId) body.userId = userId;
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to submit");
      } else {
        toast.success("Leave request submitted");
        setDate(""); setEndDate(""); setReason(""); setIsHalfDay(false); setMultiDay(false);
        await loadBalance();
      }
    } catch {
      toast.error("Something went wrong");
    }
    setSubmitting(false);
  }

  const selfExempt = isSuperAdmin && !userId;

  const balPct = balance && balance.total > 0 ? Math.round((balance.used / balance.total) * 100) : 0;
  const barColor = balPct > 80 ? "var(--rose)" : balPct > 50 ? "var(--amber)" : "var(--teal)";

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <motion.div
              className="relative w-full max-w-md mx-4 max-h-[85vh] flex flex-col rounded-2xl border shadow-xl overflow-hidden"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                <div>
                  <h2 className="text-base font-bold" style={{ color: "var(--fg)" }}>{selfExempt ? "Leaves" : "Apply Leave"}</h2>
                  {!selfExempt && balance && !balLoading && (
                    <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                      {balance.used} / {balance.total} used · {balance.remaining} remaining
                    </p>
                  )}
                </div>
                <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-secondary)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {/* Employee picker — always show for SuperAdmin so they can switch to a team member */}
                {canViewTeam && employees.length > 0 && (
                  <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                    Employee
                    <select
                      className="input text-sm"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                    >
                      {!isSuperAdmin && <option value="">Yourself</option>}
                      {employees.map((emp) => (
                        <option key={emp._id} value={emp._id}>{nameOf(emp)}</option>
                      ))}
                    </select>
                  </label>
                )}

                {selfExempt ? (
                  <div className="py-8 text-center">
                    <p className="text-sm font-semibold" style={{ color: "var(--fg-secondary)" }}>SuperAdmin is exempt</p>
                    <p className="text-xs mt-1" style={{ color: "var(--fg-tertiary)" }}>
                      Select an employee above to apply leave on their behalf.
                    </p>
                  </div>
                ) : (
                  <>
                {/* Balance bar */}
                {balance && (
                  <div>
                    <div className="flex justify-between text-[10px] font-semibold mb-1" style={{ color: "var(--fg-tertiary)" }}>
                      <span>{balance.used} days used</span>
                      <span>{balance.remaining} remaining</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-grouped)" }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: barColor }}
                        initial={{ width: 0 }}
                        animate={{ width: `${balPct}%` }}
                        transition={{ duration: 0.6 }}
                      />
                    </div>
                  </div>
                )}

                <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
                  {/* Employee picker (non-SuperAdmin — already shown above for SuperAdmin) */}
                  {!isSuperAdmin && canViewTeam && employees.length > 0 && (
                    <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                      Employee
                      <select
                        className="input text-sm"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                      >
                        <option value="">Yourself</option>
                        {employees.map((emp) => (
                          <option key={emp._id} value={emp._id}>{nameOf(emp)}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  {/* Half day / Full day toggle */}
                  <div>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--fg-tertiary)" }}>Duration</p>
                    <div className="flex gap-1 rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
                      <button
                        type="button"
                        onClick={() => setIsHalfDay(false)}
                        className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${!isHalfDay ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)]"}`}
                      >
                        Full day
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsHalfDay(true); setMultiDay(false); }}
                        className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${isHalfDay ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)]"}`}
                      >
                        Half day
                      </button>
                    </div>
                  </div>

                  {/* Multiple days toggle */}
                  {!isHalfDay && (
                    <ToggleSwitch checked={multiDay} onChange={setMultiDay} label="Multiple days" />
                  )}

                  {/* Date picker */}
                  <div className={multiDay && !isHalfDay ? "grid grid-cols-2 gap-2" : ""}>
                    <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                      {multiDay && !isHalfDay ? "Start date" : "Date"}
                      <input
                        type="date"
                        required
                        className="input text-sm"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </label>
                    {multiDay && !isHalfDay && (
                      <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                        End date
                        <input
                          type="date"
                          required
                          className="input text-sm"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          min={date}
                        />
                      </label>
                    )}
                  </div>

                  {/* Reason */}
                  <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                    Reason <span className="font-normal">(optional)</span>
                    <input
                      type="text"
                      className="input text-sm"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Personal, health, etc."
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={submitting || !date}
                    className="btn btn-primary w-full"
                  >
                    {submitting ? "Submitting…" : "Submit request"}
                  </button>
                </form>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
