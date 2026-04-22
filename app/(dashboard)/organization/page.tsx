"use client";

import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { useQuery } from "@/lib/useQuery";
import { useGuide } from "@/lib/useGuide";
import { organizationTour } from "@/lib/tourConfigs";
import { DepartmentsPanel } from "./DepartmentsPanel";
import { DesignationsPanel } from "./DesignationsPanel";
import { Portal } from "../components/Portal";
import { EmployeeModal } from "../components/EmployeeModal";
import toast from "react-hot-toast";
import { ToggleSwitch } from "../components/ToggleSwitch";
import dynamic from "next/dynamic";
import {
  ALL_WEEKDAYS,
  WEEKDAY_LABELS as FULL_DAY_LABELS,
  makeDefaultWeeklySchedule,
  type Weekday,
  type DaySchedule,
  type WeeklySchedule,
} from "@/lib/schedule";

const OrgFlowTree = dynamic(() => import("./OrgFlowTree").then((m) => m.OrgFlowTree), { ssr: false, loading: () => <div className="rounded-xl border shimmer h-full" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", minHeight: 340 }} /> });

interface Employee {
  _id: string; email: string; username: string;
  about: { firstName: string; lastName: string; phone?: string; profileImage?: string };
  isSuperAdmin?: boolean;
  memberships?: Array<{ designation?: { name: string } | null; department?: { _id: string; title: string; parentDepartment?: { title: string } | null } | null }>;
  department?: { _id: string; title: string };
  isActive: boolean; isVerified?: boolean;
  weeklySchedule?: WeeklySchedule;
  shiftType?: string;
  graceMinutes?: number;
  createdAt: string;
}
interface Department { _id: string; title: string; slug: string; employeeCount: number; isActive: boolean; manager?: { _id: string; about: { firstName: string; lastName: string }; email: string } | null }

export default function OrganizationPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { registerTour } = useGuide();
  useEffect(() => { registerTour("organization", organizationTour); }, [registerTour]);
  const { can: canPerm, isSuperAdmin } = usePermissions();
  const canViewOrg = canPerm("organization_view");
  const canManageOrganization = canPerm("organization_manageLinks");
  const canViewDesignations = canPerm("designations_view");
  const canManageDesignations = canPerm("designations_create") || canPerm("designations_edit") || canPerm("designations_delete") || canPerm("designations_toggleStatus") || canPerm("designations_setPermissions");
  const canCreateEmployees = canPerm("employees_create");
  const canCreateDepts = canPerm("departments_create");
  const canEditDepts = canPerm("departments_edit");
  const canDeleteDepts = canPerm("departments_delete");

  const { data: departments, loading: deptsLoading, refetch: refetchDepts } = useQuery<Department[]>(canViewOrg ? "/api/departments" : null, "org-departments");
  const { data: employees, refetch: refetchEmployees } = useQuery<Employee[]>(canViewOrg ? "/api/employees?includeSelf=true" : null, "org-employees");
  const { data: designationsData, refetch: refetchDesignations } = useQuery<{ _id: string; name: string; color: string; isActive: boolean; defaultPermissions?: Record<string, boolean> }[]>(canViewOrg ? "/api/designations" : null, "org-designations");
  const [search, setSearch] = useState("");

  const [empViewOpen, setEmpViewOpen] = useState(false);
  const [empViewId, setEmpViewId] = useState<string | null>(null);
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  function openEmployee(empId: string) {
    setEmpViewId(empId);
    setEmpViewOpen(true);
  }

  /* ── Invite employee form modal ── */
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [empForm, setEmpForm] = useState({
    fullName: "", email: "",
    shiftType: "fullTime", graceMinutes: 30,
    salary: 0,
    weeklySchedule: makeDefaultWeeklySchedule(),
  });
  const [empSaving, setEmpSaving] = useState(false);

  const deptList = useMemo(() => departments ?? [], [departments]);
  const empList = useMemo(() => employees ?? [], [employees]);
  const canManageSalary = canPerm("payroll_manageSalary");

  function openCreateEmployee() {
    setEmpForm({ fullName: "", email: "", shiftType: "fullTime", graceMinutes: 30, salary: 0, weeklySchedule: makeDefaultWeeklySchedule() });
    setEmpModalOpen(true);
  }

  function updateEmpDay(day: Weekday, patch: Partial<DaySchedule>) {
    setEmpForm((f) => ({ ...f, weeklySchedule: { ...f.weeklySchedule, [day]: { ...f.weeklySchedule[day], ...patch } } }));
  }

  async function handleSaveEmployee() {
    if (!empForm.fullName.trim() || !empForm.email.trim()) return;
    setEmpSaving(true);
    try {
      const body: Record<string, unknown> = {
        email: empForm.email, fullName: empForm.fullName,
        weeklySchedule: empForm.weeklySchedule, graceMinutes: empForm.graceMinutes, shiftType: empForm.shiftType,
      };
      if (canManageSalary) body.salary = empForm.salary;
      const res = await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { toast.success("Employee invited"); setEmpModalOpen(false); await refetchEmployees(); }
      else { const data = await res.json(); toast.error(data.error || "Failed to create"); }
    } catch { toast.error("Something went wrong"); }
    setEmpSaving(false);
  }

  /* ── Hierarchy scope for non-SuperAdmins ── */
  const [hierarchyScope, setHierarchyScope] = useState<{
    subordinateIds: string[];
    managerIds: string[];
    departmentIds: string[];
  } | null>(null);
  useEffect(() => {
    if (isSuperAdmin) return;
    fetch("/api/organization/scope").then((r) => r.ok ? r.json() : null).then((data) => {
      if (data) setHierarchyScope({
        subordinateIds: data.subordinateIds ?? [],
        managerIds: data.managerIds ?? [],
        departmentIds: data.departmentIds ?? [],
      });
    }).catch(() => {});
  }, [isSuperAdmin]);

  const scopedEmps = useMemo(() => {
    if (isSuperAdmin) return empList;
    if (!hierarchyScope) return [];
    const selfId = session?.user?.id;
    const visible = new Set<string>([
      ...(selfId ? [selfId] : []),
      ...hierarchyScope.subordinateIds,
      ...hierarchyScope.managerIds,
    ]);
    return empList.filter((e) => visible.has(e._id));
  }, [empList, isSuperAdmin, hierarchyScope, session?.user?.id]);

  const scopedDepts = useMemo(() => {
    if (isSuperAdmin) return deptList;
    if (!hierarchyScope) return [];
    const visibleDeptIds = new Set(hierarchyScope.departmentIds);
    return deptList.filter((d) => visibleDeptIds.has(d._id));
  }, [deptList, isSuperAdmin, hierarchyScope]);

  const filteredEmps = useMemo(() => {
    if (!search.trim()) return scopedEmps;
    const q = search.toLowerCase();
    return scopedEmps.filter((e) => `${e.about.firstName} ${e.about.lastName} ${e.email} ${e.username}`.toLowerCase().includes(q));
  }, [scopedEmps, search]);

  if (!canViewOrg && !isSuperAdmin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
        <h2 className="text-lg font-semibold" style={{ color: "var(--fg)" }}>Access Restricted</h2>
        <p className="text-sm max-w-xs" style={{ color: "var(--fg-tertiary)" }}>You don&apos;t have permission to view the organization chart. Contact your administrator for access.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col" style={{ height: "calc(93dvh - 80px)" }}>
      {/* ── Title row ── */}
      <div data-tour="org-header" className="mb-3 shrink-0 flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-bold" style={{ color: "var(--fg)" }}>Organization</h1>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {sessionStatus !== "loading" && canCreateEmployees && (
            <motion.button type="button" onClick={openCreateEmployee} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg)" }}>
              <svg className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Invite Employee
            </motion.button>
          )}
        </div>
      </div>

      {/* ── Main layout: sidebar + flow ── */}
      <div data-tour="org-tree" className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch">
        {/* Left sidebar */}
        <aside className="flex w-full shrink-0 flex-col gap-3 min-h-0 lg:w-[280px]">
          {/* Search + Add Employee */}
          <div className="shrink-0 flex items-center gap-2 rounded-xl border px-3 py-2" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
            <svg className="pointer-events-none h-3.5 w-3.5 shrink-0" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="flex-1 min-w-0 bg-transparent text-[11px] outline-none"
              style={{ color: "var(--fg)", border: "none" }}
            />
          </div>
          {/* Departments card */}
          <div className="rounded-xl border overflow-hidden flex flex-col flex-1 min-h-0" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
            <DepartmentsPanel departments={scopedDepts} loading={deptsLoading} refetch={refetchDepts} canCreate={canCreateDepts} canEdit={canEditDepts} canDelete={canDeleteDepts} onToggle={() => { refetchDepts(); setTreeRefreshKey((k) => k + 1); }} />
          </div>

          {/* Designations card */}
          {canViewDesignations && (
            <div className="rounded-xl border overflow-hidden flex flex-col flex-1 min-h-0" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
              <DesignationsPanel canManage={canManageDesignations} perms={{
                canCreate: canPerm("designations_create"),
                canEdit: canPerm("designations_edit"),
                canDelete: canPerm("designations_delete"),
                canToggleStatus: canPerm("designations_toggleStatus"),
                canSetPermissions: canPerm("designations_setPermissions"),
              }} onToggle={() => { refetchDesignations(); setTreeRefreshKey((k) => k + 1); }} />
            </div>
          )}
        </aside>

        {/* Flow diagram */}
        <main data-tour="org-context" className="min-h-0 min-w-0 flex-1">
          <OrgFlowTree departments={scopedDepts} employees={filteredEmps} designations={designationsData ?? []} canEditCanvas={canManageOrganization} canAssignDesignation={canPerm("members_assignDesignation")} canCustomizePermissions={canPerm("members_customizePermissions")} canAddToDepartment={canPerm("members_addToDepartment")} canRemoveFromDepartment={canPerm("members_removeFromDepartment")} editableEmployeeIds={isSuperAdmin ? undefined : hierarchyScope?.subordinateIds} onEditEmployee={(empId) => openEmployee(empId)} refreshKey={treeRefreshKey} />
        </main>
      </div>

      {/* ── Invite Employee Modal ── */}
      <Portal>
        <AnimatePresence>
          {empModalOpen && (
            <motion.div className="fixed inset-0 z-[60] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEmpModalOpen(false)} />
              <motion.div
                className="relative w-full max-w-lg mx-3 sm:mx-4 max-h-[min(92vh,900px)] overflow-y-auto rounded-2xl border p-6 shadow-xl"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-lg font-bold mb-4" style={{ color: "var(--fg)" }}>Invite Employee</h2>
                <form onSubmit={(e) => { e.preventDefault(); handleSaveEmployee(); }} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Full Name</label><input type="text" value={empForm.fullName} onChange={(e) => setEmpForm((f) => ({ ...f, fullName: e.target.value }))} className="input w-full" required autoFocus /></div>
                    <div><label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Email</label><input type="email" value={empForm.email} onChange={(e) => setEmpForm((f) => ({ ...f, email: e.target.value }))} className="input w-full" required /></div>
                  </div>

                  <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
                    <p className="text-[11px] font-medium mb-2" style={{ color: "var(--fg-secondary)" }}>Weekly Schedule</p>
                    <div className="space-y-1.5">
                      {ALL_WEEKDAYS.map((day) => {
                        const ds = empForm.weeklySchedule[day];
                        return (
                          <div key={day} className="flex items-center gap-2 text-[11px]">
                            <span className="w-8 font-semibold shrink-0" style={{ color: ds.isWorking ? "var(--fg)" : "var(--fg-tertiary)" }}>{FULL_DAY_LABELS[day].slice(0, 3)}</span>
                            <ToggleSwitch checked={ds.isWorking} onChange={() => updateEmpDay(day, { isWorking: !ds.isWorking })} />
                            <input type="time" value={ds.start} disabled={!ds.isWorking} onChange={(e) => updateEmpDay(day, { start: e.target.value })} className="input text-[11px] py-0.5 w-20" style={{ opacity: ds.isWorking ? 1 : 0.35 }} />
                            <span style={{ color: "var(--fg-tertiary)" }}>–</span>
                            <input type="time" value={ds.end} disabled={!ds.isWorking} onChange={(e) => updateEmpDay(day, { end: e.target.value })} className="input text-[11px] py-0.5 w-20" style={{ opacity: ds.isWorking ? 1 : 0.35 }} />
                            <input type="number" min={0} value={ds.breakMinutes} disabled={!ds.isWorking} onChange={(e) => updateEmpDay(day, { breakMinutes: Number(e.target.value) || 0 })} className="input text-[11px] py-0.5 w-12 text-center" style={{ opacity: ds.isWorking ? 1 : 0.35 }} />
                            <span style={{ color: "var(--fg-tertiary)" }}>break (min)</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className={`mt-2 grid gap-2 ${canManageSalary ? "grid-cols-3" : "grid-cols-2"}`}>
                      <div><label className="text-[11px] mb-0.5 block" style={{ color: "var(--fg-tertiary)" }}>Employment type</label><select value={empForm.shiftType} onChange={(e) => setEmpForm((f) => ({ ...f, shiftType: e.target.value }))} className="input w-full text-xs"><option value="fullTime">Full-time</option><option value="partTime">Part-time</option><option value="contract">Contract</option></select></div>
                      <div><label className="text-[11px] mb-0.5 block" style={{ color: "var(--fg-tertiary)" }}>Clock-in grace (minutes)</label><input type="number" min={0} value={empForm.graceMinutes} onChange={(e) => setEmpForm((f) => ({ ...f, graceMinutes: Number(e.target.value) || 0 }))} className="input w-full text-xs" /></div>
                      {canManageSalary && (
                        <div><label className="text-[11px] mb-0.5 block" style={{ color: "var(--fg-tertiary)" }}>Salary</label><input type="number" min={0} step="any" value={empForm.salary} onChange={(e) => setEmpForm((f) => ({ ...f, salary: Number(e.target.value) || 0 }))} className="input w-full text-xs" /></div>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] rounded-lg p-2" style={{ color: "var(--fg-tertiary)", background: "var(--bg-grouped)" }}>
                    After adding, drag from their node on the flow to a department to assign them.
                  </p>

                  <div className="flex gap-2 pt-2">
                    <motion.button type="submit" disabled={empSaving || !empForm.fullName.trim() || !empForm.email.trim()} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm flex-1">{empSaving ? "Saving…" : "Send Invite"}</motion.button>
                    <button type="button" onClick={() => setEmpModalOpen(false)} className="btn btn-secondary btn-sm flex-1">Cancel</button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>


      <EmployeeModal open={empViewOpen} onClose={() => { setEmpViewOpen(false); setEmpViewId(null); setTreeRefreshKey((k) => k + 1); }} initialEmployeeId={empViewId} />
    </div>
  );
}
