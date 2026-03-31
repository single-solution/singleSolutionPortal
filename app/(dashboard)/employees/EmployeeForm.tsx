"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { PasswordInput } from "@/components/PasswordInput";
import { PasswordStrength } from "@/components/PasswordStrength";
import toast from "react-hot-toast";

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface Department { _id: string; title: string; }
interface TeamOption { _id: string; name: string; department?: { _id: string } | string; }

const ROLES = [
  { value: "manager", label: "Manager" },
  { value: "teamLead", label: "Team Lead" },
  { value: "businessDeveloper", label: "Business Developer" },
  { value: "developer", label: "Developer" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

interface EmployeeFormProps {
  employeeId?: string;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  password: string;
  userRole: string;
  department: string;
  teams: string[];
  shiftType: string;
  shiftStart: string;
  shiftEnd: string;
  workingDays: string[];
  breakTime: number;
}

const INITIAL: FormState = {
  firstName: "", lastName: "", email: "", username: "", password: "",
  userRole: "developer", department: "", teams: [],
  shiftType: "fullTime", shiftStart: "10:00", shiftEnd: "19:00",
  workingDays: ["mon", "tue", "wed", "thu", "fri"],
  breakTime: 60,
};

export default function EmployeeForm({ employeeId }: EmployeeFormProps) {
  const router = useRouter();
  const isEdit = !!employeeId;
  const [form, setForm] = useState<FormState>(INITIAL);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [allTeams, setAllTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [deptRes, teamsRes] = await Promise.all([
      fetch("/api/departments").then((r) => r.ok ? r.json() : []),
      fetch("/api/teams").then((r) => r.ok ? r.json() : []),
    ]);
    setDepartments(Array.isArray(deptRes) ? deptRes : []);
    setAllTeams(Array.isArray(teamsRes) ? teamsRes : []);

    if (employeeId) {
      const empRes = await fetch(`/api/employees/${employeeId}`).then((r) => r.ok ? r.json() : null);
      if (empRes) {
        setForm({
          firstName: empRes.about?.firstName ?? "",
          lastName: empRes.about?.lastName ?? "",
          email: empRes.email ?? "",
          username: empRes.username ?? "",
          password: "",
          userRole: empRes.userRole ?? "developer",
          department: empRes.department?._id ?? "",
          teams: (empRes.teams ?? []).map((t: { _id: string }) => t._id),
          shiftType: empRes.workShift?.type ?? "fullTime",
          shiftStart: empRes.workShift?.shift?.start ?? "10:00",
          shiftEnd: empRes.workShift?.shift?.end ?? "19:00",
          workingDays: empRes.workShift?.workingDays ?? ["mon", "tue", "wed", "thu", "fri"],
          breakTime: empRes.workShift?.breakTime ?? 60,
        });
      }
    }
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  const strength = useMemo(() => {
    if (!form.password) return 0;
    let s = 0;
    if (form.password.length >= 6) s++;
    if (form.password.length >= 10) s++;
    if (/[A-Z]/.test(form.password)) s++;
    if (/[0-9]/.test(form.password)) s++;
    if (/[^A-Za-z0-9]/.test(form.password)) s++;
    return s;
  }, [form.password]);

  void strength;

  const filteredTeams = useMemo(() => {
    if (!form.department) return allTeams;
    return allTeams.filter((t) => {
      const dId = typeof t.department === "object" && t.department ? t.department._id : String(t.department ?? "");
      return dId === form.department;
    });
  }, [allTeams, form.department]);

  function toggleTeam(teamId: string) {
    setForm((f) => ({
      ...f,
      teams: f.teams.includes(teamId) ? f.teams.filter((id) => id !== teamId) : [...f.teams, teamId],
    }));
  }

  function toggleWorkingDay(day: string) {
    setForm((f) => ({
      ...f,
      workingDays: f.workingDays.includes(day) ? f.workingDays.filter((d) => d !== day) : [...f.workingDays, day],
    }));
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

      if (isEdit) {
        const body: Record<string, unknown> = {
          firstName: form.firstName, lastName: form.lastName,
          userRole: form.userRole, department: form.department || null,
          teams: form.teams,
          workShift,
        };
        if (form.password) body.password = form.password;
        const res = await fetch(`/api/employees/${employeeId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.ok) {
          toast.success("Employee updated");
          router.push("/employees");
        } else {
          const data = await res.json();
          toast.error(data.error || "Failed to update");
        }
      } else {
        const res = await fetch("/api/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, teams: form.teams, workShift }),
        });
        if (res.ok) {
          toast.success("Employee created");
          router.push("/employees");
        } else {
          const data = await res.json();
          toast.error(data.error || "Failed to create");
        }
      }
    } catch {
      toast.error("Something went wrong");
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="shimmer h-11 w-11 rounded-xl" />
          <div className="space-y-2"><div className="shimmer h-5 w-48 rounded" /><div className="shimmer h-3 w-64 rounded" /></div>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="card-xl p-6 space-y-4"><div className="shimmer h-4 w-1/3 rounded" /><div className="shimmer h-10 rounded" /><div className="shimmer h-10 rounded" /><div className="shimmer h-10 rounded" /></div>
          <div className="card-xl p-6 space-y-4"><div className="shimmer h-4 w-1/3 rounded" /><div className="shimmer h-10 rounded" /><div className="shimmer h-10 rounded" /></div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Page header */}
      <motion.div
        className="flex items-center gap-3 mb-5"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease }}
      >
        <button
          type="button"
          onClick={() => router.push("/employees")}
          className="page-icon bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-blue-500/20 hover:scale-105 transition-transform"
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-title">{isEdit ? "Edit Employee" : "Create Employee"}</h1>
          <p className="text-subhead hidden sm:block">{isEdit ? "Update employee details and shift configuration." : "Add a new team member to the organization."}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => router.push("/employees")} className="btn btn-secondary hidden sm:inline-flex">Cancel</button>
          <motion.button type="submit" disabled={saving} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary">
            {saving ? "Saving..." : isEdit ? "Update" : "Create"}
          </motion.button>
        </div>
      </motion.div>

      {/* Top row grid: Personal Info + Role & Department */}
      <motion.div
        className="grid grid-cols-1 gap-5 lg:grid-cols-2 mb-5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05, ease }}
      >
        {/* Personal Information card */}
        <motion.div
          className="card-xl card-shine p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--fg)" }}>Personal Information</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">First Name</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></span>
                  <input className="input" style={{ paddingLeft: "40px" }} placeholder="Ali" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Last Name</label>
                <input className="input" placeholder="Ahmed" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
            </div>

            {!isEdit && (
              <>
                <div>
                  <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Email</label>
                  <div className="relative">
                    <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                    <input className="input" type="email" required placeholder="ali@singlesolution.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ paddingLeft: "40px" }} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Username</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg></span>
                    <input className="input" style={{ paddingLeft: "40px" }} placeholder="ali" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">{isEdit ? "New Password (optional)" : "Password"}</label>
              <PasswordInput
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!isEdit}
                placeholder={isEdit ? "Leave blank to keep current" : "Set initial password"}
              />
              <PasswordStrength password={form.password} />
            </div>
          </div>
        </motion.div>

        {/* Role & Department card */}
        <motion.div
          className="card-xl card-shine p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15, ease }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--fg)" }}>Role & Department</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Designation</label>
                <select className="input" value={form.userRole} onChange={(e) => setForm({ ...form, userRole: e.target.value })}>
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Department</label>
                <select className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                  <option value="">No Department</option>
                  {departments.map((d) => <option key={d._id} value={d._id}>{d.title}</option>)}
                </select>
              </div>
            </div>

            <AnimatePresence>
              {filteredTeams.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease }}
                >
                  <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Teams</label>
                  <div className="flex flex-wrap gap-2">
                    {filteredTeams.map((t) => {
                      const active = form.teams.includes(t._id);
                      return (
                        <motion.button
                          key={t._id}
                          type="button"
                          onClick={() => toggleTeam(t._id)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.92 }}
                          transition={{ type: "spring", stiffness: 400, damping: 17 }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            active
                              ? "bg-[var(--teal)] text-white shadow-sm"
                              : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                          }`}
                          style={!active ? { background: "var(--glass-bg)" } : undefined}
                        >
                          {t.name}
                        </motion.button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: "var(--fg-tertiary)" }}>
                    Select one or more teams. Employees can belong to multiple teams.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>

      {/* Bottom row: Shift Configuration (full width with internal grid) */}
      <motion.div
        className="card-xl card-shine p-6 mb-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.2, ease }}
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--fg)" }}>Shift Configuration</h2>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Shift Type</label>
              <select className="input" value={form.shiftType} onChange={(e) => setForm({ ...form, shiftType: e.target.value })}>
                <option value="fullTime">Full Time</option>
                <option value="partTime">Part Time</option>
                <option value="contract">Contract</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Start Time</label>
                <input className="input" type="time" value={form.shiftStart} onChange={(e) => setForm({ ...form, shiftStart: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">End Time</label>
                <input className="input" type="time" value={form.shiftEnd} onChange={(e) => setForm({ ...form, shiftEnd: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Break Time (min)</label>
              <input className="input" type="number" value={form.breakTime} onChange={(e) => setForm({ ...form, breakTime: Number(e.target.value) })} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Working Days</label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day, idx) => {
                const key = WEEKDAY_KEYS[idx];
                const active = form.workingDays.includes(key);
                return (
                  <motion.button
                    key={day}
                    type="button"
                    onClick={() => toggleWorkingDay(key)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.92 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      active
                        ? "bg-[var(--primary)] text-white shadow-sm"
                        : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                    }`}
                    style={!active ? { background: "var(--glass-bg)" } : undefined}
                  >
                    {day}
                  </motion.button>
                );
              })}
            </div>
            <p className="text-[11px] mt-2" style={{ color: "var(--fg-tertiary)" }}>
              Toggle to select which days this employee works.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Mobile-only action row */}
      <div className="flex gap-3 sm:hidden">
        <motion.button type="submit" disabled={saving} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary flex-1">
          {saving ? "Saving..." : isEdit ? "Update Employee" : "Create Employee"}
        </motion.button>
        <button type="button" onClick={() => router.push("/employees")} className="btn btn-secondary flex-1">Cancel</button>
      </div>
    </form>
  );
}
