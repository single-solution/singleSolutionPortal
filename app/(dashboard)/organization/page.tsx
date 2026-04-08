"use client";

import { useMemo, useState, useCallback, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { useQuery } from "@/lib/useQuery";
import { useGuide } from "@/lib/useGuide";
import { organizationTour } from "@/lib/tourConfigs";
import { DesignationsPanel } from "./DesignationsPanel";
import { TeamsPanel } from "./TeamsPanel";
import { Portal } from "../components/Portal";
import toast from "react-hot-toast";
import dynamic from "next/dynamic";
import { PERMISSION_CATEGORIES, PERMISSION_KEYS } from "@/lib/permissions.shared";

const OrgFlowTree = dynamic(() => import("./OrgFlowTree").then((m) => m.OrgFlowTree), { ssr: false, loading: () => <div className="card-xl shimmer" style={{ height: "calc(100vh - 320px)", minHeight: 400 }} /> });

interface Employee {
  _id: string; email: string; username: string;
  about: { firstName: string; lastName: string; phone?: string; profileImage?: string };
  userRole: string;
  department?: { _id: string; title: string };
  teams?: { _id: string; name: string }[];
  isActive: boolean; isVerified?: boolean;
  workShift?: { type: string; shift: { start: string; end: string }; workingDays: string[]; breakTime: number };
  createdAt: string;
}
interface Department { _id: string; title: string; slug: string; employeeCount: number; teamCount: number; isActive: boolean }
interface TeamRow { _id: string; name: string; slug: string; memberCount: number; department: { _id: string; title: string; slug: string }; isActive?: boolean }

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function idStr(x: unknown): string {
  if (x === null || x === undefined) return "";
  if (typeof x === "string") return x;
  if (typeof x === "object" && x !== null && "_id" in x) return idStr((x as { _id: unknown })._id);
  return String(x);
}

export default function OrganizationPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { registerTour } = useGuide();
  useEffect(() => { registerTour("organization", organizationTour); }, [registerTour]);
  const role = session?.user?.role;
  const isSuperAdminFlag = session?.user?.isSuperAdmin === true;
  const isSuperAdmin = role === "superadmin" || isSuperAdminFlag;
  const isManager = role === "manager";
  const canManage = isSuperAdmin || isManager;

  const { data: departments, loading: deptsLoading, refetch: refetchDepts } = useQuery<Department[]>("/api/departments", "org-departments");
  const { data: teams, loading: teamsLoading, refetch: refetchTeams } = useQuery<TeamRow[]>("/api/teams", "org-teams");
  const { data: employees, loading: employeesLoading, refetch: refetchEmployees } = useQuery<Employee[]>("/api/employees", "org-employees");
  const { data: designationsData, refetch: refetchDesignations } = useQuery<{ _id: string; name: string; color: string; isActive: boolean }[]>("/api/designations", "org-designations");
  const activeDesignations = useMemo(() => (designationsData ?? []).filter((d) => d.isActive !== false), [designationsData]);

  const [search, setSearch] = useState("");

  /* ── Collapse state for sidebar cards ── */
  const [showDepts, setShowDepts] = useState(true);
  const [showTeamsCard, setShowTeamsCard] = useState(false);
  const [showDesigCard, setShowDesigCard] = useState(false);

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
  const teamList = useMemo(() => teams ?? [], [teams]);
  const empList = useMemo(() => employees ?? [], [employees]);

  const teamsByDept = useMemo(() => {
    const m = new Map<string, TeamRow[]>();
    for (const t of teamList) {
      const did = idStr(t.department?._id ?? t.department);
      if (!did) continue;
      if (!m.has(did)) m.set(did, []);
      m.get(did)!.push(t);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [teamList]);

  const unassignedCount = useMemo(() => empList.filter((e) => !e.department?._id).length, [empList]);

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

  /* ── Filtered employees for search ── */
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
          <p className="mt-0.5 text-sm" style={{ color: "var(--fg-secondary)" }}>Departments, teams, and people.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="input w-full text-sm" style={{ paddingLeft: "36px" }} />
          </div>
          {sessionStatus !== "loading" && canManage && (
            <motion.button type="button" onClick={openCreateEmployee} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Add
            </motion.button>
          )}
        </div>
      </div>

      {/* ── Summary cards row ── */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Departments card */}
        <button type="button" onClick={() => setShowDepts(!showDepts)}
          className="card-xl flex items-center gap-3 p-4 text-left transition-all hover:shadow-md"
          style={{ borderColor: showDepts ? "#8b5cf6" : "var(--border)" }}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "#8b5cf6", color: "white" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--fg)" }}>{deptList.length}</p>
            <p className="text-[11px] font-medium" style={{ color: "var(--fg-secondary)" }}>Departments</p>
          </div>
        </button>

        {/* Teams card */}
        <button type="button" onClick={() => setShowTeamsCard(!showTeamsCard)}
          className="card-xl flex items-center gap-3 p-4 text-left transition-all hover:shadow-md"
          style={{ borderColor: showTeamsCard ? "#3b82f6" : "var(--border)" }}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "#3b82f6", color: "white" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--fg)" }}>{teamList.length}</p>
            <p className="text-[11px] font-medium" style={{ color: "var(--fg-secondary)" }}>Teams</p>
          </div>
        </button>

        {/* Employees card */}
        <div className="card-xl flex items-center gap-3 p-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--teal)", color: "white" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--fg)" }}>{empList.length}</p>
            <p className="text-[11px] font-medium" style={{ color: "var(--fg-secondary)" }}>Employees</p>
          </div>
        </div>

        {/* Designations card */}
        <button type="button" onClick={() => setShowDesigCard(!showDesigCard)}
          className="card-xl flex items-center gap-3 p-4 text-left transition-all hover:shadow-md"
          style={{ borderColor: showDesigCard ? "#f59e0b" : "var(--border)" }}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "#f59e0b", color: "white" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--fg)" }}>{activeDesignations.length}</p>
            <p className="text-[11px] font-medium" style={{ color: "var(--fg-secondary)" }}>Designations</p>
          </div>
        </button>
      </div>

      {/* ── Expandable panels ── */}
      <AnimatePresence>
        {showDepts && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden mb-4">
            <div className="card-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold" style={{ color: "#8b5cf6" }}>Departments</h3>
                <button type="button" onClick={() => setShowDepts(false)} className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>Collapse</button>
              </div>
              {deptsLoading && deptList.length === 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((i) => <div key={i} className="shimmer h-16 rounded-xl" />)}
                </div>
              ) : deptList.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>No departments yet.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {deptList.map((dept) => {
                    const dTeams = teamsByDept.get(dept._id) ?? [];
                    return (
                      <div key={dept._id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-grouped)" }}>
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--fg)" }}>{dept.title}</p>
                        <p className="text-[10px] tabular-nums mt-0.5" style={{ color: "var(--fg-tertiary)" }}>{dept.employeeCount} people · {dTeams.length} teams</p>
                      </div>
                    );
                  })}
                  {unassignedCount > 0 && (
                    <div className="rounded-xl border border-dashed p-3" style={{ borderColor: "var(--amber)", background: "color-mix(in srgb, var(--amber) 6%, transparent)" }}>
                      <p className="text-sm font-semibold" style={{ color: "var(--amber)" }}>Unassigned</p>
                      <p className="text-[10px] tabular-nums mt-0.5" style={{ color: "var(--fg-tertiary)" }}>{unassignedCount} people</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTeamsCard && isSuperAdmin && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden mb-4">
            <div className="card-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold" style={{ color: "#3b82f6" }}>Teams Management</h3>
                <button type="button" onClick={() => setShowTeamsCard(false)} className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>Collapse</button>
              </div>
              <TeamsPanel teams={teamList as any} departments={deptList} loading={teamsLoading} refetch={refetchTeams} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDesigCard && isSuperAdmin && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden mb-4">
            <div className="card-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold" style={{ color: "#f59e0b" }}>Designations Management</h3>
                <button type="button" onClick={() => setShowDesigCard(false)} className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>Collapse</button>
              </div>
              <DesignationsPanel />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Flow diagram (full width) ── */}
      <OrgFlowTree departments={deptList} teams={teamList} employees={filteredEmps} teamsByDept={teamsByDept} designations={activeDesignations} isSuperAdmin={isSuperAdmin} />

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
                      After adding, drag from their node on the flow to a department or team to assign them.
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
