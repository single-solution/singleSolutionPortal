"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { PasswordInput } from "@/components/PasswordInput";
import { PasswordStrength } from "@/components/PasswordStrength";
import toast from "react-hot-toast";

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface Department { _id: string; title: string; manager?: string | { _id: string }; }
interface TeamOption { _id: string; name: string; department?: { _id: string } | string; }
interface SupervisorOption { _id: string; fullName: string; userRole: string; departmentId: string; }

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
  fullName: string;
  email: string;
  password: string;
  userRole: string;
  department: string;
  reportsTo: string;
  teams: string[];
  managedDepartments: string[];
  shiftType: string;
  shiftStart: string;
  shiftEnd: string;
  workingDays: string[];
  breakTime: number;
}

const INITIAL: FormState = {
  fullName: "", email: "", password: "",
  userRole: "developer", department: "", reportsTo: "", teams: [],
  managedDepartments: [],
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
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isLeadOrManager = form.userRole === "manager" || form.userRole === "teamLead";

  const derivedUsername = useMemo(() => {
    if (!form.email) return "";
    return form.email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9._-]/g, "") ?? "";
  }, [form.email]);

  const load = useCallback(async () => {
    const [deptRes, teamsRes, empListRes] = await Promise.all([
      fetch("/api/departments").then((r) => r.ok ? r.json() : []),
      fetch("/api/teams").then((r) => r.ok ? r.json() : []),
      fetch("/api/employees").then((r) => r.ok ? r.json() : []),
    ]);
    setDepartments(Array.isArray(deptRes) ? deptRes : []);
    setAllTeams(Array.isArray(teamsRes) ? teamsRes : []);

    const empList: Array<{ _id: string; about: { firstName: string; lastName: string }; userRole: string; department?: { _id: string } | string }> = Array.isArray(empListRes) ? empListRes : [];
    setSupervisors(
      empList
        .filter((e) => e.userRole === "manager" || e.userRole === "teamLead")
        .map((e) => ({
          _id: e._id,
          fullName: `${e.about.firstName} ${e.about.lastName}`.trim(),
          userRole: e.userRole,
          departmentId: typeof e.department === "object" && e.department ? e.department._id : String(e.department ?? ""),
        })),
    );

    if (employeeId) {
      const empRes = await fetch(`/api/employees/${employeeId}`).then((r) => r.ok ? r.json() : null);
      if (empRes) {
        const fn = empRes.about?.firstName ?? "";
        const ln = empRes.about?.lastName ?? "";
        const depts = Array.isArray(deptRes) ? deptRes : [];
        const managed = depts
          .filter((d: Department) => {
            const mId = typeof d.manager === "object" && d.manager ? d.manager._id : d.manager;
            return mId === employeeId;
          })
          .map((d: Department) => d._id);
        setForm({
          fullName: ln ? `${fn} ${ln}` : fn,
          email: empRes.email ?? "",
          password: "",
          userRole: empRes.userRole ?? "developer",
          department: empRes.department?._id ?? "",
          reportsTo: empRes.reportsTo?._id ?? "",
          teams: (empRes.teams ?? []).map((t: { _id: string }) => t._id),
          managedDepartments: managed,
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

  const filteredTeams = useMemo(() => {
    if (!form.department) return allTeams;
    return allTeams.filter((t) => {
      const dId = typeof t.department === "object" && t.department ? t.department._id : String(t.department ?? "");
      return dId === form.department;
    });
  }, [allTeams, form.department]);

  const filteredSupervisors = useMemo(() => {
    if (!form.department) return supervisors;
    return supervisors.filter((s) => s.departmentId === form.department);
  }, [supervisors, form.department]);

  const deptManagerName = useMemo(() => {
    if (!form.department) return null;
    const dept = departments.find((d) => d._id === form.department);
    if (!dept?.manager) return null;
    const mgrId = typeof dept.manager === "object" ? dept.manager._id : dept.manager;
    const mgr = supervisors.find((s) => s._id === mgrId);
    return mgr?.fullName ?? null;
  }, [form.department, departments, supervisors]);

  function toggleTeam(teamId: string) {
    setForm((f) => ({
      ...f,
      teams: f.teams.includes(teamId) ? f.teams.filter((id) => id !== teamId) : [...f.teams, teamId],
    }));
  }

  function toggleManagedDept(deptId: string) {
    setForm((f) => ({
      ...f,
      managedDepartments: f.managedDepartments.includes(deptId)
        ? f.managedDepartments.filter((id) => id !== deptId)
        : [...f.managedDepartments, deptId],
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
          fullName: form.fullName,
          userRole: form.userRole,
          department: form.department || null,
          reportsTo: form.reportsTo || null,
          teams: form.teams,
          managedDepartments: (form.userRole === "manager" || form.userRole === "teamLead") ? form.managedDepartments : [],
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
          body: JSON.stringify({
            email: form.email,
            fullName: form.fullName,
            userRole: form.userRole,
            department: form.department || undefined,
            reportsTo: form.reportsTo || undefined,
            teams: form.teams,
            managedDepartments: (form.userRole === "manager" || form.userRole === "teamLead") ? form.managedDepartments : [],
            workShift,
          }),
        });
        if (res.ok) {
          toast.success("Employee invited");
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
          <div className="flex-1 min-w-0 space-y-2"><div className="shimmer h-5 w-48 rounded" /><div className="shimmer h-3 w-64 rounded" /></div>
          <div className="flex gap-2 shrink-0"><div className="shimmer h-9 w-20 rounded-lg hidden sm:block" /><div className="shimmer h-9 w-20 rounded-lg" /></div>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="card-xl p-6 space-y-4">
            <div className="shimmer h-4 w-36 rounded" />
            <div className="shimmer h-10 rounded" />
            <div className="shimmer h-10 rounded" />
            <div className="flex gap-3"><div className="shimmer h-5 w-24 rounded" /><div className="shimmer h-3 w-40 rounded mt-1" /></div>
          </div>
          <div className="card-xl p-6 space-y-4">
            <div className="shimmer h-4 w-36 rounded" />
            <div className="grid grid-cols-2 gap-3"><div className="shimmer h-10 rounded" /><div className="shimmer h-10 rounded" /></div>
            <div className="flex flex-wrap gap-2"><div className="shimmer h-7 w-16 rounded-lg" /><div className="shimmer h-7 w-20 rounded-lg" /><div className="shimmer h-7 w-14 rounded-lg" /></div>
          </div>
        </div>
        <div className="card-xl p-6 space-y-4">
          <div className="shimmer h-4 w-40 rounded" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-4"><div className="shimmer h-10 rounded" /><div className="grid grid-cols-2 gap-3"><div className="shimmer h-10 rounded" /><div className="shimmer h-10 rounded" /></div><div className="shimmer h-10 rounded" /></div>
            <div className="space-y-2"><div className="shimmer h-4 w-28 rounded" /><div className="flex flex-wrap gap-2">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="shimmer h-10 w-12 rounded-xl" />)}</div></div>
          </div>
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
          <h1 className="text-title">{isEdit ? "Edit Employee" : "Invite Employee"}</h1>
          <p className="text-subhead hidden sm:block">{isEdit ? "Update employee details and shift configuration." : "Add a new team member — they'll set their own password."}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => router.push("/employees")} className="btn btn-secondary hidden sm:inline-flex">Cancel</button>
          <motion.button type="submit" disabled={saving} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary">
            {saving ? "Saving..." : isEdit ? "Update" : "Invite"}
          </motion.button>
        </div>
      </motion.div>

      {/* Top row grid: Personal Info + Role & Department */}
      <motion.div
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 mb-5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05, ease }}
      >
        {/* Personal Information card */}
        <motion.div
          className="card-xl p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--fg)" }}>Personal Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Full Name</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></span>
                <input className="input" style={{ paddingLeft: "40px" }} placeholder="Ali Ahmed" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </div>
            </div>

            {!isEdit && (
              <div>
                <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Email</label>
                <div className="relative">
                  <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                  <input className="input" type="email" required placeholder="ali@singlesolution.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ paddingLeft: "40px" }} />
                </div>
                {derivedUsername && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: "var(--fg-tertiary)" }}>
                    <span style={{ color: "var(--fg-secondary)" }}>Username:</span> @{derivedUsername}
                  </motion.p>
                )}
              </div>
            )}

            {isEdit && (
              <div>
                <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">New Password (optional)</label>
                <PasswordInput
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={false}
                  placeholder="Leave blank to keep current"
                />
                <PasswordStrength password={form.password} />
              </div>
            )}
          </div>
        </motion.div>

        {/* Role & Department card */}
        <motion.div
          className="card-xl p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15, ease }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--fg)" }}>Role & Assignment</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Designation</label>
              <select className="input" value={form.userRole} onChange={(e) => setForm({ ...form, userRole: e.target.value })}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Reports To</label>
              <select className="input" value={form.reportsTo} onChange={(e) => setForm({ ...form, reportsTo: e.target.value })}>
                <option value="">None</option>
                {supervisors.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.fullName} ({s.userRole === "teamLead" ? "Team Lead" : "Manager"})
                  </option>
                ))}
              </select>
            </div>

            {departments.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">
                  {isLeadOrManager ? "Departments" : "Department"}
                </label>
                {isLeadOrManager && (
                  <p className="text-[11px] mb-2" style={{ color: "var(--fg-tertiary)" }}>
                    Departments this {form.userRole === "manager" ? "manager" : "lead"} can view and manage
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {departments.map((d) => {
                    const active = isLeadOrManager
                      ? form.managedDepartments.includes(d._id)
                      : form.department === d._id;
                    return (
                      <motion.button
                        key={d._id}
                        type="button"
                        onClick={() => {
                          if (isLeadOrManager) {
                            toggleManagedDept(d._id);
                          } else {
                            setForm((f) => ({ ...f, department: f.department === d._id ? "" : d._id }));
                          }
                        }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.92 }}
                        transition={{ type: "spring", stiffness: 400, damping: 17 }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          active
                            ? "bg-[var(--primary)] text-white shadow-sm"
                            : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                        }`}
                        style={!active ? { background: "var(--bg-grouped)" } : undefined}
                      >
                        {d.title}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

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
                          style={!active ? { background: "var(--bg-grouped)" } : undefined}
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
        className="card-xl p-6 mb-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.2, ease }}
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--fg)" }}>Shift Configuration</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
                    style={!active ? { background: "var(--bg-grouped)" } : undefined}
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
          {saving ? "Saving..." : isEdit ? "Update Employee" : "Invite Employee"}
        </motion.button>
        <button type="button" onClick={() => router.push("/employees")} className="btn btn-secondary flex-1">Cancel</button>
      </div>
    </form>
  );
}
