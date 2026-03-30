"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StatusToggle } from "../components/DataTable";
import SidebarModal from "../components/SidebarModal";
import { buttonHover } from "@/lib/motion";

interface Employee {
  _id: string;
  email: string;
  username: string;
  about: { firstName: string; lastName: string; phone?: string };
  userRole: string;
  department?: { _id: string; title: string };
  isActive: boolean;
  workShift?: {
    type: string;
    shift: { start: string; end: string };
    workingDays: string[];
    breakTime: number;
  };
  createdAt: string;
}

interface Department { _id: string; title: string; }

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

const ROLES = [
  { value: "manager", label: "Manager" },
  { value: "businessDeveloper", label: "Business Developer" },
  { value: "developer", label: "Developer" },
];

const DESIGNATION_LABELS: Record<string, string> = {
  superadmin: "System Administrator",
  manager: "Team Manager",
  businessDeveloper: "Business Developer",
  developer: "Software Developer",
};

type RoleFilter = "all" | "manager" | "businessDeveloper" | "developer";
const ROLE_FILTER_LABELS: Record<RoleFilter, string> = {
  all: "All",
  manager: "Managers",
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

function getPasswordStrength(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

function strengthColor(s: number) {
  if (s <= 1) return "var(--rose)";
  if (s <= 2) return "var(--amber)";
  if (s <= 3) return "var(--amber)";
  return "var(--green)";
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [presenceMap, setPresenceMap] = useState<Map<string, PresenceStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", username: "", password: "",
    userRole: "developer", department: "",
    shiftType: "fullTime", shiftStart: "10:00", shiftEnd: "19:00",
    workingDays: ["mon", "tue", "wed", "thu", "fri"] as string[],
    breakTime: 60,
  });

  const strength = useMemo(() => getPasswordStrength(form.password), [form.password]);

  const load = useCallback(async () => {
    const [empRes, deptRes, presRes] = await Promise.all([
      fetch("/api/employees").then((r) => r.ok ? r.json() : []),
      fetch("/api/departments").then((r) => r.ok ? r.json() : []),
      fetch("/api/attendance/presence").then((r) => r.ok ? r.json() : []),
    ]);
    setEmployees(Array.isArray(empRes) ? empRes : []);
    setDepartments(Array.isArray(deptRes) ? deptRes : []);
    if (Array.isArray(presRes)) {
      const map = new Map<string, PresenceStatus>();
      for (const p of presRes as Array<{ _id: string; status: string }>) {
        map.set(p._id, p.status as PresenceStatus);
      }
      setPresenceMap(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = employees;
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
  }, [employees, roleFilter, search, sortMode]);

  function toggleSelect(id: string) {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map((e) => e._id)));
  }

  function openCreate() {
    setEditing(null);
    setForm({
      firstName: "", lastName: "", email: "", username: "", password: "",
      userRole: "developer", department: "",
      shiftType: "fullTime", shiftStart: "10:00", shiftEnd: "19:00",
      workingDays: ["mon", "tue", "wed", "thu", "fri"],
      breakTime: 60,
    });
    setShowPw(false);
    setSidebarOpen(true);
  }

  function openEdit(emp: Employee) {
    setEditing(emp);
    setForm({
      firstName: emp.about.firstName,
      lastName: emp.about.lastName,
      email: emp.email,
      username: emp.username,
      password: "",
      userRole: emp.userRole,
      department: emp.department?._id ?? "",
      shiftType: emp.workShift?.type ?? "fullTime",
      shiftStart: emp.workShift?.shift?.start ?? "10:00",
      shiftEnd: emp.workShift?.shift?.end ?? "19:00",
      workingDays: emp.workShift?.workingDays ?? ["mon", "tue", "wed", "thu", "fri"],
      breakTime: emp.workShift?.breakTime ?? 60,
    });
    setShowPw(false);
    setSidebarOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const workShift = {
        type: form.shiftType,
        shift: { start: form.shiftStart, end: form.shiftEnd },
        workingDays: form.workingDays,
        breakTime: form.breakTime,
      };
      if (editing) {
        const body: Record<string, unknown> = {
          firstName: form.firstName, lastName: form.lastName,
          userRole: form.userRole, department: form.department || null,
          workShift,
        };
        if (form.password) body.password = form.password;
        await fetch(`/api/employees/${editing._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        await fetch("/api/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, workShift }),
        });
      }
      setSidebarOpen(false);
      await load();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Deactivate this employee?")) return;
    await fetch(`/api/employees/${id}`, { method: "DELETE" });
    await load();
  }

  async function handleBulkDeactivate() {
    if (!confirm(`Deactivate ${selected.size} employee(s)?`)) return;
    await Promise.all([...selected].map((id) => fetch(`/api/employees/${id}`, { method: "DELETE" })));
    setSelected(new Set());
    await load();
  }

  async function toggleActive(emp: Employee) {
    await fetch(`/api/employees/${emp._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !emp.isActive }),
    });
    await load();
  }

  function toggleWorkingDay(day: string) {
    setForm((f) => ({
      ...f,
      workingDays: f.workingDays.includes(day) ? f.workingDays.filter((d) => d !== day) : [...f.workingDays, day],
    }));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="space-y-2 flex-1"><div className="shimmer h-5 w-1/4 rounded" /><div className="shimmer h-8 w-1/3 rounded" /></div>
          <div className="shimmer h-9 w-32 rounded-full" />
        </div>
        <div className="shimmer h-14 rounded-2xl" />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
          {[1,2,3,4,5,6].map(i => <div key={i} className="shimmer h-44 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {/* ── Header: title left, sort right ── */}
      <motion.div
        className="flex items-center justify-between gap-3 mb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="text-title">Employees</h1>
          <p className="text-subhead hidden sm:block">{employees.length} team member{employees.length !== 1 ? "s" : ""}</p>
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

      {/* ── Search + Add row ── */}
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
        <motion.button type="button" onClick={openCreate} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Employee
        </motion.button>
      </motion.div>

      {/* ── Role filter ── */}
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

      {/* ── Batch Action Bar ── */}
      <AnimatePresence>
        {selected.size > 0 && (
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
              onClick={handleBulkDeactivate}
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

      {/* ── Count + Select all ── */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-footnote" style={{ color: "var(--fg-secondary)" }}>{filtered.length} employee{filtered.length !== 1 ? "s" : ""}</p>
        <button type="button" onClick={toggleSelectAll} className="text-footnote font-medium hover:underline" style={{ color: "var(--primary)" }}>
          {selected.size === filtered.length && filtered.length > 0 ? "Deselect all" : "Select all"}
        </button>
      </div>

      {/* ── Employee Card Grid ── */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full card p-12 text-center">
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
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <div className="card group relative overflow-hidden">
                    {/* Selection checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(emp._id)}
                      className="absolute top-3 left-3 z-10 w-4 h-4 rounded accent-[var(--primary)] opacity-0 group-hover:opacity-100 checked:opacity-100 transition-opacity"
                    />

                    <div className="p-3 sm:p-4 pb-2 sm:pb-3">
                      {/* Top row: avatar + info */}
                      <div className="flex items-start gap-3">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white ${grad}`}>
                          {initials(emp.about.firstName, emp.about.lastName)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate" style={{ color: "var(--fg)" }}>{emp.about.firstName} {emp.about.lastName}</p>
                          <p className="text-caption truncate">{emp.email}</p>
                        </div>
                        {/* Status dot */}
                        <span className="relative flex h-2.5 w-2.5 shrink-0 mt-1.5">
                          <span className="absolute inline-flex h-full w-full rounded-full opacity-40" style={{ background: STATUS_COLORS[status], animation: status !== "absent" ? "ping 1.5s cubic-bezier(0,0,0.2,1) infinite" : "none" }} />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[status] }} />
                        </span>
                      </div>

                      {/* Details rows */}
                      <div className="mt-3 space-y-1.5 text-[13px]">
                        <div className="flex items-center justify-between">
                          <span style={{ color: "var(--fg-tertiary)" }}>Role</span>
                          <span className="font-medium" style={{ color: "var(--fg)" }}>{DESIGNATION_LABELS[emp.userRole] ?? emp.userRole}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span style={{ color: "var(--fg-tertiary)" }}>Department</span>
                          <span className="font-medium" style={{ color: "var(--fg)" }}>{emp.department?.title ?? "—"}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span style={{ color: "var(--fg-tertiary)" }}>Status</span>
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${STATUS_COLORS[status]} 15%, transparent)`, color: STATUS_COLORS[status] }}>
                            {STATUS_LABELS[status]}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Footer: toggle + actions */}
                    <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-t" style={{ borderColor: "var(--border)" }}>
                      <StatusToggle active={emp.isActive} onChange={() => toggleActive(emp)} />
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openEdit(emp)} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--primary)" }} title="Edit">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </motion.button>
                        <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleDelete(emp._id)} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--rose)" }} title="Delete">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* ── Sidebar Modal ── */}
      <SidebarModal
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        title={editing ? "Edit Employee" : "Create Employee"}
        subtitle={editing ? editing.email : "Create a new employee account."}
      >
        <form id="emp-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1">First Name</label>
              <input className="input" placeholder="Ali" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1">Last Name</label>
              <input className="input" placeholder="Ahmed" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>

          {!editing && (
            <div>
              <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1">Email</label>
              <input className="input" type="email" required placeholder="ali@singlesolution.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          )}

          {!editing && (
            <div>
              <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1">Username</label>
              <input className="input" placeholder="ali" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
          )}

          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1">{editing ? "New Password (optional)" : "Password"}</label>
            <div className="relative">
              <input className="input pr-12" type={showPw ? "text" : "password"} required={!editing} placeholder={editing ? "Leave blank to keep current" : "Set initial password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--fg-secondary)" }} onClick={() => setShowPw(!showPw)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  {showPw ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" /><line x1="1" y1="1" x2="23" y2="23" /></> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
                </svg>
              </button>
            </div>
            {form.password && (
              <div className="mt-1.5 flex gap-1">
                {[0, 1, 2, 3, 4].map((j) => (
                  <motion.div key={j} className="h-1 flex-1 rounded-full" animate={{ backgroundColor: j < strength ? strengthColor(strength) : "var(--border)", opacity: j < strength ? 1 : 0.45 }} transition={{ type: "spring", stiffness: 380, damping: 28 }} />
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1">Designation</label>
            <select className="input" value={form.userRole} onChange={(e) => setForm({ ...form, userRole: e.target.value })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1">Department</label>
            <select className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
              <option value="">No Department</option>
              {departments.map((d) => <option key={d._id} value={d._id}>{d.title}</option>)}
            </select>
          </div>

          <hr className="divider" />
          <p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>Shift Configuration</p>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1">Shift Type</label>
            <select className="input" value={form.shiftType} onChange={(e) => setForm({ ...form, shiftType: e.target.value })}>
              <option value="fullTime">Full Time</option>
              <option value="partTime">Part Time</option>
              <option value="contract">Contract</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1">Start Time</label>
              <input className="input" type="time" value={form.shiftStart} onChange={(e) => setForm({ ...form, shiftStart: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1">End Time</label>
              <input className="input" type="time" value={form.shiftEnd} onChange={(e) => setForm({ ...form, shiftEnd: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-2">Working Days</label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day, idx) => {
                const key = WEEKDAY_KEYS[idx];
                const active = form.workingDays.includes(key);
                return (
                  <label key={day} className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-caption font-medium" style={{ background: active ? "var(--primary-light)" : "var(--glass-bg)", color: active ? "var(--primary)" : "var(--fg-secondary)" }}>
                    <input type="checkbox" checked={active} onChange={() => toggleWorkingDay(key)} className="accent-[var(--primary)]" />
                    {day}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1">Break Time (min)</label>
            <input className="input" type="number" value={form.breakTime} onChange={(e) => setForm({ ...form, breakTime: Number(e.target.value) })} />
          </div>

          <motion.button type="submit" disabled={saving} className="btn btn-primary w-full" whileHover={buttonHover} whileTap={{ scale: 0.97 }}>
            {saving ? "Saving..." : editing ? "Update Employee" : "Create Employee"}
          </motion.button>
        </form>
      </SidebarModal>
    </div>
  );
}
