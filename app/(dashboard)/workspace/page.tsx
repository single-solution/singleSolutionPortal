"use client";

import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cardVariants, staggerContainerFast } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RefreshBtn, SearchField, SegmentedControl, PageHeader, EmptyState, ModalShell } from "../components/ui";
import toast from "react-hot-toast";
import { timeAgo, formatShortDate } from "@/lib/formatters";

/* ─── types ─── */

type CampaignStatus = "active" | "paused" | "completed" | "cancelled";
type TaskPriority = "low" | "medium" | "high" | "urgent";
type TaskStatus = "pending" | "inProgress" | "completed";
type StatusFilter = "all" | "pending" | "inProgress" | "completed";

interface TaggedEmployee { _id: string; about: { firstName: string; lastName: string }; email: string }
interface TaggedDept { _id: string; title: string }
interface Recurrence { frequency: "weekly" | "monthly"; days: number[] }
interface Campaign {
  _id: string; name: string; slug: string; description?: string; status: CampaignStatus;
  startDate?: string; endDate?: string; budget?: string;
  tags: { employees: TaggedEmployee[]; departments: TaggedDept[] };
  taskStats?: { total: number; completed: number; recurring: number; todayDue: number; todayDone: number };
  todayChecklist?: { _id: string; title: string; done: boolean }[];
  notes?: string; isActive: boolean;
  createdBy?: { about: { firstName: string; lastName: string } };
  createdAt: string; updatedAt?: string;
}
interface Task {
  _id: string; title: string; description?: string; priority: TaskPriority; status: TaskStatus;
  deadline?: string;
  parentTask?: string | null;
  recurrence?: Recurrence;
  campaign?: { _id: string; name: string; status: CampaignStatus } | null;
  assignedTo?: { _id: string; about?: { firstName: string; lastName: string }; email?: string };
  createdBy?: { _id: string; about?: { firstName: string; lastName: string }; email?: string };
  createdAt: string;
}
interface OverviewEmployee {
  _id: string; name: string; email: string;
  byDate: { date: string; done: number; total: number }[];
}
interface LogEntry {
  _id: string; userEmail: string; userName: string; action: string;
  entity: string; entityId?: string; details?: string; createdAt: string;
}
interface SelectOption { _id: string; label: string }

/* ─── constants ─── */

const TASK_STATUS_LABELS: Record<string, string> = { pending: "Pending", inProgress: "In Progress", completed: "Completed" };

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
const LOG_ENTITY_LABELS: Record<string, string> = {
  task: "Tasks", campaign: "Campaigns", employee: "Employees", department: "Departments",
  attendance: "Attendance", leave: "Leave", payroll: "Payroll", security: "Security",
  settings: "Settings", auth: "Auth",
};

/* ─── helpers ─── */

const formatDate = formatShortDate;
function assigneeName(t: Task) { return t.assignedTo?.about ? `${t.assignedTo.about.firstName} ${t.assignedTo.about.lastName}` : "Unassigned"; }

function deadlineUrgency(deadline?: string): "overdue" | "soon" | "normal" | "none" {
  if (!deadline) return "none";
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff < 0) return "overdue";
  if (diff < 2 * 86400000) return "soon";
  return "normal";
}

function taskStateLabel(task: Task): { label: string; color: string; bg: string } {
  if (task.status === "completed") return { label: "Done", color: "var(--teal)", bg: "color-mix(in srgb, var(--teal) 12%, transparent)" };
  if (task.status === "inProgress") {
    const urg = deadlineUrgency(task.deadline);
    if (urg === "overdue") return { label: "Delayed", color: "var(--rose)", bg: "color-mix(in srgb, var(--rose) 12%, transparent)" };
    return { label: "Working", color: "var(--primary)", bg: "color-mix(in srgb, var(--primary) 12%, transparent)" };
  }
  const urg = deadlineUrgency(task.deadline);
  if (urg === "overdue") return { label: "Delayed", color: "var(--rose)", bg: "color-mix(in srgb, var(--rose) 12%, transparent)" };
  return { label: "Pending", color: "var(--amber)", bg: "color-mix(in srgb, var(--amber) 12%, transparent)" };
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

function TaskStatusToggle({ task, canChange, onCycle }: { task: Task; canChange: boolean; onCycle: () => void }) {
  const states: TaskStatus[] = ["pending", "inProgress", "completed"];
  const idx = states.indexOf(task.status);
  const labels: Record<string, { short: string; color: string }> = {
    pending: { short: "Pending", color: "var(--amber)" },
    inProgress: { short: "Working", color: "var(--primary)" },
    completed: { short: "Done", color: "var(--teal)" },
  };
  const s = labels[task.status] ?? labels.pending;
  return (
    <button type="button" disabled={!canChange} onClick={canChange ? onCycle : undefined}
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-semibold transition-all disabled:cursor-default"
      style={{ borderColor: `color-mix(in srgb, ${s.color} 30%, transparent)`, background: `color-mix(in srgb, ${s.color} 10%, transparent)`, color: s.color }}
      title={canChange ? `Click to change (${states[(idx + 1) % 3]})` : task.status}>
      <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: s.color }}>
        {task.status === "inProgress" && <span className="absolute inset-0 animate-ping rounded-full opacity-50" style={{ background: s.color }} />}
      </span>
      {s.short}
    </button>
  );
}

/* ─── main page ─── */

export default function WorkspacePage() {
  const { data: session, status: sessionStatus } = useSession();
  const { can: canPerm } = usePermissions();

  const canCreateTasks = canPerm("tasks_create");
  const canEditTasks = canPerm("tasks_edit");
  const canDeleteTasks = canPerm("tasks_delete");
  const canReassignTasks = canPerm("tasks_reassign");
  const canCreateCampaigns = canPerm("campaigns_create");
  const canEditCampaigns = canPerm("campaigns_edit");
  const canDeleteCampaigns = canPerm("campaigns_delete");
  const canTagEntities = canPerm("campaigns_tagEntities");
  const canViewCampaigns = canPerm("campaigns_view");
  const canViewLogs = canPerm("activityLogs_view");

  /* ── data ── */
  const { data: tasks, loading: tasksLoading, refetch: refetchTasks } = useQuery<Task[]>("/api/tasks", "ws-tasks");
  const { data: campaigns, loading: campaignsLoading, refetch: refetchCampaigns } = useQuery<Campaign[]>("/api/campaigns", "ws-campaigns");
  const needsDropdown = canCreateTasks || canReassignTasks || canTagEntities;
  const { data: employeesRaw } = useQuery<Array<Record<string, unknown>>>(needsDropdown ? "/api/employees/dropdown" : null, "ws-emp");
  const { data: deptsRaw } = useQuery<Array<Record<string, unknown>>>(canTagEntities ? "/api/departments" : null, "ws-dept");
  const { data: logsPayload, refetch: refetchLogs } = useQuery<{ logs: LogEntry[] }>(canViewLogs ? "/api/activity-logs?limit=30" : null, "ws-activity");
  const { data: lastSeenPayload } = useQuery<{ lastSeenLogId: string | null }>(canViewLogs ? "/api/user/last-seen" : null, "ws-lastseen");

  const taskList = useMemo(() => tasks ?? [], [tasks]);
  const campaignList = useMemo(() => campaigns ?? [], [campaigns]);
  const logs = useMemo(() => logsPayload?.logs ?? [], [logsPayload]);
  const allEmployees: SelectOption[] = useMemo(() => (employeesRaw ?? []).filter((e) => (e as { isSuperAdmin?: boolean }).isSuperAdmin !== true).map((e) => ({ _id: e._id as string, label: `${(e.about as { firstName: string; lastName: string }).firstName} ${(e.about as { firstName: string; lastName: string }).lastName}` })), [employeesRaw]);
  const allDepartments: SelectOption[] = useMemo(() => (deptsRaw ?? []).map((d) => ({ _id: d._id as string, label: d.title as string })), [deptsRaw]);

  /* ── state ── */
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

  /* ── checklist state for recurring tasks ── */
  const [checklistOverrides, setChecklistOverrides] = useState<Map<string, boolean>>(new Map());
  const toggleChecklist = useCallback(async (campaignId: string, taskId: string, currentDone: boolean) => {
    setChecklistOverrides((prev) => new Map(prev).set(taskId, !currentDone));
    try {
      await fetch(`/api/campaigns/${campaignId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
    } catch {
      setChecklistOverrides((prev) => { const n = new Map(prev); n.delete(taskId); return n; });
    }
  }, []);

  /* ── admin overview state for expanded campaigns ── */
  const [overviewData, setOverviewData] = useState<{ dates: string[]; tasks: { _id: string; title: string; frequency: string }[]; employees: OverviewEmployee[] } | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const loadOverview = useCallback(async (campaignId: string) => {
    setOverviewLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/checklist/overview?days=7`);
      if (res.ok) setOverviewData(await res.json());
    } catch { /* ignore */ }
    setOverviewLoading(false);
  }, []);

  /* ── subtasks state ── */
  const [subtasksByParent, setSubtasksByParent] = useState<Map<string, Task[]>>(new Map());
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [subtaskLoading, setSubtaskLoading] = useState<string | null>(null);
  const loadSubtasks = useCallback(async (taskId: string) => {
    setSubtaskLoading(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/subtasks`);
      if (res.ok) {
        const data = await res.json();
        setSubtasksByParent((prev) => new Map(prev).set(taskId, data));
      }
    } catch { /* ignore */ }
    setSubtaskLoading(null);
  }, []);

  useEffect(() => {
    const handler = () => { if (document.visibilityState === "visible") void refetchLogs(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [refetchLogs]);

  /* ── activity sidebar: group by entity, unread counts ── */
  const lastSeenLogIdRef = useRef<string | null>(null);
  useEffect(() => { lastSeenLogIdRef.current = lastSeenPayload?.lastSeenLogId ?? null; }, [lastSeenPayload]);
  const [activityCollapsed, setActivityCollapsed] = useState<Set<string>>(new Set());
  const toggleActivityGroup = useCallback((entity: string) => {
    setActivityCollapsed((prev) => { const n = new Set(prev); if (n.has(entity)) n.delete(entity); else n.add(entity); return n; });
  }, []);

  const [markedReadEntities, setMarkedReadEntities] = useState<Set<string>>(new Set());
  const [allMarkedRead, setAllMarkedRead] = useState(false);

  const logGroups = useMemo(() => {
    const lastId = lastSeenLogIdRef.current;
    const seenIdx = lastId ? logs.findIndex((l) => l._id === lastId) : -1;
    const map = new Map<string, { logs: LogEntry[]; unread: number }>();
    logs.forEach((log, i) => {
      const entry = map.get(log.entity) ?? { logs: [], unread: 0 };
      entry.logs.push(log);
      const isNew = seenIdx === -1 || i < seenIdx;
      if (isNew && !allMarkedRead && !markedReadEntities.has(log.entity)) entry.unread++;
      map.set(log.entity, entry);
    });
    return map;
  }, [logs, allMarkedRead, markedReadEntities]);

  const totalUnread = useMemo(() => {
    let count = 0;
    logGroups.forEach((g) => { count += g.unread; });
    return count;
  }, [logGroups]);

  const markAllRead = useCallback(() => {
    setAllMarkedRead(true);
    if (logs.length > 0) {
      lastSeenLogIdRef.current = logs[0]._id;
      fetch("/api/user/last-seen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastSeenLogId: logs[0]._id }),
      }).catch(() => {});
    }
  }, [logs]);

  const markEntityRead = useCallback((entity: string) => {
    setMarkedReadEntities((prev) => new Set(prev).add(entity));
    if (logs.length > 0) {
      const latest = logs[0]._id;
      lastSeenLogIdRef.current = latest;
      fetch("/api/user/last-seen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastSeenLogId: latest }),
      }).catch(() => {});
    }
  }, [logs]);

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
  const [fRecurFreq, setFRecurFreq] = useState<string>("");
  const [fRecurDays, setFRecurDays] = useState<number[]>([]);
  const [taskSaving, setTaskSaving] = useState(false);
  const [fParentTask, setFParentTask] = useState("");

  function openCreateTask(campaignId: string, parentTaskId?: string) {
    setEditingTask(null); setFTitle(""); setFDesc(""); setFAssignee(""); setFCampaign(campaignId); setFPriority("medium"); setFDeadline(""); setFStatus("pending"); setFRecurFreq(""); setFRecurDays([]); setFParentTask(parentTaskId ?? ""); setTaskModalOpen(true);
  }
  function openEditTask(t: Task) {
    setEditingTask(t); setFTitle(t.title); setFDesc(t.description ?? ""); setFAssignee(t.assignedTo?._id ?? ""); setFCampaign(t.campaign?._id ?? ""); setFPriority(t.priority); setFDeadline(t.deadline ? t.deadline.slice(0, 10) : ""); setFStatus(t.status);
    setFRecurFreq(t.recurrence?.frequency ?? ""); setFRecurDays(t.recurrence?.days ?? []); setFParentTask(t.parentTask ?? "");
    setTaskModalOpen(true);
  }
  async function handleSaveTask() {
    if (!fTitle.trim()) return;
    setTaskSaving(true);
    try {
      const payload: Record<string, unknown> = { title: fTitle.trim(), description: fDesc, priority: fPriority, status: fStatus, assignedTo: fAssignee || undefined, campaign: fCampaign || null, deadline: fDeadline || undefined };
      if (fParentTask) payload.parentTask = fParentTask;
      if (fRecurFreq && fRecurDays.length > 0) {
        payload.recurrence = { frequency: fRecurFreq, days: fRecurDays };
      } else {
        payload.recurrence = null;
      }
      const res = editingTask
        ? await fetch(`/api/tasks/${editingTask._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const err = await res.json().catch(() => null); toast.error(err?.error ?? "Failed to save task"); return; }
      setTaskModalOpen(false);
      if (fParentTask && !editingTask) {
        await loadSubtasks(fParentTask);
      }
      await Promise.all([refetchTasks(), refetchCampaigns()]);
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

  /* ── build campaign → tasks map ── */
  const campaignTaskMap = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const c of campaignList) map.set(c._id, []);
    for (const t of taskList) {
      const cid = t.campaign?._id;
      if (cid && map.has(cid)) map.get(cid)!.push(t);
    }
    return map;
  }, [taskList, campaignList]);

  /* ── filtering ── */
  const filteredCampaignTasks = useMemo(() => {
    const result = new Map<string, Task[]>();
    for (const [cid, tasks] of campaignTaskMap) {
      let list = tasks;
      if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
      if (search.trim()) {
        const q = search.toLowerCase();
        list = list.filter((t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          assigneeName(t).toLowerCase().includes(q)
        );
      }
      result.set(cid, list);
    }
    return result;
  }, [campaignTaskMap, statusFilter, search]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = { all: taskList.length, pending: 0, inProgress: 0, completed: 0 };
    for (const t of taskList) m[t.status] = (m[t.status] ?? 0) + 1;
    return m;
  }, [taskList]);

  const visibleCampaigns = useMemo(() => {
    if (!search.trim()) return campaignList;
    const q = search.toLowerCase();
    return campaignList.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      const tasks = filteredCampaignTasks.get(c._id) ?? [];
      return tasks.length > 0;
    });
  }, [campaignList, search, filteredCampaignTasks]);

  const loading = tasksLoading || campaignsLoading;
  const ready = sessionStatus !== "loading";

  /* ─── render ─── */
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col" style={{ height: "calc(90dvh - 80px)" }}>
      {/* ── header ── */}
      <div className="mb-4 shrink-0">
        <PageHeader
          title="Workspace"
          loading={loading}
          subtitle={`${statusCounts.all} tasks · ${campaignList.length} campaign${campaignList.length !== 1 ? "s" : ""} · ${statusCounts.inProgress} in progress`}
        />
      </div>

      {/* ── search + create ── */}
      <div data-tour="workspace-toolbar" className="card-static mb-4 flex shrink-0 items-center gap-3 p-4">
        <SearchField value={search} onChange={setSearch} placeholder="Search campaigns and tasks..." />
        {ready && canCreateCampaigns && (
          <motion.button type="button" onClick={openCreateCampaign} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            New Campaign
          </motion.button>
        )}
      </div>

      {/* ── status filter ── */}
      <div className="mb-4 flex shrink-0 items-center gap-2 flex-wrap">
        <SegmentedControl
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all" as StatusFilter, label: `All (${statusCounts.all})` },
            { value: "pending" as StatusFilter, label: `Pending (${statusCounts.pending ?? 0})` },
            { value: "inProgress" as StatusFilter, label: `In Progress (${statusCounts.inProgress ?? 0})` },
            { value: "completed" as StatusFilter, label: `Completed (${statusCounts.completed ?? 0})` },
          ]}
        />
        {(search || statusFilter !== "all") && (
          <button type="button" onClick={() => { setSearch(""); setStatusFilter("all"); }} className="text-xs font-medium transition-colors" style={{ color: "var(--primary)" }}>
            Clear
          </button>
        )}
      </div>

      {/* ── main + feed ── */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* ── campaign card grid ── */}
        <div className="min-w-0 min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((g) => (
                <div key={g} className="card-xl overflow-hidden">
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="shimmer h-4 w-32 rounded" />
                    </div>
                    <div className="space-y-2">
                      {[1, 2, 3].map((t) => (
                        <div key={t} className="flex items-center gap-2">
                          <div className="shimmer h-4 w-4 rounded" />
                          <div className="shimmer h-3 flex-1 rounded" />
                          <div className="shimmer h-4 w-14 rounded-full" />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <div className="shimmer h-4 w-16 rounded-full" />
                      <div className="shimmer h-4 w-12 rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : visibleCampaigns.length === 0 ? (
            <EmptyState
              message={campaignList.length === 0 ? "No campaigns yet." : "No matching campaigns."}
              action={canCreateCampaigns && campaignList.length === 0 ? <button type="button" onClick={openCreateCampaign} className="btn btn-primary btn-sm">Create your first campaign</button> : undefined}
            />
          ) : (
            <motion.div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" variants={staggerContainerFast} initial="hidden" animate="visible">
              {visibleCampaigns.map((c) => {
                const allTasks = campaignTaskMap.get(c._id) ?? [];
                const visibleTasks = filteredCampaignTasks.get(c._id) ?? [];
                const oneTimeTasks = visibleTasks.filter((t) => !t.recurrence);
                const todayChecklist = c.todayChecklist ?? [];
                const todayDone = todayChecklist.filter((t) => checklistOverrides.has(t._id) ? checklistOverrides.get(t._id) : t.done).length;
                const hasRecurring = (c.taskStats?.recurring ?? 0) > 0 || todayChecklist.length > 0;
                const isExpanded = expandedCampaign === c._id;
                const isInactive = c.status !== "active";

                const totalTasks = allTasks.length;
                const pendingTasks = allTasks.filter((t) => t.status === "pending").length;
                const inProgressTasks = allTasks.filter((t) => t.status === "inProgress").length;
                const completedTasks = allTasks.filter((t) => t.status === "completed").length;
                const empCount = c.tags.employees.length;
                const recurCount = c.taskStats?.recurring ?? 0;

                return (
                  <motion.div key={c._id} variants={cardVariants} custom={0}
                    className="card-xl overflow-hidden flex flex-col transition-opacity"
                    style={{ opacity: isInactive ? 0.5 : 1 }}>
                    {/* ── card header ── */}
                    <div className="flex items-center gap-2 p-3 pb-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-[13px] font-semibold truncate block" style={{ color: "var(--fg)" }}>{c.name}</span>
                        {todayChecklist.length > 0 && (
                          <span className="text-[10px] tabular-nums font-semibold mt-0.5 block" style={{ color: todayDone === todayChecklist.length ? "var(--teal)" : "var(--amber)" }}>
                            {todayDone}/{todayChecklist.length} today
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {hasRecurring && canViewCampaigns && (
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                            onClick={() => {
                              const next = isExpanded ? null : c._id;
                              setExpandedCampaign(next);
                              if (next) void loadOverview(c._id);
                            }}
                            className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-grouped)]"
                            style={{ color: isExpanded ? "var(--primary)" : "var(--fg-tertiary)" }}
                            title={isExpanded ? "Collapse" : "Compliance overview"}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
                            </svg>
                          </motion.button>
                        )}
                        {canCreateTasks && (
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openCreateTask(c._id)}
                            className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
                            style={{ color: "var(--primary)" }} title="Add task">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                          </motion.button>
                        )}
                        {canEditCampaigns && (
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openEditCampaign(c)} className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-tertiary)" }} title="Edit campaign">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </motion.button>
                        )}
                        {canDeleteCampaigns && (
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setDeleteTarget({ type: "campaign", id: c._id, name: c.name })} className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--rose)_10%,transparent)]" style={{ color: "var(--rose)" }} title="Delete campaign">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                          </motion.button>
                        )}
                      </div>
                    </div>

                    {/* ── card body ── */}
                    <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-2" style={{ scrollbarWidth: "thin", maxHeight: 340 }}>
                      {/* Recurring tasks as checklist */}
                      {todayChecklist.length > 0 && (
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--fg-tertiary)" }}>Recurring</p>
                          {todayChecklist.map((item) => {
                            const isDone = checklistOverrides.has(item._id) ? checklistOverrides.get(item._id)! : item.done;
                            return (
                              <button key={item._id} type="button" onClick={() => toggleChecklist(c._id, item._id, isDone)}
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
                                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all"
                                  style={{ borderColor: isDone ? "var(--teal)" : "var(--border-strong)", background: isDone ? "var(--teal)" : "transparent" }}>
                                  {isDone && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                                </span>
                                <span className="text-[11px] flex-1 truncate" style={{ color: isDone ? "var(--fg-tertiary)" : "var(--fg)", textDecoration: isDone ? "line-through" : undefined }}>{item.title}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* One-time tasks as compact rows with status toggle */}
                      {oneTimeTasks.length > 0 && (
                        <div className="space-y-0.5">
                          {todayChecklist.length > 0 && <p className="text-[10px] font-bold uppercase tracking-wider mb-1 mt-1" style={{ color: "var(--fg-tertiary)" }}>Tasks</p>}
                          {oneTimeTasks.map((task) => {
                            const isTaskExpanded = expandedTask === task._id;
                            const subs = subtasksByParent.get(task._id) ?? [];
                            const canChange = canEditTasks || task.assignedTo?._id === session?.user?.id;
                            return (
                              <div key={task._id}>
                                <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
                                  <button type="button" onClick={() => {
                                    const next = isTaskExpanded ? null : task._id;
                                    setExpandedTask(next);
                                    if (next && !subtasksByParent.has(task._id)) void loadSubtasks(task._id);
                                  }} className="shrink-0">
                                    <motion.svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" animate={{ rotate: isTaskExpanded ? 90 : 0 }}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </motion.svg>
                                  </button>
                                  <span className="text-[11px] font-medium flex-1 truncate" style={{ color: task.status === "completed" ? "var(--fg-tertiary)" : "var(--fg)", textDecoration: task.status === "completed" ? "line-through" : undefined }}>{task.title}</span>
                                  <TaskStatusToggle task={task} canChange={!!canChange} onCycle={() => cycleTaskStatus(task)} />
                                  {task.deadline && <span className="text-[9px] tabular-nums shrink-0" style={{ color: deadlineUrgency(task.deadline) === "overdue" ? "var(--rose)" : "var(--fg-tertiary)" }}>{formatDate(task.deadline)}</span>}
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    {canEditTasks && (
                                      <button type="button" onClick={() => openEditTask(task)} className="h-5 w-5 flex items-center justify-center rounded transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-tertiary)" }} title="Edit">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                      </button>
                                    )}
                                    {canDeleteTasks && (
                                      <button type="button" onClick={() => setDeleteTarget({ type: "task", id: task._id, name: task.title })} className="h-5 w-5 flex items-center justify-center rounded transition-colors hover:bg-[color-mix(in_srgb,var(--rose)_10%,transparent)]" style={{ color: "var(--rose)" }} title="Delete">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {/* subtasks accordion */}
                                <AnimatePresence initial={false}>
                                  {isTaskExpanded && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                      <div className="pl-8 pr-2 py-1 space-y-1">
                                        {subtaskLoading === task._id ? (
                                          <div className="space-y-1">{[1, 2].map((i) => <div key={i} className="shimmer h-5 w-full rounded" />)}</div>
                                        ) : subs.length === 0 ? (
                                          <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>No subtasks</p>
                                        ) : subs.map((sub) => (
                                          <div key={sub._id} className="flex items-center gap-2 rounded px-2 py-1" style={{ background: "var(--bg-grouped)" }}>
                                            <StatusDot status={sub.status} />
                                            <span className="text-[10px] flex-1" style={{ color: sub.status === "completed" ? "var(--fg-tertiary)" : "var(--fg)", textDecoration: sub.status === "completed" ? "line-through" : undefined }}>{sub.title}</span>
                                          </div>
                                        ))}
                                        {canCreateTasks && (
                                          <button type="button" onClick={() => openCreateTask(c._id, task._id)}
                                            className="flex items-center gap-1.5 text-[10px] font-medium transition-colors hover:opacity-80 mt-0.5 px-2 py-1 rounded"
                                            style={{ color: "var(--primary)" }}>
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                            Add subtask
                                          </button>
                                        )}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {visibleTasks.length === 0 && todayChecklist.length === 0 && (
                        <p className="text-[11px] py-3 text-center" style={{ color: "var(--fg-tertiary)" }}>No tasks yet</p>
                      )}
                    </div>

                    {/* ── compliance overview (expanded) ── */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t" style={{ borderColor: "var(--border)" }}>
                          <div className="p-3">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>Team Compliance (7d)</h4>
                            {overviewLoading ? (
                              <div className="space-y-1.5">{[1, 2, 3].map((i) => <div key={i} className="shimmer h-7 w-full rounded-lg" />)}</div>
                            ) : !overviewData ? (
                              <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>No data</p>
                            ) : (
                              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
                                <table className="w-full text-[10px]">
                                  <thead>
                                    <tr style={{ background: "var(--bg-grouped)" }}>
                                      <th className="text-left px-2 py-1.5 font-semibold sticky left-0" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>Employee</th>
                                      {overviewData.dates.map((d) => (
                                        <th key={d} className="px-1.5 py-1.5 text-center font-medium whitespace-nowrap" style={{ color: "var(--fg-tertiary)" }}>
                                          {new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {overviewData.employees.map((emp) => (
                                      <tr key={emp._id} className="border-t" style={{ borderColor: "var(--border)" }}>
                                        <td className="px-2 py-1.5 font-medium sticky left-0" style={{ background: "var(--bg-elevated)", color: "var(--fg)" }}>{emp.name}</td>
                                        {emp.byDate.map((day) => {
                                          const pct = day.total > 0 ? Math.round((day.done / day.total) * 100) : 0;
                                          const bg = pct === 100 ? "color-mix(in srgb, var(--teal) 15%, transparent)" : pct > 0 ? "color-mix(in srgb, var(--amber) 15%, transparent)" : "transparent";
                                          const fg = pct === 100 ? "var(--teal)" : pct > 0 ? "var(--amber)" : "var(--fg-tertiary)";
                                          return (
                                            <td key={day.date} className="px-1.5 py-1.5 text-center" style={{ background: bg }}>
                                              <span className="font-semibold tabular-nums" style={{ color: fg }}>{day.done}/{day.total}</span>
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* ── card footer: stat pills ── */}
                    <div className="border-t px-3 py-2 flex items-center gap-1.5 flex-wrap" style={{ borderColor: "var(--border)" }}>
                      {totalTasks > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>
                          {totalTasks} {totalTasks === 1 ? "task" : "tasks"}
                        </span>
                      )}
                      {pendingTasks > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ background: "color-mix(in srgb, var(--amber) 12%, transparent)", color: "var(--amber)" }}>
                          {pendingTasks} pending
                        </span>
                      )}
                      {inProgressTasks > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" }}>
                          {inProgressTasks} working
                        </span>
                      )}
                      {completedTasks > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ background: "color-mix(in srgb, var(--teal) 12%, transparent)", color: "var(--teal)" }}>
                          {completedTasks} done
                        </span>
                      )}
                      {recurCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ background: "color-mix(in srgb, #8b5cf6 12%, transparent)", color: "#8b5cf6" }}>
                          {recurCount} recurring
                        </span>
                      )}
                      {empCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zm-4 7a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          {empCount}
                        </span>
                      )}
                      {c.startDate && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                          {formatDate(c.startDate)}{c.endDate ? ` — ${formatDate(c.endDate)}` : ""}
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>

        {/* ── activity feed sidebar (grouped by entity type) ── */}
        {canViewLogs && (
          <aside className="hidden lg:flex shrink-0 overflow-hidden flex-col min-h-0 w-[380px]">
            <div className="flex w-[380px] min-h-0 flex-1 flex-col rounded-2xl border overflow-hidden" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
              <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center min-w-0">
                  <h3 className="text-headline" style={{ color: "var(--fg)" }}>Activity</h3>
                  <RefreshBtn onRefresh={() => void refetchLogs()} />
                  {totalUnread > 0 && (
                    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ml-2" style={{ background: "var(--rose)" }}>
                      {totalUnread > 99 ? "99+" : totalUnread}
                    </span>
                  )}
                </div>
                {totalUnread > 0 && (
                  <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={markAllRead}
                    className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--teal)_10%,transparent)]"
                    style={{ color: "var(--teal)" }} title="Mark all as read">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L7 17l-5-5" /><path d="M22 10l-9.5 9.5L10 17" /></svg>
                  </motion.button>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {logs.length === 0 ? (
                  <p className="text-center text-xs py-8" style={{ color: "var(--fg-tertiary)" }}>No activity yet</p>
                ) : (
                  <div className="p-2 space-y-1">
                    {Array.from(logGroups.entries())
                      .sort((a, b) => {
                        if (b[1].unread !== a[1].unread) return b[1].unread - a[1].unread;
                        return b[1].logs.length - a[1].logs.length;
                      })
                      .map(([entity, group]) => {
                        const lc = LOG_ENTITY_COLORS[entity] ?? LOG_DEFAULT_COLOR;
                        const label = LOG_ENTITY_LABELS[entity] ?? entity.charAt(0).toUpperCase() + entity.slice(1);
                        const isOpen = !activityCollapsed.has(entity);
                        return (
                          <div key={entity} className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                            <div className="flex w-full items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
                              <button type="button" onClick={() => toggleActivityGroup(entity)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: lc.fg }} />
                                <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--fg)" }}>{label}</span>
                                {group.unread > 0 && (
                                  <span className="flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white" style={{ background: "var(--rose)" }}>
                                    {group.unread}
                                  </span>
                                )}
                                <span className="text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{group.logs.length}</span>
                                <motion.svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.15 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </motion.svg>
                              </button>
                              {group.unread > 0 && (
                                <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => markEntityRead(entity)}
                                  className="shrink-0 h-5 w-5 flex items-center justify-center rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--teal)_10%,transparent)]"
                                  style={{ color: "var(--teal)" }}
                                  title="Mark as read">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                                </motion.button>
                              )}
                            </div>
                            <AnimatePresence initial={false}>
                              {isOpen && (
                                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                                  <div className="px-2 pb-2 space-y-1.5">
                                    {group.logs.map((log) => {
                                      const isSelf = session?.user?.email && log.userEmail?.toLowerCase() === session.user.email.toLowerCase();
                                      const needsPossessive = /^(location|account|profile|password|session)\b/i.test(log.action);
                                      const displayName = isSelf ? (needsPossessive ? "Your" : "You") : (log.userName?.trim() || log.userEmail);
                                      return (
                                        <div key={log._id} className="rounded-lg p-2.5 transition-colors" style={{ background: "var(--bg)" }}>
                                          <div className="flex items-start gap-2">
                                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[8px] font-bold"
                                              style={{ background: lc.bg, color: lc.fg }}>
                                              {logAvatarLabel(log)}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <p className="text-[11px] leading-snug" style={{ color: "var(--fg)" }}>
                                                <span className="font-semibold">{displayName}</span>{" "}
                                                <span style={{ color: "var(--fg-secondary)" }}>{log.action}</span>
                                              </p>
                                              {log.details && log.entity !== "security" && (
                                                <p className="text-[10px] line-clamp-2 mt-0.5" style={{ color: "var(--fg-tertiary)" }}>{log.details}</p>
                                              )}
                                              <span className="text-[9px] tabular-nums mt-1 block" style={{ color: "var(--fg-tertiary)" }}>{timeAgo(log.createdAt)}</span>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                    })}
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ── task modal ── */}
      <ModalShell
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        title={editingTask ? "Edit Task" : fParentTask ? "New Subtask" : "New Task"}
        subtitle={editingTask ? "Update task details." : "Create and assign a task."}
        maxWidth="max-w-md"
        footer={<>
          <motion.button type="button" onClick={handleSaveTask} disabled={taskSaving || !fTitle.trim()} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary flex-1">{taskSaving ? "Saving…" : editingTask ? "Update" : "Create"}</motion.button>
          <button type="button" onClick={() => setTaskModalOpen(false)} className="btn btn-secondary flex-1">Cancel</button>
        </>}
      >
        <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Title</label><input type="text" value={fTitle} onChange={(e) => setFTitle(e.target.value)} className="input" autoFocus required /></div>
        <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Description</label><textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={2} className="input" /></div>
        {canReassignTasks && allEmployees.length > 0 && (
          <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Assign To</label><select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} className="input" required><option value="">Select…</option>{allEmployees.map((o) => <option key={o._id} value={o._id}>{o.label}</option>)}</select></div>
        )}
        <div>
          <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Campaign</label>
          <select value={fCampaign} onChange={(e) => setFCampaign(e.target.value)} className="input" disabled={!!fCampaign && !editingTask}>
            <option value="">None</option>
            {campaignList.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Priority</label><select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className="input"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
          <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Deadline</label><input type="date" value={fDeadline} onChange={(e) => setFDeadline(e.target.value)} className="input" /></div>
        </div>
        {!fParentTask && (
          <div>
            <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Recurrence</label>
            <select value={fRecurFreq} onChange={(e) => { setFRecurFreq(e.target.value); setFRecurDays([]); }} className="input">
              <option value="">One-time (no recurrence)</option>
              <option value="weekly">Weekly — pick days of the week</option>
              <option value="monthly">Monthly — pick dates of the month</option>
            </select>
            {fRecurFreq === "weekly" && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, idx) => (
                  <button key={idx} type="button"
                    onClick={() => setFRecurDays((prev) => prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx])}
                    className="rounded-md px-2 py-1 text-[11px] font-semibold border transition-all"
                    style={{ background: fRecurDays.includes(idx) ? "var(--primary)" : "var(--bg-grouped)", color: fRecurDays.includes(idx) ? "white" : "var(--fg-secondary)", borderColor: fRecurDays.includes(idx) ? "var(--primary)" : "var(--border)" }}>{label}</button>
                ))}
              </div>
            )}
            {fRecurFreq === "monthly" && (
              <div className="flex flex-wrap gap-1 mt-2">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <button key={d} type="button"
                    onClick={() => setFRecurDays((prev) => prev.includes(d) ? prev.filter((v) => v !== d) : [...prev, d])}
                    className="h-7 w-7 rounded-md text-[10px] font-semibold border transition-all flex items-center justify-center"
                    style={{ background: fRecurDays.includes(d) ? "var(--primary)" : "var(--bg-grouped)", color: fRecurDays.includes(d) ? "white" : "var(--fg-secondary)", borderColor: fRecurDays.includes(d) ? "var(--primary)" : "var(--border)" }}>{d}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {editingTask && (
          <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Status</label><select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="input"><option value="pending">Pending</option><option value="inProgress">In Progress</option><option value="completed">Completed</option></select></div>
        )}
      </ModalShell>

      {/* ── campaign modal ── */}
      <ModalShell
        open={campaignModalOpen}
        onClose={() => setCampaignModalOpen(false)}
        title={editingCampaign ? "Edit Campaign" : "New Campaign"}
        subtitle={editingCampaign ? "Update campaign details." : "Create a new campaign."}
        footer={<>
          <motion.button type="button" onClick={handleSaveCampaign} disabled={campaignSaving || !cName.trim()} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary flex-1">{campaignSaving ? "Saving…" : editingCampaign ? "Update" : "Create"}</motion.button>
          <button type="button" onClick={() => setCampaignModalOpen(false)} className="btn btn-secondary flex-1">Cancel</button>
        </>}
      >
        <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Name</label><input type="text" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="e.g. Q2 Marketing Push" className="input" autoFocus /></div>
        <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Description</label><textarea value={cDesc} onChange={(e) => setCDesc(e.target.value)} rows={2} className="input" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Status</label><select value={cStatus} onChange={(e) => setCStatus(e.target.value as CampaignStatus)} className="input"><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
          <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Budget</label><input type="text" value={cBudget} onChange={(e) => setCBudget(e.target.value)} className="input" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Start</label><input type="date" value={cStart} onChange={(e) => setCStart(e.target.value)} className="input" /></div>
          <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">End</label><input type="date" value={cEnd} onChange={(e) => setCEnd(e.target.value)} className="input" /></div>
        </div>
        {canTagEntities && allDepartments.length > 0 && (
          <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Tag Departments</label><div className="flex flex-wrap gap-1.5">{allDepartments.map((d) => (<button key={d._id} type="button" onClick={() => setCTagDepts(toggleArr(cTagDepts, d._id))} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${cTagDepts.includes(d._id) ? "text-white shadow-sm" : "text-[var(--fg-secondary)]"}`} style={cTagDepts.includes(d._id) ? { background: "var(--primary)" } : { background: "var(--bg-grouped)" }}>{d.label}</button>))}</div></div>
        )}
        {canTagEntities && allEmployees.length > 0 && (
          <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Tag Employees</label><div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">{allEmployees.map((e) => (<button key={e._id} type="button" onClick={() => setCTagEmployees(toggleArr(cTagEmployees, e._id))} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${cTagEmployees.includes(e._id) ? "text-white shadow-sm" : "text-[var(--fg-secondary)]"}`} style={cTagEmployees.includes(e._id) ? { background: "var(--purple)" } : { background: "var(--bg-grouped)" }}>{e.label}</button>))}</div></div>
        )}
        <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Notes</label><textarea value={cNotes} onChange={(e) => setCNotes(e.target.value)} rows={2} className="input" /></div>
      </ModalShell>

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
