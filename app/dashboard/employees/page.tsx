"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import DataTable, { StatusToggle, type Column } from "../components/DataTable";
import SidebarModal from "../components/SidebarModal";
import { buttonHover, slideUpItem, staggerContainer } from "@/lib/motion";

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
  all: "All Employees",
  manager: "Managers",
  businessDeveloper: "Business Developers",
  developer: "Developers",
};

type PresenceStatus = "office" | "remote" | "late" | "overtime" | "absent";
const STATUS_COLORS: Record<PresenceStatus, string> = { office: "#10b981", remote: "#007aff", late: "#f59e0b", overtime: "#8b5cf6", absent: "#f43f5e" };
const STATUS_LABELS: Record<PresenceStatus, string> = { office: "In Office", remote: "Remote", late: "Late", overtime: "Overtime", absent: "Absent" };
const STATUS_BADGE_CLASS: Record<PresenceStatus, string> = { office: "badge-office", remote: "badge-remote", late: "badge-late", overtime: "badge-overtime", absent: "badge-absent" };

// Presence data is fetched from API in the component

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

  const filtered = useMemo(() => {
    if (roleFilter === "all") return employees;
    return employees.filter((e) => e.userRole === roleFilter);
  }, [employees, roleFilter]);

  const columns: Column<Employee>[] = [
    {
      key: "name", label: "Name", sortable: true,
      render: (emp, idx) => (
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-bold text-white ${AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length]}`}>
            {initials(emp.about.firstName, emp.about.lastName)}
          </div>
          <div className="min-w-0">
            <div className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{emp.about.firstName} {emp.about.lastName}</div>
            <div className="text-caption line-clamp-1">{emp.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "designation", label: "Designation", sortable: true,
      render: (emp) => <span className="text-subhead">{DESIGNATION_LABELS[emp.userRole] ?? emp.userRole}</span>,
    },
    {
      key: "department", label: "Department", sortable: true,
      render: (emp) => <span className="text-subhead">{emp.department?.title ?? "—"}</span>,
    },
    {
      key: "status", label: "Status",
      render: (emp) => {
        const status = presenceMap.get(emp._id) ?? "absent";
        return <span className={`badge ${STATUS_BADGE_CLASS[status]}`}>{STATUS_LABELS[status]}</span>;
      },
    },
    {
      key: "active", label: "Active",
      render: (emp) => <StatusToggle active={emp.isActive} onChange={() => toggleActive(emp)} />,
    },
    {
      key: "actions", label: "Actions",
      render: (emp) => (
        <div className="flex items-center gap-1">
          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openEdit(emp)} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--primary)" }} title="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          </motion.button>
          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleDelete(emp._id)} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--rose)" }} title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
          </motion.button>
        </div>
      ),
    },
  ];

  return (
    <motion.div className="flex flex-col gap-4" variants={staggerContainer} initial="hidden" animate="visible">
      <motion.div className="flex items-start justify-between gap-3" variants={slideUpItem}>
        <div>
          <h1 className="text-title"><span className="gradient-text">Employees</span></h1>
          <p className="text-subhead mt-1">{filtered.length} employee{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <motion.button type="button" whileHover={buttonHover} onClick={openCreate} className="btn btn-primary btn-sm shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Employee
        </motion.button>
      </motion.div>

      <motion.div variants={slideUpItem}>
        <DataTable
          columns={columns}
          data={filtered}
          loading={loading}
          searchPlaceholder="Search employees..."
          searchKey={(e) => `${e.about.firstName} ${e.about.lastName} ${e.email} ${e.username}`}
          rowKey={(e) => e._id}
          filterSlot={
            <div className="flex items-center gap-0.5 rounded-xl border-[0.5px] p-0.5" style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)" }}>
              {(Object.keys(ROLE_FILTER_LABELS) as RoleFilter[]).map((k) => {
                const active = roleFilter === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setRoleFilter(k)}
                    className={`px-2.5 py-1 rounded-[10px] text-xs font-medium transition-colors ${
                      active
                        ? "bg-[var(--primary)] text-white shadow-sm"
                        : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                    }`}
                  >
                    {ROLE_FILTER_LABELS[k]}
                  </button>
                );
              })}
            </div>
          }
        />
      </motion.div>

      <SidebarModal
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        title={editing ? "Edit Employee" : "Create Employee"}
        subtitle={editing ? editing.email : "Create a new employee account."}
      >
        <form id="emp-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Names */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>First Name</label>
              <input className="input" placeholder="Ali" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Last Name</label>
              <input className="input" placeholder="Ahmed" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>

          {/* Email */}
          {!editing && (
            <div>
              <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Email</label>
              <input className="input" type="email" required placeholder="ali@singlesolution.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          )}

          {/* Username with tooltip */}
          {!editing && (
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <label className="text-caption block font-semibold" style={{ color: "var(--fg)" }}>Username</label>
                <div className="group relative">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="cursor-help"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                  <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-48 rounded-xl p-3 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100" style={{ background: "var(--bg-solid)", border: "1px solid var(--border)" }}>
                    <p className="text-caption font-semibold" style={{ color: "var(--fg)" }}>Username rules:</p>
                    <ul className="mt-1 space-y-0.5 text-caption" style={{ color: "var(--fg-secondary)" }}>
                      <li>3-20 characters</li><li>Lowercase letters, numbers</li><li>No spaces or special chars</li>
                    </ul>
                  </div>
                </div>
              </div>
              <input className="input" placeholder="ali" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
          )}

          {/* Password with tooltip, visibility toggle, strength bars */}
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <label className="text-caption block font-semibold" style={{ color: "var(--fg)" }}>{editing ? "New Password (optional)" : "Password"}</label>
              {!editing && (
                <div className="group relative">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="cursor-help"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                  <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-52 rounded-xl p-3 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100" style={{ background: "var(--bg-solid)", border: "1px solid var(--border)" }}>
                    <p className="text-caption font-semibold" style={{ color: "var(--fg)" }}>Password rules:</p>
                    <ul className="mt-1 space-y-0.5 text-caption" style={{ color: "var(--fg-secondary)" }}>
                      <li>Minimum 8 characters</li><li>One uppercase letter</li><li>One lowercase letter</li><li>One number</li><li>One special character</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
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
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.div key={i} className="h-1 flex-1 rounded-full" animate={{ backgroundColor: i < strength ? strengthColor(strength) : "var(--border)", opacity: i < strength ? 1 : 0.45 }} transition={{ type: "spring", stiffness: 380, damping: 28 }} />
                ))}
              </div>
            )}
          </div>

          {/* Designation (Role) */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Designation</label>
            <select className="input" value={form.userRole} onChange={(e) => setForm({ ...form, userRole: e.target.value })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {/* Department */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Department</label>
            <select className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
              <option value="">No Department</option>
              {departments.map((d) => <option key={d._id} value={d._id}>{d.title}</option>)}
            </select>
          </div>

          {/* Shift Configuration */}
          <hr className="divider" />
          <p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>Shift Configuration</p>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Shift Type</label>
            <select className="input" value={form.shiftType} onChange={(e) => setForm({ ...form, shiftType: e.target.value })}>
              <option value="fullTime">Full Time</option>
              <option value="partTime">Part Time</option>
              <option value="contract">Contract</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Start Time</label>
              <input className="input" type="time" value={form.shiftStart} onChange={(e) => setForm({ ...form, shiftStart: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>End Time</label>
              <input className="input" type="time" value={form.shiftEnd} onChange={(e) => setForm({ ...form, shiftEnd: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="text-caption mb-2 block font-semibold" style={{ color: "var(--fg)" }}>Working Days</label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day, i) => {
                const key = WEEKDAY_KEYS[i];
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
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Break Time (min)</label>
            <input className="input" type="number" value={form.breakTime} onChange={(e) => setForm({ ...form, breakTime: Number(e.target.value) })} />
          </div>

          <motion.button type="submit" disabled={saving} className="btn btn-primary w-full" whileHover={buttonHover} whileTap={{ scale: 0.97 }}>
            {saving ? "Saving..." : editing ? "Update Employee" : "Create Employee"}
          </motion.button>
        </form>
      </SidebarModal>
    </motion.div>
  );
}
