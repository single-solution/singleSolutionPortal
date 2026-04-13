"use client";

import { useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { Portal } from "../components/Portal";
import { useQuery } from "@/lib/useQuery";
import { ease } from "@/lib/motion";
import {
  ALL_WEEKDAYS,
  WEEKDAY_LABELS,
  getTodaySchedule,
  resolveWeeklySchedule,
  type WeeklySchedule,
} from "@/lib/schedule";

/* ─── types ─── */
interface DropdownEmp {
  _id: string;
  about?: { firstName?: string; lastName?: string };
  email?: string;
  department?: { id: string; title: string } | null;
}
interface EmployeeDoc {
  _id: string;
  email: string;
  username: string;
  isSuperAdmin?: boolean;
  about?: { firstName?: string; lastName?: string; phone?: string; profileImage?: string };
  department?: { _id?: string; title?: string } | null;
  weeklySchedule?: WeeklySchedule;
  shiftType?: string;
  isActive?: boolean;
  createdAt?: string;
}
interface SessionApi {
  activeSession?: { status?: string; location?: { inOffice?: boolean } } | null;
  todayMinutes?: number;
  locationFlagged?: boolean;
  flagReason?: string | null;
}
interface MembershipRow {
  _id: string;
  isActive?: boolean;
  department?: { title?: string };
  designation?: { name?: string; color?: string };
}
interface DailyRow {
  date: string;
  isPresent?: boolean;
  isOnTime?: boolean;
  lateBy?: number;
}
interface MonthlyStats {
  presentDays?: number;
  totalWorkingDays?: number;
  onTimePercentage?: number;
  totalWorkingHours?: number;
  averageDailyHours?: number;
  totalOfficeHours?: number;
  totalRemoteHours?: number;
}
interface PayEstimate {
  workingDays?: number;
  presentDays?: number;
  baseSalary?: number;
  grossPay?: number;
  totalDeductions?: number;
  deductions?: number;
  netPay?: number;
  overtimeHours?: number;
  overtimePay?: number;
  exempt?: boolean;
}
interface LeaveBalance {
  total: number;
  used: number;
  remaining: number;
}
interface LeaveRecord {
  _id: string;
  startDate: string;
  endDate: string;
  type: string;
  status: string;
  reason?: string;
  isHalfDay?: boolean;
}
interface TaskRow {
  _id: string;
  status: string;
  assignedTo?: { _id?: string } | string;
}
interface CampaignRow {
  _id: string;
  tags?: { employees?: ({ _id?: string } | string)[] };
}
interface DeptGroup {
  id: string;
  title: string;
  employees: DropdownEmp[];
}
type TabId = "overview" | "attendance" | "payroll" | "leaves" | "profile";
interface Props {
  open: boolean;
  onClose: () => void;
  initialEmployeeId?: string | null;
}

const SHIFT_LABELS: Record<string, string> = {
  fullTime: "Full Time",
  partTime: "Part Time",
  contract: "Contract",
};
const TZ = "Asia/Karachi";
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function todayStrKarachi() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}
function nameOf(e: DropdownEmp) {
  return [e.about?.firstName, e.about?.lastName].filter(Boolean).join(" ") || e.email || "Employee";
}
function initialsDropdown(e: DropdownEmp) {
  return ((e.about?.firstName?.[0] ?? "") + (e.about?.lastName?.[0] ?? "")).toUpperCase() || "?";
}
function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60),
    m = mins % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function recordDateKey(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}
function primaryDesignation(memberships: MembershipRow[] | null, isSuperAdmin?: boolean) {
  if (isSuperAdmin) return "System Administrator";
  const w = memberships?.find((m) => m.designation?.name);
  return w?.designation?.name ?? "Employee";
}
function calendarCells(year: number, month: number) {
  const first = new Date(year, month - 1, 1),
    last = new Date(year, month, 0),
    cells: { day: number | null }[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push({ day: null });
  for (let d = 1; d <= last.getDate(); d++) cells.push({ day: d });
  while (cells.length % 7) cells.push({ day: null });
  return cells;
}
function avatarColor(id: string) {
  const h = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${h}, 55%, 50%)`;
}
function assigneeId(t: TaskRow) {
  if (typeof t.assignedTo === "object" && t.assignedTo?._id) return String(t.assignedTo._id);
  if (typeof t.assignedTo === "string") return t.assignedTo;
  return undefined;
}

function Sh({ c }: { c: string }) {
  return <div className={`shimmer rounded ${c}`} />;
}
function ProfRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-2 text-[12px] sm:block">
      <dt style={{ color: "var(--fg-tertiary)" }}>{k}</dt>
      <dd className="truncate font-medium sm:mt-0.5 sm:text-right" style={{ color: "var(--fg)" }}>
        {v}
      </dd>
    </div>
  );
}

export function EmployeeModal({ open, onClose, initialEmployeeId }: Props) {
  const { data: session } = useSession();
  const { can: canPerm, isSuperAdmin: viewerIsSuperAdmin } = usePermissions();
  const canViewTeam = canPerm("employees_view");
  const [employees, setEmployees] = useState<DropdownEmp[]>([]);
  const [userId, setUserId] = useState("");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [tab, setTab] = useState<TabId>("overview");
  const n = new Date();
  const [calYear, setCalYear] = useState(n.getFullYear());
  const [calMonth, setCalMonth] = useState(n.getMonth() + 1);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialEmployeeId) setUserId(initialEmployeeId);
  }, [initialEmployeeId]);
  useEffect(() => {
    if (!open) return;
    if (initialEmployeeId) setUserId(initialEmployeeId);
    else if (!viewerIsSuperAdmin) setUserId("");
  }, [open, initialEmployeeId, viewerIsSuperAdmin]);
  useEffect(() => {
    if (!open || !canViewTeam) return;
    fetch("/api/employees/dropdown")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setEmployees(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [open, canViewTeam]);

  const effectiveId = useMemo(() => {
    if (viewerIsSuperAdmin && !userId) return null;
    return userId || session?.user?.id || null;
  }, [viewerIsSuperAdmin, userId, session?.user?.id]);
  const isOwn = Boolean(session?.user?.id && effectiveId && session.user.id === effectiveId);
  const canAtt = isOwn || canPerm("attendance_viewTeam");
  const tasksUrl = open && effectiveId && (isOwn || canPerm("tasks_view")) ? "/api/tasks" : null;
  const campUrl = open && effectiveId && (isOwn || canPerm("campaigns_view")) ? "/api/campaigns" : null;
  const empUrl = open && effectiveId ? `/api/employees/${effectiveId}` : null;
  const sessUrl =
    open && effectiveId && canAtt ? `/api/attendance/session?userId=${encodeURIComponent(effectiveId)}` : null;
  const memUrl = open && effectiveId ? `/api/memberships?userId=${encodeURIComponent(effectiveId)}` : null;
  const dailyUrl =
    open && effectiveId && canAtt
      ? `/api/attendance?type=daily&year=${calYear}&month=${calMonth}&userId=${encodeURIComponent(effectiveId)}`
      : null;
  const monthlyUrl =
    open && effectiveId && canAtt
      ? `/api/attendance?type=monthly&year=${calYear}&month=${calMonth}&userId=${encodeURIComponent(effectiveId)}`
      : null;

  const { data: employee, loading: empL } = useQuery<EmployeeDoc>(empUrl);
  const { data: sess, loading: sessL } = useQuery<SessionApi>(sessUrl);
  const { data: memRaw, loading: memL } = useQuery<MembershipRow[]>(memUrl);
  const { data: dailyRaw, loading: dayL } = useQuery<DailyRow[]>(dailyUrl, undefined, { enabled: tab === "attendance" });
  const { data: monthlyRaw, loading: monL } = useQuery<MonthlyStats | null>(monthlyUrl, undefined, {
    enabled: tab === "attendance",
  });
  const { data: tasksRaw, loading: taskL } = useQuery<TaskRow[]>(tasksUrl, undefined, { enabled: tab === "overview" });
  const { data: campRaw, loading: campL } = useQuery<CampaignRow[]>(campUrl, undefined, { enabled: tab === "overview" });

  const canViewPayroll = isOwn || canPerm("payroll_viewTeam");
  const canViewLeaves = isOwn || canPerm("leaves_viewTeam");

  const now2 = new Date();
  const payMonth = now2.getMonth() + 1;
  const payYear = now2.getFullYear();
  const otherUserParam =
    session?.user?.id && effectiveId && session.user.id !== effectiveId
      ? `userId=${encodeURIComponent(effectiveId)}`
      : "";
  const payUrl =
    open && effectiveId && canViewPayroll && tab === "payroll"
      ? `/api/payroll/estimate?detail=true&month=${payMonth}&year=${payYear}${otherUserParam ? `&${otherUserParam}` : ""}`
      : null;
  const balUrl =
    open && effectiveId && canViewLeaves && tab === "leaves"
      ? `/api/leaves/balance${otherUserParam ? `?${otherUserParam}` : ""}`
      : null;
  const leavesUrl =
    open && effectiveId && canViewLeaves && tab === "leaves"
      ? `/api/leaves${otherUserParam ? `?${otherUserParam}` : ""}`
      : null;

  const { data: payEstimate, loading: payL } = useQuery<PayEstimate>(payUrl);
  const { data: leaveBalance, loading: balL } = useQuery<LeaveBalance>(balUrl);
  const { data: leavesRaw, loading: leaveL } = useQuery<LeaveRecord[]>(leavesUrl);
  const leavesList = Array.isArray(leavesRaw) ? leavesRaw : [];

  const memberships = Array.isArray(memRaw) ? memRaw : [];
  const id = effectiveId ?? "";
  const memActive = useMemo(() => memberships.filter((m) => m.isActive !== false), [memberships]);
  const designation = useMemo(
    () => primaryDesignation(memberships, employee?.isSuperAdmin),
    [memberships, employee?.isSuperAdmin],
  );
  const empTasks = useMemo(() => {
    const list = Array.isArray(tasksRaw) ? tasksRaw : [];
    return !effectiveId ? [] : list.filter((t) => assigneeId(t) === effectiveId);
  }, [tasksRaw, effectiveId]);
  const activeTasks = useMemo(
    () => empTasks.filter((t) => t.status === "pending" || t.status === "inProgress").length,
    [empTasks],
  );
  const campCount = useMemo(() => {
    const list = Array.isArray(campRaw) ? campRaw : [];
    if (!effectiveId) return 0;
    return list.filter((c) =>
      (c.tags?.employees ?? []).some((e) => String(typeof e === "object" && e && "_id" in e ? e._id : e) === effectiveId),
    ).length;
  }, [campRaw, effectiveId]);

  const filtered = useMemo(() => {
    if (!sidebarSearch.trim()) return employees;
    const q = sidebarSearch.toLowerCase();
    return employees.filter(
      (e) => nameOf(e).toLowerCase().includes(q) || (e.department?.title ?? "").toLowerCase().includes(q),
    );
  }, [employees, sidebarSearch]);
  const deptGroups = useMemo(() => {
    const g = new Map<string, DeptGroup>(),
      u: DropdownEmp[] = [];
    for (const e of filtered) {
      if (e.department) {
        const x = g.get(e.department.id);
        if (x) x.employees.push(e);
        else g.set(e.department.id, { id: e.department.id, title: e.department.title, employees: [e] });
      } else u.push(e);
    }
    const out = [...g.values()].sort((a, b) => a.title.localeCompare(b.title));
    if (u.length) out.push({ id: "__none", title: "Unassigned", employees: u });
    for (const d of out) d.employees.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return out;
  }, [filtered]);
  const selDrop = useMemo(() => (userId ? employees.find((e) => e._id === userId) : undefined), [employees, userId]);
  const targetSA = employee?.isSuperAdmin === true;
  const canEdit = isOwn || (canPerm("employees_edit") && (!targetSA || viewerIsSuperAdmin));
  const displayName = employee
    ? [employee.about?.firstName, employee.about?.lastName].filter(Boolean).join(" ") || employee.email || "Employee"
    : selDrop
      ? nameOf(selDrop)
      : "Employee";
  const parts = displayName.trim().split(/\s+/);
  const fn = employee?.about?.firstName ?? parts[0] ?? "Employee";
  const ln = employee?.about?.lastName ?? parts.slice(1).join(" ");
  const deptTitle = employee?.department?.title ?? selDrop?.department?.title ?? "";
  const tm = sess?.todayMinutes ?? 0;
  const hasAct = !!sess?.activeSession && sess.activeSession.status === "active";
  const inOff = sess?.activeSession?.location?.inOffice ?? false;
  const stLabel =
    employee && !employee.isActive ? "Inactive"
    : hasAct ? (inOff ? "Active · Office" : "Active · Remote")
    : tm > 0 ? "Checked in"
    : "Off shift";
  const stCol =
    employee && !employee.isActive ? "var(--fg-tertiary)"
    : hasAct ? "var(--green)"
    : tm > 0 ? "var(--primary)"
    : "var(--fg-secondary)";
  const empRec = employee as unknown as Record<string, unknown> | undefined;
  const week = empRec ? resolveWeeklySchedule(empRec) : null;
  const todayS = empRec ? getTodaySchedule(empRec, TZ) : { isWorking: false, start: "", end: "", breakMinutes: 0 };
  const shiftK = employee?.shiftType ?? "";
  const dailyList = Array.isArray(dailyRaw) ? dailyRaw : [];
  const dailyMap = useMemo(() => {
    const m = new Map<string, DailyRow>();
    for (const r of dailyList) m.set(recordDateKey(r.date), r);
    return m;
  }, [dailyList]);
  const cells = calendarCells(calYear, calMonth);
  const monthLab = new Date(calYear, calMonth - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const ms = monthlyRaw;
  const offPct =
    ms && (ms.totalOfficeHours ?? 0) + (ms.totalRemoteHours ?? 0) > 0
      ? ((ms.totalOfficeHours ?? 0) / ((ms.totalOfficeHours ?? 0) + (ms.totalRemoteHours ?? 0))) * 100
      : 0;
  const selfExempt = viewerIsSuperAdmin && !userId;
  const showSb = canViewTeam && employees.length > 0;

  useEffect(() => {
    detailRef.current && (detailRef.current.scrollTop = 0);
  }, [userId, effectiveId]);
  const editSlug = employee?.username || id.slice(-6);
  const onEdit = useCallback(() => onClose(), [onClose]);

  const inp = "w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs outline-none focus:border-[var(--primary)]";
  const ib = { background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--fg)" } as const;

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <motion.div
              className={`relative mx-4 flex w-full flex-col overflow-hidden rounded-2xl border shadow-xl ${showSb ? "h-[80vh] max-w-6xl" : "h-[80vh] max-w-3xl"}`}
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                <h2 className="text-base font-bold" style={{ color: "var(--fg)" }}>
                  Employee
                </h2>
                <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-secondary)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-1 overflow-hidden">
                {showSb && (
                  <div className="flex min-w-[260px] max-w-[260px] flex-col border-r" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                    <div className="border-b p-3" style={{ borderColor: "var(--border)" }}>
                      <div className="relative">
                        <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <circle cx="11" cy="11" r="8" />
                          <path strokeLinecap="round" d="m21 21-4.35-4.35" />
                        </svg>
                        <input type="text" value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} placeholder="Search employees…" className={inp} style={ib} />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto py-1.5" style={{ scrollbarWidth: "thin" }}>
                      {!viewerIsSuperAdmin && !sidebarSearch && (
                        <button
                          type="button"
                          onClick={() => setUserId("")}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
                          style={{ background: !userId ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent" }}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "var(--green)" }}>ME</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold" style={{ color: !userId ? "var(--primary)" : "var(--fg)" }}>Yourself</p>
                            <p className="truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>Your profile</p>
                          </div>
                          {!userId && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--primary)" }} />}
                        </button>
                      )}
                      {!sidebarSearch && employees.length > 1 && <div className="mx-3 my-1 border-b" style={{ borderColor: "var(--border)" }} />}
                      {deptGroups.map((g) => (
                        <div key={g.id}>
                          <div className="flex items-center gap-2 px-3 py-1.5">
                            <svg className="h-3 w-3 shrink-0" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            <span className="truncate text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>{g.title}</span>
                            <span className="ml-auto text-[9px]" style={{ color: "var(--fg-tertiary)" }}>{g.employees.length}</span>
                          </div>
                          {g.employees.map((emp) => {
                            const sel = userId === emp._id;
                            return (
                              <button key={emp._id} type="button" onClick={() => setUserId(emp._id)} className="flex w-full items-center gap-2.5 px-3 py-1.5 pl-8 text-left" style={{ background: sel ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent" }}>
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: avatarColor(emp._id) }}>{initialsDropdown(emp)}</span>
                                <span className="min-w-0 flex-1 truncate text-xs font-medium" style={{ color: sel ? "var(--primary)" : "var(--fg)" }}>{nameOf(emp)}</span>
                                {sel && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--primary)" }} />}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                      {!filtered.length && sidebarSearch && <p className="px-3 py-4 text-center text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No matches</p>}
                    </div>
                    <div className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
                      <p className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>{employees.length} employee{employees.length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                )}
                <div ref={detailRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  {selfExempt ? (
                    <div className="flex flex-col items-center py-16">
                      <p className="text-sm font-semibold" style={{ color: "var(--fg-secondary)" }}>Select an employee</p>
                      <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>Choose from the sidebar</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--border)", background: "var(--bg-grouped)" }}>
                        <div className="flex min-w-0 items-center gap-3">
                          {employee?.about?.profileImage ? (
                            <img src={employee.about.profileImage} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover shadow-md" />
                          ) : (
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white shadow-md" style={{ background: id ? avatarColor(id) : "var(--primary)" }}>
                              {empL ? <span className="opacity-60">…</span> : initials(fn, ln)}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-base font-bold" style={{ color: "var(--fg)" }}>{displayName}</h3>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="badge inline-flex items-center gap-1 text-[10px]" style={{ background: `color-mix(in srgb, ${stCol} 9%, transparent)`, color: stCol, border: `1px solid color-mix(in srgb, ${stCol} 35%, transparent)` }}>
                                {hasAct && (
                                  <span className="relative flex h-1.5 w-1.5">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ background: stCol }} />
                                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: stCol }} />
                                  </span>
                                )}
                                {stLabel}
                              </span>
                              {deptTitle ? <span className="badge text-[10px]" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>{deptTitle}</span> : null}
                              <span className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{memL ? "…" : designation}</span>
                            </div>
                          </div>
                        </div>
                        {canEdit && editSlug && (
                          <Link href={`/employee/${editSlug}/edit`} onClick={onEdit} className="shrink-0 text-xs font-semibold hover:underline" style={{ color: "var(--primary)" }}>Edit</Link>
                        )}
                      </div>
                      <nav className="flex flex-wrap gap-2" aria-label="Employee sections">
                        {(
                          [
                            ["overview", "Overview"],
                            ["attendance", "Attendance"],
                            ...(canViewPayroll ? [["payroll", "Payroll"]] : []),
                            ...(canViewLeaves ? [["leaves", "Leaves"]] : []),
                            ["profile", "Profile"],
                          ] as [string, string][]
                        ).map(([tid, lab]) => {
                          const act = tab === tid;
                          return (
                            <button
                              key={tid}
                              type="button"
                              onClick={() => setTab(tid as TabId)}
                              className="rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors"
                              style={{
                                background: act ? "var(--primary)" : "var(--bg-grouped)",
                                color: act ? "#fff" : "var(--fg-secondary)",
                                boxShadow: act ? "var(--shadow-sm)" : "none",
                              }}
                            >
                              {lab}
                            </button>
                          );
                        })}
                      </nav>

                      {tab === "overview" && (
                        <div className="space-y-3">
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Today&apos;s attendance</p>
                            {sessL ? (
                              <div className="flex flex-wrap gap-2"><Sh c="h-8 flex-1 min-w-[90px]" /><Sh c="h-8 flex-1 min-w-[90px]" /><Sh c="h-8 flex-1 min-w-[90px]" /></div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium" style={{ borderColor: "var(--border)", color: "var(--fg)" }}><span style={{ color: "var(--fg-tertiary)" }}>Time</span>{formatMinutes(tm)}</span>
                                <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium" style={{ borderColor: "var(--border)", color: "var(--fg)" }}><span style={{ color: "var(--fg-tertiary)" }}>Session</span>{hasAct ? (inOff ? "Active · Office" : "Active · Remote") : "None"}</span>
                                <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium" style={{ borderColor: "var(--border)", color: "var(--fg)" }}><span style={{ color: "var(--fg-tertiary)" }}>Location</span>{sess?.locationFlagged ? "Flagged" : "OK"}</span>
                              </div>
                            )}
                            {sess?.flagReason && !sessL && <p className="mt-1.5 text-[10px]" style={{ color: "var(--rose)" }}>{sess.flagReason}</p>}
                          </div>
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Workload</p>
                            {taskL || campL ? <div className="flex gap-2"><Sh c="h-8 w-28" /><Sh c="h-8 w-32" /></div> : (
                              <div className="flex flex-wrap gap-2">
                                <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg)" }}>Active tasks <span style={{ color: "var(--primary)" }}>{activeTasks}</span></span>
                                <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--fg)" }}>Campaigns <span style={{ color: "var(--teal)" }}>{campCount}</span></span>
                              </div>
                            )}
                          </div>
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Memberships</p>
                            {memL ? <div className="flex flex-wrap gap-1.5"><Sh c="h-7 w-24" /><Sh c="h-7 w-28" /></div>
                            : memActive.length === 0 ? <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No active memberships.</p>
                            : (
                              <div className="flex flex-wrap gap-1.5">
                                {memActive.map((m) => (
                                  <span key={m._id} className="max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ borderColor: m.designation?.color ?? "var(--border)", color: "var(--fg-secondary)", background: "var(--bg-elevated)" }} title={m.designation?.name}>
                                    {m.department?.title ?? "Dept"}{m.designation?.name ? ` · ${m.designation.name}` : ""}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {tab === "attendance" && (
                        <div className="space-y-3">
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <h4 className="text-sm font-bold" style={{ color: "var(--fg)" }}>{monthLab}</h4>
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  style={{ background: "var(--bg-grouped)", color: "var(--fg)" }}
                                  onClick={() => {
                                    if (calMonth === 1) {
                                      setCalMonth(12);
                                      setCalYear((y) => y - 1);
                                    } else setCalMonth((m) => m - 1);
                                  }}
                                >
                                  Prev
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  style={{ background: "var(--bg-grouped)", color: "var(--fg)" }}
                                  onClick={() => {
                                    if (calMonth === 12) {
                                      setCalMonth(1);
                                      setCalYear((y) => y + 1);
                                    } else setCalMonth((m) => m + 1);
                                  }}
                                >
                                  Next
                                </button>
                              </div>
                            </div>
                            {dayL ? (
                              <div className="grid grid-cols-7 gap-1">{Array.from({ length: 28 }, (_, i) => <Sh key={i} c="aspect-square rounded-lg" />)}</div>
                            ) : (
                              <>
                                <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>{WD.map((d) => <div key={d}>{d}</div>)}</div>
                                <div className="grid grid-cols-7 gap-1">
                                  {cells.map((c, idx) =>
                                    c.day === null ? (
                                      <div key={`e-${idx}`} className="aspect-square rounded-lg" />
                                    ) : (() => {
                                      const key = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`,
                                        rec = dailyMap.get(key),
                                        dot = !rec || !rec.isPresent ? "#f43f5e" : !rec.isOnTime || (rec.lateBy ?? 0) > 0 ? "var(--amber)" : "var(--green)",
                                        today = key === todayStrKarachi();
                                      return (
                                        <div key={key} className="flex aspect-square flex-col items-center justify-center rounded-lg border text-[10px] font-medium tabular-nums" style={{ borderColor: today ? "var(--primary)" : "var(--border)", background: "var(--bg-grouped)", color: "var(--fg)" }}>
                                          <span>{c.day}</span>
                                          <span className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />
                                        </div>
                                      );
                                    })(),
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Monthly stats</p>
                            {monL ? <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[1, 2, 3, 4].map((i) => <Sh key={i} c="h-14 rounded-lg" />)}</div>
                            : !ms ? <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No stats for this month.</p>
                            : (
                              <>
                                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                                  {[
                                    ["Present / days", `${ms.presentDays ?? 0} / ${ms.totalWorkingDays ?? 0}`],
                                    ["On-time", `${ms.onTimePercentage ?? 0}%`],
                                    ["Total hours", `${ms.totalWorkingHours ?? 0}h`],
                                    ["Avg / day", `${ms.averageDailyHours ?? 0}h`],
                                  ].map(([k, v]) => (
                                    <div key={k} className="rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--border)" }}>
                                      <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>{k}</p>
                                      <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{v}</p>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-3 space-y-1">
                                  <div className="flex justify-between text-[10px]" style={{ color: "var(--fg-secondary)" }}>
                                    <span>Office / remote</span>
                                    <span className="tabular-nums">{ms.totalOfficeHours ?? 0}h · {ms.totalRemoteHours ?? 0}h</span>
                                  </div>
                                  <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                                    <motion.div className="h-full" style={{ background: "var(--teal)" }} initial={{ width: 0 }} animate={{ width: `${offPct}%` }} transition={{ duration: 0.5, ease }} />
                                    <motion.div className="h-full" style={{ background: "var(--primary)" }} initial={{ width: 0 }} animate={{ width: `${100 - offPct}%` }} transition={{ duration: 0.5, delay: 0.04, ease }} />
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {tab === "payroll" && (
                        <div className="space-y-3">
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                              Current month estimate
                            </p>
                            {payL ? (
                              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => <Sh key={i} c="h-14 rounded-lg" />)}</div>
                            ) : !payEstimate || payEstimate.exempt ? (
                              <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>Payroll data not available.</p>
                            ) : (
                              <>
                                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                                  {[
                                    ["Working Days", `${payEstimate.workingDays ?? 0}`],
                                    ["Present", `${payEstimate.presentDays ?? 0}`],
                                    ["Base Salary", `${(payEstimate.baseSalary ?? 0).toLocaleString()}`],
                                    ["Gross Pay", `${(payEstimate.grossPay ?? 0).toLocaleString()}`],
                                    [
                                      "Deductions",
                                      `${(payEstimate.totalDeductions ?? payEstimate.deductions ?? 0).toLocaleString()}`,
                                    ],
                                    ["Net Pay", `${(payEstimate.netPay ?? 0).toLocaleString()}`],
                                  ].map(([k, v]) => (
                                    <div key={k} className="rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--border)" }}>
                                      <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>{k}</p>
                                      <p className="text-sm font-bold tabular-nums" style={{ color: "var(--fg)" }}>{v}</p>
                                    </div>
                                  ))}
                                </div>
                                {(payEstimate.overtimeHours ?? 0) > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--teal)" }}>OT: {payEstimate.overtimeHours}h</span>
                                    <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ borderColor: "var(--border)", color: "var(--teal)" }}>OT Pay: {(payEstimate.overtimePay ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {tab === "leaves" && (
                        <div className="space-y-3">
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Balance</p>
                            {balL ? (
                              <div className="grid grid-cols-3 gap-2">{[1, 2, 3].map((i) => <Sh key={i} c="h-14 rounded-lg" />)}</div>
                            ) : !leaveBalance ? (
                              <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>Leave balance not available.</p>
                            ) : (
                              <div className="grid grid-cols-3 gap-2">
                                {(
                                  [
                                    ["Total", `${leaveBalance.total}`, "var(--primary)"],
                                    ["Used", `${leaveBalance.used}`, "var(--amber)"],
                                    [
                                      "Remaining",
                                      `${leaveBalance.remaining}`,
                                      leaveBalance.remaining > 0 ? "var(--green)" : "var(--rose)",
                                    ],
                                  ] as [string, string, string][]
                                ).map(([k, v, c]) => (
                                  <div key={k} className="rounded-lg border px-2 py-1.5 text-center" style={{ borderColor: "var(--border)" }}>
                                    <p className="text-[9px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>{k}</p>
                                    <p className="text-sm font-bold tabular-nums" style={{ color: c }}>{v}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>History</p>
                            {leaveL ? (
                              <div className="space-y-2">{[1, 2, 3].map((i) => <Sh key={i} c="h-10 w-full rounded-lg" />)}</div>
                            ) : leavesList.length === 0 ? (
                              <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No leave records found.</p>
                            ) : (
                              <div className="max-h-[300px] space-y-1.5 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                                {leavesList.slice(0, 20).map((l) => {
                                  const sc: Record<string, string> = { approved: "var(--green)", pending: "var(--amber)", rejected: "var(--rose)", cancelled: "var(--fg-tertiary)" };
                                  const col = sc[l.status] ?? "var(--fg-secondary)";
                                  const start = new Date(l.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                                  const end = new Date(l.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                                  const same = l.startDate === l.endDate;
                                  return (
                                    <div key={l._id} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-grouped)" }}>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: col }} />
                                          <span className="truncate text-[11px] font-semibold" style={{ color: "var(--fg)" }}>{l.type || "Leave"}{l.isHalfDay ? " (½)" : ""}</span>
                                        </div>
                                        <p className="mt-0.5 truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{same ? start : `${start} – ${end}`}{l.reason ? ` · ${l.reason}` : ""}</p>
                                      </div>
                                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `color-mix(in srgb, ${col} 12%, transparent)`, color: col }}>{l.status}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {tab === "profile" && (
                        <section className="space-y-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                          {empL || !employee ? (
                            <div className="space-y-2">{[1, 2, 3, 4, 5, 6].map((i) => <Sh key={i} c="h-4 w-full" />)}</div>
                          ) : (
                            <dl className="grid gap-2 sm:grid-cols-2">
                              <ProfRow k="Email" v={employee.email} />
                              <ProfRow k="Phone" v={employee.about?.phone || "—"} />
                              <ProfRow k="Username" v={`@${employee.username}`} />
                              <div className="flex justify-between gap-2 text-[12px] sm:block">
                                <dt style={{ color: "var(--fg-tertiary)" }}>Role</dt>
                                <dd className="flex flex-wrap items-center justify-end gap-1 sm:mt-0.5">
                                  <span className="font-medium" style={{ color: "var(--fg)" }}>{designation}</span>
                                  {employee.isSuperAdmin && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: "var(--rose)", color: "#fff" }}>Super Admin</span>}
                                </dd>
                              </div>
                              <ProfRow k="Department" v={employee.department?.title ?? "—"} />
                              <ProfRow k="Designation" v={designation} />
                              <div className="sm:col-span-2">
                                <ProfRow k="Shift type" v={(SHIFT_LABELS[shiftK] ?? shiftK) || "—"} />
                                {week && (
                                  <ul className="mt-1 grid gap-0.5 text-[10px] sm:grid-cols-2" style={{ color: "var(--fg-secondary)" }}>
                                    {ALL_WEEKDAYS.map((d) => (
                                      <li key={d} className="flex justify-between gap-2 tabular-nums">
                                        <span style={{ color: "var(--fg-tertiary)" }}>{WEEKDAY_LABELS[d]}</span>
                                        <span className="font-medium" style={{ color: "var(--fg)" }}>{week[d].isWorking ? `${week[d].start}–${week[d].end}` : "Off"}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <ProfRow k="Today" v={todayS.isWorking ? `${todayS.start} – ${todayS.end} (${todayS.breakMinutes}m break)` : "Off"} />
                              <ProfRow k="Joined" v={employee.createdAt ? new Date(employee.createdAt).toLocaleDateString() : "—"} />
                              <ProfRow k="Active" v={employee.isActive === false ? "Inactive" : "Active"} />
                            </dl>
                          )}
                        </section>
                      )}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
