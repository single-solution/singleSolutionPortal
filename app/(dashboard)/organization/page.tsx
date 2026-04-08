"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { useQuery } from "@/lib/useQuery";
import { useGuide } from "@/lib/useGuide";
import { organizationTour } from "@/lib/tourConfigs";
import { DepartmentsPanel } from "./DepartmentsPanel";
import { DesignationsPanel } from "./DesignationsPanel";
import { Portal } from "../components/Portal";
import toast from "react-hot-toast";
import dynamic from "next/dynamic";

const OrgFlowTree = dynamic(() => import("./OrgFlowTree").then((m) => m.OrgFlowTree), { ssr: false, loading: () => <div className="card-xl shimmer" style={{ height: "calc(100vh - 280px)", minHeight: 400 }} /> });

interface Employee {
  _id: string; email: string; username: string;
  about: { firstName: string; lastName: string; phone?: string; profileImage?: string };
  department?: { _id: string; title: string };
  teams?: { _id: string; name: string }[];
  isActive: boolean; isVerified?: boolean;
  workShift?: { type: string; shift: { start: string; end: string }; workingDays: string[]; breakTime: number };
  createdAt: string;
}
interface Department { _id: string; title: string; slug: string; employeeCount: number; teamCount: number; isActive: boolean; manager?: { _id: string; about: { firstName: string; lastName: string }; email: string } | null }

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function OrganizationPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { registerTour } = useGuide();
  useEffect(() => { registerTour("organization", organizationTour); }, [registerTour]);
  const isSuperAdmin = session?.user?.isSuperAdmin === true;
  const canManage = isSuperAdmin;

  const { data: departments, loading: deptsLoading, refetch: refetchDepts } = useQuery<Department[]>("/api/departments", "org-departments");
  const { data: employees, refetch: refetchEmployees } = useQuery<Employee[]>("/api/employees", "org-employees");
  const { data: designationsData, refetch: refetchDesignations } = useQuery<{ _id: string; name: string; color: string; isActive: boolean }[]>("/api/designations", "org-designations");
  const activeDesignations = useMemo(() => (designationsData ?? []).filter((d) => d.isActive !== false), [designationsData]);

  const [search, setSearch] = useState("");

  /* ── Employee modal ── */
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState({
    fullName: "", email: "", password: "",
    shiftType: "fullTime", shiftStart: "10:00", shiftEnd: "19:00",
    workingDays: ["mon", "tue", "wed", "thu", "fri"], breakTime: 60,
  });
  const [empSaving, setEmpSaving] = useState(false);
  const isEditEmp = !!editingEmpId;

  const deptList = useMemo(() => departments ?? [], [departments]);
  const empList = useMemo(() => employees ?? [], [employees]);

  function openCreateEmployee() {
    setEditingEmpId(null);
    setEmpForm({ fullName: "", email: "", password: "", shiftType: "fullTime", shiftStart: "10:00", shiftEnd: "19:00", workingDays: ["mon", "tue", "wed", "thu", "fri"], breakTime: 60 });
    setEmpModalOpen(true);
  }

  function openEditEmployee(emp: Employee) {
    setEditingEmpId(emp._id);
    setEmpForm({
      fullName: `${emp.about.firstName} ${emp.about.lastName}`.trim(),
      email: emp.email, password: "",
      shiftType: emp.workShift?.type ?? "fullTime", shiftStart: emp.workShift?.shift?.start ?? "10:00", shiftEnd: emp.workShift?.shift?.end ?? "19:00",
      workingDays: emp.workShift?.workingDays ?? ["mon", "tue", "wed", "thu", "fri"], breakTime: emp.workShift?.breakTime ?? 60,
    });
    setEmpModalOpen(true);
  }

  async function handleSaveEmployee() {
    if (!empForm.fullName.trim() || (!isEditEmp && !empForm.email.trim())) return;
    setEmpSaving(true);
    try {
      const workShift = { type: empForm.shiftType, shift: { start: empForm.shiftStart, end: empForm.shiftEnd }, workingDays: empForm.workingDays, breakTime: empForm.breakTime };
      if (isEditEmp) {
        const body: Record<string, unknown> = { fullName: empForm.fullName, workShift };
        if (empForm.password) body.password = empForm.password;
        const res = await fetch(`/api/employees/${editingEmpId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.ok) { toast.success("Employee updated"); setEmpModalOpen(false); await refetchEmployees(); }
        else { const data = await res.json(); toast.error(data.error || "Failed to update"); }
      } else {
        const body: Record<string, unknown> = { email: empForm.email, fullName: empForm.fullName, workShift };
        const res = await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.ok) { toast.success("Employee invited"); setEmpModalOpen(false); await refetchEmployees(); }
        else { const data = await res.json(); toast.error(data.error || "Failed to create"); }
      }
    } catch { toast.error("Something went wrong"); }
    setEmpSaving(false);
  }

  function toggleEmpWorkingDay(day: string) { setEmpForm((f) => ({ ...f, workingDays: f.workingDays.includes(day) ? f.workingDays.filter((d) => d !== day) : [...f.workingDays, day] })); }

  const filteredEmps = useMemo(() => {
    if (!search.trim()) return empList;
    const q = search.toLowerCase();
    return empList.filter((e) => `${e.about.firstName} ${e.about.lastName} ${e.email} ${e.username}`.toLowerCase().includes(q));
  }, [empList, search]);

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-6">
      {/* ── Title row ── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="shrink-0">
          <h1 className="text-title-2 font-bold tracking-tight" style={{ color: "var(--fg)" }}>Organization</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--fg-secondary)" }}>Departments and people.</p>
        </div>
      </div>

      {/* ── Search + Add Employee card ── */}
      <div className="card-xl mb-4 flex items-center gap-3 p-4">
        <div className="relative w-full flex-1">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people, departments…" className="input w-full" style={{ paddingLeft: "40px" }} />
        </div>
        {sessionStatus !== "loading" && canManage && (
          <motion.button type="button" onClick={openCreateEmployee} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Employee
          </motion.button>
        )}
      </div>

      {/* ── Main layout: sidebar + flow ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Left sidebar: separate cards */}
        <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[280px]">
          {/* Departments card */}
          <div className="card-xl p-3" style={{ borderColor: "var(--border)" }}>
            {isSuperAdmin ? (
              <DepartmentsPanel departments={deptList} loading={deptsLoading} refetch={refetchDepts} />
            ) : (
              <div className="flex flex-col gap-1.5">
                <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Departments</h2>
                {deptsLoading && deptList.length === 0 ? (
                  <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="shimmer h-8 rounded-lg" />)}</div>
                ) : deptList.length === 0 ? (
                  <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No departments.</p>
                ) : (
                  deptList.map((d) => (
                    <div key={d._id} className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "var(--bg-grouped)" }}>
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background: "#8b5cf6", color: "white" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium" style={{ color: "var(--fg)" }}>{d.title}</p>
                        <p className="truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{d.employeeCount} people · {d.teamCount} teams</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Designations card */}
          {isSuperAdmin && (
            <div className="card-xl p-3" style={{ borderColor: "var(--border)" }}>
              <DesignationsPanel />
            </div>
          )}

          {/* Summary */}
          <div className="card-xl p-3" style={{ borderColor: "var(--border)" }}>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg p-2" style={{ background: "var(--bg-grouped)" }}>
                <p className="text-lg font-bold tabular-nums" style={{ color: "var(--fg)" }}>{empList.length}</p>
                <p className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>Employees</p>
              </div>
              <div className="rounded-lg p-2" style={{ background: "var(--bg-grouped)" }}>
                <p className="text-lg font-bold tabular-nums" style={{ color: "var(--amber)" }}>{empList.filter((e) => !e.department?._id).length}</p>
                <p className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>Unassigned</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Flow diagram */}
        <main className="min-w-0 flex-1">
          <OrgFlowTree departments={deptList} employees={filteredEmps} designations={activeDesignations} isSuperAdmin={isSuperAdmin} />
        </main>
      </div>

      {/* ── Employee Add/Edit Modal ── */}
      <Portal>
        <AnimatePresence>
          {empModalOpen && (
            <motion.div className="fixed inset-0 z-[60] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEmpModalOpen(false)} />
              <motion.div
                className="relative w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto rounded-2xl border p-6 shadow-xl"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-lg font-bold mb-4" style={{ color: "var(--fg)" }}>{isEditEmp ? "Edit Employee" : "Invite Employee"}</h2>
                <form onSubmit={(e) => { e.preventDefault(); handleSaveEmployee(); }} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Full Name</label><input type="text" value={empForm.fullName} onChange={(e) => setEmpForm((f) => ({ ...f, fullName: e.target.value }))} className="input w-full" required autoFocus /></div>
                    <div><label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Email</label><input type="email" value={empForm.email} onChange={(e) => setEmpForm((f) => ({ ...f, email: e.target.value }))} className="input w-full" required disabled={isEditEmp} /></div>
                  </div>

                  {isEditEmp && (
                    <div><label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>New Password (optional)</label><input type="password" value={empForm.password} onChange={(e) => setEmpForm((f) => ({ ...f, password: e.target.value }))} className="input w-full" placeholder="Leave blank to keep current" /></div>
                  )}

                  <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
                    <p className="text-[11px] font-medium mb-2" style={{ color: "var(--fg-secondary)" }}>Shift Configuration</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div><label className="text-[10px] mb-0.5 block" style={{ color: "var(--fg-tertiary)" }}>Type</label><select value={empForm.shiftType} onChange={(e) => setEmpForm((f) => ({ ...f, shiftType: e.target.value }))} className="input w-full text-xs"><option value="fullTime">Full-time</option><option value="partTime">Part-time</option><option value="contract">Contract</option><option value="intern">Intern</option></select></div>
                      <div><label className="text-[10px] mb-0.5 block" style={{ color: "var(--fg-tertiary)" }}>Start</label><input type="time" value={empForm.shiftStart} onChange={(e) => setEmpForm((f) => ({ ...f, shiftStart: e.target.value }))} className="input w-full text-xs" /></div>
                      <div><label className="text-[10px] mb-0.5 block" style={{ color: "var(--fg-tertiary)" }}>End</label><input type="time" value={empForm.shiftEnd} onChange={(e) => setEmpForm((f) => ({ ...f, shiftEnd: e.target.value }))} className="input w-full text-xs" /></div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      {WEEKDAY_KEYS.map((d, i) => (<button key={d} type="button" onClick={() => toggleEmpWorkingDay(d)} className={`h-7 w-7 rounded-md text-[10px] font-bold transition-all ${empForm.workingDays.includes(d) ? "text-white shadow-sm" : "text-[var(--fg-secondary)]"}`} style={empForm.workingDays.includes(d) ? { background: "var(--primary)" } : { background: "var(--bg-grouped)" }}>{WEEKDAY_LABELS[i]}</button>))}
                      <div className="ml-auto flex items-center gap-1"><label className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>Break</label><input type="number" value={empForm.breakTime} onChange={(e) => setEmpForm((f) => ({ ...f, breakTime: Number(e.target.value) || 0 }))} className="input w-14 text-xs text-center" min={0} /><span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>min</span></div>
                    </div>
                  </div>

                  {!isEditEmp && (
                    <p className="text-[11px] rounded-lg p-2" style={{ color: "var(--fg-tertiary)", background: "var(--bg-grouped)" }}>
                      After adding, drag from their node on the flow to a department to assign them.
                    </p>
                  )}

                  <div className="flex gap-2 pt-2">
                    <motion.button type="submit" disabled={empSaving || !empForm.fullName.trim() || (!isEditEmp && !empForm.email.trim())} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm flex-1">{empSaving ? "Saving…" : isEditEmp ? "Update" : "Send Invite"}</motion.button>
                    <button type="button" onClick={() => setEmpModalOpen(false)} className="btn btn-secondary btn-sm flex-1">Cancel</button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}
