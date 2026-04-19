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
import { EmployeeCard } from "../components/EmployeeCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmployeeModal } from "../components/EmployeeModal";
import toast from "react-hot-toast";
import { HeaderStatPill } from "../components/StatChips";
import { ToggleSwitch } from "../components/ToggleSwitch";
import dynamic from "next/dynamic";
import {
  ALL_WEEKDAYS,
  WEEKDAY_LABELS as FULL_DAY_LABELS,
  makeDefaultWeeklySchedule,
  resolveWeeklySchedule,
  resolveGraceMinutes,
  getTodaySchedule,
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

interface PresenceRow {
  _id: string; status: string; isLive?: boolean;
  firstEntry?: string | null; lastOfficeExit?: string | null; lastExit?: string | null;
  todayMinutes?: number; officeMinutes?: number; remoteMinutes?: number;
  lateBy?: number; shiftStart?: string; shiftEnd?: string; shiftBreakTime?: number;
  locationFlagged?: boolean;
}

const SHIFT_TYPE_LABELS: Record<string, string> = { fullTime: "Full-time", partTime: "Part-time", contract: "Contract", intern: "Intern" };
const DAY_MAP: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const FULL_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function formatWorkingDays(days: string[]) {
  const sorted = FULL_WEEK.filter((d) => days.includes(d));
  if (sorted.length === 7) return "Every day";
  if (sorted.length === 5 && ["mon", "tue", "wed", "thu", "fri"].every((d) => sorted.includes(d))) return "Mon – Fri";
  if (sorted.length === 6 && FULL_WEEK.slice(0, 6).every((d) => sorted.includes(d))) return "Mon – Sat";
  return sorted.map((d) => DAY_MAP[d] ?? d).join(", ");
}

function primaryDesignationLabel(emp: Employee): string {
  if (emp.isSuperAdmin) return "System Administrator";
  const list = emp.memberships;
  if (list?.length) {
    for (const m of list) {
      if (m.designation && typeof m.designation === "object" && "name" in m.designation && m.designation.name) return m.designation.name;
    }
  }
  return "";
}

function primaryDepartmentLabel(emp: Employee): string {
  const m = emp.memberships?.find((mb) => mb.department?.title);
  return m?.department?.title ?? emp.department?.title ?? "";
}

function parentDepartmentLabel(emp: Employee): string {
  const m = emp.memberships?.find((mb) => mb.department?.parentDepartment?.title);
  return m?.department?.parentDepartment?.title ?? "";
}

function shiftSummaryLine(emp: Employee) {
  const rec = emp as unknown as Record<string, unknown>;
  const type = SHIFT_TYPE_LABELS[emp.shiftType ?? "fullTime"] ?? emp.shiftType;
  const today = getTodaySchedule(rec, "Asia/Karachi");
  const schedule = resolveWeeklySchedule(rec);
  const workingKeys = ALL_WEEKDAYS.filter((d) => schedule[d].isWorking);
  const days = workingKeys.length ? formatWorkingDays(workingKeys) : "";
  return `${type} ${today.start}–${today.end}${days ? ` · ${days}` : ""}`;
}

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
  const { data: employees, refetch: refetchEmployees, mutate: mutateEmployees } = useQuery<Employee[]>(canViewOrg ? "/api/employees?includeSelf=true" : null, "org-employees");
  const { data: designationsData } = useQuery<{ _id: string; name: string; color: string; isActive: boolean; defaultPermissions?: Record<string, boolean> }[]>(canViewOrg ? "/api/designations" : null, "org-designations");
  const activeDesignations = useMemo(() => (designationsData ?? []).filter((d) => d.isActive !== false), [designationsData]);
  const { data: presenceData } = useQuery<PresenceRow[]>(canViewOrg ? "/api/attendance/presence" : null, "org-presence");

  const presenceById = useMemo(() => {
    const map = new Map<string, PresenceRow>();
    if (presenceData) for (const p of presenceData) map.set(p._id, p);
    return map;
  }, [presenceData]);

  const [search, setSearch] = useState("");

  /* ── Employee preview modal (full card) ── */
  const [previewEmp, setPreviewEmp] = useState<Employee | null>(null);
  const [empViewOpen, setEmpViewOpen] = useState(false);
  const [empViewId, setEmpViewId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [empTogglingId, setEmpTogglingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const canEditEmployees = canPerm("employees_edit");
  const canDeleteEmployees = canPerm("employees_delete");
  const canToggleStatus = canPerm("employees_toggleStatus");
  const canResendInvite = canPerm("employees_resendInvite");
  const canViewTeamAttendance = canPerm("attendance_viewTeam");
  const canViewAttendanceDetail = canPerm("attendance_viewDetail");
  const canViewOrgTasks = canPerm("tasks_view");
  const canViewOrgCampaigns = canPerm("campaigns_view");
  const canViewEmpLocation = canPerm("employees_viewLocation");

  function openEmployeePreview(empId: string) {
    const emp = scopedEmps.find((e) => e._id === empId);
    if (emp) setPreviewEmp(emp);
  }

  async function handleDeleteEmployee() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/employees/${deleteTarget._id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Employee removed");
        setDeleteTarget(null);
        if (previewEmp?._id === deleteTarget._id) setPreviewEmp(null);
        await refetchEmployees();
      } else { const err = await res.json().catch(() => null); toast.error(err?.error ?? "Failed to remove employee"); }
    } catch { toast.error("Something went wrong"); }
    setDeleting(false);
  }

  async function toggleEmployeeActive(emp: Employee) {
    if (empTogglingId) return;
    const newStatus = !emp.isActive;
    setEmpTogglingId(emp._id);
    mutateEmployees((prev) => prev?.map((e) => e._id === emp._id ? { ...e, isActive: newStatus } : e) ?? null);
    try {
      const res = await fetch(`/api/employees/${emp._id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newStatus }),
      });
      if (res.ok) {
        toast.success(newStatus ? "Activated" : "Deactivated");
        await refetchEmployees();
      } else { mutateEmployees((prev) => prev?.map((e) => e._id === emp._id ? { ...e, isActive: !newStatus } : e) ?? null); toast.error("Failed to update status"); }
    } catch { mutateEmployees((prev) => prev?.map((e) => e._id === emp._id ? { ...e, isActive: !newStatus } : e) ?? null); toast.error("Failed to update status"); }
    setEmpTogglingId(null);
  }

  async function resendInvite(emp: Employee) {
    setResendingId(emp._id);
    try {
      const res = await fetch(`/api/employees/${emp._id}/resend-invite`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.sent) toast.success(`Invite sent to ${emp.email}`);
        else { await navigator.clipboard.writeText(data.link); toast.success("Email failed — invite link copied"); }
      } else { const data = await res.json(); toast.error(data.error || "Failed to send"); }
    } catch { toast.error("Something went wrong"); }
    setResendingId(null);
  }

  async function copyInviteLink(emp: Employee) {
    setCopyingId(emp._id);
    try {
      const res = await fetch(`/api/employees/${emp._id}/resend-invite`, { method: "POST" });
      if (res.ok) { const data = await res.json(); await navigator.clipboard.writeText(data.link); toast.success("Invite link copied"); }
      else { const data = await res.json(); toast.error(data.error || "Failed to generate link"); }
    } catch { toast.error("Something went wrong"); }
    setCopyingId(null);
  }

  /* ── Employee edit form modal ── */
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState({
    fullName: "", email: "", password: "",
    shiftType: "fullTime", graceMinutes: 30,
    salary: 0,
    weeklySchedule: makeDefaultWeeklySchedule(),
  });
  const [empSaving, setEmpSaving] = useState(false);
  const isEditEmp = !!editingEmpId;

  const deptList = useMemo(() => departments ?? [], [departments]);
  const empList = useMemo(() => employees ?? [], [employees]);
  const canManageSalary = canPerm("payroll_manageSalary");

  function openCreateEmployee() {
    setEditingEmpId(null);
    setEmpForm({ fullName: "", email: "", password: "", shiftType: "fullTime", graceMinutes: 30, salary: 0, weeklySchedule: makeDefaultWeeklySchedule() });
    setEmpModalOpen(true);
  }

  function openEditEmployee(emp: Employee) {
    setEditingEmpId(emp._id);
    setEmpForm({
      fullName: `${emp.about.firstName} ${emp.about.lastName}`.trim(),
      email: emp.email, password: "",
      shiftType: emp.shiftType ?? "fullTime",
      graceMinutes: resolveGraceMinutes(emp as unknown as Record<string, unknown>),
      salary: (emp as unknown as Record<string, unknown>).salary as number ?? 0,
      weeklySchedule: resolveWeeklySchedule(emp as unknown as Record<string, unknown>),
    });
    setEmpModalOpen(true);
  }

  function updateEmpDay(day: Weekday, patch: Partial<DaySchedule>) {
    setEmpForm((f) => ({ ...f, weeklySchedule: { ...f.weeklySchedule, [day]: { ...f.weeklySchedule[day], ...patch } } }));
  }

  async function handleSaveEmployee() {
    if (!empForm.fullName.trim() || (!isEditEmp && !empForm.email.trim())) return;
    setEmpSaving(true);
    try {
      const schedulePayload: Record<string, unknown> = { weeklySchedule: empForm.weeklySchedule, graceMinutes: empForm.graceMinutes, shiftType: empForm.shiftType };
      if (canManageSalary) schedulePayload.salary = empForm.salary;
      if (isEditEmp) {
        const body: Record<string, unknown> = { fullName: empForm.fullName, ...schedulePayload };
        if (empForm.password) body.password = empForm.password;
        const res = await fetch(`/api/employees/${editingEmpId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.ok) { toast.success("Employee updated"); setEmpModalOpen(false); await refetchEmployees(); }
        else { const data = await res.json(); toast.error(data.error || "Failed to update"); }
      } else {
        const body: Record<string, unknown> = { email: empForm.email, fullName: empForm.fullName, ...schedulePayload };
        const res = await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.ok) { toast.success("Employee invited"); setEmpModalOpen(false); await refetchEmployees(); }
        else { const data = await res.json(); toast.error(data.error || "Failed to create"); }
      }
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
    <div className="mx-auto flex max-w-[1600px] flex-col px-4 pt-6" style={{ height: "calc(93dvh - 80px)" }}>
      {/* ── Title row ── */}
      <div data-tour="org-header" className="mb-4 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-headline text-lg font-bold" style={{ color: "var(--fg)" }}>Organization</h1>
          <HeaderStatPill label={scopedEmps.length === 1 ? "employee" : "employees"} value={scopedEmps.length} dotColor="var(--teal)" />
          <HeaderStatPill label={scopedDepts.length === 1 ? "department" : "departments"} value={scopedDepts.length} dotColor="var(--purple)" />
          {scopedEmps.filter((e) => e.isActive).length !== scopedEmps.length && (
            <HeaderStatPill label="active accounts" value={scopedEmps.filter((e) => e.isActive).length} dotColor="var(--green)" />
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
            {sessionStatus !== "loading" && canCreateEmployees && (
              <motion.button type="button" onClick={openCreateEmployee} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
                style={{ color: "var(--primary)" }} title="Add Employee">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              </motion.button>
            )}
          </div>
          {/* Departments card */}
          <div className="rounded-xl border overflow-hidden flex flex-col flex-1 min-h-0" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
            <DepartmentsPanel departments={scopedDepts} loading={deptsLoading} refetch={refetchDepts} canCreate={canCreateDepts} canEdit={canEditDepts} canDelete={canDeleteDepts} />
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
              }} />
            </div>
          )}
        </aside>

        {/* Flow diagram */}
        <main data-tour="org-context" className="min-h-0 min-w-0 flex-1">
          <OrgFlowTree departments={scopedDepts} employees={filteredEmps} designations={activeDesignations} canEditCanvas={canManageOrganization} canAssignDesignation={canPerm("members_assignDesignation")} canCustomizePermissions={canPerm("members_customizePermissions")} canAddToDepartment={canPerm("members_addToDepartment")} canRemoveFromDepartment={canPerm("members_removeFromDepartment")} editableEmployeeIds={isSuperAdmin ? undefined : hierarchyScope?.subordinateIds} onEditEmployee={(empId) => openEmployeePreview(empId)} />
        </main>
      </div>

      {/* ── Employee Preview Modal (full card) ── */}
      <Portal>
        <AnimatePresence>
          {previewEmp && (() => {
            const emp = scopedEmps.find((e) => e._id === previewEmp._id) ?? previewEmp;
            const p = presenceById.get(emp._id);
            const todaySch = getTodaySchedule(emp as unknown as Record<string, unknown>, "Asia/Karachi");
            const notSA = !emp.isSuperAdmin;
            return (
              <motion.div className="fixed inset-0 z-[60] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPreviewEmp(null)} />
                <motion.div
                  className="relative mx-4 w-full max-w-sm max-h-[92vh] overflow-y-auto rounded-2xl border shadow-xl"
                  style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                  initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className={`card group relative flex flex-col pt-4 ${!emp.isActive ? "opacity-60 grayscale" : ""}`}>
                    <EmployeeCard
                      embedded
                      idx={0}
                      onCardClick={(id) => { setPreviewEmp(null); setEmpViewId(id); setEmpViewOpen(true); }}
                      showEmployeeMeta
                      showAttendance={canViewTeamAttendance}
                      showAttendanceDetail={canViewAttendanceDetail}
                      showLocationFlags={canViewAttendanceDetail && canViewEmpLocation}
                      showTasks={canViewOrgTasks}
                      showCampaigns={canViewOrgCampaigns}
                      showActions={(canEditEmployees || canDeleteEmployees) && notSA}
                      onEdit={canEditEmployees && notSA ? () => { setPreviewEmp(null); openEditEmployee(emp); } : undefined}
                      onDelete={canDeleteEmployees && notSA ? () => setDeleteTarget(emp) : undefined}
                      emp={{
                        _id: emp._id,
                        username: emp.username,
                        firstName: emp.about.firstName,
                        lastName: emp.about.lastName,
                        email: emp.email,
                        designation: primaryDesignationLabel(emp),
                        department: primaryDepartmentLabel(emp),
                        parentDepartment: parentDepartmentLabel(emp),
                        profileImage: emp.about.profileImage,
                        isVerified: emp.isVerified,
                        isLive: p?.isLive,
                        status: p?.status,
                        locationFlagged: p?.locationFlagged,
                        firstEntry: p?.firstEntry ?? undefined,
                        lastOfficeExit: p?.lastOfficeExit ?? undefined,
                        lastExit: p?.lastExit ?? undefined,
                        todayMinutes: p?.todayMinutes,
                        officeMinutes: p?.officeMinutes,
                        remoteMinutes: p?.remoteMinutes,
                        lateBy: p?.lateBy,
                        shiftStart: p?.shiftStart ?? todaySch.start,
                        shiftEnd: p?.shiftEnd ?? todaySch.end,
                        shiftBreakTime: p?.shiftBreakTime ?? todaySch.breakMinutes,
                        phone: emp.about.phone,
                        shiftSummary: shiftSummaryLine(emp),
                      }}
                      footerSlot={
                        <div className="flex flex-wrap items-center gap-2">
                          {canToggleStatus && notSA && <ToggleSwitch size="sm" checked={emp.isActive} disabled={empTogglingId === emp._id} onChange={() => toggleEmployeeActive(emp)} />}
                          <span className="text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                            Joined {new Date(emp.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                          </span>
                          {canResendInvite && emp.isVerified === false && (
                            <>
                              <motion.button type="button" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} disabled={resendingId === emp._id} onClick={() => resendInvite(emp)} className="flex h-7 items-center gap-1 px-2 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-50" style={{ color: "var(--teal)", background: "color-mix(in srgb, var(--teal) 10%, transparent)" }} title="Send invite email">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                                {resendingId === emp._id ? "Sending…" : "Invite"}
                              </motion.button>
                              <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} disabled={copyingId === emp._id} onClick={() => copyInviteLink(emp)} className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors disabled:opacity-50" style={{ color: "var(--fg-secondary)" }} title="Copy invite link">
                                {copyingId === emp._id ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                                ) : (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                                )}
                              </motion.button>
                            </>
                          )}
                        </div>
                      }
                    />
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </Portal>

      {/* ── Employee Add/Edit Modal ── */}
      <Portal>
        <AnimatePresence>
          {empModalOpen && (
            <motion.div className="fixed inset-0 z-[60] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEmpModalOpen(false)} />
              <motion.div
                className="relative w-full max-w-lg mx-4 max-h-[92vh] overflow-y-auto rounded-2xl border p-6 shadow-xl"
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
                    <p className="text-[11px] font-medium mb-2" style={{ color: "var(--fg-secondary)" }}>Weekly Schedule</p>
                    <div className="space-y-1.5">
                      {ALL_WEEKDAYS.map((day) => {
                        const ds = empForm.weeklySchedule[day];
                        return (
                          <div key={day} className="flex items-center gap-2 text-[10px]">
                            <span className="w-8 font-semibold shrink-0" style={{ color: ds.isWorking ? "var(--fg)" : "var(--fg-tertiary)" }}>{FULL_DAY_LABELS[day].slice(0, 3)}</span>
                            <ToggleSwitch checked={ds.isWorking} onChange={() => updateEmpDay(day, { isWorking: !ds.isWorking })} />
                            <input type="time" value={ds.start} disabled={!ds.isWorking} onChange={(e) => updateEmpDay(day, { start: e.target.value })} className="input text-[10px] py-0.5 w-20" style={{ opacity: ds.isWorking ? 1 : 0.35 }} />
                            <span style={{ color: "var(--fg-tertiary)" }}>–</span>
                            <input type="time" value={ds.end} disabled={!ds.isWorking} onChange={(e) => updateEmpDay(day, { end: e.target.value })} className="input text-[10px] py-0.5 w-20" style={{ opacity: ds.isWorking ? 1 : 0.35 }} />
                            <input type="number" min={0} value={ds.breakMinutes} disabled={!ds.isWorking} onChange={(e) => updateEmpDay(day, { breakMinutes: Number(e.target.value) || 0 })} className="input text-[10px] py-0.5 w-12 text-center" style={{ opacity: ds.isWorking ? 1 : 0.35 }} />
                            <span style={{ color: "var(--fg-tertiary)" }}>break (min)</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className={`mt-2 grid gap-2 ${canManageSalary ? "grid-cols-3" : "grid-cols-2"}`}>
                      <div><label className="text-[10px] mb-0.5 block" style={{ color: "var(--fg-tertiary)" }}>Employment type</label><select value={empForm.shiftType} onChange={(e) => setEmpForm((f) => ({ ...f, shiftType: e.target.value }))} className="input w-full text-xs"><option value="fullTime">Full-time</option><option value="partTime">Part-time</option><option value="contract">Contract</option></select></div>
                      <div><label className="text-[10px] mb-0.5 block" style={{ color: "var(--fg-tertiary)" }}>Clock-in grace (minutes)</label><input type="number" min={0} value={empForm.graceMinutes} onChange={(e) => setEmpForm((f) => ({ ...f, graceMinutes: Number(e.target.value) || 0 }))} className="input w-full text-xs" /></div>
                      {canManageSalary && (
                        <div><label className="text-[10px] mb-0.5 block" style={{ color: "var(--fg-tertiary)" }}>Salary</label><input type="number" min={0} step="any" value={empForm.salary} onChange={(e) => setEmpForm((f) => ({ ...f, salary: Number(e.target.value) || 0 }))} className="input w-full text-xs" /></div>
                      )}
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

      {/* ── Delete Confirmation ── */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Remove Employee"
        description={`Remove "${deleteTarget?.about.firstName} ${deleteTarget?.about.lastName}"? This action cannot be undone.`}
        confirmLabel="Remove"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteEmployee}
        onCancel={() => setDeleteTarget(null)}
      />

      <EmployeeModal open={empViewOpen} onClose={() => setEmpViewOpen(false)} initialEmployeeId={empViewId} />
    </div>
  );
}
