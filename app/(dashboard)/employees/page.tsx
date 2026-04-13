"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainerFast, cardVariants, cardHover } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmployeeCard } from "../components/EmployeeCard";
import { SearchField, SegmentedControl, PageHeader, EmptyState } from "../components/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import toast from "react-hot-toast";
import { ScopeStrip } from "../components/ScopeStrip";
import { EmployeeModal } from "../components/EmployeeModal";
import { useGuide } from "@/lib/useGuide";
import { employeesTour } from "@/lib/tourConfigs";
import {
  ALL_WEEKDAYS,
  getTodaySchedule,
  resolveWeeklySchedule,
  type WeeklySchedule,
} from "@/lib/schedule";

interface Employee {
  _id: string;
  email: string;
  username: string;
  about: { firstName: string; lastName: string; phone?: string; profileImage?: string };
  isSuperAdmin?: boolean;
  memberships?: Array<{ designation?: { name: string } | null }>;
  department?: { _id: string; title: string };
  isActive: boolean;
  isVerified?: boolean;
  weeklySchedule?: WeeklySchedule;
  shiftType?: string;
  createdAt: string;
}

const SHIFT_TYPE_LABELS: Record<string, string> = {
  fullTime: "Full-time",
  partTime: "Part-time",
  contract: "Contract",
  intern: "Intern",
};

type SortMode = "recent" | "name";
type GroupMode = "flat" | "department";

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

function primaryDesignationLabel(emp: Employee): string {
  if (emp.isSuperAdmin) return "System Administrator";
  const list = emp.memberships;
  if (list?.length) {
    for (const m of list) {
      const des = m.designation;
      if (des && typeof des === "object" && "name" in des && des.name) return des.name;
    }
  }
  return "Employee";
}

function shiftSummaryLine(emp: Employee) {
  const rec = emp as unknown as Record<string, unknown>;
  const typeKey = emp.shiftType ?? "fullTime";
  const type = SHIFT_TYPE_LABELS[typeKey] ?? typeKey;
  const today = getTodaySchedule(rec, "Asia/Karachi");
  const schedule = resolveWeeklySchedule(rec);
  const workingKeys = ALL_WEEKDAYS.filter((d) => schedule[d].isWorking);
  const days = workingKeys.length ? formatWorkingDays(workingKeys) : "";
  return `${type} ${today.start}–${today.end}${days ? ` · ${days}` : ""}`;
}

export default function EmployeesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status: sessionStatus } = useSession();
  const { registerTour } = useGuide();
  useEffect(() => { registerTour("employees", employeesTour); }, [registerTour]);
  const scopeDept = searchParams.get("dept") ?? "all";
  function setScopeDept(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "all") params.delete("dept"); else params.set("dept", id);
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  const { can: canPerm } = usePermissions();
  const canCreateEmployees = canPerm("employees_create");
  const canEditEmployees = canPerm("employees_edit");
  const canDeleteEmployees = canPerm("employees_delete");
  const canToggleEmployeeStatus = canPerm("employees_toggleStatus");
  const canViewEmployees = canPerm("employees_view");
  const canViewTeamAttendance = canPerm("attendance_viewTeam");
  const canViewAttendanceDetail = canPerm("attendance_viewDetail");
  const canViewTasksList = canPerm("tasks_view");
  const canViewCampaignsList = canPerm("campaigns_view");
  const canResendInvite = canPerm("employees_resendInvite");
  const { data: employees, loading: employeesLoading, refetch: refetchEmployees, mutate: mutateEmployees } = useQuery<Employee[]>(canViewEmployees ? "/api/employees" : null, "employees");
  const { data: presenceData } = useQuery<PresenceRow[]>(canViewEmployees && canViewTeamAttendance ? "/api/attendance/presence" : null, "presence");

  const presenceById = useMemo(() => {
    const map = new Map<string, PresenceRow>();
    if (presenceData) for (const p of presenceData) map.set(p._id, p);
    return map;
  }, [presenceData]);

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [groupMode, setGroupMode] = useState<GroupMode>("flat");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [empModalId, setEmpModalId] = useState<string | null>(null);

  useEffect(() => {
    const viewId = searchParams.get("view");
    if (viewId) {
      setEmpModalId(viewId);
      setEmpModalOpen(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("view");
      router.replace(params.toString() ? `?${params.toString()}` : "?", { scroll: false });
    }
  }, [searchParams, router]);

  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const empList = employees ?? [];

  const empInsights = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const mo = now.getMonth();
    const monthStart = new Date(y, mo, 1);
    const nextMonthStart = new Date(y, mo + 1, 1);
    let inactive = 0;
    let verified = 0;
    let unverified = 0;
    let noDept = 0;
    let newThisMonth = 0;
    for (const e of empList) {
      if (e.isActive === false) inactive++;
      if (e.department == null) noDept++;
      const created = new Date(e.createdAt);
      if (!Number.isNaN(created.getTime()) && created >= monthStart && created < nextMonthStart) newThisMonth++;
      const ext = e as Employee & { password?: unknown };
      const hasPassword =
        ext.password === true ||
        (typeof ext.password === "string" && ext.password.length > 0);
      if (e.isVerified === true || hasPassword) verified++;
      else unverified++;
    }
    const shiftCounts = new Map<string, number>();
    const desCounts = new Map<string, number>();
    for (const e of empList) {
      const st = e.shiftType || "unset";
      shiftCounts.set(st, (shiftCounts.get(st) ?? 0) + 1);
      const des = e.memberships?.find((m) => m.designation?.name)?.designation?.name ?? "";
      if (des) desCounts.set(des, (desCounts.get(des) ?? 0) + 1);
    }
    const shiftBreakdown = [...shiftCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: SHIFT_TYPE_LABELS[k] ?? k, count: v }));
    const desBreakdown = [...desCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, count: v }));
    const noDesCount = empList.filter((e) => !e.memberships?.some((m) => m.designation?.name)).length;
    const len = empList.length;
    const verificationRate = len ? Math.round((verified / len) * 100) : 0;
    const activeRate = len ? Math.round(((len - inactive) / len) * 100) : 0;
    const superAdminCount = empList.filter((e) => e.isSuperAdmin).length;
    return {
      inactive,
      verified,
      unverified,
      noDept,
      newThisMonth,
      shiftBreakdown,
      desBreakdown,
      noDesignation: noDesCount,
      verificationRate,
      activeRate,
      superAdminCount,
    };
  }, [empList]);

  const filtered = useMemo(() => {
    let list = empList;
    if (scopeDept !== "all") list = list.filter((e) => e.department?._id === scopeDept);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => `${e.about.firstName} ${e.about.lastName} ${e.email} ${e.username}`.toLowerCase().includes(q));
    }
    if (sortMode === "name") {
      list = [...list].sort((a, b) => `${a.about.firstName} ${a.about.lastName}`.localeCompare(`${b.about.firstName} ${b.about.lastName}`));
    } else {
      list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return list;
  }, [empList, scopeDept, search, sortMode]);

  const grouped = useMemo(() => {
    if (groupMode === "flat") return null;
    const map = new Map<string, { label: string; employees: typeof filtered }>();
    for (const emp of filtered) {
      const key = emp.department?._id ?? "__none__";
      const label = emp.department?.title ?? "No Department";
      if (!map.has(key)) map.set(key, { label, employees: [] });
      map.get(key)!.employees.push(emp);
    }
    return [...map.values()].sort((a, b) => {
      if (a.label === "No Department") return 1;
      if (b.label === "No Department") return -1;
      return a.label.localeCompare(b.label);
    });
  }, [filtered, groupMode]);

  function toggleSelect(id: string) {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map((e) => e._id)));
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/employees/${deleteTarget._id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Failed to delete employee"); setDeleting(false); return; }
      setDeleteTarget(null);
      await refetchEmployees();
    } catch { toast.error("Network error"); }
    setDeleting(false);
  }

  async function handleBulkDeactivate() {
    setBulkDeleting(true);
    try {
      await Promise.all([...selected].map((id) => fetch(`/api/employees/${id}`, { method: "DELETE" })));
      setSelected(new Set());
      setBulkDeleteOpen(false);
      await refetchEmployees();
    } catch { /* ignore */ }
    setBulkDeleting(false);
  }

  const [resendingId, setResendingId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  async function resendInvite(emp: Employee) {
    setResendingId(emp._id);
    try {
      const res = await fetch(`/api/employees/${emp._id}/resend-invite`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.sent) {
          toast.success(`Invite sent to ${emp.email}`);
        } else {
          await navigator.clipboard.writeText(data.link);
          toast.success("Email failed — invite link copied to clipboard");
        }
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to send invite");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setResendingId(null);
  }

  async function copyInviteLink(emp: Employee) {
    setCopyingId(emp._id);
    try {
      const res = await fetch(`/api/employees/${emp._id}/resend-invite`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        await navigator.clipboard.writeText(data.link);
        toast.success("Invite link copied to clipboard");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to generate link");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setCopyingId(null);
  }

  async function toggleActive(emp: Employee) {
    const newStatus = !emp.isActive;
    mutateEmployees((prev) =>
      prev ? prev.map((e) => (e._id === emp._id ? { ...e, isActive: newStatus } : e)) : prev,
    );
    try {
      const res = await fetch(`/api/employees/${emp._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newStatus }),
      });
      if (!res.ok) {
        mutateEmployees((prev) =>
          prev ? prev.map((e) => (e._id === emp._id ? { ...e, isActive: !newStatus } : e)) : prev,
        );
        toast.error("Failed to update status");
      }
    } catch {
      mutateEmployees((prev) =>
        prev ? prev.map((e) => (e._id === emp._id ? { ...e, isActive: !newStatus } : e)) : prev,
      );
      toast.error("Failed to update status");
    }
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Header: title left, sort right — no route-level loading.tsx + no entrance fade: avoids double skeleton / flicker on client nav */}
      <div data-tour="employees-header" className="mb-4 flex items-center justify-between gap-3">
        <PageHeader
          title="Employees"
          loading={employeesLoading && !employees}
          subtitle={
            empList.length === 0
              ? "0 employees"
              : `${empList.length} employee${empList.length !== 1 ? "s" : ""} · ${empInsights.inactive} inactive · ${empInsights.newThisMonth} new this month`
          }
          shimmerWidth="w-36"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <ScopeStrip value={scopeDept} onChange={setScopeDept} />
          <SegmentedControl
            value={groupMode}
            onChange={setGroupMode}
            options={[
              { value: "flat" as GroupMode, label: "Flat" },
              { value: "department" as GroupMode, label: "By Dept" },
            ]}
          />
          <SegmentedControl
            value={sortMode}
            onChange={setSortMode}
            options={[
              { value: "recent" as SortMode, label: "Latest" },
              { value: "name" as SortMode, label: "A – Z" },
            ]}
          />
        </div>
      </div>

      {/* Search + Add row */}
      <div data-tour="employees-search" className="card-static mb-4 flex items-center gap-3 p-4">
        <SearchField value={search} onChange={setSearch} placeholder="Search employees..." />
        {sessionStatus !== "loading" && canCreateEmployees && (
        <motion.button
          type="button"
            onClick={() => router.push("/employees/new")}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="btn btn-primary btn-sm shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Employee
        </motion.button>
        )}
        </div>

      <div data-tour="employees-filters" className="mb-4 flex min-h-[1.25rem] items-center gap-2 flex-wrap">
        {search ? (
          <button type="button" onClick={() => setSearch("")} className="text-xs font-medium transition-colors" style={{ color: "var(--primary)" }}>
            Clear search
          </button>
        ) : null}
      </div>

      {!employeesLoading && empList.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>
          {empInsights.inactive > 0 && (
            <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--rose) 12%, transparent)", color: "var(--rose)" }}>
              {empInsights.inactive} inactive
            </span>
          )}
          {empInsights.noDesignation > 0 && (
            <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--rose) 12%, transparent)", color: "var(--rose)" }}>
              {empInsights.noDesignation} no designation
            </span>
          )}
          <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--green) 10%, transparent)", color: "var(--green)" }}>
            {empInsights.verificationRate}% verified
          </span>
          <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--teal) 10%, transparent)", color: "var(--teal)" }}>
            {empInsights.activeRate}% active
          </span>
          <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--teal) 10%, transparent)", color: "var(--teal)" }}>
            {empInsights.verified} verified
          </span>
          <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>
            {empInsights.unverified} unverified
          </span>
          {empInsights.noDept > 0 && (
            <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--amber) 12%, transparent)", color: "var(--amber)" }}>
              {empInsights.noDept} no department
            </span>
          )}
          {empInsights.newThisMonth > 0 && (
            <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--primary)" }}>
              {empInsights.newThisMonth} new this month
            </span>
          )}
          {empInsights.superAdminCount > 0 && (
            <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>
              {empInsights.superAdminCount} super admin
            </span>
          )}
          {empInsights.shiftBreakdown.length > 0 && empInsights.shiftBreakdown.map((s) => (
            <span key={s.label} className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{s.count} {s.label}</span>
          ))}
          {empInsights.desBreakdown.length > 0 && empInsights.desBreakdown.slice(0, 5).map((d) => (
            <span key={d.label} className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{d.count} {d.label}</span>
          ))}
        </div>
      )}

      {/* Batch Action Bar */}
      <AnimatePresence>
        {canDeleteEmployees && selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="card-static p-3 mb-4 flex items-center gap-2 overflow-hidden"
          >
            <span className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{selected.size} selected</span>
            <div className="flex-1" />
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              onClick={() => setBulkDeleteOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: "color-mix(in srgb, var(--rose) 12%, transparent)", color: "var(--rose)" }}
            >
              Deactivate
            </motion.button>
            <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-medium transition-colors" style={{ color: "var(--fg-secondary)" }}>
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Count + Select all */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-footnote" style={{ color: "var(--fg-secondary)" }}>
          <motion.span key={filtered.length} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
            {filtered.length}
          </motion.span>
          {" "}employee{filtered.length !== 1 ? "s" : ""}
        </p>
        {canDeleteEmployees && (
        <button type="button" onClick={toggleSelectAll} className="text-footnote font-medium hover:underline" style={{ color: "var(--primary)" }}>
          {selected.size === filtered.length && filtered.length > 0 ? "Deselect all" : "Select all"}
        </button>
        )}
      </div>

      {/* Employee Card Grid */}
      {(() => {
        function renderCard(emp: Employee, i: number) {
          const p = presenceById.get(emp._id);
              const isSelected = selected.has(emp._id);
          const todaySch = getTodaySchedule(emp as unknown as Record<string, unknown>, "Asia/Karachi");
              return (
            <motion.div key={emp._id} variants={cardVariants} custom={i} layout layoutId={emp._id} whileHover={cardHover} className="h-full" exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }} transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}>
              <div className={`card group relative flex h-full flex-col overflow-visible transition-opacity duration-300 ${!emp.isActive ? "opacity-50 grayscale" : ""}`}>
                <EmployeeCard
                  embedded
                  idx={i}
                  selectable={canDeleteEmployees}
                  selected={isSelected}
                  onSelect={() => toggleSelect(emp._id)}
                  onCardClick={(id) => { setEmpModalId(id); setEmpModalOpen(true); }}
                  showEmployeeMeta
                  showAttendance={canViewTeamAttendance}
                  showAttendanceDetail={canViewAttendanceDetail}
                  showLocationFlags={canViewAttendanceDetail}
                  showTasks={canViewTasksList}
                  showCampaigns={canViewCampaignsList}
                  showActions={(canEditEmployees || canDeleteEmployees) && !emp.isSuperAdmin}
                  onEdit={canEditEmployees && !emp.isSuperAdmin ? () => router.push(`/employees/${emp.username}/edit`) : undefined}
                  onDelete={canDeleteEmployees && !emp.isSuperAdmin ? () => setDeleteTarget(emp) : undefined}
                  emp={{
                    _id: emp._id,
                    username: emp.username,
                    firstName: emp.about.firstName,
                    lastName: emp.about.lastName,
                    email: emp.email,
                    designation: primaryDesignationLabel(emp),
                    department: emp.department?.title,
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
                        {canToggleEmployeeStatus && !emp.isSuperAdmin && <ToggleSwitch size="sm" checked={emp.isActive} onChange={() => toggleActive(emp)} />}
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
          );
        }

        const skeletons = (
          [1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <motion.div key={`skel-${i}`} variants={cardVariants} custom={i} className="h-full">
              <div className="card flex h-full flex-col overflow-hidden">
                <div className="flex-1 p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="shimmer h-7 w-7 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1"><div className="shimmer h-3.5 w-20 rounded" /></div>
                    <div className="shimmer h-4 w-14 shrink-0 rounded-full" />
                  </div>
                  <div className="shimmer mt-1 h-2.5 w-28 rounded" />
                  <div className="mt-1.5 space-y-0.5">
                    <div className="flex items-center justify-between"><div className="shimmer h-2.5 w-8 rounded" /><div className="shimmer h-2.5 w-20 rounded" /></div>
                    <div className="flex items-center justify-between"><div className="shimmer h-2.5 w-16 rounded" /><div className="shimmer h-2.5 w-16 rounded" /></div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t px-2.5 py-1.5" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2"><div className="shimmer h-5 w-10 rounded-full" /><div className="shimmer h-2.5 w-20 rounded" /></div>
                  <div className="flex items-center gap-1"><div className="shimmer h-6 w-6 rounded-lg" /><div className="shimmer h-6 w-6 rounded-lg" /></div>
                </div>
              </div>
            </motion.div>
          ))
        );

        if (employeesLoading && !employees) {
          return <motion.div className="grid gap-3 pt-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4" variants={staggerContainerFast} initial="hidden" animate="visible">{skeletons}</motion.div>;
        }

        if (filtered.length === 0) {
          return <div className="mt-4"><EmptyState message="No employees found." /></div>;
        }

        if (grouped) {
          return (
            <div className="space-y-5 pt-4">
              {grouped.map((group) => (
                <motion.div key={group.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{group.label}</h3>
                    <span className="text-caption font-medium px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
                      {group.employees.length}
                    </span>
                  </div>
                  <motion.div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4" variants={staggerContainerFast} initial="hidden" animate="visible">
                    <AnimatePresence mode="popLayout">
                      {group.employees.map((emp, i) => renderCard(emp, i))}
                    </AnimatePresence>
                  </motion.div>
                </motion.div>
              ))}
            </div>
          );
        }

        return (
          <motion.div data-tour="employees-grid" className="grid gap-3 pt-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4" variants={staggerContainerFast} initial="hidden" animate="visible">
            <AnimatePresence mode="popLayout">
              {filtered.map((emp, i) => renderCard(emp, i))}
        </AnimatePresence>
          </motion.div>
        );
      })()}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Deactivate Employee"
        description={`Deactivate "${deleteTarget?.about.firstName} ${deleteTarget?.about.lastName}"? They won't be able to log in.`}
        confirmLabel="Deactivate"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        title="Deactivate Employees"
        description={`Deactivate ${selected.size} employee(s)? They won't be able to log in.`}
        confirmLabel="Deactivate All"
        variant="danger"
        loading={bulkDeleting}
        onConfirm={handleBulkDeactivate}
        onCancel={() => setBulkDeleteOpen(false)}
      />

      <EmployeeModal open={empModalOpen} onClose={() => setEmpModalOpen(false)} initialEmployeeId={empModalId} />
    </div>
  );
}
