"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { PasswordInput } from "@/components/PasswordInput";
import { PasswordStrength } from "@/components/PasswordStrength";
import toast from "react-hot-toast";

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

import {
  ALL_WEEKDAYS,
  WEEKDAY_LABELS,
  makeDefaultWeeklySchedule,
  resolveWeeklySchedule,
  resolveGraceMinutes,
  type Weekday,
  type DaySchedule,
  type WeeklySchedule,
} from "@/lib/schedule";

interface Department { _id: string; title: string; manager?: string | { _id: string }; }

interface EmployeeFormProps {
  employeeId?: string;
}

interface FormState {
  fullName: string;
  email: string;
  password: string;
  department: string;
  managedDepartments: string[];
  shiftType: string;
  graceMinutes: number;
  weeklySchedule: WeeklySchedule;
}

const INITIAL: FormState = {
  fullName: "", email: "", password: "",
  department: "",
  managedDepartments: [],
  shiftType: "fullTime", graceMinutes: 30,
  weeklySchedule: makeDefaultWeeklySchedule(),
};

export default function EmployeeForm({ employeeId }: EmployeeFormProps) {
  const router = useRouter();
  const isEdit = !!employeeId;
  const [form, setForm] = useState<FormState>(INITIAL);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** Multi-department management UI (replaces legacy single-department manager role). */
  const [multiDeptUi, setMultiDeptUi] = useState(false);

  const isLeadOrManager = multiDeptUi;

  const derivedUsername = useMemo(() => {
    if (!form.email) return "";
    return form.email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9._-]/g, "") ?? "";
  }, [form.email]);

  const load = useCallback(async () => {
    const deptRes = await fetch("/api/departments").then((r) => (r.ok ? r.json() : []));
    setDepartments(Array.isArray(deptRes) ? deptRes : []);

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
          department: empRes.department?._id ?? "",
          managedDepartments: managed,
          shiftType: empRes.shiftType ?? "fullTime",
          graceMinutes: resolveGraceMinutes(empRes),
          weeklySchedule: resolveWeeklySchedule(empRes),
        });
        setMultiDeptUi(managed.length > 0);
      }
    } else {
      setForm({ ...INITIAL });
      setMultiDeptUi(false);
    }
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  function toggleManagedDept(deptId: string) {
    setForm((f) => ({
      ...f,
      managedDepartments: f.managedDepartments.includes(deptId)
        ? f.managedDepartments.filter((id) => id !== deptId)
        : [...f.managedDepartments, deptId],
    }));
  }

  function updateDay(day: Weekday, patch: Partial<DaySchedule>) {
    setForm((f) => ({
      ...f,
      weeklySchedule: {
        ...f.weeklySchedule,
        [day]: { ...f.weeklySchedule[day], ...patch },
      },
    }));
  }

  function copyMondayToAll() {
    setForm((f) => {
      const mon = f.weeklySchedule.mon;
      const next = { ...f.weeklySchedule };
      for (const d of ALL_WEEKDAYS) next[d] = { ...mon };
      return { ...f, weeklySchedule: next };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const schedulePayload = {
        weeklySchedule: form.weeklySchedule,
        graceMinutes: form.graceMinutes,
        shiftType: form.shiftType,
      };

      if (isEdit) {
        const body: Record<string, unknown> = {
          fullName: form.fullName,
          department: form.department || null,
          managedDepartments: isLeadOrManager ? form.managedDepartments : [],
          ...schedulePayload,
        };
        if (form.password) body.password = form.password;
        const res = await fetch(`/api/employees/${employeeId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.ok) {
          toast.success("Employee updated");
          router.push("/organization");
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
            department: form.department || undefined,
            managedDepartments: isLeadOrManager ? form.managedDepartments : [],
            ...schedulePayload,
          }),
        });
        if (res.ok) {
          toast.success("Employee invited");
          router.push("/organization");
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
          onClick={() => router.push("/organization")}
          className="page-icon bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-blue-500/20 hover:scale-105 transition-transform"
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-title">{isEdit ? "Edit Employee" : "Invite Employee"}</h1>
          <p className="text-subhead hidden sm:block">{isEdit ? "Update employee details and shift configuration." : "Add a new employee — they'll set their own password."}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => router.push("/organization")} className="btn btn-secondary hidden sm:inline-flex">Cancel</button>
          <motion.button type="submit" disabled={saving} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary">
            {saving ? "Saving..." : isEdit ? "Update" : "Invite"}
          </motion.button>
        </div>
      </motion.div>

      {/* Top row grid: Personal Info + Assignment */}
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

        {/* Assignment card */}
        <motion.div
          className="card-xl p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15, ease }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--fg)" }}>Assignment</h2>
          <div className="space-y-4">
            {isEdit && (
              <>
                {departments.length > 0 && (
              <div>
                    <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">
                      {isLeadOrManager ? "Departments" : "Department"}
                    </label>
                    {isLeadOrManager && (
                      <p className="text-[11px] mb-2" style={{ color: "var(--fg-tertiary)" }}>
                        Departments they can view and manage
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
                    <div className="pt-1">
                      {!multiDeptUi ? (
                        <button
                          type="button"
                          className="text-[11px] font-medium hover:underline"
                          style={{ color: "var(--primary)" }}
                          onClick={() => {
                            setMultiDeptUi(true);
                            setForm((f) => ({
                              ...f,
                              managedDepartments: f.department ? [f.department] : f.managedDepartments,
                            }));
                          }}
                        >
                          Manage multiple departments
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-[11px] font-medium hover:underline"
                          style={{ color: "var(--fg-secondary)" }}
                          onClick={() => {
                            setMultiDeptUi(false);
                            setForm((f) => ({
                              ...f,
                              department: f.department || f.managedDepartments[0] || "",
                              managedDepartments: [],
                            }));
                          }}
                        >
                          Use single department only
                        </button>
                      )}
                    </div>
              </div>
                )}
              </>
            )}

            {!isEdit && (
              <p className="text-[11px] rounded-lg p-2" style={{ color: "var(--fg-tertiary)", background: "var(--bg-grouped)" }}>
                Department assignments can be configured after the employee is added, from the Organization page.
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Bottom row: Weekly Schedule (full width) */}
      <motion.div
        className="card-xl p-6 mb-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.2, ease }}
      >
        <div className="flex items-center justify-between mb-4 gap-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Weekly Schedule</h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-tertiary)" }}>Configure working hours for each day of the week.</p>
          </div>
          <motion.button
            type="button"
            onClick={copyMondayToAll}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-lg shrink-0"
            style={{ color: "var(--primary)", background: "var(--bg-grouped)" }}
          >
            Copy Mon → All
          </motion.button>
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--fg-tertiary)] text-[10px] uppercase tracking-wider">
                <th className="pb-2 text-left font-medium w-24">Day</th>
                <th className="pb-2 text-center font-medium w-16">Working</th>
                <th className="pb-2 text-left font-medium">Start</th>
                <th className="pb-2 text-left font-medium">End</th>
                <th className="pb-2 text-left font-medium w-20">Break</th>
              </tr>
            </thead>
            <tbody>
              {ALL_WEEKDAYS.map((day) => {
                const ds = form.weeklySchedule[day];
                return (
                  <tr key={day} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 font-medium" style={{ color: ds.isWorking ? "var(--fg)" : "var(--fg-tertiary)" }}>
                      {WEEKDAY_LABELS[day]}
                    </td>
                    <td className="py-2 text-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={ds.isWorking}
                        onClick={() => updateDay(day, { isWorking: !ds.isWorking })}
                        className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                        style={{ backgroundColor: ds.isWorking ? "var(--primary)" : "var(--bg-tertiary)" }}
                      >
                        <span className="pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform" style={{ transform: ds.isWorking ? "translateX(1rem)" : "translateX(0)" }} />
                      </button>
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        className="input text-xs py-1.5"
                        type="time"
                        value={ds.start}
                        disabled={!ds.isWorking}
                        onChange={(e) => updateDay(day, { start: e.target.value })}
                        style={{ opacity: ds.isWorking ? 1 : 0.4 }}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        className="input text-xs py-1.5"
                        type="time"
                        value={ds.end}
                        disabled={!ds.isWorking}
                        onChange={(e) => updateDay(day, { end: e.target.value })}
                        style={{ opacity: ds.isWorking ? 1 : 0.4 }}
                      />
                    </td>
                    <td className="py-2">
                      <input
                        className="input text-xs py-1.5 w-16"
                        type="number"
                        min={0}
                        value={ds.breakMinutes}
                        disabled={!ds.isWorking}
                        onChange={(e) => updateDay(day, { breakMinutes: Number(e.target.value) || 0 })}
                        style={{ opacity: ds.isWorking ? 1 : 0.4 }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden space-y-2">
          {ALL_WEEKDAYS.map((day) => {
            const ds = form.weeklySchedule[day];
            return (
              <div key={day} className="rounded-xl p-3" style={{ background: "var(--bg-grouped)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: ds.isWorking ? "var(--fg)" : "var(--fg-tertiary)" }}>{WEEKDAY_LABELS[day]}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={ds.isWorking}
                    onClick={() => updateDay(day, { isWorking: !ds.isWorking })}
                    className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                    style={{ backgroundColor: ds.isWorking ? "var(--primary)" : "var(--bg-tertiary)" }}
                  >
                    <span className="pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform" style={{ transform: ds.isWorking ? "translateX(1rem)" : "translateX(0)" }} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2" style={{ opacity: ds.isWorking ? 1 : 0.35 }}>
                  <div>
                    <label className="block text-[10px] text-[var(--fg-tertiary)] mb-0.5">Start</label>
                    <input className="input text-xs py-1" type="time" value={ds.start} disabled={!ds.isWorking} onChange={(e) => updateDay(day, { start: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--fg-tertiary)] mb-0.5">End</label>
                    <input className="input text-xs py-1" type="time" value={ds.end} disabled={!ds.isWorking} onChange={(e) => updateDay(day, { end: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--fg-tertiary)] mb-0.5">Break</label>
                    <input className="input text-xs py-1" type="number" min={0} value={ds.breakMinutes} disabled={!ds.isWorking} onChange={(e) => updateDay(day, { breakMinutes: Number(e.target.value) || 0 })} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Shift type + Grace minutes row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            <div>
              <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Shift Type</label>
              <select className="input" value={form.shiftType} onChange={(e) => setForm({ ...form, shiftType: e.target.value })}>
                <option value="fullTime">Full Time</option>
                <option value="partTime">Part Time</option>
                <option value="contract">Contract</option>
              </select>
            </div>
          <div>
            <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Grace Minutes</label>
            <input className="input" type="number" min={0} value={form.graceMinutes} onChange={(e) => setForm({ ...form, graceMinutes: Number(e.target.value) || 0 })} />
            <p className="text-[10px] mt-1" style={{ color: "var(--fg-tertiary)" }}>Allowed minutes after shift start before marking late.</p>
          </div>
        </div>
      </motion.div>

      {/* Mobile-only action row */}
      <div className="flex gap-3 sm:hidden">
        <motion.button type="submit" disabled={saving} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary flex-1">
          {saving ? "Saving..." : isEdit ? "Update Employee" : "Invite Employee"}
        </motion.button>
        <button type="button" onClick={() => router.push("/organization")} className="btn btn-secondary flex-1">Cancel</button>
      </div>
    </form>
  );
}
