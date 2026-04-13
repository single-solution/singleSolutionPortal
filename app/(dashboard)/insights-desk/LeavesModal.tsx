"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
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
  department?: { id: string; title: string } | null;
}

interface BalancePayload {
  total: number;
  used: number;
  remaining: number;
}

interface LeaveRecord {
  _id: string;
  startDate: string;
  endDate: string;
  days: number;
  isHalfDay?: boolean;
  status: string;
  reason?: string;
  type?: string;
  createdAt?: string;
  user?: { _id?: string; about?: { firstName?: string; lastName?: string }; email?: string };
  reviewedBy?: { about?: { firstName?: string; lastName?: string }; email?: string };
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

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseLeaveDay(s: string) {
  return startOfLocalDay(new Date(s));
}

function monthsElapsedSinceYearStart(now: Date) {
  const y0 = new Date(now.getFullYear(), 0, 1);
  const days = (now.getTime() - y0.getTime()) / 86400000;
  return Math.max(days / (365.2425 / 12), 1 / 12);
}

const STATUS_COLORS: Record<string, string> = {
  approved: "var(--green)",
  pending: "var(--amber)",
  rejected: "var(--rose)",
  cancelled: "var(--fg-tertiary)",
};

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

export function LeavesModal({ open, onClose, selectedUserId }: Props) {
  const { data: session } = useSession();
  const { can: canPerm, isSuperAdmin } = usePermissions();
  const canViewTeam = canPerm("leaves_viewTeam");

  const [employees, setEmployees] = useState<DropdownEmp[]>([]);
  const [userId, setUserId] = useState(selectedUserId || "");
  const [balance, setBalance] = useState<BalancePayload | null>(null);
  const [balLoading, setBalLoading] = useState(false);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [multiDay, setMultiDay] = useState(false);
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const detailRef = useRef<HTMLDivElement>(null);

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

  const loadLeaves = useCallback(async () => {
    if (isSuperAdmin && !userId) { setLeaves([]); return; }
    const uid = userId || session?.user?.id;
    if (!uid) return;
    setLeavesLoading(true);
    try {
      const q = new URLSearchParams({ year: String(new Date().getFullYear()) });
      if (userId) q.set("userId", userId);
      const res = await fetch(`/api/leaves?${q}`);
      if (res.ok) {
        const data = await res.json();
        setLeaves(Array.isArray(data) ? data : []);
      }
    } catch { setLeaves([]); }
    setLeavesLoading(false);
  }, [userId, session?.user?.id, isSuperAdmin]);

  useEffect(() => {
    if (open) { loadBalance(); loadLeaves(); }
  }, [open, loadBalance, loadLeaves]);

  useEffect(() => {
    if (detailRef.current) detailRef.current.scrollTop = 0;
  }, [userId]);

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
    for (const g of groups) g.employees.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return groups;
  }, [filteredEmployees]);

  const selectedEmployee = useMemo(() => employees.find((e) => e._id === userId), [employees, userId]);

  const leaveSummary = useMemo(() => {
    const pending = leaves.filter((l) => l.status === "pending").length;
    const approved = leaves.filter((l) => l.status === "approved").length;
    const rejected = leaves.filter((l) => l.status === "rejected").length;
    const cancelled = leaves.filter((l) => l.status === "cancelled").length;
    const totalDays = leaves.filter((l) => l.status === "approved").reduce((s, l) => s + l.days, 0);
    const nonCancelled = leaves.filter((l) => l.status !== "cancelled");
    const approvalRate = nonCancelled.length > 0 ? Math.round((approved / nonCancelled.length) * 100) : 0;
    const avgDuration = approved > 0 ? +(totalDays / approved).toFixed(1) : 0;
    const today = new Date();
    const pastApproved = leaves.filter((l) => l.status === "approved" && new Date(l.endDate) < today).sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
    const daysSinceLastLeave = pastApproved.length > 0 ? Math.ceil((today.getTime() - new Date(pastApproved[0].endDate).getTime()) / 86400000) : null;
    const typeDays = new Map<string, number>();
    for (const l of leaves.filter((x) => x.status === "approved")) {
      const t = l.type && l.type !== "leave" ? l.type : "General";
      typeDays.set(t, (typeDays.get(t) ?? 0) + l.days);
    }
    const typeDayBreakdown = [...typeDays.entries()].sort((a, b) => b[1] - a[1]).map(([label, days]) => ({ label, days }));
    return { pending, approved, rejected, cancelled, totalDays, approvalRate, avgDuration, daysSinceLastLeave, typeDayBreakdown };
  }, [leaves]);

  const leavePersonalExtras = useMemo(() => {
    const today = startOfLocalDay(new Date());
    const todayT = today.getTime();
    const approved = leaves.filter((l) => l.status === "approved");
    const onLeaveToday = approved.some((l) => {
      const s = parseLeaveDay(l.startDate).getTime();
      const e = parseLeaveDay(l.endDate).getTime();
      return todayT >= s && todayT <= e;
    });
    const halfDayLeaves = leaves.filter((l) => l.isHalfDay).length;
    let nextStart: string | null = null;
    let nextStartT = Infinity;
    for (const l of approved) {
      const s = parseLeaveDay(l.startDate).getTime();
      if (s <= todayT) continue;
      if (s < nextStartT) {
        nextStartT = s;
        nextStart = l.startDate;
      }
    }
    return { onLeaveToday, halfDayLeaves, nextScheduledStart: nextStart };
  }, [leaves]);

  const balanceRunoutDays = useMemo(() => {
    if (leavesLoading || !balance || balance.used <= 0 || balance.remaining <= 0) return null;
    const hasLeaveDates = leaves.some((l) => Boolean(l.startDate));
    if (!hasLeaveDates) return null;
    const months = monthsElapsedSinceYearStart(new Date());
    const monthsLeft = balance.remaining / (balance.used / months);
    const daysLeft = monthsLeft * (365.2425 / 12);
    if (!Number.isFinite(daysLeft) || daysLeft <= 0) return null;
    return Math.round(daysLeft);
  }, [balance, leaves, leavesLoading]);

  const leaveTypeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leaves) {
      const key = (l.type && l.type.trim()) || "General";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [leaves]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { date, isHalfDay, reason };
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
        setShowForm(false);
        await Promise.all([loadBalance(), loadLeaves()]);
      }
    } catch {
      toast.error("Something went wrong");
    }
    setSubmitting(false);
  }

  const selfExempt = isSuperAdmin && !userId;
  const balPct = balance && balance.total > 0 ? Math.round((balance.used / balance.total) * 100) : 0;
  const barColor = balPct > 80 ? "var(--rose)" : balPct > 50 ? "var(--amber)" : "var(--teal)";
  const showSidebar = canViewTeam && employees.length > 0;

  const detailLabel = userId
    ? (selectedEmployee ? nameOf(selectedEmployee) : "Employee")
    : (isSuperAdmin ? "" : "Yourself");

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
              className={`relative mx-4 flex flex-col rounded-2xl border shadow-xl overflow-hidden ${showSidebar ? "w-full max-w-6xl max-h-[95vh]" : "w-full max-w-3xl max-h-[93vh]"}`}
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                <div>
                  <h2 className="text-base font-bold" style={{ color: "var(--fg)" }}>Leaves</h2>
                  {!selfExempt && balance && !balLoading && (
                    <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                      {detailLabel && <>{detailLabel} · </>}
                      {balance.remaining} of {balance.total} remaining · {new Date().getFullYear()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!selfExempt && (
                    <motion.button
                      type="button"
                      onClick={() => setShowForm((p) => !p)}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                      style={{ background: "var(--primary)" }}
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M12 4v16m8-8H4" /></svg>
                      Apply
                    </motion.button>
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
                          style={{
                            background: !userId ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent",
                          }}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "var(--green)" }}>
                            ME
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate" style={{ color: !userId ? "var(--primary)" : "var(--fg)" }}>Yourself</p>
                            <p className="text-[10px] truncate" style={{ color: "var(--fg-tertiary)" }}>My leave data</p>
                          </div>
                          {!userId && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--primary)" }} />}
                        </button>
                      )}

                      {/* "All Team" option */}
                      {!sidebarSearch && employees.length > 1 && (
                        <div className="mx-3 my-1 border-b" style={{ borderColor: "var(--border)" }} />
                      )}

                      {/* Department groups — always expanded */}
                      {deptGroups.map((g) => (
                        <div key={g.id}>
                          <div className="flex items-center gap-2 px-3 py-1.5">
                            <svg className="h-3 w-3 shrink-0" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            <span className="text-[10px] font-semibold uppercase tracking-wider truncate" style={{ color: "var(--fg-tertiary)" }}>
                              {g.title}
                            </span>
                            <span className="ml-auto text-[9px] font-medium" style={{ color: "var(--fg-tertiary)" }}>{g.employees.length}</span>
                          </div>
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
                        </div>
                      ))}

                      {filteredEmployees.length === 0 && sidebarSearch && (
                        <p className="px-3 py-4 text-center text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No matches</p>
                      )}
                    </div>

                    {/* Sidebar footer: employee count */}
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
                        Choose from the sidebar to view leave data
                      </p>
                    </div>
                  ) : (
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
                        </div>
                      )}

                      {/* Balance card */}
                      {balLoading ? (
                        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-grouped)" }}>
                          <div className="shimmer h-3 w-40 rounded" />
                          <div className="shimmer h-2.5 w-full rounded-full" />
                          <div className="grid grid-cols-3 gap-2">
                            {[1, 2, 3].map((i) => <div key={i} className="shimmer h-12 rounded-xl" />)}
                          </div>
                        </div>
                      ) : balance ? (
                        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-grouped)" }}>
                          <div className="flex justify-between text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                            <span>{balance.used} days used</span>
                            <span>{balance.remaining} remaining</span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: barColor }}
                              initial={{ width: 0 }}
                              animate={{ width: `${balPct}%` }}
                              transition={{ duration: 0.6 }}
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--bg-elevated)" }}>
                              <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Total</p>
                              <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>{balance.total}</p>
                            </div>
                            <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--bg-elevated)" }}>
                              <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Used</p>
                              <p className="text-sm font-bold" style={{ color: barColor }}>{balance.used}</p>
                            </div>
                            <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--bg-elevated)" }}>
                              <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Remaining</p>
                              <p className="text-sm font-bold" style={{ color: "var(--green)" }}>{balance.remaining}</p>
                            </div>
                          </div>
                          {balanceRunoutDays != null && (
                            <div className="rounded-lg px-2.5 py-2 text-center" style={{ background: "var(--bg-elevated)" }}>
                              <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Days Until Balance Runs Out</p>
                              <p className="text-xs font-bold" style={{ color: "var(--fg-secondary)" }}>~{balanceRunoutDays} days <span className="font-normal" style={{ color: "var(--fg-tertiary)" }}>(est.)</span></p>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* Leave summary stats */}
                      {leavesLoading && (
                        <div className="grid grid-cols-4 gap-2">
                          {[1, 2, 3, 4].map((i) => <div key={i} className="shimmer h-14 rounded-lg" />)}
                        </div>
                      )}
                      {!leavesLoading && leaves.length > 0 && (
                        <div className="grid grid-cols-5 gap-2">
                          <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Total</p>
                            <p className="text-sm font-bold" style={{ color: "var(--fg)" }}>{leaves.length}</p>
                          </div>
                          <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Approved</p>
                            <p className="text-sm font-bold" style={{ color: "var(--green)" }}>{leaveSummary.approved}</p>
                          </div>
                          <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Pending</p>
                            <p className="text-sm font-bold" style={{ color: "var(--amber)" }}>{leaveSummary.pending}</p>
                          </div>
                          {leaveSummary.rejected > 0 && (
                            <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                              <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Rejected</p>
                              <p className="text-sm font-bold" style={{ color: "var(--rose)" }}>{leaveSummary.rejected}</p>
                            </div>
                          )}
                          {leaveSummary.cancelled > 0 && (
                            <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                              <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Cancelled</p>
                              <p className="text-sm font-bold" style={{ color: "var(--fg-tertiary)" }}>{leaveSummary.cancelled}</p>
                            </div>
                          )}
                          <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Days Taken</p>
                            <p className="text-sm font-bold" style={{ color: "var(--teal)" }}>{leaveSummary.totalDays}</p>
                          </div>
                        </div>
                      )}
                      {!leavesLoading && leaves.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                          <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--green) 10%, transparent)", color: "var(--green)" }}>{leaveSummary.approvalRate}% approval</span>
                          {leaveSummary.avgDuration > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>avg {leaveSummary.avgDuration}d per leave</span>}
                          {leaveSummary.daysSinceLastLeave != null && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{leaveSummary.daysSinceLastLeave}d since last leave</span>}
                          {leaveSummary.typeDayBreakdown.map((t) => (
                            <span key={t.label} className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{t.days}d {t.label}</span>
                          ))}
                        </div>
                      )}
                      {balance && !leavesLoading && leaves.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>On Leave Today</p>
                            <p className="text-sm font-bold" style={{ color: leavePersonalExtras.onLeaveToday ? "var(--green)" : "var(--fg-tertiary)" }}>
                              {leavePersonalExtras.onLeaveToday ? "Yes" : "No"}
                            </p>
                          </div>
                          <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Half-Day Leaves</p>
                            <p className="text-sm font-bold" style={{ color: "var(--purple)" }}>{leavePersonalExtras.halfDayLeaves}</p>
                          </div>
                          <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Next Scheduled Leave</p>
                            <p className="text-sm font-bold truncate px-0.5" style={{ color: "var(--primary)" }} title={leavePersonalExtras.nextScheduledStart ?? undefined}>
                              {leavePersonalExtras.nextScheduledStart ? fmtDate(leavePersonalExtras.nextScheduledStart) : "—"}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Apply form — collapsible */}
                      <AnimatePresence>
                        {showForm && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <form onSubmit={(e) => void handleSubmit(e)} className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-grouped)" }}>
                              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Apply Leave</p>
                              <div>
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
                              {!isHalfDay && (
                                <ToggleSwitch checked={multiDay} onChange={setMultiDay} label="Multiple days" />
                              )}
                              <div className={multiDay && !isHalfDay ? "grid grid-cols-2 gap-2" : ""}>
                                <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                                  {multiDay && !isHalfDay ? "Start date" : "Date"}
                                  <input type="date" required className="input text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
                                </label>
                                {multiDay && !isHalfDay && (
                                  <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                                    End date
                                    <input type="date" required className="input text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={date} />
                                  </label>
                                )}
                              </div>
                              <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                                Reason <span className="font-normal">(optional)</span>
                                <input type="text" className="input text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Personal, health, etc." />
                              </label>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}>Cancel</button>
                                <button type="submit" disabled={submitting || !date} className="btn btn-primary flex-1">{submitting ? "Submitting…" : "Submit"}</button>
                              </div>
                            </form>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Leave history */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>
                          Leave History · {new Date().getFullYear()}
                        </p>
                        {!leavesLoading && leaves.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {leaveTypeCounts.map(([typeLabel, count]) => (
                              <span
                                key={typeLabel}
                                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                                style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg-grouped)" }}
                              >
                                <span className="truncate max-w-[140px]" title={typeLabel}>{typeLabel}</span>
                                <span style={{ color: "var(--fg-tertiary)" }}>{count}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        {leavesLoading ? (
                          <div className="space-y-2">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="rounded-xl p-3" style={{ background: "var(--bg-grouped)" }}>
                                <div className="flex items-center gap-3">
                                  <div className="shimmer h-2.5 w-2.5 shrink-0 rounded-full" />
                                  <div className="flex-1 space-y-1"><div className="shimmer h-3 w-32 rounded" /><div className="shimmer h-2.5 w-24 rounded" /></div>
                                  <div className="shimmer h-5 w-14 rounded-full" />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : leaves.length === 0 ? (
                          <div className="rounded-xl py-8 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <svg className="mx-auto mb-2 h-8 w-8" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p className="text-xs font-medium" style={{ color: "var(--fg-tertiary)" }}>No leave records this year</p>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {leaves.map((l, idx) => {
                              const sc = STATUS_COLORS[l.status] ?? "var(--fg-tertiary)";
                              return (
                                <motion.div
                                  key={l._id}
                                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
                                  style={{ background: "var(--bg-grouped)" }}
                                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
                                >
                                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: sc }} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold" style={{ color: "var(--fg)" }}>
                                      {fmtDate(l.startDate)}
                                      {l.startDate !== l.endDate && <> – {fmtDate(l.endDate)}</>}
                                    </p>
                                    <p className="text-[10px] truncate" style={{ color: "var(--fg-tertiary)" }}>
                                      {l.isHalfDay ? "Half day" : `${l.days} day${l.days !== 1 ? "s" : ""}`}
                                      {l.reason && <> · {l.reason}</>}
                                      {l.type && l.type !== "leave" && <> · {l.type}</>}
                                    </p>
                                  </div>
                                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize" style={{
                                    background: `color-mix(in srgb, ${sc} 12%, transparent)`,
                                    color: sc,
                                  }}>
                                    {l.status}
                                  </span>
                                </motion.div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
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
