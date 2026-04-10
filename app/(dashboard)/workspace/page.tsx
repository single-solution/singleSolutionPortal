"use client";

import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { useMemo, useState, useCallback, useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cardVariants, staggerContainerFast } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { Portal } from "../components/Portal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import toast from "react-hot-toast";
import { HeaderStatPill, StatusPill } from "../components/StatChips";
import { timeAgo, formatShortDate } from "@/lib/formatters";

/* ─── types ─── */

type CampaignStatus = "active" | "paused" | "completed" | "cancelled";
type TaskPriority = "low" | "medium" | "high" | "urgent";
type TaskStatus = "pending" | "inProgress" | "completed";
type GroupMode = "campaign" | "employee" | "hierarchy";
type StatusFilter = "all" | "pending" | "inProgress" | "completed";

interface TaggedEmployee { _id: string; about: { firstName: string; lastName: string }; email: string }
interface TaggedDept { _id: string; title: string }
interface Campaign {
  _id: string; name: string; slug: string; description?: string; status: CampaignStatus;
  startDate?: string; endDate?: string; budget?: string;
  tags: { employees: TaggedEmployee[]; departments: TaggedDept[] };
  notes?: string; isActive: boolean;
  createdBy?: { about: { firstName: string; lastName: string } };
  createdAt: string; updatedAt?: string;
}
interface Task {
  _id: string; title: string; description?: string; priority: TaskPriority; status: TaskStatus;
  deadline?: string;
  campaign?: { _id: string; name: string; status: CampaignStatus } | null;
  assignedTo?: { _id: string; about?: { firstName: string; lastName: string }; email?: string };
  createdBy?: { _id: string; about?: { firstName: string; lastName: string }; email?: string };
  createdAt: string;
}
interface LogEntry {
  _id: string; userEmail: string; userName: string; action: string;
  entity: string; entityId?: string; details?: string; createdAt: string;
}
interface HierarchyScope { subordinateIds: string[]; managerIds: string[]; departmentIds: string[]; all?: boolean }
interface SelectOption { _id: string; label: string }

/* ─── constants ─── */

const STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string; bg: string; icon: string }> = {
  active:    { label: "Active",    color: "var(--teal)",    bg: "color-mix(in srgb, var(--teal) 12%, transparent)",    icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
  paused:    { label: "Paused",    color: "var(--amber)",   bg: "color-mix(in srgb, var(--amber) 12%, transparent)",   icon: "M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  completed: { label: "Completed", color: "var(--primary)", bg: "color-mix(in srgb, var(--primary) 12%, transparent)", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  cancelled: { label: "Cancelled", color: "var(--rose)",    bg: "color-mix(in srgb, var(--rose) 12%, transparent)",    icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" },
};
const PRIORITY_COLORS: Record<string, string> = { low: "var(--primary)", medium: "var(--amber)", high: "var(--rose)", urgent: "#ef4444" };
const PRIORITY_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
const TASK_STATUS_LABELS: Record<string, string> = { pending: "Pending", inProgress: "In Progress", completed: "Completed" };
const GROUP_LABELS: Record<GroupMode, string> = { campaign: "By Campaign", employee: "By Employee", hierarchy: "By Hierarchy" };
const GROUP_ICONS: Record<GroupMode, string> = {
  campaign: "M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z",
  employee: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
  hierarchy: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm10 0a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z",
};

const LOG_ENTITY_COLORS: Record<string, { bg: string; fg: string }> = {
  task:       { bg: "color-mix(in srgb, var(--primary) 14%, transparent)", fg: "var(--primary)" },
  campaign:   { bg: "color-mix(in srgb, #8b5cf6 14%, transparent)", fg: "#8b5cf6" },
  employee:   { bg: "color-mix(in srgb, var(--teal) 14%, transparent)", fg: "var(--teal)" },
  department: { bg: "color-mix(in srgb, var(--amber) 14%, transparent)", fg: "var(--amber)" },
  attendance: { bg: "color-mix(in srgb, var(--green) 14%, transparent)", fg: "var(--green)" },
  leave:      { bg: "color-mix(in srgb, var(--rose) 14%, transparent)", fg: "var(--rose)" },
  payroll:    { bg: "color-mix(in srgb, var(--amber) 14%, transparent)", fg: "var(--amber)" },
  security:   { bg: "color-mix(in srgb, var(--rose) 14%, transparent)", fg: "var(--rose)" },
};
const LOG_DEFAULT_COLOR = { bg: "var(--bg-grouped)", fg: "var(--fg-tertiary)" };

/* ─── helpers ─── */

const formatDate = formatShortDate;
function assigneeName(t: Task) { return t.assignedTo?.about ? `${t.assignedTo.about.firstName} ${t.assignedTo.about.lastName}` : "Unassigned"; }

function taskCampaignId(task: Task, campaigns: Campaign[]): string | null {
  if (task.campaign?._id) return task.campaign._id;
  const aid = task.assignedTo?._id;
  for (const c of campaigns) {
    if (aid && c.tags.employees.some((e) => e._id === aid)) return c._id;
  }
  return null;
}

function deadlineUrgency(deadline?: string): "overdue" | "soon" | "normal" | "none" {
  if (!deadline) return "none";
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff < 0) return "overdue";
  if (diff < 2 * 86400000) return "soon";
  return "normal";
}

function logAvatarLabel(log: LogEntry) {
  const n = (log.userName || "").trim();
  if (n) { const parts = n.split(/\s+/).filter(Boolean); return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : (parts[0]?.slice(0, 2) ?? "?").toUpperCase(); }
  return (log.userEmail || "?").slice(0, 2).toUpperCase();
}

/* ─── sub-components ─── */

function StatusDot({ status }: { status: string }) {
  if (status === "completed") return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>;
  if (status === "inProgress") return <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "var(--primary)" }} /><span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: "var(--primary)" }} /></span>;
  return <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--fg-tertiary)" }} />;
}

function CampaignProgress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="h-1.5 flex-1 min-w-[60px] max-w-[120px] overflow-hidden rounded-full" style={{ background: "var(--bg-grouped)" }}>
        <motion.div className="h-full rounded-full" style={{ background: "var(--teal)" }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 200, damping: 28 }} />
      </div>
      <span className="text-[10px] tabular-nums whitespace-nowrap" style={{ color: "var(--fg-tertiary)" }}>{done}/{total}</span>
    </div>
  );
}

/* ─── main page ─── */

export default function WorkspacePage() {
  const { data: session, status: sessionStatus } = useSession();
  const { can: canPerm, canAny: canAnyPerm } = usePermissions();
  const isSuperAdmin = session?.user?.isSuperAdmin === true;

  const canViewTasks = canPerm("tasks_view");
  const canCreateTasks = canPerm("tasks_create");
  const canEditTasks = canPerm("tasks_edit");
  const canDeleteTasks = canPerm("tasks_delete");
  const canReassignTasks = canPerm("tasks_reassign");
  const canViewCampaigns = canPerm("campaigns_view");
  const canCreateCampaigns = canPerm("campaigns_create");
  const canEditCampaigns = canPerm("campaigns_edit");
  const canDeleteCampaigns = canPerm("campaigns_delete");
  const canTagEntities = canPerm("campaigns_tagEntities");
  const canViewLogs = canPerm("activityLogs_view");

  /* ── data ── */
  const { data: tasks, loading: tasksLoading, refetch: refetchTasks } = useQuery<Task[]>(canViewTasks ? "/api/tasks" : null, "ws-tasks");
  const { data: campaigns, loading: campaignsLoading, refetch: refetchCampaigns } = useQuery<Campaign[]>(canViewCampaigns ? "/api/campaigns" : null, "ws-campaigns");
  const needsDropdown = canCreateTasks || canReassignTasks || canTagEntities;
  const { data: employeesRaw } = useQuery<Array<Record<string, unknown>>>(needsDropdown ? "/api/employees/dropdown" : null, "ws-emp");
  const { data: deptsRaw } = useQuery<Array<Record<string, unknown>>>(canTagEntities ? "/api/departments" : null, "ws-dept");
  const { data: hierarchyScope } = useQuery<HierarchyScope>((canViewTasks || canViewCampaigns) ? "/api/organization/scope" : null, "ws-hierarchy");
  const { data: logsPayload, refetch: refetchLogs } = useQuery<{ logs: LogEntry[] }>(canViewLogs ? "/api/activity-logs?limit=30" : null, "ws-activity");

  const taskList = useMemo(() => tasks ?? [], [tasks]);
  const campaignList = useMemo(() => campaigns ?? [], [campaigns]);
  const logs = useMemo(() => logsPayload?.logs ?? [], [logsPayload]);
  const allEmployees: SelectOption[] = useMemo(() => (employeesRaw ?? []).filter((e) => (e as { isSuperAdmin?: boolean }).isSuperAdmin !== true).map((e) => ({ _id: e._id as string, label: `${(e.about as { firstName: string; lastName: string }).firstName} ${(e.about as { firstName: string; lastName: string }).lastName}` })), [employeesRaw]);
  const allDepartments: SelectOption[] = useMemo(() => (deptsRaw ?? []).map((d) => ({ _id: d._id as string, label: d.title as string })), [deptsRaw]);

  /* ── state ── */
  const [groupMode, setGroupMode] = useState<GroupMode>("campaign");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  

  const toggleCollapse = useCallback((key: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; }), []);

  useEffect(() => {
    const handler = () => { if (document.visibilityState === "visible") void refetchLogs(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [refetchLogs]);

  /* ── task modal ── */
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fAssignee, setFAssignee] = useState("");
  const [fCampaign, setFCampaign] = useState("");
  const [fPriority, setFPriority] = useState("medium");
  const [fDeadline, setFDeadline] = useState("");
  const [fStatus, setFStatus] = useState("pending");
  const [taskSaving, setTaskSaving] = useState(false);

  function openCreateTask(campaignId?: string) {
    setEditingTask(null); setFTitle(""); setFDesc(""); setFAssignee(""); setFCampaign(campaignId ?? ""); setFPriority("medium"); setFDeadline(""); setFStatus("pending"); setTaskModalOpen(true);
  }
  function openEditTask(t: Task) {
    setEditingTask(t); setFTitle(t.title); setFDesc(t.description ?? ""); setFAssignee(t.assignedTo?._id ?? ""); setFCampaign(t.campaign?._id ?? ""); setFPriority(t.priority); setFDeadline(t.deadline ? t.deadline.slice(0, 10) : ""); setFStatus(t.status); setTaskModalOpen(true);
  }
  async function handleSaveTask() {
    if (!fTitle.trim()) return;
    setTaskSaving(true);
    try {
      const payload: Record<string, unknown> = { title: fTitle.trim(), description: fDesc, priority: fPriority, status: fStatus, assignedTo: fAssignee || undefined, campaign: fCampaign || null, deadline: fDeadline || undefined };
      const res = editingTask
        ? await fetch(`/api/tasks/${editingTask._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const err = await res.json().catch(() => null); toast.error(err?.error ?? "Failed to save task"); return; }
      setTaskModalOpen(false); await refetchTasks();
    } catch { toast.error("Network error"); }
    setTaskSaving(false);
  }

  /* ── campaign modal ── */
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [cName, setCName] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cStatus, setCStatus] = useState<CampaignStatus>("active");
  const [cStart, setCStart] = useState("");
  const [cEnd, setCEnd] = useState("");
  const [cBudget, setCBudget] = useState("");
  const [cNotes, setCNotes] = useState("");
  const [cTagEmployees, setCTagEmployees] = useState<string[]>([]);
  const [cTagDepts, setCTagDepts] = useState<string[]>([]);
  const [campaignSaving, setCampaignSaving] = useState(false);

  function openCreateCampaign() {
    setEditingCampaign(null); setCName(""); setCDesc(""); setCStatus("active"); setCStart(""); setCEnd(""); setCBudget(""); setCNotes(""); setCTagEmployees([]); setCTagDepts([]); setCampaignModalOpen(true);
  }
  function openEditCampaign(c: Campaign) {
    setEditingCampaign(c); setCName(c.name); setCDesc(c.description ?? ""); setCStatus(c.status); setCStart(c.startDate ? c.startDate.slice(0, 10) : ""); setCEnd(c.endDate ? c.endDate.slice(0, 10) : ""); setCBudget(c.budget ?? ""); setCNotes(c.notes ?? ""); setCTagEmployees(c.tags.employees.map((e) => e._id)); setCTagDepts(c.tags.departments.map((d) => d._id)); setCampaignModalOpen(true);
  }
  async function handleSaveCampaign() {
    if (!cName.trim()) return;
    setCampaignSaving(true);
    try {
      const payload: Record<string, unknown> = { name: cName.trim(), description: cDesc, status: cStatus, startDate: cStart || null, endDate: cEnd || null, budget: cBudget, notes: cNotes, tagEmployees: cTagEmployees, tagDepartments: cTagDepts };
      const res = editingCampaign
        ? await fetch(`/api/campaigns/${editingCampaign._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const err = await res.json().catch(() => null); toast.error(err?.error ?? "Failed to save campaign"); return; }
      setCampaignModalOpen(false); await refetchCampaigns();
    } catch { toast.error("Network error"); }
    setCampaignSaving(false);
  }
  function toggleArr(arr: string[], item: string): string[] { return arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item]; }

  /* ── delete ── */
  const [deleteTarget, setDeleteTarget] = useState<{ type: "task" | "campaign"; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const endpoint = deleteTarget.type === "task" ? `/api/tasks/${deleteTarget.id}` : `/api/campaigns/${deleteTarget.id}`;
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) { const err = await res.json().catch(() => null); toast.error(err?.error ?? "Delete failed"); return; }
      setDeleteTarget(null);
      if (deleteTarget.type === "task") await refetchTasks();
      else await refetchCampaigns();
    } catch { toast.error("Network error"); }
    setDeleting(false);
  }

  /* ── quick status update ── */
  async function cycleTaskStatus(task: Task) {
    const nextMap: Record<string, string> = { pending: "inProgress", inProgress: "completed", completed: "pending" };
    const next = nextMap[task.status] ?? "pending";
    const res = await fetch(`/api/tasks/${task._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    if (!res.ok) { const err = await res.json().catch(() => null); toast.error(err?.error ?? "Failed to update status"); return; }
    await refetchTasks();
  }

  /* ── filtering ── */
  const filtered = useMemo(() => {
    let list = taskList;
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => {
        const name = assigneeName(t);
        return t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q) || name.toLowerCase().includes(q) || (t.campaign?.name ?? "").toLowerCase().includes(q);
      });
    }
    return list;
  }, [taskList, statusFilter, search]);

  /* ── grouping ── */
  const groups = useMemo(() => {
    const result: { key: string; label: string; campaign?: Campaign; items: Task[] }[] = [];
    if (groupMode === "campaign") {
      const campaignTaskMap = new Map<string, Task[]>();
      const unlinked: Task[] = [];
      for (const t of filtered) {
        const cid = taskCampaignId(t, campaignList);
        if (cid) { const arr = campaignTaskMap.get(cid) ?? []; arr.push(t); campaignTaskMap.set(cid, arr); }
        else unlinked.push(t);
      }
      for (const c of campaignList) {
        const items = campaignTaskMap.get(c._id) ?? [];
        result.push({ key: c._id, label: c.name, campaign: c, items });
      }
      if (unlinked.length > 0) result.push({ key: "_unlinked", label: "Unlinked Tasks", items: unlinked });
    } else if (groupMode === "employee") {
      const map = new Map<string, { label: string; items: Task[] }>();
      for (const t of filtered) {
        const key = t.assignedTo?._id ?? "_unassigned";
        const label = assigneeName(t);
        const entry = map.get(key) ?? { label, items: [] };
        entry.items.push(t);
        map.set(key, entry);
      }
      for (const [key, val] of map) result.push({ key, label: val.label, items: val.items });
      result.sort((a, b) => a.label.localeCompare(b.label));
    } else {
      const myId = session?.user?.id;
      const scope = hierarchyScope;
      const myTasks: Task[] = [];
      const subordinateMap = new Map<string, { label: string; items: Task[] }>();
      const other: Task[] = [];

      for (const t of filtered) {
        const aid = t.assignedTo?._id;
        if (aid === myId) { myTasks.push(t); continue; }
        if (scope && !scope.all && aid && scope.subordinateIds.includes(aid)) {
          const entry = subordinateMap.get(aid) ?? { label: assigneeName(t), items: [] };
          entry.items.push(t);
          subordinateMap.set(aid, entry);
          continue;
        }
        other.push(t);
      }

      if (myTasks.length > 0) result.push({ key: "_my", label: "My Tasks", items: myTasks });
      const subs = [...subordinateMap.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));
      for (const [key, val] of subs) result.push({ key, label: val.label, items: val.items });
      if (other.length > 0) result.push({ key: "_other", label: "Other", items: other });
    }
    return result;
  }, [filtered, groupMode, campaignList, session?.user?.id, hierarchyScope]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = { all: taskList.length, pending: 0, inProgress: 0, completed: 0 };
    for (const t of taskList) m[t.status] = (m[t.status] ?? 0) + 1;
    return m;
  }, [taskList]);

  const campaignStats = useMemo(() => {
    return campaignList.map((c) => {
      const cTasks = taskList.filter((t) => taskCampaignId(t, campaignList) === c._id);
      const done = cTasks.filter((t) => t.status === "completed").length;
      return { ...c, taskCount: cTasks.length, doneCount: done };
    });
  }, [campaignList, taskList]);

  const loading = tasksLoading || campaignsLoading;
  const ready = sessionStatus !== "loading";

  /* ─── render ─── */
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col" style={{ height: "calc(90dvh - 80px)" }}>
      {/* ── header ── */}
      <div className="mb-4 flex shrink-0 items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <div>
            <h1 className="text-headline text-lg font-bold" style={{ color: "var(--fg)" }}>Workspace</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--fg-secondary)" }}>Campaigns, tasks, and activity in one place.</p>
          </div>
          {!loading && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <HeaderStatPill label="tasks" value={statusCounts.all} dotColor="var(--fg-tertiary)" />
              {statusCounts.inProgress > 0 && <HeaderStatPill label="in progress" value={statusCounts.inProgress} dotColor="var(--amber)" />}
              {statusCounts.completed > 0 && <HeaderStatPill label="done" value={statusCounts.completed} dotColor="var(--teal)" />}
              {campaignList.length > 0 && <HeaderStatPill label={campaignList.length === 1 ? "campaign" : "campaigns"} value={campaignList.length} dotColor="var(--primary)" />}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {ready && canCreateTasks && (
            <motion.button type="button" onClick={() => openCreateTask()} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Task
            </motion.button>
          )}
          {ready && canCreateCampaigns && (
            <motion.button type="button" onClick={openCreateCampaign} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="btn btn-sm inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ borderColor: "var(--border-strong)", color: "var(--fg)", background: "var(--bg-elevated)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" /></svg>
              Campaign
            </motion.button>
          )}
        </div>
      </div>

      {/* ── toolbar ── */}
      <div data-tour="workspace-toolbar" className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 w-52 shrink-0">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks..." className="input w-full text-xs" style={{ paddingLeft: "36px" }} />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
            {(Object.keys(GROUP_LABELS) as GroupMode[]).map((g) => (
              <button key={g} type="button" onClick={() => setGroupMode(g)}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${groupMode === g ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"}`}>
                {GROUP_LABELS[g]}
              </button>
            ))}
          </div>
          <span className="h-5 w-px shrink-0" style={{ background: "var(--border)" }} />
          {(["all", "pending", "inProgress", "completed"] as StatusFilter[]).map((s) => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap"
              style={{ borderColor: statusFilter === s ? "var(--primary)" : "var(--border)", background: statusFilter === s ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "transparent", color: statusFilter === s ? "var(--primary)" : "var(--fg-tertiary)" }}>
              {s === "all" ? "All" : TASK_STATUS_LABELS[s]}
              <span className="tabular-nums text-[10px]" style={{ opacity: 0.7 }}>{statusCounts[s] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── campaign summary cards ── */}
      {!loading && canViewCampaigns && campaignStats.length > 0 && (
        <motion.div
          className="mb-4 shrink-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
          variants={staggerContainerFast} initial="hidden" animate="visible"
        >
          {campaignStats.map((cs) => {
            const pct = cs.taskCount === 0 ? 0 : Math.round((cs.doneCount / cs.taskCount) * 100);
            return (
              <motion.div
                key={cs._id} variants={cardVariants} custom={0}
                className="card-xl p-3 flex flex-col gap-2 cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => { setGroupMode("campaign"); setSearch(""); setStatusFilter("all"); }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[13px] font-semibold truncate flex-1" style={{ color: "var(--fg)" }}>{cs.name}</span>
                  <StatusPill status={cs.status} />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-grouped)" }}>
                    <motion.div className="h-full rounded-full" style={{ background: "var(--teal)" }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 200, damping: 28 }} />
                  </div>
                  <span className="text-[10px] tabular-nums font-medium whitespace-nowrap" style={{ color: "var(--fg-tertiary)" }}>{cs.doneCount}/{cs.taskCount}</span>
                </div>
                {(cs.startDate || cs.endDate) && (
                  <p className="text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                    {formatDate(cs.startDate)} — {formatDate(cs.endDate)}
                  </p>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* ── main + feed ── */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* ── main content ── */}
        <div className="min-w-0 min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {loading ? (
            <motion.div className="space-y-3" variants={staggerContainerFast} initial="hidden" animate="visible">
              {[1, 2, 3].map((g) => (
                <motion.div key={g} variants={cardVariants} custom={g} className="card-xl overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    <div className="shimmer h-3.5 w-3.5 rounded" />
                    <div className="shimmer h-4 w-36 rounded" />
                    <div className="shimmer h-4 w-14 rounded-full" />
                    <div className="shimmer h-1.5 flex-1 max-w-[100px] rounded-full" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3 pt-0">
                    {[1, 2, 3].map((t) => (
                      <div key={t} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
                        <div className="flex items-start gap-2 mb-2">
                          <div className="shimmer h-3 w-3 shrink-0 rounded-full mt-0.5" />
                          <div className="shimmer h-4 w-full rounded" />
                        </div>
                        <div className="shimmer mb-2 h-3 w-4/5 rounded" />
                        <div className="flex gap-1.5">
                          <div className="shimmer h-4 w-16 rounded-full" />
                          <div className="shimmer h-4 w-12 rounded-full" />
                          <div className="shimmer h-4 w-14 rounded-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          ) : groups.every((g) => g.items.length === 0) && groups.filter((g) => !g.campaign).length === 0 ? (
            <div className="card-xl p-16 text-center">
              <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>No tasks found.</p>
              {canCreateTasks && <button type="button" onClick={() => openCreateTask()} className="btn btn-primary btn-sm mt-4">Create your first task</button>}
            </div>
          ) : (
            <motion.div className="space-y-3" variants={staggerContainerFast} initial="hidden" animate="visible">
              {groups.map((group) => {
                const isCollapsed = collapsed.has(group.key);
                const c = group.campaign;
                const taskCount = group.items.length;
                const doneCount = group.items.filter((t) => t.status === "completed").length;

                return (
                  <motion.div key={group.key} variants={cardVariants} custom={0} className="card-xl overflow-hidden">
                    {/* section header */}
                    <button type="button" onClick={() => toggleCollapse(group.key)}
                      className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
                      <motion.svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" animate={{ rotate: isCollapsed ? -90 : 0 }} transition={{ duration: 0.15 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </motion.svg>

                      <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold truncate" style={{ color: "var(--fg)" }}>{group.label}</span>
                        {c && (
                          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: STATUS_CONFIG[c.status].bg, color: STATUS_CONFIG[c.status].color }}>{STATUS_CONFIG[c.status].label}</span>
                        )}
                        {taskCount > 0 && <CampaignProgress done={doneCount} total={taskCount} />}
                        {c && c.startDate && <span className="hidden sm:inline text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{formatDate(c.startDate)} — {formatDate(c.endDate)}</span>}
                      </div>

                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {c && canEditCampaigns && (
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openEditCampaign(c)} className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-tertiary)" }} title="Edit campaign">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </motion.button>
                        )}
                        {c && canDeleteCampaigns && (
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setDeleteTarget({ type: "campaign", id: c._id, name: c.name })} className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--rose)_10%,transparent)]" style={{ color: "var(--rose)" }} title="Delete campaign">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                          </motion.button>
                        )}
                        {groupMode === "campaign" && canCreateTasks && (
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openCreateTask(c?._id)} className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]" style={{ color: "var(--primary)" }} title="Add task">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                          </motion.button>
                        )}
                      </div>
                    </button>

                    {/* task card grid */}
                    <AnimatePresence initial={false}>
                      {!isCollapsed && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          {taskCount === 0 ? (
                            <div className="px-4 pb-3 text-xs" style={{ color: "var(--fg-tertiary)" }}>No tasks{groupMode === "campaign" && c ? " in this campaign" : ""}</div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
                              {group.items.map((task) => (
                                <TaskCard
                                  key={task._id}
                                  task={task}
                                  showCampaign={groupMode !== "campaign"}
                                  showAssignee={groupMode !== "employee"}
                                  canEdit={canEditTasks}
                                  canDelete={canDeleteTasks}
                                  onEdit={() => openEditTask(task)}
                                  onDelete={() => setDeleteTarget({ type: "task", id: task._id, name: task.title })}
                                  onCycleStatus={(canEditTasks || task.assignedTo?._id === session?.user?.id) ? () => cycleTaskStatus(task) : undefined}
                                />
                              ))}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>

        {/* ── activity feed sidebar ── */}
        {canViewLogs && (
            <aside className="hidden lg:flex shrink-0 overflow-hidden flex-col min-h-0 w-[300px]">
              <div className="flex w-[300px] min-h-0 flex-1 flex-col rounded-2xl border overflow-hidden" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Activity</h3>
                  <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={() => void refetchLogs()} className="text-[10px] font-medium" style={{ color: "var(--primary)" }}>Refresh</motion.button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-3" style={{ scrollbarWidth: "thin" }}>
                  {logs.length === 0 ? (
                    <p className="text-center text-xs py-8" style={{ color: "var(--fg-tertiary)" }}>No activity yet</p>
                  ) : (
                    <div className="relative pl-6">
                      <div className="absolute bottom-0 left-[11px] top-0 w-px" style={{ background: "var(--border)" }} aria-hidden />
                      <ul className="space-y-0">
                        {logs.map((log) => {
                          const lc = LOG_ENTITY_COLORS[log.entity] ?? LOG_DEFAULT_COLOR;
                          return (
                            <li key={log._id} className="relative py-2.5 pl-3">
                              <div className="absolute left-0 top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-[8px] font-bold"
                                style={{ background: lc.bg, color: lc.fg, border: "2px solid var(--bg-elevated)" }}>
                                {logAvatarLabel(log)}
                              </div>
                              <p className="text-[11px] leading-snug" style={{ color: "var(--fg)" }}>
                                <span className="font-semibold">{log.userName?.trim() || log.userEmail}</span>{" "}
                                <span style={{ color: "var(--fg-secondary)" }}>{log.action}</span>
                              </p>
                              {log.details && log.entity !== "security" && (
                                <p className="text-[10px] line-clamp-1 mt-0.5" style={{ color: "var(--fg-tertiary)" }}>{log.details}</p>
                              )}
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="inline-block rounded-full px-1.5 py-px text-[8px] font-semibold uppercase" style={{ background: lc.bg, color: lc.fg }}>{log.entity}</span>
                                <span className="text-[9px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{timeAgo(log.createdAt)}</span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </aside>
        )}
      </div>

      {/* ── task modal ── */}
      <Portal>
        <AnimatePresence>
          {taskModalOpen && (
            <motion.div className="fixed inset-0 z-[60] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setTaskModalOpen(false)} />
              <motion.div
                className="relative w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto rounded-2xl border p-6 shadow-xl"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-headline text-lg mb-4">{editingTask ? "Edit Task" : "New Task"}</h2>
                <div className="space-y-3">
                  <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Title</label><input type="text" value={fTitle} onChange={(e) => setFTitle(e.target.value)} className="input w-full" autoFocus required /></div>
                  <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Description</label><textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={2} className="input w-full" /></div>
                  {canReassignTasks && allEmployees.length > 0 && (
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Assign To</label><select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} className="input w-full" required><option value="">Select…</option>{allEmployees.map((o) => <option key={o._id} value={o._id}>{o.label}</option>)}</select></div>
                  )}
                  {campaignList.length > 0 && (
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Campaign</label><select value={fCampaign} onChange={(e) => setFCampaign(e.target.value)} className="input w-full"><option value="">None</option>{campaignList.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Priority</label><select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className="input w-full"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Deadline</label><input type="date" value={fDeadline} onChange={(e) => setFDeadline(e.target.value)} className="input w-full" /></div>
                  </div>
                  {editingTask && (
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Status</label><select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="input w-full"><option value="pending">Pending</option><option value="inProgress">In Progress</option><option value="completed">Completed</option></select></div>
                  )}
                </div>
                <div className="flex gap-2 mt-5">
                  <motion.button type="button" onClick={handleSaveTask} disabled={taskSaving || !fTitle.trim()} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm flex-1">{taskSaving ? "Saving…" : editingTask ? "Update" : "Create"}</motion.button>
                  <button type="button" onClick={() => setTaskModalOpen(false)} className="btn btn-secondary btn-sm flex-1">Cancel</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>

      {/* ── campaign modal ── */}
      <Portal>
        <AnimatePresence>
          {campaignModalOpen && (
            <motion.div className="fixed inset-0 z-[60] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCampaignModalOpen(false)} />
              <motion.div
                className="relative w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto rounded-2xl border p-6 shadow-xl"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-headline text-lg mb-4">{editingCampaign ? "Edit Campaign" : "New Campaign"}</h2>
                <div className="space-y-3">
                  <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Name</label><input type="text" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="e.g. Q2 Marketing Push" className="input w-full" autoFocus /></div>
                  <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Description</label><textarea value={cDesc} onChange={(e) => setCDesc(e.target.value)} rows={2} className="input w-full" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Status</label><select value={cStatus} onChange={(e) => setCStatus(e.target.value as CampaignStatus)} className="input w-full"><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Budget</label><input type="text" value={cBudget} onChange={(e) => setCBudget(e.target.value)} className="input w-full" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Start</label><input type="date" value={cStart} onChange={(e) => setCStart(e.target.value)} className="input w-full" /></div>
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>End</label><input type="date" value={cEnd} onChange={(e) => setCEnd(e.target.value)} className="input w-full" /></div>
                  </div>
                  {canTagEntities && allDepartments.length > 0 && (
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Tag Departments</label><div className="flex flex-wrap gap-1.5">{allDepartments.map((d) => (<button key={d._id} type="button" onClick={() => setCTagDepts(toggleArr(cTagDepts, d._id))} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${cTagDepts.includes(d._id) ? "text-white shadow-sm" : "text-[var(--fg-secondary)]"}`} style={cTagDepts.includes(d._id) ? { background: "var(--primary)" } : { background: "var(--bg-grouped)" }}>{d.label}</button>))}</div></div>
                  )}
                  {canTagEntities && allEmployees.length > 0 && (
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Tag Employees</label><div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">{allEmployees.map((e) => (<button key={e._id} type="button" onClick={() => setCTagEmployees(toggleArr(cTagEmployees, e._id))} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${cTagEmployees.includes(e._id) ? "text-white shadow-sm" : "text-[var(--fg-secondary)]"}`} style={cTagEmployees.includes(e._id) ? { background: "var(--purple)" } : { background: "var(--bg-grouped)" }}>{e.label}</button>))}</div></div>
                  )}
                  <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Notes</label><textarea value={cNotes} onChange={(e) => setCNotes(e.target.value)} rows={2} className="input w-full" /></div>
                </div>
                <div className="flex gap-2 mt-5">
                  <motion.button type="button" onClick={handleSaveCampaign} disabled={campaignSaving || !cName.trim()} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm flex-1">{campaignSaving ? "Saving…" : editingCampaign ? "Update" : "Create"}</motion.button>
                  <button type="button" onClick={() => setCampaignModalOpen(false)} className="btn btn-secondary btn-sm flex-1">Cancel</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>

      {/* ── delete confirm ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.type === "campaign" ? "Campaign" : "Task"}`}
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* ─── TaskCard component ─── */

function TaskCard({ task, showCampaign, showAssignee, canEdit, canDelete, onEdit, onDelete, onCycleStatus }: {
  task: Task; showCampaign: boolean; showAssignee: boolean;
  canEdit: boolean; canDelete: boolean;
  onEdit: () => void; onDelete: () => void; onCycleStatus?: () => void;
}) {
  const name = assigneeName(task);
  const pc = PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)";
  const urgency = deadlineUrgency(task.deadline);
  const deadlineColor = urgency === "overdue" ? "var(--rose)" : urgency === "soon" ? "var(--amber)" : "var(--fg-tertiary)";

  return (
    <div
      className="group relative rounded-xl border p-3 transition-all hover:shadow-md"
      style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
    >
      {/* top: status + title */}
      <div className="flex items-start gap-2 mb-1.5">
        <button type="button" onClick={onCycleStatus} disabled={!onCycleStatus} className="shrink-0 mt-0.5 flex items-center justify-center w-5 h-5 rounded-full transition-transform hover:scale-110 disabled:cursor-default" title={onCycleStatus ? "Change status" : undefined}>
          <StatusDot status={task.status} />
        </button>
        <p className="text-[13px] font-semibold leading-snug line-clamp-2 flex-1" style={{ color: task.status === "completed" ? "var(--fg-tertiary)" : "var(--fg)", textDecoration: task.status === "completed" ? "line-through" : undefined }}>{task.title}</p>
      </div>

      {/* description snippet */}
      {task.description && (
        <p className="text-[11px] leading-relaxed line-clamp-2 mb-2" style={{ color: "var(--fg-tertiary)" }}>{task.description}</p>
      )}

      {/* bottom: meta pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {showAssignee && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>
            <svg className="h-2.5 w-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zm-4 7a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            {name}
          </span>
        )}
        <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `color-mix(in srgb, ${pc} 15%, transparent)`, color: pc }}>{PRIORITY_LABELS[task.priority]}</span>
        {showCampaign && task.campaign && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "color-mix(in srgb, var(--primary) 8%, transparent)", color: "var(--primary)" }}>
            {task.campaign.name}
          </span>
        )}
        {task.deadline && (
          <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums font-medium" style={{ color: deadlineColor, background: urgency === "overdue" ? "color-mix(in srgb, var(--rose) 10%, transparent)" : "transparent" }}>
            {urgency === "overdue" && <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            {formatDate(task.deadline)}
          </span>
        )}
      </div>

      {/* hover actions */}
      {(canEdit || canDelete) && (
        <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {canEdit && (
            <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={onEdit} className="h-6 w-6 flex items-center justify-center rounded-md transition-colors" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }} title="Edit task">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            </motion.button>
          )}
          {canDelete && (
            <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={onDelete} className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--rose)_10%,transparent)]" style={{ color: "var(--rose)" }} title="Delete task">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
            </motion.button>
          )}
        </div>
      )}
    </div>
  );
}
