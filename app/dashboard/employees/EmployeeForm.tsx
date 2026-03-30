"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { PasswordInput } from "@/components/PasswordInput";
import { PasswordStrength } from "@/components/PasswordStrength";
import toast from "react-hot-toast";

interface Department { _id: string; title: string; }

const ROLES = [
  { value: "manager", label: "Manager" },
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
  shiftType: string;
  shiftStart: string;
  shiftEnd: string;
  workingDays: string[];
  breakTime: number;
}

const INITIAL: FormState = {
  firstName: "", lastName: "", email: "", username: "", password: "",
  userRole: "developer", department: "",
  shiftType: "fullTime", shiftStart: "10:00", shiftEnd: "19:00",
  workingDays: ["mon", "tue", "wed", "thu", "fri"],
  breakTime: 60,
};

export default function EmployeeForm({ employeeId }: EmployeeFormProps) {
  const router = useRouter();
  const isEdit = !!employeeId;
  const [form, setForm] = useState<FormState>(INITIAL);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const deptRes = await fetch("/api/departments").then((r) => r.ok ? r.json() : []);
    setDepartments(Array.isArray(deptRes) ? deptRes : []);

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

  // suppress unused warning
  void strength;

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
          workShift,
        };
        if (form.password) body.password = form.password;
        const res = await fetch(`/api/employees/${employeeId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.ok) {
          toast.success("Employee updated");
          router.push("/dashboard/employees");
        } else {
          const data = await res.json();
          toast.error(data.error || "Failed to update");
        }
      } else {
        const res = await fetch("/api/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, workShift }),
        });
        if (res.ok) {
          toast.success("Employee created");
          router.push("/dashboard/employees");
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
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="shimmer h-8 w-48 rounded" />
        <div className="shimmer h-[500px] rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-6"
      >
        <button
          type="button"
          onClick={() => router.push("/dashboard/employees")}
          className="flex items-center gap-1.5 text-sm font-medium mb-4 transition-colors"
          style={{ color: "var(--fg-secondary)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          Back to Employees
        </button>
        <h1 className="text-title">{isEdit ? "Edit Employee" : "Create Employee"}</h1>
        <p className="text-subhead">{isEdit ? "Update employee details and shift configuration." : "Add a new team member to the organization."}</p>
      </motion.div>

      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="space-y-6"
      >
        {/* Personal Info */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Personal Information</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">First Name</label>
              <input className="input" placeholder="Ali" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
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
                <input className="input" placeholder="ali" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
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

        {/* Role & Department */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Role & Department</h2>
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
        </div>

        {/* Shift Configuration */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Shift Configuration</h2>
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
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Break Time (min)</label>
            <input className="input" type="number" value={form.breakTime} onChange={(e) => setForm({ ...form, breakTime: Number(e.target.value) })} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <motion.button
            type="submit"
            disabled={saving}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn btn-primary flex-1"
          >
            {saving ? "Saving..." : isEdit ? "Update Employee" : "Create Employee"}
          </motion.button>
          <button
            type="button"
            onClick={() => router.push("/dashboard/employees")}
            className="btn btn-secondary flex-1"
          >
            Cancel
          </button>
        </div>
      </motion.form>
    </div>
  );
}
