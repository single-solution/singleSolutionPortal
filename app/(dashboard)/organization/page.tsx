"use client";

import { useMemo, useState, useCallback, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { staggerContainerFast, cardVariants, cardHover } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { EmployeeCard } from "../components/EmployeeCard";
import { useGuide } from "@/lib/useGuide";
import { organizationTour } from "@/lib/tourConfigs";
import { DesignationsPanel } from "./DesignationsPanel";
import { TeamsPanel } from "./TeamsPanel";
import { Portal } from "../components/Portal";
import toast from "react-hot-toast";
import dynamic from "next/dynamic";
import { PERMISSION_CATEGORIES, PERMISSION_KEYS } from "@/lib/permissions.shared";
import type { IPermissions } from "@/lib/permissions.shared";

const OrgFlowTree = dynamic(() => import("./OrgFlowTree").then((m) => m.OrgFlowTree), { ssr: false, loading: () => <div className="card-xl shimmer" style={{ height: "calc(100vh - 280px)", minHeight: 400 }} /> });

type ViewMode = "tree" | "cards";
type SortKey = "name" | "email" | "role";
type GroupBy = "none" | "department" | "team";

type Selection =
  | { kind: "none" }
  | { kind: "department"; id: string }
  | { kind: "team"; id: string; departmentId: string }
  | { kind: "unassigned" };

interface Employee {
  _id: string;
  email: string;
  username: string;
  about: { firstName: string; lastName: string; phone?: string; profileImage?: string };
  userRole: string;
  department?: { _id: string; title: string };
  teams?: { _id: string; name: string }[];
  isActive: boolean;
  isVerified?: boolean;
  workShift?: {
    type: string;
    shift: { start: string; end: string };
    workingDays: string[];
    breakTime: number;
  };
  createdAt: string;
}

interface Department {
  _id: string;
  title: string;
  slug: string;
  employeeCount: number;
  teamCount: number;
  isActive: boolean;
}

interface TeamRow {
  _id: string;
  name: string;
  slug: string;
  memberCount: number;
  department: { _id: string; title: string; slug: string };
  isActive?: boolean;
}

interface PresenceRow {
  _id: string;
  status: string;
  isLive?: boolean;
  firstEntry?: string | null;
  lastOfficeExit?: string | null;
  lastExit?: string | null;
  todayMinutes?: number;
  officeMinutes?: number;
  remoteMinutes?: number;
  lateBy?: number;
  shiftStart?: string;
  shiftEnd?: string;
  shiftBreakTime?: number;
  locationFlagged?: boolean;
}

const DESIGNATION_LABELS: Record<string, string> = {
  superadmin: "System Administrator",
  manager: "Team Manager",
  teamLead: "Team Lead",
  businessDeveloper: "Business Developer",
  developer: "Software Developer",
};

const SHIFT_TYPE_LABELS: Record<string, string> = {
  fullTime: "Full-time",
  partTime: "Part-time",
  contract: "Contract",
  intern: "Intern",
};

const DAY_MAP: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];
const FULL_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function formatWorkingDays(days: string[]) {
  const sorted = FULL_WEEK.filter((d) => days.includes(d));
  if (sorted.length === 7) return "Every day";
  if (sorted.length === 5 && WEEKDAYS.every((d) => sorted.includes(d))) return "Mon – Fri";
  if (sorted.length === 6 && FULL_WEEK.slice(0, 6).every((d) => sorted.includes(d))) return "Mon – Sat";
  return sorted.map((d) => DAY_MAP[d] ?? d).join(", ");
}

function shiftSummaryLine(emp: Employee) {
  if (!emp.workShift) return undefined;
  const type = SHIFT_TYPE_LABELS[emp.workShift.type] ?? emp.workShift.type;
  const days = emp.workShift.workingDays?.length ? formatWorkingDays(emp.workShift.workingDays) : "";
  return `${type} ${emp.workShift.shift.start}–${emp.workShift.shift.end}${days ? ` · ${days}` : ""}`;
}

function idStr(x: unknown): string {
  if (x === null || x === undefined) return "";
  if (typeof x === "string") return x;
  if (typeof x === "object" && x !== null && "_id" in x) return idStr((x as { _id: unknown })._id);
  return String(x);
}

function empFullName(emp: Employee): string {
  return `${emp.about.firstName} ${emp.about.lastName}`.trim();
}

function NavPill({
  active,
  onClick,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
      style={{
        borderColor: active ? "var(--primary)" : "var(--border)",
        background: active ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--bg-elevated)",
        color: active ? "var(--primary)" : "var(--fg-secondary)",
      }}
    >
      {children}
      {badge !== undefined && (
        <span
          className="tabular-nums rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}
        >
          {badge}
        </span>
      )}
    </button>
  );
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
  const { data: presenceData } = useQuery<PresenceRow[]>("/api/attendance/presence", "org-presence");
  const { data: designationsData, refetch: refetchDesignations } = useQuery<{ _id: string; name: string; color: string; isActive: boolean }[]>("/api/designations", "org-designations");
  const activeDesignations = useMemo(() => (designationsData ?? []).filter((d) => d.isActive !== false), [designationsData]);

  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  const ROLES = [
    { value: "developer", label: "Developer" },
    { value: "businessDeveloper", label: "Business Developer" },
    { value: "teamLead", label: "Team Lead" },
    { value: "manager", label: "Manager" },
  ];
  const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState({
    fullName: "", email: "", password: "", userRole: "developer",
    department: "", reportsTo: "", teams: [] as string[], managedDepartments: [] as string[],
    shiftType: "fullTime", shiftStart: "10:00", shiftEnd: "19:00",
    workingDays: ["mon", "tue", "wed", "thu", "fri"], breakTime: 60,
  });
  const [empSaving, setEmpSaving] = useState(false);
  const isEditEmp = !!editingEmpId;
  const [empDesignation, setEmpDesignation] = useState("");
  const [showNewDesig, setShowNewDesig] = useState(false);
  const [newDesigName, setNewDesigName] = useState("");
  const [newDesigColor, setNewDesigColor] = useState("#6366f1");
  const [creatingDesig, setCreatingDesig] = useState(false);

  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);

  // --- Manage Designation & Privileges modal ---
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [manageEmpId, setManageEmpId] = useState<string | null>(null);
  const [manageEmpName, setManageEmpName] = useState("");
  const [manageDept, setManageDept] = useState("");
  const [manageTeams, setManageTeams] = useState<string[]>([]);
  const [manageReportsTo, setManageReportsTo] = useState("");
  const [manageManagedDepts, setManageManagedDepts] = useState<string[]>([]);
  const [empPermissions, setEmpPermissions] = useState<Record<string, boolean>>(() => {
    const p: Record<string, boolean> = {};
    for (const k of PERMISSION_KEYS) p[k] = false;
    return p;
  });
  const [showPermissions, setShowPermissions] = useState(false);
  const [manageSaving, setManageSaving] = useState(false);

  async function createDesignationInline() {
    if (!newDesigName.trim()) return;
    setCreatingDesig(true);
    try {
      const res = await fetch("/api/designations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newDesigName.trim(), color: newDesigColor }) });
      if (res.ok) {
        const created = await res.json();
        await refetchDesignations();
        setEmpDesignation(created._id);
        setShowNewDesig(false); setNewDesigName(""); setNewDesigColor("#6366f1");
      }
    } catch { /* ignore */ }
    setCreatingDesig(false);
  }

  async function createTeamInline() {
    if (!newTeamName.trim() || !empForm.department) return;
    setCreatingTeam(true);
    try {
      const res = await fetch("/api/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newTeamName.trim(), department: empForm.department }) });
      if (res.ok) {
        const created = await res.json();
        await refetchTeams();
        setEmpForm((f) => ({ ...f, teams: [...f.teams, created._id] }));
        setShowNewTeam(false); setNewTeamName("");
      }
    } catch { /* ignore */ }
    setCreatingTeam(false);
  }

  function openManageModal(emp: Employee) {
    setManageEmpId(emp._id);
    setManageEmpName(`${emp.about.firstName} ${emp.about.lastName}`.trim());
    setManageDept(emp.department?._id ?? "");
    setManageTeams((emp.teams ?? []).map((t) => t._id));
    setManageReportsTo("");
    const managed = (departments ?? [])
      .filter((d) => { const raw = d as unknown as Record<string, unknown>; const mId = typeof raw.manager === "object" && raw.manager ? (raw.manager as { _id: string })._id : raw.manager; return mId === emp._id; })
      .map((d) => d._id);
    setManageManagedDepts(managed);
    const empAny = emp as unknown as Record<string, unknown>;
    setEmpDesignation(typeof empAny.designation === "string" ? empAny.designation : typeof empAny.designation === "object" && empAny.designation ? (empAny.designation as { _id: string })._id : "");
    const existingPerms = (empAny.permissions ?? {}) as Record<string, boolean>;
    const p: Record<string, boolean> = {};
    for (const k of PERMISSION_KEYS) p[k] = !!existingPerms[k];
    setEmpPermissions(p);
    setShowPermissions(false); setShowNewDesig(false); setShowNewTeam(false);
    setManageModalOpen(true);
  }

  async function handleSaveManage() {
    if (!manageEmpId) return;
    setManageSaving(true);
    try {
      const body: Record<string, unknown> = {
        department: manageDept || null,
        teams: manageTeams,
        reportsTo: manageReportsTo || null,
        managedDepartments: manageManagedDepts,
      };
      if (empDesignation) body.designation = empDesignation;
      body.permissions = empPermissions;
      const res = await fetch(`/api/employees/${manageEmpId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { toast.success("Assignment updated"); setManageModalOpen(false); await refetchEmployees(); }
      else { const data = await res.json(); toast.error(data.error || "Failed to update"); }
    } catch { toast.error("Something went wrong"); }
    setManageSaving(false);
  }

  function toggleManageTeam(id: string) { setManageTeams((t) => t.includes(id) ? t.filter((x) => x !== id) : [...t, id]); }
  function toggleManageManagedDept(id: string) { setManageManagedDepts((d) => d.includes(id) ? d.filter((x) => x !== id) : [...d, id]); }

  function openCreateEmployee() {
    setEditingEmpId(null);
    setEmpForm({ fullName: "", email: "", password: "", userRole: "developer", department: "", reportsTo: "", teams: [], managedDepartments: [], shiftType: "fullTime", shiftStart: "10:00", shiftEnd: "19:00", workingDays: ["mon", "tue", "wed", "thu", "fri"], breakTime: 60 });
    setShowNewTeam(false);
    setEmpModalOpen(true);
  }
  async function openEditEmployee(emp: Employee) {
    const managed = (departments ?? [])
      .filter((d) => { const raw = d as unknown as Record<string, unknown>; const mId = typeof raw.manager === "object" && raw.manager ? (raw.manager as { _id: string })._id : raw.manager; return mId === emp._id; })
      .map((d) => d._id);
    setEditingEmpId(emp._id);
    setEmpForm({
      fullName: `${emp.about.firstName} ${emp.about.lastName}`.trim(),
      email: emp.email, password: "", userRole: emp.userRole,
      department: emp.department?._id ?? "", reportsTo: "",
      teams: (emp.teams ?? []).map((t) => t._id), managedDepartments: managed,
      shiftType: emp.workShift?.type ?? "fullTime", shiftStart: emp.workShift?.shift?.start ?? "10:00", shiftEnd: emp.workShift?.shift?.end ?? "19:00",
      workingDays: emp.workShift?.workingDays ?? ["mon", "tue", "wed", "thu", "fri"], breakTime: emp.workShift?.breakTime ?? 60,
    });
    setShowNewTeam(false);
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
  function toggleEmpTeam(id: string) { setEmpForm((f) => ({ ...f, teams: f.teams.includes(id) ? f.teams.filter((t) => t !== id) : [...f.teams, id] })); }
  function toggleEmpManagedDept(id: string) { setEmpForm((f) => ({ ...f, managedDepartments: f.managedDepartments.includes(id) ? f.managedDepartments.filter((d) => d !== id) : [...f.managedDepartments, id] })); }

  const deptList = useMemo(() => departments ?? [], [departments]);
  const teamList = useMemo(() => teams ?? [], [teams]);
  const empList = useMemo(() => employees ?? [], [employees]);

  const presenceById = useMemo(() => {
    const map = new Map<string, PresenceRow>();
    if (presenceData) for (const p of presenceData) map.set(p._id, p);
    return map;
  }, [presenceData]);

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

  const unassignedEmployees = useMemo(
    () => empList.filter((e) => !e.department?._id),
    [empList],
  );

  const unassignedCount = unassignedEmployees.length;

  const toggleDept = useCallback((deptId: string) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  }, []);

  const baseFilteredEmployees = useMemo(() => {
    let list = empList;
    if (selection.kind === "department") {
      list = list.filter((e) => idStr(e.department?._id) === selection.id);
    } else if (selection.kind === "team") {
      list = list.filter((e) => (e.teams ?? []).some((t) => idStr(t._id) === selection.id));
    } else if (selection.kind === "unassigned") {
      list = unassignedEmployees;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        `${e.about.firstName} ${e.about.lastName} ${e.email} ${e.username}`.toLowerCase().includes(q),
      );
    }
    return list;
  }, [empList, selection, search, unassignedEmployees]);

  const sortedEmployees = useMemo(() => {
    const arr = [...baseFilteredEmployees];
    switch (sortKey) {
      case "name":
        arr.sort((a, b) => empFullName(a).localeCompare(empFullName(b)));
        break;
      case "email":
        arr.sort((a, b) => a.email.localeCompare(b.email));
        break;
      case "role":
        arr.sort((a, b) => a.userRole.localeCompare(b.userRole) || empFullName(a).localeCompare(empFullName(b)));
        break;
    }
    return arr;
  }, [baseFilteredEmployees, sortKey]);

  const groupedEmployees = useMemo(() => {
    if (groupBy === "none" || selection.kind !== "none") return null;
    const groups: { key: string; label: string; members: Employee[] }[] = [];
    if (groupBy === "department") {
      for (const dept of deptList) {
        const members = sortedEmployees.filter((e) => idStr(e.department?._id) === dept._id);
        if (members.length > 0) groups.push({ key: dept._id, label: dept.title, members });
      }
      const noD = sortedEmployees.filter((e) => !e.department?._id);
      if (noD.length > 0) groups.push({ key: "unassigned", label: "Unassigned", members: noD });
    } else if (groupBy === "team") {
      for (const team of teamList) {
        const members = sortedEmployees.filter((e) => (e.teams ?? []).some((t) => idStr(t._id) === team._id));
        if (members.length > 0) groups.push({ key: team._id, label: team.name, members });
      }
      const noT = sortedEmployees.filter((e) => !(e.teams ?? []).length);
      if (noT.length > 0) groups.push({ key: "no-team", label: "No Team", members: noT });
    }
    return groups;
  }, [groupBy, selection.kind, deptList, teamList, sortedEmployees]);

  const selectedDepartment = useMemo(() => {
    if (selection.kind !== "department") return null;
    return deptList.find((d) => d._id === selection.id) ?? null;
  }, [selection, deptList]);

  const selectedTeam = useMemo(() => {
    if (selection.kind !== "team") return null;
    return teamList.find((t) => t._id === selection.id) ?? null;
  }, [selection, teamList]);

  const deptTeams = useMemo(() => {
    if (!selectedDepartment) return [];
    return teamsByDept.get(selectedDepartment._id) ?? [];
  }, [selectedDepartment, teamsByDept]);

  const employeesGroupedByTeam = useMemo(() => {
    if (selection.kind !== "department" || !selectedDepartment) return null;
    const tidSet = new Set(deptTeams.map((t) => t._id));
    const groups: { team: TeamRow | null; members: Employee[] }[] = [];
    for (const team of deptTeams) {
      const members = sortedEmployees.filter((e) => (e.teams ?? []).some((t) => idStr(t._id) === team._id));
      groups.push({ team, members });
    }
    const noTeam = sortedEmployees.filter(
      (e) => !(e.teams ?? []).some((t) => tidSet.has(idStr(t._id))),
    );
    groups.push({ team: null, members: noTeam });
    return groups;
  }, [selection.kind, selectedDepartment, deptTeams, sortedEmployees]);

  const visibleDepts = useMemo(() => {
    if (selection.kind !== "none" || !search.trim()) return deptList;
    const q = search.toLowerCase();
    return deptList.filter((d) => {
      if (d.title.toLowerCase().includes(q)) return true;
      const ts = teamsByDept.get(d._id) ?? [];
      return ts.some((t) => t.name.toLowerCase().includes(q));
    });
  }, [deptList, teamsByDept, search, selection.kind]);

  const renderEmployeeCard = (emp: Employee, i: number) => {
    const p = presenceById.get(emp._id);
    return (
      <motion.div
        key={emp._id}
        variants={cardVariants}
        custom={i}
        layout
        whileHover={cardHover}
        className="h-full"
        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      >
        <div
          className={`card group relative flex h-full flex-col overflow-visible transition-opacity duration-300 ${!emp.isActive ? "opacity-50 grayscale" : ""}`}
        >
          <EmployeeCard
            embedded
            idx={i}
            showRoleDepartmentTeams
            showActions={canManage}
            onEdit={canManage ? () => openEditEmployee(emp) : undefined}
            onManage={canManage ? () => openManageModal(emp) : undefined}
            emp={{
              _id: emp._id,
              username: emp.username,
              firstName: emp.about.firstName,
              lastName: emp.about.lastName,
              email: emp.email,
              designation: DESIGNATION_LABELS[emp.userRole] ?? emp.userRole,
              department: emp.department?.title,
              profileImage: emp.about.profileImage,
              userRole: emp.userRole,
              teams: emp.teams,
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
              shiftStart: p?.shiftStart ?? emp.workShift?.shift.start,
              shiftEnd: p?.shiftEnd ?? emp.workShift?.shift.end,
              shiftBreakTime: p?.shiftBreakTime ?? emp.workShift?.breakTime,
              phone: emp.about.phone,
              shiftSummary: shiftSummaryLine(emp),
            }}
          />
        </div>
      </motion.div>
    );
  };

  const renderEmployeeGrid = (emps: Employee[], emptyMsg: string) => {
    if (employeesLoading) {
      return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card-xl shimmer h-40 rounded-xl" />
          ))}
        </div>
      );
    }
    if (emps.length === 0) {
      return (
        <p className="p-6 text-sm" style={{ color: "var(--fg-secondary)" }}>{emptyMsg}</p>
      );
    }
    if (viewMode === "cards") {
      return (
        <motion.div
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          variants={staggerContainerFast}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence>{emps.map((emp, i) => renderEmployeeCard(emp, i))}</AnimatePresence>
        </motion.div>
      );
    }
    return null;
  };

  const loading = deptsLoading || teamsLoading || employeesLoading;

  const sidebarNodes = (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setSelection({ kind: "none" })}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold transition-colors"
        style={{
          background: selection.kind === "none" ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
          color: selection.kind === "none" ? "var(--primary)" : "var(--fg)",
        }}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </span>
        <span className="flex-1 text-left">All Employees</span>
        <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
          {empList.length}
        </span>
      </button>

      {visibleDepts.map((dept) => {
        const expanded = expandedDepts.has(dept._id) || !!search.trim();
        const subTeams = teamsByDept.get(dept._id) ?? [];

        return (
          <div key={dept._id} className="ml-0">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => toggleDept(dept._id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors"
                style={{ color: "var(--fg-tertiary)" }}
                aria-expanded={expanded}
              >
                <motion.svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  animate={{ rotate: expanded ? 90 : 0 }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </motion.svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelection({ kind: "department", id: dept._id });
                  if (!expandedDepts.has(dept._id)) toggleDept(dept._id);
                }}
                className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-sm font-medium transition-colors"
                style={{
                  background: selection.kind === "department" && selection.id === dept._id ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
                  color: selection.kind === "department" && selection.id === dept._id ? "var(--primary)" : "var(--fg)",
                }}
              >
                <span className="block truncate">{dept.title}</span>
                <span className="text-[10px] font-normal tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                  {dept.employeeCount} people · {dept.teamCount} teams
                </span>
              </button>
            </div>

            <AnimatePresence initial={false}>
              {expanded && subTeams.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="ml-7 overflow-hidden border-l pl-2"
                  style={{ borderColor: "var(--border)" }}
                >
                  {subTeams.map((team) => (
                    <button
                      key={team._id}
                      type="button"
                      onClick={() => setSelection({ kind: "team", id: team._id, departmentId: idStr(team.department) })}
                      className="mb-0.5 flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors"
                      style={{
                        background: selection.kind === "team" && selection.id === team._id ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "transparent",
                        color: selection.kind === "team" && selection.id === team._id ? "var(--primary)" : "var(--fg-secondary)",
                      }}
                    >
                      <span className="truncate font-medium">{team.name}</span>
                      <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
                        {team.memberCount}
                      </span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          onClick={() => setSelection({ kind: "unassigned" })}
          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium transition-colors"
          style={{
            background: selection.kind === "unassigned" ? "color-mix(in srgb, var(--amber) 14%, transparent)" : "var(--bg-grouped)",
            color: selection.kind === "unassigned" ? "var(--amber)" : "var(--fg-secondary)",
          }}
        >
          Unassigned
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums" style={{ background: "var(--bg-elevated)", color: "var(--fg-tertiary)" }}>
            {unassignedCount}
          </span>
        </button>
      </div>

      {isSuperAdmin && (
        <>
          <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
            <TeamsPanel teams={teamList as any} departments={deptList} loading={teamsLoading} refetch={refetchTeams} />
          </div>
          <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
            <DesignationsPanel />
          </div>
        </>
      )}
    </div>
  );

  const mobileDeptSource = selection.kind === "none" && search.trim() ? visibleDepts : deptList;

  const mobilePills = (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <NavPill active={selection.kind === "none"} onClick={() => setSelection({ kind: "none" })} badge={empList.length}>
        All
      </NavPill>
      <NavPill
        active={selection.kind === "unassigned"}
        onClick={() => setSelection({ kind: "unassigned" })}
        badge={unassignedCount}
      >
        Unassigned
      </NavPill>
      {mobileDeptSource.map((dept) => (
        <NavPill
          key={dept._id}
          active={selection.kind === "department" && selection.id === dept._id}
          onClick={() => setSelection({ kind: "department", id: dept._id })}
        >
          {dept.title}
        </NavPill>
      ))}
      {teamList.map((team) => (
        <NavPill
          key={`m-team-${team._id}`}
          active={selection.kind === "team" && selection.id === team._id}
          onClick={() => setSelection({ kind: "team", id: team._id, departmentId: idStr(team.department) })}
        >
          {team.name}
        </NavPill>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-6">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="shrink-0">
          <h1 className="text-title-2 font-bold tracking-tight" style={{ color: "var(--fg)" }}>Organization</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--fg-secondary)" }}>Departments, teams, and people.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ borderColor: "var(--border-strong)", background: "var(--bg)" }}>
            {(["tree", "cards"] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => setViewMode(mode)} className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all whitespace-nowrap ${viewMode === mode ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"}`}>
                {mode === "tree" ? "Flow" : mode}
              </button>
            ))}
          </div>

          {selection.kind === "none" && viewMode !== "tree" && (
            <>
              <div className="h-4 w-px" style={{ background: "var(--border)" }} />
              <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ borderColor: "var(--border-strong)", background: "var(--bg)" }}>
                {(["name", "email", "role"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setSortKey(s)} className={`px-2 py-1 rounded-md text-[11px] font-medium capitalize transition-all ${sortKey === s ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)]"}`}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ borderColor: "var(--border-strong)", background: "var(--bg)" }}>
                {([["none", "All"], ["department", "Dept"], ["team", "Team"]] as const).map(([g, label]) => (
                  <button key={g} type="button" onClick={() => setGroupBy(g as GroupBy)} className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${groupBy === g ? "bg-[var(--teal)] text-white shadow-sm" : "text-[var(--fg-secondary)]"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="card-xl mb-4 flex items-center gap-3 p-4">
        <div className="relative w-full flex-1">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people, departments, teams…" className="input w-full" style={{ paddingLeft: "40px" }} />
        </div>
        {sessionStatus !== "loading" && canManage && (
          <motion.button type="button" onClick={openCreateEmployee} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Employee
          </motion.button>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Mobile: horizontal pills */}
        <div className="lg:hidden">{mobilePills}</div>

        {/* Left sidebar */}
        <aside
          className="card-xl hidden max-h-[calc(100vh-220px)] w-full shrink-0 overflow-y-auto p-3 lg:block lg:w-[300px]"
          style={{ borderColor: "var(--border)", scrollbarWidth: "thin" }}
        >
          {deptsLoading && deptList.length === 0 ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="shimmer h-10 rounded-lg" />
              ))}
            </div>
          ) : (
            sidebarNodes
          )}
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            {selection.kind === "none" && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                {/* Overview content */}
                {viewMode === "tree" ? (
                  <OrgFlowTree departments={deptList} teams={teamList} employees={empList} teamsByDept={teamsByDept} />
                ) : groupedEmployees ? (
                  <div className="space-y-4">
                    {groupedEmployees.map((g) => (
                      <div key={g.key}>
                        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--fg)" }}>
                          {g.label}
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
                            {g.members.length}
                          </span>
                        </h3>
                        {renderEmployeeGrid(g.members, "No people in this group.")}
                      </div>
                    ))}
                  </div>
                ) : (
                  renderEmployeeGrid(sortedEmployees, "No people found.")
                )}
              </motion.div>
            )}

            {selection.kind === "department" && selectedDepartment && (
              <motion.div
                key={`dept-${selectedDepartment._id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <div className="card-xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold" style={{ color: "var(--fg)" }}>{selectedDepartment.title}</h2>
                      <p className="mt-1 text-sm tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                        {selectedDepartment.employeeCount} employees · {selectedDepartment.teamCount} teams
                      </p>
                    </div>
                  </div>

                  {deptTeams.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {deptTeams.map((t) => (
                        <button
                          key={t._id}
                          type="button"
                          onClick={() => setSelection({ kind: "team", id: t._id, departmentId: selectedDepartment._id })}
                          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                          style={{ borderColor: "var(--border)", background: "var(--bg-grouped)", color: "var(--fg)" }}
                        >
                          {t.name}
                          <span className="tabular-nums opacity-70">{t.memberCount}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {viewMode === "tree" && employeesGroupedByTeam ? (
                  <div className="space-y-6">
                    {employeesGroupedByTeam.map(({ team, members }) => (
                      <div key={team?._id ?? "no-team"} className="card-xl overflow-hidden p-4">
                        <h3 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                          {team ? team.name : "No team"}
                          <span className="ml-2 text-xs font-normal tabular-nums" style={{ color: "var(--fg-tertiary)" }}>({members.length})</span>
                        </h3>
                        <div className="mt-3 space-y-1 border-l-2 pl-3" style={{ borderColor: "var(--border)" }}>
                          {members.length === 0 ? (
                            <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>None</p>
                          ) : (
                            members.map((emp) => (
                              <Link key={emp._id} href={`/employee/${emp.username}`} className="block truncate text-sm py-0.5 transition-colors hover:underline" style={{ color: "var(--primary)" }}>
                                {emp.about.firstName} {emp.about.lastName}
                                <span className="ml-2 text-xs" style={{ color: "var(--fg-secondary)" }}>{emp.email}</span>
                              </Link>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  renderEmployeeGrid(sortedEmployees, "No people match this filter.")
                )}
              </motion.div>
            )}

            {selection.kind === "team" && selectedTeam && (
              <motion.div
                key={`team-${selectedTeam._id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <div className="card-xl p-5">
                  <h2 className="text-xl font-bold" style={{ color: "var(--fg)" }}>{selectedTeam.name}</h2>
                  <p className="mt-1 text-sm tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                    {selectedTeam.department?.title} · {selectedTeam.memberCount} members
                  </p>
                </div>
                {renderEmployeeGrid(sortedEmployees, "No members in this team.")}
              </motion.div>
            )}

            {selection.kind === "unassigned" && (
              <motion.div
                key="unassigned"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <div className="card-xl p-5">
                  <h2 className="text-xl font-bold" style={{ color: "var(--fg)" }}>Unassigned</h2>
                  <p className="mt-1 text-sm" style={{ color: "var(--fg-secondary)" }}>
                    People without a department ({unassignedCount}).
                  </p>
                </div>
                {renderEmployeeGrid(sortedEmployees, "No unassigned people.")}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

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
                <h2 className="text-headline text-lg mb-4">{isEditEmp ? "Edit Employee" : "Invite Employee"}</h2>
                <form onSubmit={(e) => { e.preventDefault(); handleSaveEmployee(); }} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Full Name</label><input type="text" value={empForm.fullName} onChange={(e) => setEmpForm((f) => ({ ...f, fullName: e.target.value }))} className="input w-full" required autoFocus /></div>
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Email</label><input type="email" value={empForm.email} onChange={(e) => setEmpForm((f) => ({ ...f, email: e.target.value }))} className="input w-full" required disabled={isEditEmp} /></div>
                  </div>

                  {isEditEmp && (
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>New Password (optional)</label><input type="password" value={empForm.password} onChange={(e) => setEmpForm((f) => ({ ...f, password: e.target.value }))} className="input w-full" placeholder="Leave blank to keep current" /></div>
                  )}

                  <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
                    <p className="text-footnote font-medium mb-2" style={{ color: "var(--fg-secondary)" }}>Shift Configuration</p>
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
                      After adding, use the <strong>Manage</strong> button on their card to assign department, team, designation, and permissions.
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

      {/* Manage Designation & Privileges modal */}
      <Portal>
        <AnimatePresence>
          {manageModalOpen && (
            <motion.div className="fixed inset-0 z-[60] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setManageModalOpen(false)} />
              <motion.div
                className="relative w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto rounded-2xl border p-6 shadow-xl"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-headline text-lg mb-1">Manage Assignment</h2>
                <p className="text-xs mb-4" style={{ color: "var(--fg-secondary)" }}>{manageEmpName}</p>
                <div className="space-y-3">
                  {/* Department */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Department</label><select value={manageDept} onChange={(e) => setManageDept(e.target.value)} className="input w-full"><option value="">None</option>{(departments ?? []).map((d) => <option key={d._id} value={d._id}>{d.title}</option>)}</select></div>
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Reports To</label><select value={manageReportsTo} onChange={(e) => setManageReportsTo(e.target.value)} className="input w-full"><option value="">None</option>{(employees ?? []).filter((e) => e._id !== manageEmpId).map((e) => <option key={e._id} value={e._id}>{empFullName(e)}</option>)}</select></div>
                  </div>

                  {/* Teams */}
                  <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Teams</label>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {(teams ?? []).filter((t) => !manageDept || idStr(t.department?._id ?? t.department) === manageDept).map((t) => (<button key={t._id} type="button" onClick={() => toggleManageTeam(t._id)} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${manageTeams.includes(t._id) ? "text-white shadow-sm" : "text-[var(--fg-secondary)]"}`} style={manageTeams.includes(t._id) ? { background: "var(--purple)" } : { background: "var(--bg-grouped)" }}>{t.name}</button>))}
                      {manageDept && <button type="button" onClick={() => setShowNewTeam(!showNewTeam)} className="px-2.5 py-1 rounded-lg text-[11px] font-medium border border-dashed transition-all" style={{ borderColor: "var(--border)", color: "var(--fg-tertiary)" }}>+ New</button>}
                    </div>
                    {showNewTeam && manageDept && (
                      <div className="mt-2 flex items-center gap-2">
                        <input type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="Team name…" className="input flex-1 text-xs" />
                        <motion.button type="button" onClick={async () => { if (!newTeamName.trim()) return; setCreatingTeam(true); try { const res = await fetch("/api/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newTeamName.trim(), department: manageDept }) }); if (res.ok) { const c = await res.json(); await refetchTeams(); setManageTeams((t) => [...t, c._id]); setShowNewTeam(false); setNewTeamName(""); } } catch {} setCreatingTeam(false); }} disabled={creatingTeam || !newTeamName.trim()} whileTap={{ scale: 0.97 }} className="btn btn-primary btn-sm text-[10px]" style={{ padding: "4px 8px" }}>{creatingTeam ? "…" : "Create"}</motion.button>
                      </div>
                    )}
                  </div>

                  {/* Managed Departments */}
                  {(departments ?? []).length > 0 && (
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Managed Departments</label>
                      <div className="flex flex-wrap gap-1.5">{(departments ?? []).map((d) => (<button key={d._id} type="button" onClick={() => toggleManageManagedDept(d._id)} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${manageManagedDepts.includes(d._id) ? "text-white shadow-sm" : "text-[var(--fg-secondary)]"}`} style={manageManagedDepts.includes(d._id) ? { background: "var(--teal)" } : { background: "var(--bg-grouped)" }}>{d.title}</button>))}</div>
                    </div>
                  )}

                  {/* Designation */}
                  <div>
                    <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Designation</label>
                    <div className="flex items-center gap-2">
                      <select value={empDesignation} onChange={(e) => setEmpDesignation(e.target.value)} className="input flex-1">
                        <option value="">Select or create…</option>
                        {activeDesignations.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                      </select>
                      <button type="button" onClick={() => setShowNewDesig(!showNewDesig)} className="btn btn-secondary btn-sm shrink-0 text-xs" style={{ padding: "4px 8px" }}>+ New</button>
                    </div>
                    {showNewDesig && (
                      <div className="mt-2 rounded-lg p-2 space-y-1.5" style={{ background: "var(--bg-grouped)" }}>
                        <input type="text" value={newDesigName} onChange={(e) => setNewDesigName(e.target.value)} placeholder="e.g. Senior Developer" className="input w-full text-xs" />
                        <div className="flex items-center gap-1.5">
                          {["#6366f1","#3b82f6","#8b5cf6","#ef4444","#f59e0b","#10b981","#06b6d4","#ec4899"].map((c) => (
                            <button key={c} type="button" onClick={() => setNewDesigColor(c)} className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110" style={{ background: c, borderColor: newDesigColor === c ? "var(--fg)" : "transparent" }} />
                          ))}
                          <motion.button type="button" onClick={createDesignationInline} disabled={creatingDesig || !newDesigName.trim()} whileTap={{ scale: 0.97 }} className="btn btn-primary btn-sm ml-auto text-[10px]" style={{ padding: "2px 8px" }}>{creatingDesig ? "…" : "Create"}</motion.button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Privileges accordion */}
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                    <button type="button" onClick={() => setShowPermissions(!showPermissions)} className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg)" }}>
                      <span className="flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        Privileges / Permissions
                      </span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${showPermissions ? "rotate-180" : ""}`}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <AnimatePresence>
                      {showPermissions && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="px-3 pb-3 space-y-3 max-h-[280px] overflow-y-auto">
                            {PERMISSION_CATEGORIES.map((cat) => (
                              <div key={cat.label}>
                                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--fg-tertiary)" }}>{cat.label}</p>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                  {cat.keys.map((k) => (
                                    <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                                      <input type="checkbox" checked={!!empPermissions[k]} onChange={(e) => setEmpPermissions((p) => ({ ...p, [k]: e.target.checked }))} className="h-3.5 w-3.5 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]" />
                                      <span className="text-[11px] capitalize" style={{ color: "var(--fg-secondary)" }}>{k.split("_").slice(1).join(" ")}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <motion.button type="button" onClick={handleSaveManage} disabled={manageSaving} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm flex-1">{manageSaving ? "Saving…" : "Save Assignment"}</motion.button>
                    <button type="button" onClick={() => setManageModalOpen(false)} className="btn btn-secondary btn-sm flex-1">Cancel</button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}
