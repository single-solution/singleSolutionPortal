"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainerFast, cardVariants, cardHover } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { StatusToggle } from "../components/DataTable";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmployeeCard } from "../components/EmployeeCard";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { ScopeStrip } from "../components/ScopeStrip";
import { useGuide } from "@/lib/useGuide";
import { employeesTour } from "@/lib/tourConfigs";

interface Employee {
  _id: string;
  email: string;
  username: string;
  about: { firstName: string; lastName: string; phone?: string; profileImage?: string };
  userRole: string;
  department?: { _id: string; title: string };
  teams?: { _id: string; name: string }[];
  reportsTo?: { _id: string; about: { firstName: string; lastName: string }; email: string; userRole: string } | null;
  isActive: boolean;
  isVerified?: boolean;
  workShift?: {
    type: string;
    shift: { start: string; end: string };
    workingDays: string[];
    breakTime: number;
  };
  createdAt: string;
}

const SHIFT_TYPE_LABELS: Record<string, string> = {
  fullTime: "Full-time",
  partTime: "Part-time",
  contract: "Contract",
  intern: "Intern",
};

const DESIGNATION_LABELS: Record<string, string> = {
  superadmin: "System Administrator",
  manager: "Team Manager",
  teamLead: "Team Lead",
  businessDeveloper: "Business Developer",
  developer: "Software Developer",
};

type RoleFilter = "all" | "manager" | "teamLead" | "businessDeveloper" | "developer";
const ROLE_FILTER_LABELS: Record<RoleFilter, string> = {
  all: "All",
  manager: "Managers",
  teamLead: "Leads",
  businessDeveloper: "BD",
  developer: "Developers",
};

type SortMode = "recent" | "name";
type GroupMode = "flat" | "manager" | "department";

interface PresenceRow {
  _id: string;
  status: string;
  isLive?: boolean;
  firstEntry?: string | null;
  lastOfficeExit?: string | null;
  lastExit?: string | null;
  todayMinutes?: number;
  officeMinutes?: number;
  remoteMinutes?: number;
  lateBy?: number;
  shiftStart?: string;
  shiftEnd?: string;
  shiftBreakTime?: number;
  locationFlagged?: boolean;
}

const DAY_MAP: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];
const FULL_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function formatWorkingDays(days: string[]) {
  const sorted = FULL_WEEK.filter((d) => days.includes(d));
  if (sorted.length === 7) return "Every day";
  if (sorted.length === 5 && WEEKDAYS.every((d) => sorted.includes(d))) return "Mon – Fri";
  if (sorted.length === 6 && FULL_WEEK.slice(0, 6).every((d) => sorted.includes(d))) return "Mon – Sat";
  return sorted.map((d) => DAY_MAP[d] ?? d).join(", ");
}

function shiftSummaryLine(emp: Employee) {
  if (!emp.workShift) return undefined;
  const type = SHIFT_TYPE_LABELS[emp.workShift.type] ?? emp.workShift.type;
  const days = emp.workShift.workingDays?.length ? formatWorkingDays(emp.workShift.workingDays) : "";
  return `${type} ${emp.workShift.shift.start}–${emp.workShift.shift.end}${days ? ` · ${days}` : ""}`;
}

export default function EmployeesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const { registerTour } = useGuide();
  useEffect(() => { registerTour("employees", employeesTour); }, [registerTour]);
  const scopeDept = searchParams.get("dept") ?? "all";
  function setScopeDept(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "all") params.delete("dept"); else params.set("dept", id);
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  const role = session?.user?.role;
  const isSuperAdmin = role === "superadmin";
  const isManager = role === "manager";
  const canManage = isSuperAdmin || isManager;
  const { data: employees, loading: employeesLoading, refetch: refetchEmployees, mutate: mutateEmployees } = useQuery<Employee[]>("/api/employees", "employees");
  const { data: presenceData } = useQuery<PresenceRow[]>("/api/attendance/presence", "presence");

  const presenceById = useMemo(() => {
    const map = new Map<string, PresenceRow>();
    if (presenceData) for (const p of presenceData) map.set(p._id, p);
    return map;
  }, [presenceData]);

  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [groupMode, setGroupMode] = useState<GroupMode>("flat");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const empList = employees ?? [];

  const availableRoles = useMemo(() => {
    const rolesInList = new Set(empList.map((e) => e.userRole));
    return (Object.keys(ROLE_FILTER_LABELS) as RoleFilter[]).filter(
      (k) => k === "all" || rolesInList.has(k),
    );
  }, [empList]);

  useEffect(() => {
    if (roleFilter !== "all" && !availableRoles.includes(roleFilter)) setRoleFilter("all");
  }, [availableRoles, roleFilter]);

  const filtered = useMemo(() => {
    let list = empList;
    if (scopeDept !== "all") list = list.filter((e) => e.department?._id === scopeDept);
    if (roleFilter !== "all") list = list.filter((e) => e.userRole === roleFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => `${e.about.firstName} ${e.about.lastName} ${e.email} ${e.username}`.toLowerCase().includes(q));
    }
    if (sortMode === "name") {
      list = [...list].sort((a, b) => `${a.about.firstName} ${a.about.lastName}`.localeCompare(`${b.about.firstName} ${b.about.lastName}`));
    } else {
      list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return list;
  }, [empList, scopeDept, roleFilter, search, sortMode]);

  const grouped = useMemo(() => {
    if (groupMode === "flat") return null;
    const map = new Map<string, { label: string; employees: typeof filtered }>();
    for (const emp of filtered) {
      let key: string;
      let label: string;
      if (groupMode === "manager") {
        if (emp.reportsTo) {
          key = emp.reportsTo._id;
          label = `${emp.reportsTo.about.firstName} ${emp.reportsTo.about.lastName}`;
        } else {
          key = "__none__";
          label = "No Manager Assigned";
        }
      } else {
        key = emp.department?._id ?? "__none__";
        label = emp.department?.title ?? "No Department";
      }
      if (!map.has(key)) map.set(key, { label, employees: [] });
      map.get(key)!.employees.push(emp);
    }
    return [...map.values()].sort((a, b) => {
      if (a.label === "No Manager Assigned" || a.label === "No Department") return 1;
      if (b.label === "No Manager Assigned" || b.label === "No Department") return -1;
      return a.label.localeCompare(b.label);
    });
  }, [filtered, groupMode]);

  function toggleSelect(id: string) {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map((e) => e._id)));
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/employees/${deleteTarget._id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await refetchEmployees();
    } catch { /* ignore */ }
    setDeleting(false);
  }

  async function handleBulkDeactivate() {
    setBulkDeleting(true);
    try {
      await Promise.all([...selected].map((id) => fetch(`/api/employees/${id}`, { method: "DELETE" })));
      setSelected(new Set());
      setBulkDeleteOpen(false);
      await refetchEmployees();
    } catch { /* ignore */ }
    setBulkDeleting(false);
  }

  const [resendingId, setResendingId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  async function resendInvite(emp: Employee) {
    setResendingId(emp._id);
    try {
      const res = await fetch(`/api/employees/${emp._id}/resend-invite`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.sent) {
          toast.success(`Invite sent to ${emp.email}`);
        } else {
          await navigator.clipboard.writeText(data.link);
          toast.success("Email failed — invite link copied to clipboard");
        }
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to send invite");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setResendingId(null);
  }

  async function copyInviteLink(emp: Employee) {
    setCopyingId(emp._id);
    try {
      const res = await fetch(`/api/employees/${emp._id}/resend-invite`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        await navigator.clipboard.writeText(data.link);
        toast.success("Invite link copied to clipboard");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to generate link");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setCopyingId(null);
  }

  async function toggleActive(emp: Employee) {
    const newStatus = !emp.isActive;
    mutateEmployees((prev) =>
      prev ? prev.map((e) => (e._id === emp._id ? { ...e, isActive: newStatus } : e)) : prev,
    );
    try {
      const res = await fetch(`/api/employees/${emp._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newStatus }),
      });
      if (!res.ok) {
        mutateEmployees((prev) =>
          prev ? prev.map((e) => (e._id === emp._id ? { ...e, isActive: !newStatus } : e)) : prev,
        );
        toast.error("Failed to update status");
      }
    } catch {
      mutateEmployees((prev) =>
        prev ? prev.map((e) => (e._id === emp._id ? { ...e, isActive: !newStatus } : e)) : prev,
      );
      toast.error("Failed to update status");
    }
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Header: title left, sort right — no route-level loading.tsx + no entrance fade: avoids double skeleton / flicker on client nav */}
      <div data-tour="employees-header" className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-title">Employees</h1>
          <p className="text-subhead">
            {employeesLoading && !employees ? (
              <span className="inline-block h-3 w-36 max-w-[50vw] rounded align-middle shimmer" aria-hidden />
            ) : (
              <>
                {empList.length} team member{empList.length !== 1 ? "s" : ""}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ScopeStrip value={scopeDept} onChange={setScopeDept} />
          <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
            {(["flat", "manager", "department"] as GroupMode[]).map((g) => (
              <motion.button
                key={g}
                type="button"
                onClick={() => setGroupMode(g)}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  groupMode === g
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                }`}
              >
                {g === "flat" ? "Flat" : g === "manager" ? "By Manager" : "By Dept"}
              </motion.button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
            {(["recent", "name"] as SortMode[]).map((s) => (
              <motion.button
                key={s}
                type="button"
                onClick={() => setSortMode(s)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  sortMode === s
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                }`}
              >
                {s === "recent" ? "Latest" : "A – Z"}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Search + Add row */}
      <div data-tour="employees-search" className="card-static mb-4 flex items-center gap-3 p-4">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees..."
            className="input flex-1"
            style={{ paddingLeft: "40px" }}
          />
        </div>
        {sessionStatus !== "loading" && isSuperAdmin && (
        <motion.button
          type="button"
            onClick={() => router.push("/employees/new")}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="btn btn-primary btn-sm shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Employee
        </motion.button>
        )}
      </div>

      {/* Role filter */}
      <div data-tour="employees-filters" className="mb-4 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          {availableRoles.map((k) => {
            const active = roleFilter === k;
            return (
              <motion.button
                key={k}
                type="button"
                onClick={() => setRoleFilter(k)}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  active
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                }`}
              >
                {ROLE_FILTER_LABELS[k]}
              </motion.button>
            );
          })}
        </div>
        {(search || roleFilter !== "all") && (
          <button type="button" onClick={() => { setSearch(""); setRoleFilter("all"); }} className="text-xs font-medium transition-colors" style={{ color: "var(--primary)" }}>
            Clear
          </button>
        )}
      </div>

      {/* Batch Action Bar */}
      <AnimatePresence>
        {isSuperAdmin && selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="card-static p-3 mb-4 flex items-center gap-2 overflow-hidden"
          >
            <span className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{selected.size} selected</span>
            <div className="flex-1" />
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              onClick={() => setBulkDeleteOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: "color-mix(in srgb, var(--rose) 12%, transparent)", color: "var(--rose)" }}
            >
              Deactivate
            </motion.button>
            <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-medium transition-colors" style={{ color: "var(--fg-secondary)" }}>
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Count + Select all */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-footnote" style={{ color: "var(--fg-secondary)" }}>
          <motion.span key={filtered.length} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
            {filtered.length}
          </motion.span>
          {" "}employee{filtered.length !== 1 ? "s" : ""}
        </p>
        {isSuperAdmin && (
        <button type="button" onClick={toggleSelectAll} className="text-footnote font-medium hover:underline" style={{ color: "var(--primary)" }}>
          {selected.size === filtered.length && filtered.length > 0 ? "Deselect all" : "Select all"}
        </button>
        )}
      </div>

      {/* Employee Card Grid */}
      {(() => {
        function renderCard(emp: Employee, i: number) {
          const p = presenceById.get(emp._id);
          const isSelected = selected.has(emp._id);
          return (
            <motion.div key={emp._id} variants={cardVariants} custom={i} layout layoutId={emp._id} whileHover={cardHover} className="h-full" exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }} transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}>
              <div className={`card group relative flex h-full flex-col overflow-visible transition-opacity duration-300 ${!emp.isActive ? "opacity-50 grayscale" : ""}`}>
                <EmployeeCard
                  embedded
                  idx={i}
                  selectable={isSuperAdmin}
                  selected={isSelected}
                  onSelect={() => toggleSelect(emp._id)}
                  showRoleDepartmentTeams
                  showActions={canManage || isSuperAdmin}
                  onEdit={canManage ? () => router.push(`/employees/${emp.username}/edit`) : undefined}
                  onDelete={isSuperAdmin ? () => setDeleteTarget(emp) : undefined}
                  emp={{
                    _id: emp._id,
                    username: emp.username,
                    firstName: emp.about.firstName,
                    lastName: emp.about.lastName,
                    email: emp.email,
                    designation: DESIGNATION_LABELS[emp.userRole] ?? emp.userRole,
                    department: emp.department?.title,
                    profileImage: emp.about.profileImage,
                    userRole: emp.userRole,
                    teams: emp.teams,
                    isVerified: emp.isVerified,
                    isLive: p?.isLive,
                    status: p?.status,
                    locationFlagged: p?.locationFlagged,
                    firstEntry: p?.firstEntry ?? undefined,
                    lastOfficeExit: p?.lastOfficeExit ?? undefined,
                    lastExit: p?.lastExit ?? undefined,
                    todayMinutes: p?.todayMinutes,
                    officeMinutes: p?.officeMinutes,
                    remoteMinutes: p?.remoteMinutes,
                    lateBy: p?.lateBy,
                    shiftStart: p?.shiftStart ?? emp.workShift?.shift.start,
                    shiftEnd: p?.shiftEnd ?? emp.workShift?.shift.end,
                    shiftBreakTime: p?.shiftBreakTime ?? emp.workShift?.breakTime,
                    phone: emp.about.phone,
                    shiftSummary: shiftSummaryLine(emp),
                  }}
                  footerSlot={
                    <div className="flex flex-wrap items-center gap-2">
                      {isSuperAdmin && <StatusToggle active={emp.isActive} onChange={() => toggleActive(emp)} />}
                      <span className="text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                        Joined {new Date(emp.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      </span>
                      {isSuperAdmin && emp.isVerified === false && (
                        <>
                          <motion.button type="button" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} disabled={resendingId === emp._id} onClick={() => resendInvite(emp)} className="flex h-7 items-center gap-1 px-2 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-50" style={{ color: "var(--teal)", background: "color-mix(in srgb, var(--teal) 10%, transparent)" }} title="Send invite email">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                            {resendingId === emp._id ? "Sending…" : "Invite"}
                          </motion.button>
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} disabled={copyingId === emp._id} onClick={() => copyInviteLink(emp)} className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors disabled:opacity-50" style={{ color: "var(--fg-secondary)" }} title="Copy invite link">
                            {copyingId === emp._id ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                            )}
                          </motion.button>
                        </>
                      )}
                    </div>
                  }
                />
              </div>
            </motion.div>
          );
        }

        const skeletons = (
          [1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <motion.div key={`skel-${i}`} variants={cardVariants} custom={i} className="h-full">
              <div className="card flex h-full flex-col overflow-hidden">
                <div className="flex-1 p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="shimmer h-7 w-7 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1"><div className="shimmer h-3.5 w-20 rounded" /></div>
                    <div className="shimmer h-4 w-14 shrink-0 rounded-full" />
                  </div>
                  <div className="shimmer mt-1 h-2.5 w-28 rounded" />
                  <div className="mt-1.5 space-y-0.5">
                    <div className="flex items-center justify-between"><div className="shimmer h-2.5 w-8 rounded" /><div className="shimmer h-2.5 w-20 rounded" /></div>
                    <div className="flex items-center justify-between"><div className="shimmer h-2.5 w-16 rounded" /><div className="shimmer h-2.5 w-16 rounded" /></div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t px-2.5 py-1.5" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2"><div className="shimmer h-5 w-10 rounded-full" /><div className="shimmer h-2.5 w-20 rounded" /></div>
                  <div className="flex items-center gap-1"><div className="shimmer h-6 w-6 rounded-lg" /><div className="shimmer h-6 w-6 rounded-lg" /></div>
                </div>
              </div>
            </motion.div>
          ))
        );

        if (employeesLoading && !employees) {
          return <motion.div className="grid gap-3 pt-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4" variants={staggerContainerFast} initial="hidden" animate="visible">{skeletons}</motion.div>;
        }

        if (filtered.length === 0) {
          return (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card p-12 text-center mt-4">
              <p style={{ color: "var(--fg-secondary)" }}>No employees found.</p>
            </motion.div>
          );
        }

        if (grouped) {
          return (
            <div className="space-y-5 pt-4">
              {grouped.map((group) => (
                <motion.div key={group.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{group.label}</h3>
                    <span className="text-caption font-medium px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
                      {group.employees.length}
                    </span>
                  </div>
                  <motion.div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4" variants={staggerContainerFast} initial="hidden" animate="visible">
                    <AnimatePresence mode="popLayout">
                      {group.employees.map((emp, i) => renderCard(emp, i))}
                    </AnimatePresence>
                  </motion.div>
                </motion.div>
              ))}
            </div>
          );
        }

        return (
          <motion.div data-tour="employees-grid" className="grid gap-3 pt-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4" variants={staggerContainerFast} initial="hidden" animate="visible">
            <AnimatePresence mode="popLayout">
              {filtered.map((emp, i) => renderCard(emp, i))}
            </AnimatePresence>
          </motion.div>
        );
      })()}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Deactivate Employee"
        description={`Deactivate "${deleteTarget?.about.firstName} ${deleteTarget?.about.lastName}"? They won't be able to log in.`}
        confirmLabel="Deactivate"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        title="Deactivate Employees"
        description={`Deactivate ${selected.size} employee(s)? They won't be able to log in.`}
        confirmLabel="Deactivate All"
        variant="danger"
        loading={bulkDeleting}
        onConfirm={handleBulkDeactivate}
        onCancel={() => setBulkDeleteOpen(false)}
      />
    </div>
  );
}
