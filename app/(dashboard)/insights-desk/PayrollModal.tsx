"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { Portal } from "../components/Portal";

interface DropdownEmp {
  _id: string;
  about?: { firstName?: string; lastName?: string };
  email?: string;
}

interface EstimateData {
  month: number;
  year: number;
  baseSalary: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  holidays: number;
  leaveDays: number;
  overtimeHours: number;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  deductions: { label: string; amount: number }[];
  currency: string;
  ytd: { earned: number; deductions: number; netPay: number; months: number };
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

export function PayrollModal({ open, onClose, selectedUserId }: Props) {
  const { data: session } = useSession();
  const { can: canPerm } = usePermissions();
  const canViewTeam = canPerm("payroll_viewTeam");

  const [employees, setEmployees] = useState<DropdownEmp[]>([]);
  const [userId, setUserId] = useState(selectedUserId || "");
  const [estimate, setEstimate] = useState<EstimateData | null>(null);
  const [loading, setLoading] = useState(false);

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

  const loadEstimate = useCallback(async () => {
    const uid = userId || session?.user?.id;
    if (!uid) return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (userId) q.set("userId", userId);
      const res = await fetch(`/api/payroll/estimate?${q}`);
      if (res.ok) setEstimate(await res.json());
      else setEstimate(null);
    } catch { setEstimate(null); }
    setLoading(false);
  }, [userId, session?.user?.id]);

  useEffect(() => {
    if (open) loadEstimate();
  }, [open, loadEstimate]);

  const fmt = useCallback((n: number) => {
    const currency = estimate?.currency ?? "PKR";
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  }, [estimate?.currency]);

  function handleExport() {
    if (!estimate) return;
    const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const lines = [
      `Payslip Estimate — ${MONTH_NAMES[estimate.month - 1]} ${estimate.year}`,
      "",
      `Base Salary,${estimate.baseSalary}`,
      `Working Days,${estimate.workingDays}`,
      `Present Days,${estimate.presentDays}`,
      `Absent Days,${estimate.absentDays}`,
      `Late Days,${estimate.lateDays}`,
      `Holidays,${estimate.holidays}`,
      `Leave Days,${estimate.leaveDays}`,
      `Overtime Hours,${estimate.overtimeHours}`,
      "",
      `Gross Pay,${estimate.grossPay}`,
      ...estimate.deductions.map((d) => `${d.label},${d.amount}`),
      `Total Deductions,${estimate.totalDeductions}`,
      `Net Pay,${estimate.netPay}`,
      "",
      "Year-to-Date",
      `Total Earned,${estimate.ytd.earned}`,
      `Total Deductions,${estimate.ytd.deductions}`,
      `Total Net Pay,${estimate.ytd.netPay}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payslip-estimate-${estimate.year}-${String(estimate.month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
              className="relative w-full max-w-lg mx-4 max-h-[85vh] flex flex-col rounded-2xl border shadow-xl overflow-hidden"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                <div>
                  <h2 className="text-base font-bold" style={{ color: "var(--fg)" }}>Payroll</h2>
                  {estimate && (
                    <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                      {MONTH_NAMES[estimate.month - 1]} {estimate.year} · Live estimate
                    </p>
                  )}
                </div>
                <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-secondary)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {/* Employee picker */}
                {canViewTeam && employees.length > 0 && (
                  <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                    Employee
                    <select className="input text-sm" value={userId} onChange={(e) => setUserId(e.target.value)}>
                      <option value="">Yourself</option>
                      {employees.map((emp) => (
                        <option key={emp._id} value={emp._id}>{nameOf(emp)}</option>
                      ))}
                    </select>
                  </label>
                )}

                {loading ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="rounded-xl p-3 text-center space-y-1.5" style={{ background: "var(--bg-grouped)" }}>
                          <span className="shimmer block mx-auto h-2.5 w-14 rounded" />
                          <span className="shimmer block mx-auto h-5 w-16 rounded" />
                        </div>
                      ))}
                    </div>
                    <div className="shimmer h-20 rounded-xl" />
                  </div>
                ) : estimate ? (
                  <>
                    {/* YTD summary cards */}
                    {estimate.ytd.months > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>Year to Date</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Earned</p>
                            <p className="text-sm font-bold" style={{ color: "var(--green)" }}>{fmt(estimate.ytd.earned)}</p>
                          </div>
                          <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Deductions</p>
                            <p className="text-sm font-bold" style={{ color: "var(--rose)" }}>{fmt(estimate.ytd.deductions)}</p>
                          </div>
                          <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Net</p>
                            <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>{fmt(estimate.ytd.netPay)}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Current month estimate */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>
                        {MONTH_NAMES[estimate.month - 1]} Estimate
                      </p>
                      <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-grouped)" }}>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                          <div className="flex justify-between">
                            <span style={{ color: "var(--fg-tertiary)" }}>Base Salary</span>
                            <span className="font-semibold" style={{ color: "var(--fg)" }}>{fmt(estimate.baseSalary)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: "var(--fg-tertiary)" }}>Working Days</span>
                            <span className="font-semibold" style={{ color: "var(--fg)" }}>{estimate.workingDays}</span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: "var(--fg-tertiary)" }}>Present</span>
                            <span className="font-semibold" style={{ color: "var(--green)" }}>{estimate.presentDays}</span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: "var(--fg-tertiary)" }}>Absent</span>
                            <span className="font-semibold" style={{ color: estimate.absentDays > 0 ? "var(--rose)" : "var(--fg)" }}>{estimate.absentDays}</span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: "var(--fg-tertiary)" }}>Late</span>
                            <span className="font-semibold" style={{ color: estimate.lateDays > 0 ? "var(--amber)" : "var(--fg)" }}>{estimate.lateDays}</span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: "var(--fg-tertiary)" }}>Leaves</span>
                            <span className="font-semibold" style={{ color: "var(--fg)" }}>{estimate.leaveDays}</span>
                          </div>
                        </div>

                        <div className="border-t pt-3 space-y-1.5" style={{ borderColor: "var(--border)" }}>
                          <div className="flex justify-between text-xs">
                            <span style={{ color: "var(--fg-tertiary)" }}>Gross Pay</span>
                            <span className="font-semibold" style={{ color: "var(--fg)" }}>{fmt(estimate.grossPay)}</span>
                          </div>
                          {estimate.deductions.map((d, i) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span style={{ color: "var(--rose)" }}>− {d.label}</span>
                              <span className="font-semibold" style={{ color: "var(--rose)" }}>{fmt(d.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm font-bold pt-1">
                            <span style={{ color: "var(--fg)" }}>Net Pay</span>
                            <span style={{ color: "var(--primary)" }}>{fmt(estimate.netPay)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Export */}
                    <button
                      type="button"
                      onClick={handleExport}
                      className="flex items-center justify-center gap-1.5 w-full rounded-lg border px-4 py-2 text-xs font-semibold transition-colors"
                      style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg)" }}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Export CSV
                    </button>
                  </>
                ) : (
                  <div className="py-8 text-center">
                    <p className="text-xs font-medium" style={{ color: "var(--fg-tertiary)" }}>No payroll data available.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
