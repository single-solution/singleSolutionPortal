"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { Portal } from "../components/Portal";

interface DropdownEmp {
  _id: string;
  about?: { firstName?: string; lastName?: string };
  email?: string;
  salary?: number;
  department?: { id: string; title: string } | null;
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
  ytd: { earned: number; deductions: number; netPay: number; months: number };
}

function nameOf(u: DropdownEmp): string {
  const f = u.about?.firstName ?? "";
  const l = u.about?.lastName ?? "";
  const n = `${f} ${l}`.trim();
  return n || u.email || "—";
}

function initials(u: DropdownEmp): string {
  const f = u.about?.firstName?.[0] ?? "";
  const l = u.about?.lastName?.[0] ?? "";
  return (f + l).toUpperCase() || "?";
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const AVATAR_COLORS = [
  "var(--primary)", "var(--teal)", "var(--purple)", "var(--amber)",
  "var(--rose)", "var(--green)", "var(--fg-secondary)",
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface DeptGroup {
  id: string;
  title: string;
  employees: DropdownEmp[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  selectedUserId?: string;
}

export function PayrollModal({ open, onClose, selectedUserId }: Props) {
  const { data: session } = useSession();
  const { can: canPerm, isSuperAdmin } = usePermissions();
  const canViewTeam = canPerm("payroll_viewTeam");

  const [employees, setEmployees] = useState<DropdownEmp[]>([]);
  const [userId, setUserId] = useState(selectedUserId || "");
  const [estimate, setEstimate] = useState<EstimateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);

  const detailRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

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
    if (isSuperAdmin && !userId) { setEstimate(null); return; }
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
  }, [userId, session?.user?.id, isSuperAdmin]);

  useEffect(() => {
    if (open) loadEstimate();
  }, [open, loadEstimate]);

  useEffect(() => {
    if (detailRef.current) detailRef.current.scrollTop = 0;
  }, [userId]);

  useEffect(() => {
    if (!showExportMenu) return;
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportMenu(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showExportMenu]);

  const filteredEmployees = useMemo(() => {
    if (!sidebarSearch.trim()) return employees;
    const q = sidebarSearch.toLowerCase();
    return employees.filter((e) =>
      nameOf(e).toLowerCase().includes(q) ||
      (e.department?.title ?? "").toLowerCase().includes(q)
    );
  }, [employees, sidebarSearch]);

  const deptGroups = useMemo(() => {
    const grouped = new Map<string, DeptGroup>();
    const ungrouped: DropdownEmp[] = [];
    for (const emp of filteredEmployees) {
      if (emp.department) {
        const existing = grouped.get(emp.department.id);
        if (existing) existing.employees.push(emp);
        else grouped.set(emp.department.id, { id: emp.department.id, title: emp.department.title, employees: [emp] });
      } else {
        ungrouped.push(emp);
      }
    }
    const groups = [...grouped.values()].sort((a, b) => a.title.localeCompare(b.title));
    if (ungrouped.length > 0) groups.push({ id: "__none", title: "Unassigned", employees: ungrouped });
    return groups;
  }, [filteredEmployees]);

  const toggleDept = (id: string) => {
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedEmployee = useMemo(() => employees.find((e) => e._id === userId), [employees, userId]);

  const fmt = useCallback((n: number) => {
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }, []);

  function buildCSVLines(): string[] {
    if (!estimate) return [];
    const emp = selectedEmployee ? nameOf(selectedEmployee) : "Self";
    return [
      `Payslip Estimate — ${MONTH_NAMES[estimate.month - 1]} ${estimate.year}`,
      `Employee,${emp}`,
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
  }

  function handleExportCSV() {
    const lines = buildCSVLines();
    if (!lines.length) return;
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payslip-estimate-${estimate!.year}-${String(estimate!.month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }

  function handleExportJSON() {
    if (!estimate) return;
    const obj = { employee: selectedEmployee ? nameOf(selectedEmployee) : "Self", ...estimate };
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payslip-estimate-${estimate.year}-${String(estimate.month).padStart(2, "0")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }

  function handlePrint() {
    if (!estimate) return;
    const emp = selectedEmployee ? nameOf(selectedEmployee) : "Self";
    const dept = selectedEmployee?.department?.title ?? "";
    const html = `<!DOCTYPE html><html><head><title>Payslip ${MONTH_NAMES[estimate.month - 1]} ${estimate.year}</title>
<style>body{font-family:system-ui,sans-serif;padding:40px;max-width:700px;margin:0 auto;color:#1a1a1a}
h1{font-size:18px;margin-bottom:4px}h2{font-size:13px;color:#666;margin:0 0 24px;font-weight:normal}
.section{margin-bottom:20px}.section-title{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:8px;font-weight:600}
table{width:100%;border-collapse:collapse}td{padding:6px 0;font-size:13px;border-bottom:1px solid #eee}
td:last-child{text-align:right;font-weight:600}.total td{border-top:2px solid #333;border-bottom:none;font-weight:700;font-size:14px}
.hero{text-align:center;padding:20px;background:#f8f9fa;border-radius:12px;margin-bottom:24px}
.hero .amount{font-size:32px;font-weight:800;color:#2563eb}.hero .label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px}.grid-item{text-align:center;padding:10px;background:#f8f9fa;border-radius:8px}
.grid-item .val{font-size:16px;font-weight:700}.grid-item .lbl{font-size:10px;color:#888;text-transform:uppercase}
@media print{body{padding:20px}}</style></head><body>
<h1>Payslip Estimate — ${MONTH_NAMES[estimate.month - 1]} ${estimate.year}</h1>
<h2>${emp}${dept ? ` · ${dept}` : ""}</h2>
<div class="hero"><div class="label">Estimated Net Pay</div><div class="amount">${fmt(estimate.netPay)}</div></div>
<div class="grid">
<div class="grid-item"><div class="val">${estimate.presentDays}</div><div class="lbl">Present</div></div>
<div class="grid-item"><div class="val">${estimate.absentDays}</div><div class="lbl">Absent</div></div>
<div class="grid-item"><div class="val">${estimate.lateDays}</div><div class="lbl">Late</div></div>
<div class="grid-item"><div class="val">${estimate.leaveDays}</div><div class="lbl">Leaves</div></div>
</div>
<div class="section"><div class="section-title">Earnings & Deductions</div><table>
<tr><td>Base Salary</td><td>${fmt(estimate.baseSalary)}</td></tr>
${estimate.overtimeHours > 0 ? `<tr><td>Overtime (${Math.round(estimate.overtimeHours * 10) / 10}h)</td><td>${fmt(estimate.grossPay - estimate.baseSalary)}</td></tr>` : ""}
<tr><td><strong>Gross Pay</strong></td><td><strong>${fmt(estimate.grossPay)}</strong></td></tr>
${estimate.deductions.map((d) => `<tr><td style="color:#dc2626">− ${d.label}</td><td style="color:#dc2626">${fmt(d.amount)}</td></tr>`).join("")}
${estimate.totalDeductions > 0 ? `<tr><td>Total Deductions</td><td style="color:#dc2626">−${fmt(estimate.totalDeductions)}</td></tr>` : ""}
<tr class="total"><td>Net Pay</td><td>${fmt(estimate.netPay)}</td></tr>
</table></div>
${estimate.ytd.months > 0 ? `<div class="section"><div class="section-title">Year to Date · ${estimate.ytd.months} month${estimate.ytd.months !== 1 ? "s" : ""}</div><table>
<tr><td>Earned</td><td>${fmt(estimate.ytd.earned)}</td></tr>
<tr><td>Deductions</td><td>${fmt(estimate.ytd.deductions)}</td></tr>
<tr class="total"><td>Net Pay</td><td>${fmt(estimate.ytd.netPay)}</td></tr>
</table></div>` : ""}
</body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 300);
    }
    setShowExportMenu(false);
  }

  function handleCopyText() {
    const lines = buildCSVLines();
    if (!lines.length) return;
    const text = lines.map((l) => l.replace(",", ": ")).join("\n");
    navigator.clipboard.writeText(text).then(
      () => { /* success, menu will close */ },
      () => { /* fallback — silently fail */ },
    );
    setShowExportMenu(false);
  }

  const attendancePct = estimate && estimate.workingDays > 0
    ? Math.round((estimate.presentDays / estimate.workingDays) * 100) : 0;
  const deductionPct = estimate && estimate.grossPay > 0
    ? Math.round((estimate.totalDeductions / estimate.grossPay) * 100) : 0;

  const showSidebar = canViewTeam && employees.length > 0;
  const selfExempt = isSuperAdmin && !userId;

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
              className={`relative mx-4 flex flex-col rounded-2xl border shadow-xl overflow-hidden ${showSidebar ? "w-full max-w-5xl max-h-[90vh]" : "w-full max-w-2xl max-h-[90vh]"}`}
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                <div>
                  <h2 className="text-base font-bold" style={{ color: "var(--fg)" }}>Payroll</h2>
                  {!selfExempt && estimate && (
                    <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                      {selectedEmployee && <>{nameOf(selectedEmployee)} · </>}
                      {MONTH_NAMES[estimate.month - 1]} {estimate.year} · Live estimate
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Export dropdown */}
                  {estimate && (
                    <div className="relative" ref={exportRef}>
                      <motion.button
                        type="button"
                        onClick={() => setShowExportMenu((p) => !p)}
                        whileTap={{ scale: 0.95 }}
                        className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
                        style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg)" }}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Export
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M19 9l-7 7-7-7" /></svg>
                      </motion.button>
                      <AnimatePresence>
                        {showExportMenu && (
                          <motion.div
                            initial={{ opacity: 0, y: -4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.95 }}
                            transition={{ duration: 0.12 }}
                            className="absolute right-0 top-full mt-1 z-10 w-44 rounded-xl border p-1 shadow-lg"
                            style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                          >
                            {[
                              { label: "Download CSV", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", action: handleExportCSV },
                              { label: "Download JSON", icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4", action: handleExportJSON },
                              { label: "Print / PDF", icon: "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2z", action: handlePrint },
                              { label: "Copy to Clipboard", icon: "M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3", action: handleCopyText },
                            ].map((item) => (
                              <button
                                key={item.label}
                                type="button"
                                onClick={item.action}
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--hover-bg)]"
                                style={{ color: "var(--fg)" }}
                              >
                                <svg className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                                </svg>
                                {item.label}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                  <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-secondary)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              </div>

              <div className="flex flex-1 overflow-hidden">
                {/* ── Left sidebar ── */}
                {showSidebar && (
                  <div
                    className="flex flex-col border-r"
                    style={{ width: 260, minWidth: 260, borderColor: "var(--border)", background: "var(--bg)" }}
                  >
                    {/* Search */}
                    <div className="p-3 border-b" style={{ borderColor: "var(--border)" }}>
                      <div className="relative">
                        <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" /></svg>
                        <input
                          type="text"
                          value={sidebarSearch}
                          onChange={(e) => setSidebarSearch(e.target.value)}
                          placeholder="Search employees…"
                          className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs outline-none transition-colors focus:border-[var(--primary)]"
                          style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--fg)" }}
                        />
                      </div>
                    </div>

                    {/* Scrollable list */}
                    <div className="flex-1 overflow-y-auto py-1.5" style={{ scrollbarWidth: "thin" }}>
                      {/* "Yourself" option */}
                      {!isSuperAdmin && !sidebarSearch && (
                        <button
                          type="button"
                          onClick={() => setUserId("")}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors"
                          style={{ background: !userId ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent" }}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "var(--green)" }}>
                            ME
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate" style={{ color: !userId ? "var(--primary)" : "var(--fg)" }}>Yourself</p>
                            <p className="text-[10px] truncate" style={{ color: "var(--fg-tertiary)" }}>My payroll data</p>
                          </div>
                          {!userId && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--primary)" }} />}
                        </button>
                      )}

                      {!sidebarSearch && employees.length > 1 && (
                        <div className="mx-3 my-1 border-b" style={{ borderColor: "var(--border)" }} />
                      )}

                      {/* Department groups */}
                      {deptGroups.map((g) => {
                        const isCollapsed = collapsedDepts.has(g.id);
                        return (
                          <div key={g.id}>
                            <button
                              type="button"
                              onClick={() => toggleDept(g.id)}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[var(--hover-bg)]"
                            >
                              <svg
                                className="h-3 w-3 shrink-0 transition-transform"
                                style={{ color: "var(--fg-tertiary)", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)" }}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                              >
                                <path strokeLinecap="round" d="M19 9l-7 7-7-7" />
                              </svg>
                              <span className="text-[10px] font-semibold uppercase tracking-wider truncate" style={{ color: "var(--fg-tertiary)" }}>
                                {g.title}
                              </span>
                              <span className="ml-auto text-[9px] font-medium" style={{ color: "var(--fg-tertiary)" }}>{g.employees.length}</span>
                            </button>
                            <AnimatePresence initial={false}>
                              {!isCollapsed && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.15 }}
                                  className="overflow-hidden"
                                >
                                  {g.employees.map((emp) => {
                                    const isSel = userId === emp._id;
                                    return (
                                      <button
                                        key={emp._id}
                                        type="button"
                                        onClick={() => setUserId(emp._id)}
                                        className="flex w-full items-center gap-2.5 px-3 py-1.5 pl-8 text-left transition-colors"
                                        style={{ background: isSel ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent" }}
                                      >
                                        <span
                                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                                          style={{ background: avatarColor(emp._id) }}
                                        >
                                          {initials(emp)}
                                        </span>
                                        <span className="flex-1 min-w-0 text-xs font-medium truncate" style={{ color: isSel ? "var(--primary)" : "var(--fg)" }}>
                                          {nameOf(emp)}
                                        </span>
                                        {isSel && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--primary)" }} />}
                                      </button>
                                    );
                                  })}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}

                      {filteredEmployees.length === 0 && sidebarSearch && (
                        <p className="px-3 py-4 text-center text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No matches</p>
                      )}
                    </div>

                    {/* Sidebar footer */}
                    <div className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
                      <p className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
                        {employees.length} employee{employees.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Right detail panel ── */}
                <div ref={detailRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                  {selfExempt ? (
                    <div className="flex flex-col items-center justify-center py-16">
                      <div className="rounded-full p-4 mb-3" style={{ background: "var(--bg-grouped)" }}>
                        <svg className="h-8 w-8" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                      </div>
                      <p className="text-sm font-semibold" style={{ color: "var(--fg-secondary)" }}>Select an employee</p>
                      <p className="text-xs mt-1" style={{ color: "var(--fg-tertiary)" }}>
                        Choose from the sidebar to view payroll data
                      </p>
                    </div>
                  ) : loading ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="rounded-xl p-3 text-center space-y-1.5" style={{ background: "var(--bg-grouped)" }}>
                            <span className="shimmer block mx-auto h-2.5 w-14 rounded" />
                            <span className="shimmer block mx-auto h-5 w-16 rounded" />
                          </div>
                        ))}
                      </div>
                      <div className="shimmer h-40 rounded-xl" />
                      <div className="shimmer h-20 rounded-xl" />
                    </div>
                  ) : estimate ? (
                    <>
                      {/* Selected employee header */}
                      {userId && selectedEmployee && (
                        <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--bg-grouped)" }}>
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: avatarColor(selectedEmployee._id) }}>
                            {initials(selectedEmployee)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate" style={{ color: "var(--fg)" }}>{nameOf(selectedEmployee)}</p>
                            {selectedEmployee.department && (
                              <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{selectedEmployee.department.title}</p>
                            )}
                          </div>
                          {selectedEmployee.salary != null && (
                            <p className="text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                              Salary: {fmt(selectedEmployee.salary)}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Net pay hero */}
                      <div className="rounded-xl p-5 text-center" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 8%, var(--bg-grouped)), color-mix(in srgb, var(--green) 6%, var(--bg-grouped)))" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--fg-tertiary)" }}>
                          Estimated Net Pay · {MONTH_NAMES[estimate.month - 1]}
                        </p>
                        <p className="text-3xl font-bold" style={{ color: "var(--primary)" }}>{fmt(estimate.netPay)}</p>
                        {estimate.totalDeductions > 0 && (
                          <p className="text-[10px] mt-1" style={{ color: "var(--fg-tertiary)" }}>
                            {fmt(estimate.grossPay)} gross − {fmt(estimate.totalDeductions)} deductions ({deductionPct}%)
                          </p>
                        )}
                      </div>

                      {/* Attendance & work summary */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>Attendance & Work</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Present</p>
                            <p className="text-sm font-bold" style={{ color: "var(--green)" }}>{estimate.presentDays}</p>
                            <p className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>of {estimate.workingDays} days</p>
                          </div>
                          <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Absent</p>
                            <p className="text-sm font-bold" style={{ color: estimate.absentDays > 0 ? "var(--rose)" : "var(--fg)" }}>{estimate.absentDays}</p>
                            <p className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>{attendancePct}% rate</p>
                          </div>
                          <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Late</p>
                            <p className="text-sm font-bold" style={{ color: estimate.lateDays > 0 ? "var(--amber)" : "var(--fg)" }}>{estimate.lateDays}</p>
                            <p className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>days</p>
                          </div>
                          <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Leaves</p>
                            <p className="text-sm font-bold" style={{ color: "var(--teal)" }}>{estimate.leaveDays}</p>
                            <p className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>+ {estimate.holidays} holidays</p>
                          </div>
                        </div>
                      </div>

                      {/* Earnings & deductions breakdown */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>Earnings & Deductions</p>
                        <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--bg-grouped)" }}>
                          <div className="flex justify-between text-xs">
                            <span style={{ color: "var(--fg-tertiary)" }}>Base Salary</span>
                            <span className="font-semibold" style={{ color: "var(--fg)" }}>{fmt(estimate.baseSalary)}</span>
                          </div>
                          {estimate.overtimeHours > 0 && (
                            <div className="flex justify-between text-xs">
                              <span style={{ color: "var(--teal)" }}>+ Overtime ({Math.round(estimate.overtimeHours * 10) / 10}h)</span>
                              <span className="font-semibold" style={{ color: "var(--teal)" }}>{fmt(estimate.grossPay - estimate.baseSalary)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-xs border-t pt-2" style={{ borderColor: "var(--border)" }}>
                            <span className="font-semibold" style={{ color: "var(--fg)" }}>Gross Pay</span>
                            <span className="font-semibold" style={{ color: "var(--fg)" }}>{fmt(estimate.grossPay)}</span>
                          </div>
                          {estimate.deductions.map((d, i) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span style={{ color: "var(--rose)" }}>− {d.label}</span>
                              <span className="font-semibold" style={{ color: "var(--rose)" }}>{fmt(d.amount)}</span>
                            </div>
                          ))}
                          {estimate.totalDeductions > 0 && (
                            <div className="flex justify-between text-xs">
                              <span style={{ color: "var(--fg-tertiary)" }}>Total Deductions</span>
                              <span className="font-semibold" style={{ color: "var(--rose)" }}>−{fmt(estimate.totalDeductions)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm font-bold border-t pt-2" style={{ borderColor: "var(--border)" }}>
                            <span style={{ color: "var(--fg)" }}>Net Pay</span>
                            <span style={{ color: "var(--primary)" }}>{fmt(estimate.netPay)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Deduction bar visual */}
                      {estimate.grossPay > 0 && (
                        <div>
                          <div className="flex justify-between text-[10px] font-semibold mb-1.5" style={{ color: "var(--fg-tertiary)" }}>
                            <span>Pay Breakdown</span>
                            <span>{100 - deductionPct}% take-home</span>
                          </div>
                          <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                            <motion.div className="h-full" style={{ background: "var(--primary)" }} initial={{ width: 0 }} animate={{ width: `${100 - deductionPct}%` }} transition={{ duration: 0.6 }} />
                            {deductionPct > 0 && (
                              <motion.div className="h-full" style={{ background: "var(--rose)" }} initial={{ width: 0 }} animate={{ width: `${deductionPct}%` }} transition={{ duration: 0.6, delay: 0.15 }} />
                            )}
                          </div>
                          <div className="mt-1.5 flex gap-3 text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
                            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--primary)" }} />Net {100 - deductionPct}%</span>
                            {deductionPct > 0 && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--rose)" }} />Deductions {deductionPct}%</span>}
                          </div>
                        </div>
                      )}

                      {/* YTD summary */}
                      {estimate.ytd.months > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>Year to Date · {estimate.ytd.months} month{estimate.ytd.months !== 1 ? "s" : ""}</p>
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
                    </>
                  ) : (
                    <div className="py-8 text-center">
                      <p className="text-xs font-medium" style={{ color: "var(--fg-tertiary)" }}>No payroll data available.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
