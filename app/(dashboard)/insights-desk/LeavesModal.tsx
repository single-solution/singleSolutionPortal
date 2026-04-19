"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { Portal } from "../components/Portal";
import { ToggleSwitch } from "../components/ToggleSwitch";
import toast from "react-hot-toast";
import { useCachedState } from "@/lib/useQuery";

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
  const canSubmitOnBehalf = canPerm("leaves_submitOnBehalf");

  const [employees, setEmployees] = useCachedState<DropdownEmp[]>("$leaves/employees", []);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [userId, setUserId] = useState(selectedUserId || "");
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [balance, setBalance] = useCachedState<BalancePayload | null>("$leaves/balance", null);
  const [balLoading, setBalLoading] = useState(false);
  const [leaves, setLeaves] = useCachedState<LeaveRecord[]>("$leaves/records", []);
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [selYear, setSelYear] = useState(new Date().getFullYear());

  const [showForm, setShowForm] = useState(false);
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [multiDay, setMultiDay] = useState(false);
  const [leaveType, setLeaveType] = useState("leave");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [leaveTab, setLeaveTab] = useState<string>(selectedUserId ? "summary" : "overview");

  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedUserId) {
      setUserId(selectedUserId);
      setDeptFilter(null);
      setLeaveTab("summary");
    }
  }, [selectedUserId]);

  useEffect(() => {
    if (!open || !canViewTeam) return;
    setSidebarLoading(true);
    fetch("/api/employees/dropdown")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setEmployees(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setSidebarLoading(false));
  }, [open, canViewTeam]);

  const loadBalance = useCallback(async () => {
    if (isSuperAdmin && !userId) { setBalance(null); return; }
    const uid = userId || session?.user?.id;
    if (!uid) return;
    setBalLoading(true);
    try {
      const q = new URLSearchParams({ year: String(selYear) });
      if (userId) q.set("userId", userId);
      const res = await fetch(`/api/leaves/balance?${q}`);
      if (res.ok) setBalance(await res.json());
    } catch { /* ignore */ }
    setBalLoading(false);
  }, [userId, session?.user?.id, isSuperAdmin, selYear]);

  const loadLeaves = useCallback(async () => {
    const uid = userId || session?.user?.id;
    if (!isSuperAdmin && !uid) return;
    setLeavesLoading(true);
    try {
      const q = new URLSearchParams({ year: String(selYear) });
      if (userId) q.set("userId", userId);
      const res = await fetch(`/api/leaves?${q}`);
      if (res.ok) {
        const data = await res.json();
        setLeaves(Array.isArray(data) ? data : []);
      }
    } catch { setLeaves([]); }
    setLeavesLoading(false);
  }, [userId, session?.user?.id, isSuperAdmin, selYear]);

  useEffect(() => {
    if (open) { loadBalance(); loadLeaves(); }
  }, [open, loadBalance, loadLeaves]);

  useEffect(() => {
    if (detailRef.current) detailRef.current.scrollTop = 0;
  }, [userId, deptFilter]);

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
    if (!date) { toast.error("Please select a date"); return; }
    if (multiDay && !isHalfDay && !endDate) { toast.error("Please select an end date"); return; }
    if (multiDay && !isHalfDay && endDate && endDate < date) { toast.error("End date must be on or after start date"); return; }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { date, isHalfDay, reason };
      if (leaveType && leaveType !== "leave") body.type = leaveType;
      if (multiDay && endDate) body.endDate = endDate;
      if (canSubmitOnBehalf && userId) body.userId = userId;
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
        setDate(""); setEndDate(""); setReason(""); setIsHalfDay(false); setMultiDay(false); setLeaveType("leave");
        setShowForm(false);
        await Promise.all([loadBalance(), loadLeaves()]);
      }
    } catch {
      toast.error("Something went wrong");
    }
    setSubmitting(false);
  }

  const allMode = isSuperAdmin && !userId;
  const balPct = balance && balance.total > 0 ? Math.round((balance.used / balance.total) * 100) : 0;
  const barColor = balPct > 80 ? "var(--rose)" : balPct > 50 ? "var(--amber)" : "var(--teal)";
  const showSidebar = canViewTeam;

  const detailLabel = allMode
    ? "All Employees"
    : userId
      ? (selectedEmployee ? nameOf(selectedEmployee) : "Employee")
      : "Yourself";

  const allEmployeeSummary = useMemo(() => {
    if (!allMode || !leaves.length) return null;
    const byEmp = new Map<string, { name: string; dept: string; total: number; approved: number; pending: number; rejected: number; days: number }>();
    for (const l of leaves) {
      const uid = l.user?._id ?? "unknown";
      const n = l.user?.about ? `${l.user.about.firstName ?? ""} ${l.user.about.lastName ?? ""}`.trim() : l.user?.email ?? "—";
      if (!byEmp.has(uid)) byEmp.set(uid, { name: n || "—", dept: "", total: 0, approved: 0, pending: 0, rejected: 0, days: 0 });
      const row = byEmp.get(uid)!;
      row.total++;
      if (l.status === "approved") { row.approved++; row.days += l.days ?? 0; }
      else if (l.status === "pending") row.pending++;
      else if (l.status === "rejected") row.rejected++;
    }
    const empMatch = (uid: string) => employees.find((e) => e._id === uid);
    for (const [uid, row] of byEmp) {
      const emp = empMatch(uid);
      if (emp?.department?.title) row.dept = emp.department.title;
      if (emp && !row.name.trim()) row.name = nameOf(emp);
    }
    const rows = [...byEmp.values()].sort((a, b) => b.days - a.days);
    const totalLeaves = leaves.length;
    const totalApproved = leaves.filter((l) => l.status === "approved").length;
    const totalPending = leaves.filter((l) => l.status === "pending").length;
    const totalRejected = leaves.filter((l) => l.status === "rejected").length;
    const totalDays = leaves.filter((l) => l.status === "approved").reduce((s, l) => s + (l.days ?? 0), 0);
    const uniqueEmployees = byEmp.size;
    return { rows, totalLeaves, totalApproved, totalPending, totalRejected, totalDays, uniqueEmployees };
  }, [allMode, leaves, employees]);

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
              className={`relative mx-4 flex flex-col rounded-xl border shadow-xl overflow-hidden ${showSidebar ? "w-full max-w-6xl h-[80vh]" : "w-full max-w-3xl h-[80vh]"}`}
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                <div>
                  <h3 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>Leaves</h3>
                  {allMode ? (
                    <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                      All Employees · {selYear}{allEmployeeSummary ? ` · ${allEmployeeSummary.totalDays} days used` : ""}
                    </p>
                  ) : balance && !balLoading && (
                    <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                      {detailLabel && <>{detailLabel} · </>}
                      {balance.remaining} of {balance.total} remaining · {selYear}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-lg border" style={{ borderColor: "var(--border)" }}>
                    <button type="button" onClick={() => setSelYear(y => y - 1)} className="px-2 py-1 text-[11px] font-bold" style={{ color: "var(--fg-secondary)" }}>‹</button>
                    <span className="px-1.5 text-[11px] font-bold tabular-nums" style={{ color: "var(--fg)" }}>{selYear}</span>
                    <button type="button" onClick={() => setSelYear(y => y + 1)} disabled={selYear >= new Date().getFullYear()} className="px-2 py-1 text-[11px] font-bold disabled:opacity-30" style={{ color: "var(--fg-secondary)" }}>›</button>
                  </div>
                  <motion.button
                    type="button"
                    onClick={() => setShowForm((p) => !p)}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white"
                    style={{ background: "var(--primary)" }}
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M12 4v16m8-8H4" /></svg>
                    {userId && userId !== session?.user?.id && !canSubmitOnBehalf
                      ? "Request leave (for yourself)"
                      : "Request leave"}
                  </motion.button>
                  <button type="button" onClick={onClose} className="rounded-lg p-1 transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-secondary)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
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
                          className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-[11px] outline-none transition-colors focus:border-[var(--primary)]"
                          style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--fg)" }}
                        />
                      </div>
                    </div>

                    {/* Scrollable list */}
                    <div className="flex-1 overflow-y-auto py-1.5">
                      {sidebarLoading ? (
                        <div className="space-y-2 p-3">{[1,2,3,4,5].map(i => <div key={i} className="flex items-center gap-2"><div className="shimmer h-6 w-6 rounded-full" /><div className="shimmer h-3 flex-1 rounded" /></div>)}</div>
                      ) : <>
                      {!sidebarSearch && (
                        <button
                          type="button"
                          onClick={() => { setUserId(""); setDeptFilter(null); setLeaveTab(isSuperAdmin ? "overview" : "summary"); }}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${!userId && !deptFilter ? "bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]" : "hover:bg-[var(--hover-bg)]"}`}
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary)" }}>
                            {isSuperAdmin ? "All" : "You"}
                          </span>
                          <span className="text-[11px] font-semibold" style={{ color: !userId && !deptFilter ? "var(--primary)" : "var(--fg-secondary)" }}>
                            {isSuperAdmin ? "All Employees" : "Yourself"}
                          </span>
                        </button>
                      )}

                      {!sidebarSearch && employees.length > 0 && (
                        <div className="mx-3 my-1 border-b" style={{ borderColor: "var(--border)" }} />
                      )}

                      {deptGroups.map((g) => (
                        <div key={g.id}>
                          <div className="px-2 py-0.5">
                            <button
                              type="button"
                              onClick={() => { setUserId(""); setDeptFilter(g.id); setLeaveTab("overview"); }}
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors w-full text-left ${deptFilter === g.id && !userId ? "bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]" : "hover:bg-[var(--hover-bg)]"}`}
                              style={{ color: deptFilter === g.id && !userId ? "var(--primary)" : "var(--fg-tertiary)" }}
                            >
                              {g.title} ({g.employees.length})
                            </button>
                          </div>
                          {g.employees.map((emp) => {
                            const isSel = userId === emp._id;
                            return (
                              <button
                                key={emp._id}
                                type="button"
                                onClick={() => { setUserId(emp._id); setDeptFilter(null); setLeaveTab("summary"); }}
                                className="flex w-full items-center gap-2.5 px-3 py-1.5 pl-8 text-left transition-colors"
                                style={{ background: isSel ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent" }}
                              >
                                <span
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                                  style={{ background: avatarColor(emp._id) }}
                                >
                                  {initials(emp)}
                                </span>
                                <span className="flex-1 min-w-0 text-[11px] font-medium truncate" style={{ color: isSel ? "var(--primary)" : "var(--fg)" }}>
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
                      </>}
                    </div>

                    <div className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
                      <p className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
                        {sidebarLoading ? "Loading…" : `${employees.length} employee${employees.length !== 1 ? "s" : ""}`}
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Right detail panel ── */}
                <div ref={detailRef} className="flex-1 overflow-y-auto p-3 space-y-3">
                  {allMode ? (
                    <div className="space-y-4">
                      {/* All Employees header */}
                      <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--bg-grouped)" }}>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary)" }}>All</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold" style={{ color: "var(--fg)" }}>All Employees</p>
                          <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>Organization-wide leave overview · {selYear}</p>
                        </div>
                      </div>
                      {/* All-employees tabs */}
                      <div className="flex gap-1 rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
                        {(["overview", "employees"] as const).map((t) => (
                          <button key={t} type="button" onClick={() => setLeaveTab(t)}
                            className={`flex-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${leaveTab === t ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)]"}`}
                          >
                            {t === "overview" ? "Overview" : "Employees"}
                          </button>
                        ))}
                      </div>
                      <AnimatePresence mode="wait">
                        {/* ALL: OVERVIEW */}
                        {leaveTab === "overview" && (
                          <motion.div key="all-overview" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }} className="space-y-4">
                            {leavesLoading ? (
                              <div className="space-y-3">
                                <div className="grid grid-cols-3 gap-2">{[1,2,3,4,5,6].map((i) => <div key={i} className="shimmer h-14 rounded-xl" />)}</div>
                                <div className="shimmer h-20 rounded-xl" />
                              </div>
                            ) : !allEmployeeSummary ? (
                              <p className="py-8 text-center text-[10px]" style={{ color: "var(--fg-tertiary)" }}>No leave records for {selYear}.</p>
                            ) : (
                              <>
                                <div className="grid grid-cols-3 gap-2">
                                  {([
                                    ["Leave requests", `${allEmployeeSummary.totalLeaves}`, "var(--fg-secondary)"],
                                    ["Approved requests", `${allEmployeeSummary.totalApproved}`, "var(--green)"],
                                    ["Pending approval", `${allEmployeeSummary.totalPending}`, "var(--amber)"],
                                    ["Rejected requests", `${allEmployeeSummary.totalRejected}`, "var(--rose)"],
                                    ["Total days off", `${allEmployeeSummary.totalDays}`, "var(--teal)"],
                                    ["Employees with leaves", `${allEmployeeSummary.uniqueEmployees}`, "var(--primary)"],
                                  ] as const).map(([k, v, c]) => (
                                    <div key={k} className="rounded-xl p-2.5 text-center space-y-0.5" style={{ background: "var(--bg-grouped)" }}>
                                      <p className="text-[10px] font-semibold uppercase" style={{ color: c }}>{k}</p>
                                      <p className="text-[11px] font-bold tabular-nums" style={{ color: "var(--fg)" }}>{v}</p>
                                    </div>
                                  ))}
                                </div>
                                {allEmployeeSummary.totalLeaves > 0 && allEmployeeSummary.totalApproved > 0 && (
                                  <div>
                                    <div className="flex justify-between text-[10px] font-semibold mb-1.5" style={{ color: "var(--fg-tertiary)" }}>
                                      <span>Status breakdown</span>
                                      <span>{Math.round((allEmployeeSummary.totalApproved / allEmployeeSummary.totalLeaves) * 100)}% approved</span>
                                    </div>
                                    <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                                      <motion.div className="h-full" style={{ background: "var(--green)" }} initial={{ width: 0 }} animate={{ width: `${(allEmployeeSummary.totalApproved / allEmployeeSummary.totalLeaves) * 100}%` }} transition={{ duration: 0.6 }} />
                                      {allEmployeeSummary.totalPending > 0 && <motion.div className="h-full" style={{ background: "var(--amber)" }} initial={{ width: 0 }} animate={{ width: `${(allEmployeeSummary.totalPending / allEmployeeSummary.totalLeaves) * 100}%` }} transition={{ duration: 0.6, delay: 0.1 }} />}
                                      {allEmployeeSummary.totalRejected > 0 && <motion.div className="h-full" style={{ background: "var(--rose)" }} initial={{ width: 0 }} animate={{ width: `${(allEmployeeSummary.totalRejected / allEmployeeSummary.totalLeaves) * 100}%` }} transition={{ duration: 0.6, delay: 0.2 }} />}
                                    </div>
                                    <div className="mt-1.5 flex gap-3 text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
                                      <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--green)" }} />Approved</span>
                                      {allEmployeeSummary.totalPending > 0 && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--amber)" }} />Pending</span>}
                                      {allEmployeeSummary.totalRejected > 0 && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--rose)" }} />Rejected</span>}
                                    </div>
                                  </div>
                                )}
                                {leaveSummary.typeDayBreakdown.length > 0 && (
                                  <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Leave type breakdown</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {leaveSummary.typeDayBreakdown.map((t) => (
                                        <span key={t.label} className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}>
                                          {t.label}: {t.days}d
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {/* ── History (merged) ── */}
                                {leaves.length > 0 && (
                                  <div className="mt-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>Leave History · {selYear}</p>
                                    <div className="max-h-[300px] space-y-1.5 overflow-y-auto">
                                      {leaves.map((l) => {
                                        const col = STATUS_COLORS[l.status] ?? "var(--fg-secondary)";
                                        const empName = l.user?.about ? `${l.user.about.firstName ?? ""} ${l.user.about.lastName ?? ""}`.trim() : l.user?.email ?? "";
                                        return (
                                          <div key={l._id} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-grouped)" }}>
                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-center gap-1.5">
                                                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: col }} />
                                                <span className="truncate text-[11px] font-semibold" style={{ color: "var(--fg)" }}>{empName || "—"}</span>
                                                <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{l.days}d</span>
                                              </div>
                                              <p className="mt-0.5 truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
                                                {l.type || "Leave"}{l.isHalfDay ? " (½)" : ""} · {fmtDate(l.startDate)}{l.startDate !== l.endDate ? ` – ${fmtDate(l.endDate)}` : ""}{l.reason ? ` · ${l.reason}` : ""}
                                              </p>
                                            </div>
                                            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: `color-mix(in srgb, ${col} 12%, transparent)`, color: col }}>{{ pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" }[l.status] ?? l.status}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </motion.div>
                        )}
                        {/* ALL: EMPLOYEES */}
                        {leaveTab === "employees" && (
                          <motion.div key="all-employees" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }} className="space-y-4">
                            {leavesLoading ? (
                              <div className="space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="shimmer h-10 rounded-lg" />)}</div>
                            ) : !allEmployeeSummary ? (
                              <p className="py-8 text-center text-[10px]" style={{ color: "var(--fg-tertiary)" }}>No leave records for {selYear}.</p>
                            ) : (
                              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Employee leave details</p>
                                <div className="max-h-[450px] overflow-y-auto">
                                  <table className="w-full text-[11px]">
                                    <thead>
                                      <tr style={{ color: "var(--fg-tertiary)" }}>
                                        <th className="py-1.5 text-left font-semibold">Employee</th>
                                        <th className="py-1.5 text-right font-semibold">Days</th>
                                        <th className="py-1.5 text-right font-semibold">Approved</th>
                                        <th className="py-1.5 text-right font-semibold">Pending</th>
                                        <th className="py-1.5 text-right font-semibold">Rejected</th>
                                        <th className="py-1.5 text-right font-semibold">Requests</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {allEmployeeSummary.rows.map((r, i) => (
                                        <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                                          <td className="py-1.5">
                                            <p className="font-medium truncate max-w-[180px]" style={{ color: "var(--fg)" }}>{r.name}</p>
                                            {r.dept && <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{r.dept}</p>}
                                          </td>
                                          <td className="py-1.5 text-right tabular-nums font-semibold" style={{ color: "var(--teal)" }}>{r.days}</td>
                                          <td className="py-1.5 text-right tabular-nums" style={{ color: "var(--green)" }}>{r.approved}</td>
                                          <td className="py-1.5 text-right tabular-nums" style={{ color: "var(--amber)" }}>{r.pending}</td>
                                          <td className="py-1.5 text-right tabular-nums" style={{ color: "var(--rose)" }}>{r.rejected}</td>
                                          <td className="py-1.5 text-right tabular-nums font-semibold" style={{ color: "var(--fg)" }}>{r.total}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t font-bold" style={{ borderColor: "var(--border)" }}>
                                        <td className="py-1.5" style={{ color: "var(--fg)" }}>Total</td>
                                        <td className="py-1.5 text-right tabular-nums" style={{ color: "var(--teal)" }}>{allEmployeeSummary.totalDays}</td>
                                        <td className="py-1.5 text-right tabular-nums" style={{ color: "var(--green)" }}>{allEmployeeSummary.totalApproved}</td>
                                        <td className="py-1.5 text-right tabular-nums" style={{ color: "var(--amber)" }}>{allEmployeeSummary.totalPending}</td>
                                        <td className="py-1.5 text-right tabular-nums" style={{ color: "var(--rose)" }}>{allEmployeeSummary.totalRejected}</td>
                                        <td className="py-1.5 text-right tabular-nums" style={{ color: "var(--fg)" }}>{allEmployeeSummary.totalLeaves}</td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ) : canViewTeam && deptFilter && !userId ? (
                    (() => {
                      const deptName = deptGroups.find((g) => g.id === deptFilter)?.title ?? "Department";
                      const deptEmpIds = new Set(employees.filter((e) => deptFilter === "__none" ? !e.department : e.department?.id === deptFilter).map((e) => e._id));
                      const deptLeaves = leaves.filter((l) => l.user?._id && deptEmpIds.has(l.user._id));
                      const dApproved = deptLeaves.filter((l) => l.status === "approved");
                      const dPending = deptLeaves.filter((l) => l.status === "pending");
                      const dRejected = deptLeaves.filter((l) => l.status === "rejected");
                      const dDays = dApproved.reduce((s, l) => s + (l.days ?? 0), 0);
                      return (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--bg-grouped)" }}>
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary)" }}>{deptEmpIds.size}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-bold" style={{ color: "var(--fg)" }}>{deptName}</p>
                              <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{deptEmpIds.size} employee{deptEmpIds.size !== 1 ? "s" : ""} · {selYear}</p>
                            </div>
                          </div>
                          {deptLeaves.length === 0 ? (
                            <p className="py-8 text-center text-[10px]" style={{ color: "var(--fg-tertiary)" }}>No leave records for this department in {selYear}.</p>
                          ) : (
                            <>
                              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                                {([
                                  ["Approved requests", `${dApproved.length}`, "var(--green)"],
                                  ["Pending approval", `${dPending.length}`, "var(--amber)"],
                                  ["Rejected requests", `${dRejected.length}`, "var(--rose)"],
                                  ["Total days off", `${dDays}`, "var(--teal)"],
                                ] as const).map(([k, v, c]) => (
                                  <div key={k} className="rounded-xl p-2.5 text-center space-y-0.5" style={{ background: "var(--bg-grouped)" }}>
                                    <p className="text-[10px] font-semibold uppercase" style={{ color: c }}>{k}</p>
                                    <p className="text-[11px] font-bold tabular-nums" style={{ color: "var(--fg)" }}>{v}</p>
                                  </div>
                                ))}
                              </div>
                              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Recent leaves · {deptName}</p>
                                <div className="max-h-[300px] space-y-1.5 overflow-y-auto">
                                  {deptLeaves.slice(0, 25).map((l) => {
                                    const col = STATUS_COLORS[l.status] ?? "var(--fg-secondary)";
                                    const empName = l.user?.about ? `${l.user.about.firstName ?? ""} ${l.user.about.lastName ?? ""}`.trim() : l.user?.email ?? "";
                                    return (
                                      <div key={l._id} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-grouped)" }}>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-1.5">
                                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: col }} />
                                            <span className="truncate text-[11px] font-semibold" style={{ color: "var(--fg)" }}>{empName || "—"}</span>
                                          </div>
                                          <p className="mt-0.5 truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
                                            {l.type || "Leave"} · {fmtDate(l.startDate)}{l.startDate !== l.endDate ? ` – ${fmtDate(l.endDate)}` : ""} · {l.days}d
                                          </p>
                                        </div>
                                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: `color-mix(in srgb, ${col} 12%, transparent)`, color: col }}>{{ pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" }[l.status] ?? l.status}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </>
                          )}
                          <p className="text-center text-[10px]" style={{ color: "var(--fg-tertiary)" }}>Select an employee from the sidebar for individual details</p>
                        </div>
                      );
                    })()
                  ) : (
                    <>
                      {/* Selected employee header */}
                      {userId && selectedEmployee && (
                        <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--bg-grouped)" }}>
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: avatarColor(selectedEmployee._id) }}>
                            {initials(selectedEmployee)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold truncate" style={{ color: "var(--fg)" }}>{nameOf(selectedEmployee)}</p>
                            {selectedEmployee.department && (
                              <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{selectedEmployee.department.title}</p>
                            )}
                          </div>
                        </div>
                      )}


                      <div className="space-y-4">

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
                              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Total days</p>
                              <p className="text-[11px] font-bold" style={{ color: "var(--primary)" }}>{balance.total}</p>
                            </div>
                            <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--bg-elevated)" }}>
                              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Days used</p>
                              <p className="text-[11px] font-bold" style={{ color: barColor }}>{balance.used}</p>
                            </div>
                            <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--bg-elevated)" }}>
                              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Days left</p>
                              <p className="text-[11px] font-bold" style={{ color: "var(--green)" }}>{balance.remaining}</p>
                            </div>
                          </div>
                          {balanceRunoutDays != null && (
                            <div className="rounded-lg px-2.5 py-2 text-center" style={{ background: "var(--bg-elevated)" }}>
                              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Days Until Balance Runs Out</p>
                              <p className="text-[11px] font-bold" style={{ color: "var(--fg-secondary)" }}>~{balanceRunoutDays} days <span className="font-normal" style={{ color: "var(--fg-tertiary)" }}>(est.)</span></p>
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
                        <div className="flex flex-wrap gap-2">
                          {[
                            { label: "Total requests", value: leaves.length, color: "var(--fg)" },
                            { label: "Approved", value: leaveSummary.approved, color: "var(--green)" },
                            { label: "Pending approval", value: leaveSummary.pending, color: "var(--amber)" },
                            ...(leaveSummary.rejected > 0 ? [{ label: "Rejected", value: leaveSummary.rejected, color: "var(--rose)" }] : []),
                            ...(leaveSummary.cancelled > 0 ? [{ label: "Cancelled", value: leaveSummary.cancelled, color: "var(--fg-tertiary)" }] : []),
                            { label: "Days taken", value: leaveSummary.totalDays, color: "var(--teal)" },
                          ].map((s) => (
                            <div key={s.label} className="flex-1 min-w-[72px] rounded-lg p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>{s.label}</p>
                              <p className="text-[11px] font-bold" style={{ color: s.color }}>{s.value}</p>
                            </div>
                          ))}
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
                            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>On Leave Today</p>
                            <p className="text-[11px] font-bold" style={{ color: leavePersonalExtras.onLeaveToday ? "var(--green)" : "var(--fg-tertiary)" }}>
                              {leavePersonalExtras.onLeaveToday ? "Yes" : "No"}
                            </p>
                          </div>
                          <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Half-Day Leaves</p>
                            <p className="text-[11px] font-bold" style={{ color: "var(--purple)" }}>{leavePersonalExtras.halfDayLeaves}</p>
                          </div>
                          <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Next Scheduled Leave</p>
                            <p className="text-[11px] font-bold truncate px-0.5" style={{ color: "var(--primary)" }} title={leavePersonalExtras.nextScheduledStart ?? undefined}>
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
                              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Request leave</p>
                              <div>
                                <div className="flex gap-1 rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
                                  <button
                                    type="button"
                                    onClick={() => setIsHalfDay(false)}
                                    className={`flex-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${!isHalfDay ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)]"}`}
                                  >
                                    Full day
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setIsHalfDay(true); setMultiDay(false); }}
                                    className={`flex-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${isHalfDay ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)]"}`}
                                  >
                                    Half day
                                  </button>
                                </div>
                              </div>
                              {!isHalfDay && (
                                <ToggleSwitch checked={multiDay} onChange={setMultiDay} label="Multiple days" />
                              )}
                              <div className={multiDay && !isHalfDay ? "grid grid-cols-2 gap-2" : ""}>
                                <label className="flex flex-col gap-1 text-[11px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                                  {multiDay && !isHalfDay ? "Start date" : "Date"}
                                  <input type="date" required className="input text-[11px]" value={date} onChange={(e) => setDate(e.target.value)} />
                                </label>
                                {multiDay && !isHalfDay && (
                                  <label className="flex flex-col gap-1 text-[11px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                                    End date
                                    <input type="date" required className="input text-[11px]" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={date} />
                                  </label>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <label className="flex flex-col gap-1 text-[11px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                                  Type
                                  <select className="input text-[11px]" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                                    <option value="leave">General</option>
                                    <option value="sick">Sick</option>
                                    <option value="casual">Casual</option>
                                    <option value="annual">Annual</option>
                                    <option value="unpaid">Unpaid</option>
                                  </select>
                                </label>
                                <label className="flex flex-col gap-1 text-[11px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                                  Reason <span className="font-normal">(optional)</span>
                                  <input type="text" className="input text-[11px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Personal, health, etc." />
                                </label>
                              </div>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg border px-3 py-2 text-[11px] font-semibold" style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}>Cancel</button>
                                <button type="submit" disabled={submitting || !date} className="btn btn-primary flex-1">{submitting ? "Submitting request…" : "Submit request"}</button>
                              </div>
                            </form>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Leave history */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>
                          Leave History · {selYear}
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
                            <p className="text-[11px] font-medium" style={{ color: "var(--fg-tertiary)" }}>No leave records this year</p>
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
                                    <p className="text-[11px] font-semibold" style={{ color: "var(--fg)" }}>
                                      {canViewTeam && l.user?.about && (
                                        <span style={{ color: "var(--fg-secondary)" }}>{`${l.user.about.firstName ?? ""} ${l.user.about.lastName ?? ""}`.trim() || l.user.email || ""} · </span>
                                      )}
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
                                    {{ pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" }[l.status] ?? l.status}
                                  </span>
                                </motion.div>
                              );
                            })}
                          </div>
                        )}
                      </div>

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
