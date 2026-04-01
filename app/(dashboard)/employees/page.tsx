"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { contentReveal, staggerContainerFast, cardVariants, cardHover } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { StatusToggle } from "../components/DataTable";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";

interface Employee {
  _id: string;
  email: string;
  username: string;
  about: { firstName: string; lastName: string; phone?: string; profileImage?: string };
  userRole: string;
  department?: { _id: string; title: string };
  teams?: { _id: string; name: string }[];
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

const AVATAR_GRADIENTS = [
  "from-blue-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-purple-500 to-pink-400",
  "from-amber-500 to-orange-400",
  "from-rose-500 to-red-400",
  "from-indigo-500 to-blue-400",
  "from-green-500 to-lime-400",
  "from-fuchsia-500 to-purple-400",
];

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

type PresenceStatus = "office" | "remote" | "late" | "overtime" | "absent";
const STATUS_COLORS: Record<PresenceStatus, string> = { office: "#10b981", remote: "#007aff", late: "#f59e0b", overtime: "#8b5cf6", absent: "#f43f5e" };
const STATUS_LABELS: Record<PresenceStatus, string> = { office: "In Office", remote: "Remote", late: "Late", overtime: "Overtime", absent: "Absent" };

type SortMode = "recent" | "name";

function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
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

export default function EmployeesPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isSuperAdmin = role === "superadmin";
  const isManager = role === "manager";
  const canManage = isSuperAdmin || isManager;
  const { data: employees, refetch: refetchEmployees } = useQuery<Employee[]>("/api/employees", "employees");
  const { data: presenceData } = useQuery<Array<{ _id: string; status: string }>>("/api/attendance/presence", "presence");

  const presenceMap = useMemo(() => {
    const map = new Map<string, PresenceStatus>();
    if (presenceData) for (const p of presenceData) map.set(p._id, p.status as PresenceStatus);
    return map;
  }, [presenceData]);

  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const empList = employees ?? [];

  const filtered = useMemo(() => {
    let list = empList;
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
  }, [empList, roleFilter, search, sortMode]);

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
    await fetch(`/api/employees/${emp._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !emp.isActive }),
    });
    await refetchEmployees();
  }

  return (
    <motion.div
      className="flex flex-col gap-0"
      variants={contentReveal}
      initial="hidden"
      animate="visible"
    >
      {/* Header: title left, sort right */}
      <motion.div
        className="flex items-center justify-between gap-3 mb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="text-title">Employees</h1>
          <p className="text-subhead hidden sm:block">{empList.length} team member{empList.length !== 1 ? "s" : ""}</p>
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
      </motion.div>

      {/* Search + Add row */}
      <motion.div
        className="card-static p-4 mb-4 flex gap-3 items-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
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
        {isSuperAdmin && (
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
      </motion.div>

      {/* Role filter */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          {(Object.keys(ROLE_FILTER_LABELS) as RoleFilter[]).map((k) => {
            const active = roleFilter === k;
            return (
              <motion.button
                key={k}
                type="button"
                onClick={() => setRoleFilter(k)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
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
      <motion.div
        className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        variants={staggerContainerFast}
        initial="hidden"
        animate="visible"
      >
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="col-span-full card p-12 text-center">
              <p style={{ color: "var(--fg-secondary)" }}>No employees found.</p>
            </motion.div>
          ) : (
            filtered.map((emp, i) => {
              const status = presenceMap.get(emp._id) ?? "absent";
              const grad = AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length];
              const isSelected = selected.has(emp._id);
              return (
                <motion.div
                  key={emp._id}
                  variants={cardVariants}
                  custom={i}
                  whileHover={cardHover}
                  layout
                  className="h-full"
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <div className="card group relative overflow-hidden flex h-full flex-col">
                    {isSuperAdmin && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(emp._id)}
                      className="absolute top-3 left-3 z-10 w-4 h-4 rounded accent-[var(--primary)] opacity-0 group-hover:opacity-100 checked:opacity-100 transition-opacity"
                    />
                    )}

                    <div className="flex-1 p-3 sm:p-4 pb-2 sm:pb-3">
                      <div className="flex items-start gap-3">
                        {emp.about.profileImage ? (
                          <img src={emp.about.profileImage} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                        ) : (
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white ${grad}`}>
                          {initials(emp.about.firstName, emp.about.lastName)}
                        </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                          <p className="font-semibold truncate" style={{ color: "var(--fg)" }}>{emp.about.firstName} {emp.about.lastName}</p>
                            {emp.isVerified === false && (
                              <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: "color-mix(in srgb, var(--amber) 15%, transparent)", color: "var(--amber)" }}>Pending</span>
                            )}
                          </div>
                          <p className="text-caption truncate">{emp.email}</p>
                        </div>
                        <span className="relative flex h-2.5 w-2.5 shrink-0 mt-1.5">
                          <span className="absolute inline-flex h-full w-full rounded-full opacity-40" style={{ background: STATUS_COLORS[status], animation: status !== "absent" ? "ping 1.5s cubic-bezier(0,0,0.2,1) infinite" : "none" }} />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[status] }} />
                        </span>
                      </div>

                      <div className="mt-3 space-y-1.5 text-[13px]">
                        <div className="flex items-center justify-between">
                          <span style={{ color: "var(--fg-tertiary)" }}>Role</span>
                          <span className="font-medium" style={{ color: "var(--fg)" }}>{DESIGNATION_LABELS[emp.userRole] ?? emp.userRole}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span style={{ color: "var(--fg-tertiary)" }}>Department</span>
                          <span className="font-medium" style={{ color: "var(--fg)" }}>{emp.department?.title ?? "—"}</span>
                        </div>
                        {emp.teams && emp.teams.length > 0 && (
                          <div className="flex items-center justify-between">
                            <span style={{ color: "var(--fg-tertiary)" }}>Teams</span>
                            <div className="flex flex-wrap gap-1 justify-end">
                              {emp.teams.map((t) => (
                                <span key={t._id} className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "color-mix(in srgb, var(--teal) 12%, transparent)", color: "var(--teal)" }}>
                                  {t.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {emp.workShift && (
                          <>
                            <div className="flex items-center justify-between">
                              <span style={{ color: "var(--fg-tertiary)" }}>Shift</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-medium" style={{ color: "var(--fg-secondary)" }}>{SHIFT_TYPE_LABELS[emp.workShift.type] ?? emp.workShift.type}</span>
                                <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--primary)" }}>
                                  {emp.workShift.shift.start} – {emp.workShift.shift.end}
                                </span>
                              </div>
                            </div>
                            {emp.workShift.workingDays?.length > 0 && (
                              <div className="flex items-center justify-between">
                                <span style={{ color: "var(--fg-tertiary)" }}>Days</span>
                                <span className="text-[11px] font-medium" style={{ color: "var(--fg-secondary)" }}>
                                  {formatWorkingDays(emp.workShift.workingDays)}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                        {emp.about.phone && (
                          <div className="flex items-center justify-between">
                            <span style={{ color: "var(--fg-tertiary)" }}>Phone</span>
                            <span className="font-medium" style={{ color: "var(--fg)" }}>{emp.about.phone}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span style={{ color: "var(--fg-tertiary)" }}>Status</span>
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${STATUS_COLORS[status]} 15%, transparent)`, color: STATUS_COLORS[status] }}>
                            {STATUS_LABELS[status]}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-t" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center gap-2">
                        {isSuperAdmin && <StatusToggle active={emp.isActive} onChange={() => toggleActive(emp)} />}
                        <span className="text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                          Joined {new Date(emp.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        {isSuperAdmin && emp.isVerified === false && (
                          <>
                            <motion.button
                              type="button"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.92 }}
                              disabled={resendingId === emp._id}
                              onClick={() => resendInvite(emp)}
                              className="flex h-7 items-center gap-1 px-2 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-50"
                              style={{ color: "var(--teal)", background: "color-mix(in srgb, var(--teal) 10%, transparent)" }}
                              title="Send invite email"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                              {resendingId === emp._id ? "Sending…" : "Invite"}
                            </motion.button>
                            <motion.button
                              type="button"
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              disabled={copyingId === emp._id}
                              onClick={() => copyInviteLink(emp)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-50"
                              style={{ color: "var(--fg-secondary)" }}
                              title="Copy invite link"
                            >
                              {copyingId === emp._id ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                              )}
                            </motion.button>
                          </>
                        )}
                        {canManage && (
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => router.push(`/employees/${emp._id}/edit`)} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--primary)" }} title="Edit">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </motion.button>
                        )}
                        {isSuperAdmin && (
                        <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setDeleteTarget(emp)} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--rose)" }} title="Delete">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                        </motion.button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </motion.div>

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
    </motion.div>
  );
}
