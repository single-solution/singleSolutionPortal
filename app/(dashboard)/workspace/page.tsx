"use client";

import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cardVariants, staggerContainerFast } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RefreshBtn, SearchField, SegmentedControl, EmptyState, ModalShell } from "../components/ui";
import { HeaderStatPill } from "../components/StatChips";
import { ToggleSwitch } from "../components/ToggleSwitch";
import toast from "react-hot-toast";
import { formatShortDate, timeAgo } from "@/lib/formatters";

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
interface SelectOption { _id: string; label: string; departmentId?: string }

interface LogEntry {
  _id: string; userEmail: string; userName: string; action: string;
  entity: string; entityId?: string; details?: string; createdAt: string;
}

/* ─── constants ─── */

const TASK_STATUS_LABELS: Record<string, string> = { pending: "Pending", inProgress: "In Progress", completed: "Completed" };

const WS_ENTITIES = new Set(["task", "campaign"]);
const WS_LOG_COLORS: Record<string, { bg: string; fg: string }> = {
  task:     { bg: "color-mix(in srgb, var(--primary) 14%, transparent)", fg: "var(--primary)" },
  campaign: { bg: "color-mix(in srgb, #8b5cf6 14%, transparent)", fg: "#8b5cf6" },
};
const WS_LOG_LABELS: Record<string, string> = { task: "Tasks", campaign: "Campaigns" };
function logAvatarLabel(log: LogEntry) {
  const n = (log.userName || "").trim();
  if (n) { const parts = n.split(/\s+/).filter(Boolean); return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : (parts[0]?.slice(0, 2) ?? "?").toUpperCase(); }
  return (log.userEmail || "?").slice(0, 2).toUpperCase();
}

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


/* ─── sub-components ─── */

function StatusDot({ status }: { status: string }) {
  if (status === "completed") return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>;
  if (status === "inProgress") return <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "var(--primary)" }} /><span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: "var(--primary)" }} /></span>;
  return <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--fg-tertiary)" }} />;
}

function TaskStatusToggle({ task, canChange, onCycle }: { task: Task; canChange: boolean; onCycle: () => void }) {
  const states: TaskStatus[] = ["pending", "inProgress", "completed"];
  const idx = states.indexOf(task.status);
  const nextLabel = { pending: "Start", inProgress: "Complete", completed: "Reopen" }[task.status] ?? "Start";
  const labels: Record<string, { short: string; color: string }> = {
    pending: { short: "Pending", color: "var(--amber)" },
    inProgress: { short: "Working", color: "var(--primary)" },
    completed: { short: "Done", color: "var(--teal)" },
  };
  const s = labels[task.status] ?? labels.pending;
  return (
    <motion.button type="button" disabled={!canChange} onClick={canChange ? onCycle : undefined}
      whileHover={canChange ? { scale: 1.06 } : undefined} whileTap={canChange ? { scale: 0.94 } : undefined}
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-all disabled:cursor-default"
      style={{ borderColor: `color-mix(in srgb, ${s.color} 30%, transparent)`, background: `color-mix(in srgb, ${s.color} 12%, transparent)`, color: s.color, cursor: canChange ? "pointer" : "default" }}
      title={canChange ? `Click to ${nextLabel}` : task.status}>
      <span className="relative h-2 w-2 rounded-full" style={{ background: s.color }}>
        {task.status === "inProgress" && <span className="absolute inset-0 animate-ping rounded-full opacity-50" style={{ background: s.color }} />}
      </span>
      {s.short}
      {canChange && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>}
    </motion.button>
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
  const { data: lastSeenPayload } = useQuery<{ lastSeenLogId: string | null; lastSeenLogIds: Record<string, string> }>(canViewLogs ? "/api/user/last-seen" : null, "ws-lastseen");

  const taskList = useMemo(() => tasks ?? [], [tasks]);
  const campaignList = useMemo(() => campaigns ?? [], [campaigns]);
  const wsLogs = useMemo(() => (logsPayload?.logs ?? []).filter((l) => WS_ENTITIES.has(l.entity)), [logsPayload]);
  const allEmployees: SelectOption[] = useMemo(() => (employeesRaw ?? []).filter((e) => (e as { isSuperAdmin?: boolean }).isSuperAdmin !== true).map((e) => ({ _id: e._id as string, label: `${(e.about as { firstName: string; lastName: string }).firstName} ${(e.about as { firstName: string; lastName: string }).lastName}`, departmentId: (e as { department?: { id: string } }).department?.id })), [employeesRaw]);
  const allDepartments: SelectOption[] = useMemo(() => (deptsRaw ?? []).map((d) => ({ _id: d._id as string, label: d.title as string })), [deptsRaw]);

  /* ── state ── */
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

  /* ── workspace activity sidebar state ── */
  useEffect(() => {
    const handler = () => { if (document.visibilityState === "visible") void refetchLogs(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [refetchLogs]);

  const lastSeenLogIdRef = useRef<string | null>(null);
  const lastSeenEntityRef = useRef<Record<string, string>>({});
  useEffect(() => {
    lastSeenLogIdRef.current = lastSeenPayload?.lastSeenLogId ?? null;
    lastSeenEntityRef.current = lastSeenPayload?.lastSeenLogIds ?? {};
  }, [lastSeenPayload]);
  const [activityExpanded, setActivityExpanded] = useState<string | null>(null);
  const toggleActivityGroup = useCallback((entity: string) => {
    setActivityExpanded((prev) => prev === entity ? null : entity);
  }, []);
  const [allMarkedRead, setAllMarkedRead] = useState(false);

  const wsLogGroups = useMemo(() => {
    const globalId = lastSeenLogIdRef.current;
    const entityIds = lastSeenEntityRef.current;
    const allLogs = logsPayload?.logs ?? [];
    const globalIdx = globalId ? allLogs.findIndex((l) => l._id === globalId) : -1;
    const map = new Map<string, { logs: LogEntry[]; unread: number }>();
    wsLogs.forEach((log) => {
      const entry = map.get(log.entity) ?? { logs: [], unread: 0 };
      entry.logs.push(log);
      if (allMarkedRead) { map.set(log.entity, entry); return; }
      const logGlobalIdx = allLogs.indexOf(log);
      const entCursorId = entityIds[log.entity];
      const entIdx = entCursorId ? allLogs.findIndex((l) => l._id === entCursorId) : -1;
      const effectiveIdx = entIdx !== -1 ? (globalIdx !== -1 ? Math.max(entIdx, globalIdx) : entIdx) : globalIdx;
      const isNew = effectiveIdx === -1 || logGlobalIdx < effectiveIdx;
      if (isNew) entry.unread++;
      map.set(log.entity, entry);
    });
    return map;
  }, [wsLogs, logsPayload, allMarkedRead]);

  const wsTotalUnread = useMemo(() => {
    let count = 0;
    wsLogGroups.forEach((g) => { count += g.unread; });
    return count;
  }, [wsLogGroups]);

  const wsAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (wsAutoOpenedRef.current || wsLogGroups.size === 0) return;
    wsAutoOpenedRef.current = true;
    const WS_PRIORITY: Record<string, number> = { task: 0, campaign: 1 };
    const sorted = Array.from(wsLogGroups.entries()).sort((a, b) => {
      const pa = WS_PRIORITY[a[0]] ?? 50;
      const pb = WS_PRIORITY[b[0]] ?? 50;
      if (pa !== pb) return pa - pb;
      if (b[1].unread !== a[1].unread) return b[1].unread - a[1].unread;
      return b[1].logs.length - a[1].logs.length;
    });
    setActivityExpanded(sorted[0][0]);
  }, [wsLogGroups]);

  const markAllWsRead = useCallback(() => {
    setAllMarkedRead(true);
    const allLogs = logsPayload?.logs ?? [];
    if (allLogs.length > 0) {
      lastSeenLogIdRef.current = allLogs[0]._id;
      lastSeenEntityRef.current = {};
      fetch("/api/user/last-seen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lastSeenLogId: allLogs[0]._id }) }).catch(() => {});
    }
  }, [logsPayload]);

  const markWsEntityRead = useCallback((entity: string) => {
    const entityLogs = wsLogs.filter((l) => l.entity === entity);
    if (entityLogs.length > 0) {
      const latest = entityLogs[0]._id;
      lastSeenEntityRef.current = { ...lastSeenEntityRef.current, [entity]: latest };
      fetch("/api/user/last-seen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity, lastSeenLogId: latest }) }).catch(() => {});
    }
  }, [wsLogs]);

  /* ── checklist state for recurring tasks ── */
  const [checklistOverrides, setChecklistOverrides] = useState<Map<string, boolean>>(new Map());

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

  /* ── task modal ── */
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fAssignees, setFAssignees] = useState<string[]>([]);
  const [fCampaign, setFCampaign] = useState("");
  const [fPriority, setFPriority] = useState("medium");
  const [fDeadline, setFDeadline] = useState("");
  const [fRecurFreq, setFRecurFreq] = useState<string>("");
  const [fRecurDays, setFRecurDays] = useState<number[]>([]);
  const [taskSaving, setTaskSaving] = useState(false);
  const [fParentTask, setFParentTask] = useState("");

  function openCreateTask(campaignId: string, parentTaskId?: string) {
    setEditingTask(null); setFTitle(""); setFDesc(""); setFAssignees([]); setFCampaign(campaignId); setFPriority("medium"); setFDeadline(""); setFRecurFreq(""); setFRecurDays([]); setFParentTask(parentTaskId ?? ""); setTaskModalOpen(true);
  }
  function openEditTask(t: Task) {
    setEditingTask(t); setFTitle(t.title); setFDesc(t.description ?? ""); setFAssignees(t.assignedTo?._id ? [t.assignedTo._id] : []); setFCampaign(t.campaign?._id ?? ""); setFPriority(t.priority); setFDeadline(t.deadline ? t.deadline.slice(0, 10) : "");
    setFRecurFreq(t.recurrence?.frequency ?? ""); setFRecurDays(t.recurrence?.days ?? []); setFParentTask(t.parentTask ?? "");
    setTaskModalOpen(true);
  }
  async function handleSaveTask() {
    if (!fTitle.trim() || fAssignees.length === 0) return;
    setTaskSaving(true);
    try {
      const basePayload: Record<string, unknown> = { title: fTitle.trim(), description: fDesc, priority: fPriority, status: "pending", campaign: fCampaign || null, deadline: fDeadline || undefined };
      if (fParentTask) basePayload.parentTask = fParentTask;
      if (fRecurFreq && fRecurDays.length > 0) {
        basePayload.recurrence = { frequency: fRecurFreq, days: fRecurDays };
      } else {
        basePayload.recurrence = null;
      }

      if (editingTask) {
        const payload = { ...basePayload, assignedTo: fAssignees[0] };
        const res = await fetch(`/api/tasks/${editingTask._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) { const err = await res.json().catch(() => null); toast.error(err?.error ?? "Failed to save task"); setTaskSaving(false); return; }
      } else {
        const results = await Promise.all(fAssignees.map((assigneeId) =>
          fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...basePayload, assignedTo: assigneeId }) })
        ));
        const failed = results.filter((r) => !r.ok);
        if (failed.length > 0) { toast.error(`Failed to create ${failed.length} of ${fAssignees.length} task(s)`); }
      }

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
  const [cOngoing, setCOngoing] = useState(false);
  const [cTagEmployees, setCTagEmployees] = useState<string[]>([]);
  const [cTagDepts, setCTagDepts] = useState<string[]>([]);
  const [campaignSaving, setCampaignSaving] = useState(false);

  function openCreateCampaign() {
    setEditingCampaign(null); setCName(""); setCDesc(""); setCStatus("active"); setCStart(""); setCEnd(""); setCOngoing(true); setCTagEmployees([]); setCTagDepts([]); setCampaignModalOpen(true);
  }
  function openEditCampaign(c: Campaign) {
    setEditingCampaign(c); setCName(c.name); setCDesc(c.description ?? ""); setCStatus(c.status); setCStart(c.startDate ? c.startDate.slice(0, 10) : ""); setCEnd(c.endDate ? c.endDate.slice(0, 10) : ""); setCOngoing(!c.endDate); setCTagEmployees(c.tags.employees.map((e) => e._id)); setCTagDepts(c.tags.departments.map((d) => d._id)); setCampaignModalOpen(true);
  }
  async function handleSaveCampaign() {
    if (!cName.trim()) return;
    setCampaignSaving(true);
    try {
      const payload: Record<string, unknown> = { name: cName.trim(), description: cDesc, status: cStatus, startDate: cStart || null, endDate: cOngoing ? null : (cEnd || null), tagEmployees: cTagEmployees, tagDepartments: cTagDepts };
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

  /* ── quick status update with confirmation ── */
  const statusLabels: Record<string, string> = { pending: "Pending", inProgress: "Working", completed: "Done" };
  const nextStatusMap: Record<string, string> = { pending: "inProgress", inProgress: "completed", completed: "pending" };

  const [statusConfirm, setStatusConfirm] = useState<{ type: "task"; task: Task; next: string; label: string } | { type: "checklist"; campaignId: string; taskId: string; title: string; currentDone: boolean } | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  function requestCycleTask(task: Task) {
    const next = nextStatusMap[task.status] ?? "pending";
    setStatusConfirm({ type: "task", task, next, label: statusLabels[next] ?? next });
  }

  function requestToggleChecklist(campaignId: string, taskId: string, title: string, currentDone: boolean) {
    setStatusConfirm({ type: "checklist", campaignId, taskId, title, currentDone });
  }

  async function handleStatusConfirm() {
    if (!statusConfirm) return;
    setStatusUpdating(true);
    try {
      if (statusConfirm.type === "task") {
        const res = await fetch(`/api/tasks/${statusConfirm.task._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: statusConfirm.next }) });
        if (!res.ok) { const err = await res.json().catch(() => null); toast.error(err?.error ?? "Failed to update status"); setStatusUpdating(false); return; }
        await refetchTasks();
      } else {
        setChecklistOverrides((prev) => new Map(prev).set(statusConfirm.taskId, !statusConfirm.currentDone));
        try {
          await fetch(`/api/campaigns/${statusConfirm.campaignId}/checklist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: statusConfirm.taskId }) });
        } catch {
          setChecklistOverrides((prev) => { const n = new Map(prev); n.delete(statusConfirm.taskId); return n; });
        }
      }
    } catch { toast.error("Network error"); }
    setStatusConfirm(null);
    setStatusUpdating(false);
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

  const taskInsights = useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 86400000;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const weekEnd = todayStart.getTime() + weekMs;
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const userId = session?.user?.id;
    let overdue = 0, dueSoon = 0, dueThisWeek = 0, noDeadline = 0;
    let low = 0, medium = 0, high = 0, urgent = 0;
    let assignedToMe = 0, createdByMe = 0, unassigned = 0;
    let weeklyRecur = 0, monthlyRecur = 0, recurring = 0, oneTime = 0;
    let completedToday = 0, completedThisWeek = 0, completedThisMonth = 0;
    let createdToday = 0, createdThisWeek = 0, createdThisMonth = 0;
    for (const t of taskList) {
      if (t.deadline) {
        const dl = new Date(t.deadline).getTime();
        if (t.status !== "completed") {
          if (dl < now) overdue++;
          else if (dl - now < 2 * 86400000) dueSoon++;
          if (dl <= weekEnd && dl >= todayStart.getTime()) dueThisWeek++;
        }
      } else noDeadline++;
      if (t.priority === "low") low++;
      else if (t.priority === "medium") medium++;
      else if (t.priority === "high") high++;
      else if (t.priority === "urgent") urgent++;
      if (userId && t.assignedTo?._id === userId) assignedToMe++;
      if (userId && t.createdBy?._id === userId) createdByMe++;
      if (!t.assignedTo) unassigned++;
      if (t.recurrence) { recurring++; if (t.recurrence.frequency === "weekly") weeklyRecur++; else monthlyRecur++; } else oneTime++;
      const created = new Date(t.createdAt).getTime();
      if (created >= todayStart.getTime()) createdToday++;
      if (created >= weekStart.getTime()) createdThisWeek++;
      if (created >= monthStart.getTime()) createdThisMonth++;
      if (t.status === "completed") {
        if (created >= todayStart.getTime()) completedToday++;
        if (created >= weekStart.getTime()) completedThisWeek++;
        if (created >= monthStart.getTime()) completedThisMonth++;
      }
    }
    const completionRate = taskList.length > 0 ? Math.round((statusCounts.completed / taskList.length) * 100) : 0;
    const overdueHighUrgent = taskList.filter((t) => t.status !== "completed" && t.deadline && new Date(t.deadline).getTime() < now && (t.priority === "high" || t.priority === "urgent")).length;
    return { overdue, dueSoon, dueThisWeek, noDeadline, low, medium, high, urgent, highUrgent: high + urgent, overdueHighUrgent, assignedToMe, createdByMe, unassigned, weeklyRecur, monthlyRecur, recurring, oneTime, completionRate, completedToday, completedThisWeek, completedThisMonth, createdToday, createdThisWeek, createdThisMonth };
  }, [taskList, statusCounts.completed, session?.user?.id]);

  const campaignInsights = useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 86400000;
    const active = campaignList.filter((c) => c.status === "active").length;
    const completed = campaignList.filter((c) => c.status === "completed").length;
    const completionRate = campaignList.length > 0 ? Math.round((completed / campaignList.length) * 100) : 0;
    const noTasks = campaignList.filter((c) => (c.taskStats?.total ?? 0) === 0).length;
    const nearingEnd = campaignList.filter((c) => c.endDate && c.status === "active" && new Date(c.endDate).getTime() - now < weekMs && new Date(c.endDate).getTime() > now).length;
    const pastEnd = campaignList.filter((c) => c.endDate && c.status === "active" && new Date(c.endDate).getTime() < now).length;
    let totalTasksAll = 0, totalCompletedAll = 0;
    let todayDueAll = 0, todayDoneAll = 0;
    const empSet = new Set<string>();
    for (const c of campaignList) {
      totalTasksAll += c.taskStats?.total ?? 0;
      totalCompletedAll += c.taskStats?.completed ?? 0;
      todayDueAll += c.todayChecklist?.length ?? 0;
      todayDoneAll += (c.todayChecklist ?? []).filter((x) => x.done).length;
      for (const e of c.tags.employees) empSet.add(e._id);
    }
    const avgTasksPerCampaign = campaignList.length > 0 ? Math.round(totalTasksAll / campaignList.length * 10) / 10 : 0;
    const todayChecklistPct = todayDueAll > 0 ? Math.round((todayDoneAll / todayDueAll) * 100) : 0;
    return { active, completed, completionRate, noTasks, nearingEnd, pastEnd, avgTasksPerCampaign, uniqueEmployees: empSet.size, todayDueAll, todayDoneAll, todayChecklistPct };
  }, [campaignList]);

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
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-headline text-lg font-bold" style={{ color: "var(--fg)" }}>Workspace</h1>
          {loading ? (
            <span className="shimmer inline-block h-4 w-44 rounded" />
          ) : (
            <>
              <HeaderStatPill label={statusCounts.all === 1 ? "task" : "tasks"} value={statusCounts.all} dotColor="var(--primary)" />
              <HeaderStatPill label={campaignList.length === 1 ? "campaign" : "campaigns"} value={campaignList.length} dotColor="var(--teal)" />
              <HeaderStatPill label="in progress" value={statusCounts.inProgress} dotColor="var(--amber)" />
              <HeaderStatPill label="done" value={`${taskInsights.completionRate}%`} dotColor="var(--green)" />
              {taskInsights.overdue > 0 && <HeaderStatPill label="overdue" value={taskInsights.overdue} dotColor="var(--rose)" />}
              {taskInsights.dueSoon > 0 && <HeaderStatPill label="due soon" value={taskInsights.dueSoon} dotColor="var(--amber)" />}
              {campaignInsights.active > 0 && <HeaderStatPill label={campaignInsights.active === 1 ? "active campaign" : "active campaigns"} value={campaignInsights.active} dotColor="var(--green)" />}
            </>
          )}
        </div>
      </div>

      {/* ── search + create ── */}
      <div data-tour="workspace-toolbar" className="mb-4 flex shrink-0 items-center gap-3 rounded-xl p-2" style={{ background: "var(--bg-grouped)" }}>
        <SearchField value={search} onChange={setSearch} placeholder="Search campaigns and tasks…" />
        {ready && canCreateCampaigns && (
          <motion.button type="button" onClick={openCreateCampaign} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            New Campaign
          </motion.button>
        )}
      </div>

      {/* ── status filter ── */}
      <div className="mb-4 flex shrink-0 items-center justify-end gap-2 flex-wrap">
        {(search || statusFilter !== "all") && (
          <button type="button" onClick={() => { setSearch(""); setStatusFilter("all"); }} className="text-xs font-medium transition-colors" style={{ color: "var(--primary)" }}>
            Clear
          </button>
        )}
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
      </div>

      {/* ── insights strip ── */}
      {!loading && taskList.length > 0 && (
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-1.5 text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>
          {taskInsights.overdue > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--rose) 12%, transparent)", color: "var(--rose)" }}>{taskInsights.overdue} overdue</span>}
          {taskInsights.dueSoon > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--amber) 12%, transparent)", color: "var(--amber)" }}>{taskInsights.dueSoon} due soon</span>}
          {taskInsights.dueThisWeek > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{taskInsights.dueThisWeek} due this week</span>}
          {taskInsights.highUrgent > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--rose) 8%, transparent)", color: "var(--rose)" }}>{taskInsights.highUrgent} high/urgent</span>}
          <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>Low {taskInsights.low}</span>
          <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>Med {taskInsights.medium}</span>
          <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>High {taskInsights.high}</span>
          <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>Urgent {taskInsights.urgent}</span>
          {taskInsights.unassigned > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{taskInsights.unassigned} unassigned</span>}
          {taskInsights.noDeadline > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{taskInsights.noDeadline} no deadline</span>}
          <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{taskInsights.recurring} recurring ({taskInsights.weeklyRecur}w · {taskInsights.monthlyRecur}m)</span>
          {taskInsights.overdueHighUrgent > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--rose) 14%, transparent)", color: "var(--rose)" }}>{taskInsights.overdueHighUrgent} overdue high/urgent</span>}
          {taskInsights.assignedToMe > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--primary)" }}>{taskInsights.assignedToMe} assigned to me</span>}
          {taskInsights.createdByMe > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{taskInsights.createdByMe} created by me</span>}
          <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{taskInsights.oneTime} one-time</span>
          {taskInsights.completedToday > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--green) 10%, transparent)", color: "var(--green)" }}>{taskInsights.completedToday} done today</span>}
          {taskInsights.completedThisWeek > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--green) 8%, transparent)", color: "var(--green)" }}>{taskInsights.completedThisWeek} done this week</span>}
          {taskInsights.completedThisMonth > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--green) 8%, transparent)", color: "var(--green)" }}>{taskInsights.completedThisMonth} completed this month</span>}
          {taskInsights.createdToday > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{taskInsights.createdToday} created today</span>}
          {taskInsights.createdThisWeek > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{taskInsights.createdThisWeek} new this week</span>}
          {taskInsights.createdThisMonth > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{taskInsights.createdThisMonth} created this month</span>}
          {campaignInsights.active > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--green) 10%, transparent)", color: "var(--green)" }}>{campaignInsights.active} active campaigns</span>}
          {campaignInsights.completed > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{campaignInsights.completed} done campaigns</span>}
          {campaignInsights.completionRate > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{campaignInsights.completionRate}% campaigns done</span>}
          {campaignInsights.uniqueEmployees > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{campaignInsights.uniqueEmployees} people in campaigns</span>}
          <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>avg {campaignInsights.avgTasksPerCampaign} tasks/campaign</span>
          {campaignInsights.noTasks > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{campaignInsights.noTasks} empty campaigns</span>}
          {campaignInsights.pastEnd > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--rose) 12%, transparent)", color: "var(--rose)" }}>{campaignInsights.pastEnd} past end date</span>}
          {campaignInsights.nearingEnd > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--amber) 12%, transparent)", color: "var(--amber)" }}>{campaignInsights.nearingEnd} nearing end</span>}
          {campaignInsights.todayDueAll > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--teal) 10%, transparent)", color: "var(--teal)" }}>checklist {campaignInsights.todayDoneAll}/{campaignInsights.todayDueAll} ({campaignInsights.todayChecklistPct}%)</span>}
        </div>
      )}

      {/* ── main + feed ── */}
      <div className="flex min-h-0 flex-1 gap-4" style={{ containerType: "size" }}>
        {/* ── campaign card grid ── */}
        <div className="min-w-0 min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
            <motion.div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" variants={staggerContainerFast} initial="hidden" animate="visible">
              {visibleCampaigns.map((c, ci) => {
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
                  <motion.div key={c._id} variants={cardVariants} custom={ci}
                    className="card-xl overflow-hidden flex flex-col transition-opacity"
                    style={{ opacity: isInactive ? 0.5 : 1, minHeight: 200, maxHeight: "50cqh" }}>
                    {/* ── card header ── */}
                    <div className="flex items-center gap-1.5 px-2.5 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-bold truncate" style={{ color: "var(--fg)" }}>{c.name}</span>
                          {todayChecklist.length > 0 && (
                            <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums" style={{ background: todayDone === todayChecklist.length ? "color-mix(in srgb, var(--teal) 14%, transparent)" : "color-mix(in srgb, var(--amber) 14%, transparent)", color: todayDone === todayChecklist.length ? "var(--teal)" : "var(--amber)" }}>
                              {todayDone}/{todayChecklist.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center shrink-0">
                        {hasRecurring && canViewCampaigns && (
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                            onClick={() => { const next = isExpanded ? null : c._id; setExpandedCampaign(next); if (next) void loadOverview(c._id); }}
                            className="h-5 w-5 flex items-center justify-center rounded transition-colors hover:bg-[var(--bg-grouped)]"
                            style={{ color: isExpanded ? "var(--primary)" : "var(--fg-tertiary)" }} title={isExpanded ? "Collapse" : "Compliance"}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" /></svg>
                          </motion.button>
                        )}
                        {canCreateTasks && (
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openCreateTask(c._id)}
                            className="h-5 w-5 flex items-center justify-center rounded transition-colors hover:bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
                            style={{ color: "var(--primary)" }} title="Add task">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                          </motion.button>
                        )}
                        {canEditCampaigns && (
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openEditCampaign(c)} className="h-5 w-5 flex items-center justify-center rounded transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-tertiary)" }} title="Edit">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </motion.button>
                        )}
                        {canDeleteCampaigns && (
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setDeleteTarget({ type: "campaign", id: c._id, name: c.name })} className="h-5 w-5 flex items-center justify-center rounded transition-colors hover:bg-[color-mix(in_srgb,var(--rose)_10%,transparent)]" style={{ color: "var(--rose)" }} title="Delete">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                          </motion.button>
                        )}
                      </div>
                    </div>

                    {/* ── card body ── */}
                    <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-1.5" style={{ scrollbarWidth: "thin" }}>
                      {todayChecklist.length > 0 && (
                        <div className="mb-1">
                          <p className="text-[9px] font-bold uppercase tracking-wider px-1 mb-0.5" style={{ color: "var(--fg-tertiary)" }}>Recurring</p>
                          {todayChecklist.map((item) => {
                            const isDone = checklistOverrides.has(item._id) ? checklistOverrides.get(item._id)! : item.done;
                            const fullTask = taskList.find((t) => t._id === item._id);
                            const recurLabel = fullTask?.recurrence?.frequency === "weekly" ? "Weekly" : fullTask?.recurrence?.frequency === "monthly" ? "Monthly" : "Recurring";
                            return (
                              <div key={item._id} className="group mb-0.5">
                                <div className="flex items-center gap-2 rounded-xl px-2 py-2 transition-all"
                                  style={{
                                    background: isDone
                                      ? "color-mix(in srgb, var(--teal) 6%, var(--bg-elevated))"
                                      : "color-mix(in srgb, var(--fg) 2%, var(--bg-elevated))",
                                    borderLeft: isDone ? "3px solid var(--teal)" : "3px solid var(--amber)",
                                    opacity: isDone ? 0.75 : 1,
                                  }}>
                                  <button type="button" onClick={() => requestToggleChecklist(c._id, item._id, item.title, isDone)}
                                    className="shrink-0 transition-transform hover:scale-110 active:scale-90">
                                    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-md border-2 transition-all"
                                      style={{
                                        borderColor: isDone ? "var(--teal)" : "var(--border-strong)",
                                        background: isDone ? "var(--teal)" : "transparent",
                                        boxShadow: isDone ? "0 0 6px color-mix(in srgb, var(--teal) 30%, transparent)" : "none",
                                      }}>
                                      {isDone && (
                                        <motion.svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
                                          initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
                                          <path d="M20 6L9 17l-5-5" />
                                        </motion.svg>
                                      )}
                                    </span>
                                  </button>
                                  <span className="text-[10px] font-medium flex-1 truncate transition-all" style={{
                                    color: isDone ? "var(--fg-tertiary)" : "var(--fg)",
                                    textDecoration: isDone ? "line-through" : "none",
                                    textDecorationColor: isDone ? "var(--teal)" : undefined,
                                    textDecorationThickness: isDone ? "1.5px" : undefined,
                                  }}>{item.title}</span>
                                  <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold" style={{ background: "color-mix(in srgb, #8b5cf6 10%, transparent)", color: isDone ? "color-mix(in srgb, #8b5cf6 50%, var(--fg-tertiary))" : "#8b5cf6" }}>{recurLabel}</span>
                                  {isDone ? (
                                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold" style={{ background: "color-mix(in srgb, var(--teal) 14%, transparent)", color: "var(--teal)" }}>✓ Done</span>
                                  ) : (
                                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold" style={{ background: "color-mix(in srgb, var(--amber) 12%, transparent)", color: "var(--amber)" }}>To do</span>
                                  )}
                                  <div className="flex items-center gap-px opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    {canEditTasks && fullTask && (
                                      <button type="button" onClick={() => openEditTask(fullTask)} className="h-5 w-5 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-tertiary)" }} title="Edit">
                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                      </button>
                                    )}
                                    {canDeleteTasks && (
                                      <button type="button" onClick={() => setDeleteTarget({ type: "task", id: item._id, name: item.title })} className="h-5 w-5 flex items-center justify-center rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--rose)_10%,transparent)]" style={{ color: "var(--rose)" }} title="Delete">
                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {oneTimeTasks.length > 0 && (
                        <div>
                          {todayChecklist.length > 0 && <p className="text-[9px] font-bold uppercase tracking-wider px-1 mb-0.5 mt-1" style={{ color: "var(--fg-tertiary)" }}>Tasks</p>}
                          {oneTimeTasks.map((task) => {
                            const isTaskExpanded = expandedTask === task._id;
                            const subs = subtasksByParent.get(task._id) ?? [];
                            const canChange = canEditTasks || task.assignedTo?._id === session?.user?.id;
                            const statusColor = task.status === "completed" ? "var(--teal)" : task.status === "inProgress" ? "var(--primary)" : "var(--amber)";
                            return (
                              <div key={task._id} className="mb-px">
                                <div className="group flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]" style={{ borderLeft: `2px solid ${statusColor}`, background: "color-mix(in srgb, var(--fg) 2%, var(--bg-elevated))" }}>
                                  <button type="button" onClick={() => {
                                    const next = isTaskExpanded ? null : task._id;
                                    setExpandedTask(next);
                                    if (next && !subtasksByParent.has(task._id)) void loadSubtasks(task._id);
                                  }} className="shrink-0" style={{ color: "var(--fg-tertiary)" }}>
                                    <motion.svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" animate={{ rotate: isTaskExpanded ? 90 : 0 }}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </motion.svg>
                                  </button>
                                  <span className="text-[10px] font-medium flex-1 truncate" style={{ color: task.status === "completed" ? "var(--fg-tertiary)" : "var(--fg)", textDecoration: task.status === "completed" ? "line-through" : undefined }}>{task.title}</span>
                                  <TaskStatusToggle task={task} canChange={!!canChange} onCycle={() => requestCycleTask(task)} />
                                  {task.deadline && <span className="text-[8px] tabular-nums shrink-0" style={{ color: deadlineUrgency(task.deadline) === "overdue" ? "var(--rose)" : "var(--fg-tertiary)" }}>{formatDate(task.deadline)}</span>}
                                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    {canEditTasks && (
                                      <button type="button" onClick={() => openEditTask(task)} className="h-4 w-4 flex items-center justify-center rounded transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-tertiary)" }} title="Edit">
                                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                      </button>
                                    )}
                                    {canDeleteTasks && (
                                      <button type="button" onClick={() => setDeleteTarget({ type: "task", id: task._id, name: task.title })} className="h-4 w-4 flex items-center justify-center rounded transition-colors hover:bg-[color-mix(in_srgb,var(--rose)_10%,transparent)]" style={{ color: "var(--rose)" }} title="Delete">
                                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <AnimatePresence initial={false}>
                                  {isTaskExpanded && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                      <div className="ml-4 border-l pl-2 pr-1 py-0.5 space-y-px" style={{ borderColor: "color-mix(in srgb, var(--fg-tertiary) 15%, transparent)" }}>
                                        {subtaskLoading === task._id ? (
                                          <div className="space-y-1">{[1, 2].map((i) => <div key={i} className="shimmer h-4 w-full rounded" />)}</div>
                                        ) : subs.length === 0 ? (
                                          <p className="text-[9px] py-0.5 px-1" style={{ color: "var(--fg-tertiary)" }}>No subtasks</p>
                                        ) : subs.map((sub) => {
                                          const subColor = sub.status === "completed" ? "var(--teal)" : sub.status === "inProgress" ? "var(--primary)" : "var(--fg-tertiary)";
                                          return (
                                            <div key={sub._id} className="flex items-center gap-1.5 rounded-lg px-1.5 py-1" style={{ borderLeft: `2px solid ${subColor}`, background: "color-mix(in srgb, var(--fg) 1.5%, var(--bg-elevated))" }}>
                                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: subColor }} />
                                              <span className="text-[9px] flex-1 truncate" style={{ color: sub.status === "completed" ? "var(--fg-tertiary)" : "var(--fg)", textDecoration: sub.status === "completed" ? "line-through" : undefined }}>{sub.title}</span>
                                            </div>
                                          );
                                        })}
                                        {canCreateTasks && (
                                          <button type="button" onClick={() => openCreateTask(c._id, task._id)}
                                            className="flex items-center gap-1 text-[9px] font-medium transition-colors hover:opacity-80 px-1 py-0.5 rounded"
                                            style={{ color: "var(--primary)" }}>
                                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                            Subtask
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
                        <p className="text-[10px] py-2 text-center" style={{ color: "var(--fg-tertiary)" }}>No tasks yet</p>
                      )}
                    </div>

                    {/* ── compliance overview (expanded) ── */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t" style={{ borderColor: "var(--border)" }}>
                          <div className="p-2">
                            <h4 className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--fg-tertiary)" }}>Compliance (7d)</h4>
                            {overviewLoading ? (
                              <div className="space-y-1">{[1, 2, 3].map((i) => <div key={i} className="shimmer h-6 w-full rounded" />)}</div>
                            ) : !overviewData ? (
                              <p className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>No data</p>
                            ) : (
                              <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)" }}>
                                <table className="w-full text-[9px]">
                                  <thead>
                                    <tr style={{ background: "var(--bg-grouped)" }}>
                                      <th className="text-left px-1.5 py-1 font-semibold sticky left-0" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>Employee</th>
                                      {overviewData.dates.map((d) => (
                                        <th key={d} className="px-1 py-1 text-center font-medium whitespace-nowrap" style={{ color: "var(--fg-tertiary)" }}>
                                          {new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {overviewData.employees.map((emp) => (
                                      <tr key={emp._id} className="border-t" style={{ borderColor: "var(--border)" }}>
                                        <td className="px-1.5 py-1 font-medium sticky left-0" style={{ background: "var(--bg-elevated)", color: "var(--fg)" }}>{emp.name}</td>
                                        {emp.byDate.map((day) => {
                                          const pct = day.total > 0 ? Math.round((day.done / day.total) * 100) : 0;
                                          const bg = pct === 100 ? "color-mix(in srgb, var(--teal) 15%, transparent)" : pct > 0 ? "color-mix(in srgb, var(--amber) 15%, transparent)" : "transparent";
                                          const fg = pct === 100 ? "var(--teal)" : pct > 0 ? "var(--amber)" : "var(--fg-tertiary)";
                                          return (
                                            <td key={day.date} className="px-1 py-1 text-center" style={{ background: bg }}>
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
                    <div className="border-t px-2 py-1.5 flex items-center gap-1 flex-wrap" style={{ borderColor: "var(--border)" }}>
                      {totalTasks > 0 && <span className="rounded-full px-1.5 py-px text-[8px] font-semibold tabular-nums" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>{totalTasks} task{totalTasks !== 1 ? "s" : ""}</span>}
                      {pendingTasks > 0 && <span className="rounded-full px-1.5 py-px text-[8px] font-semibold tabular-nums" style={{ background: "color-mix(in srgb, var(--amber) 12%, transparent)", color: "var(--amber)" }}>{pendingTasks} pending</span>}
                      {inProgressTasks > 0 && <span className="rounded-full px-1.5 py-px text-[8px] font-semibold tabular-nums" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" }}>{inProgressTasks} active</span>}
                      {completedTasks > 0 && <span className="rounded-full px-1.5 py-px text-[8px] font-semibold tabular-nums" style={{ background: "color-mix(in srgb, var(--teal) 12%, transparent)", color: "var(--teal)" }}>{completedTasks} done</span>}
                      {recurCount > 0 && <span className="rounded-full px-1.5 py-px text-[8px] font-semibold tabular-nums" style={{ background: "color-mix(in srgb, #8b5cf6 12%, transparent)", color: "#8b5cf6" }}>{recurCount} recurring</span>}
                      {empCount > 0 && <span className="rounded-full px-1.5 py-px text-[8px] font-semibold tabular-nums" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>{empCount} people</span>}
                      {c.startDate && <span className="text-[8px] tabular-nums ml-auto" style={{ color: "var(--fg-tertiary)" }}>{formatDate(c.startDate)}{c.endDate ? ` — ${formatDate(c.endDate)}` : " · ongoing"}</span>}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>

        {/* ── workspace activity feed sidebar (tasks + campaigns only) ── */}
        {canViewLogs && (
          <aside className="hidden lg:flex shrink-0 overflow-hidden flex-col min-h-0 w-[380px]">
            <div className="flex w-[380px] min-h-0 flex-1 flex-col rounded-xl border overflow-hidden" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
              <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center min-w-0">
                  <h3 className="text-headline" style={{ color: "var(--fg)" }}>Activity</h3>
                  <RefreshBtn onRefresh={() => void refetchLogs()} />
                  {wsTotalUnread > 0 && (
                    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ml-2" style={{ background: "var(--rose)" }}>
                      {wsTotalUnread > 99 ? "99+" : wsTotalUnread}
                    </span>
                  )}
                </div>
                {wsTotalUnread > 0 && (
                  <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={markAllWsRead}
                    className="h-6 w-6 flex items-center justify-center rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--teal)_10%,transparent)]"
                    style={{ color: "var(--teal)" }} title="Mark all as read">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L7 17l-5-5" /><path d="M22 10l-9.5 9.5L10 17" /></svg>
                  </motion.button>
                )}
              </div>
              {wsLogs.length === 0 ? (
                <p className="text-center text-xs py-8 flex-1" style={{ color: "var(--fg-tertiary)" }}>No workspace activity yet</p>
              ) : (
                <div className="flex flex-1 min-h-0 flex-col gap-1 p-2">
                  {Array.from(wsLogGroups.entries())
                    .sort((a, b) => {
                      const WS_P: Record<string, number> = { task: 0, campaign: 1 };
                      const pa = WS_P[a[0]] ?? 50;
                      const pb = WS_P[b[0]] ?? 50;
                      if (pa !== pb) return pa - pb;
                      if (b[1].unread !== a[1].unread) return b[1].unread - a[1].unread;
                      return b[1].logs.length - a[1].logs.length;
                    })
                    .map(([entity, group]) => {
                      const lc = WS_LOG_COLORS[entity];
                      const label = WS_LOG_LABELS[entity] ?? entity;
                      const isOpen = activityExpanded === entity;
                      return (
                        <div key={entity} className={`rounded-xl border overflow-hidden flex flex-col ${isOpen ? "flex-1 min-h-0" : "shrink-0"}`} style={{ borderColor: "var(--border)" }}>
                          <div className="flex w-full shrink-0 items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
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
                              <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => markWsEntityRead(entity)}
                                className="shrink-0 h-5 w-5 flex items-center justify-center rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--teal)_10%,transparent)]"
                                style={{ color: "var(--teal)" }} title="Mark as read">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                              </motion.button>
                            )}
                          </div>
                          {isOpen && (
                            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-1.5" style={{ scrollbarWidth: "thin" }}>
                              {group.logs.map((log) => {
                                const isSelf = session?.user?.email && log.userEmail?.toLowerCase() === session.user.email.toLowerCase();
                                const needsPossessive = /^(location|account|profile|password|session)\b/i.test(log.action);
                                const displayName = isSelf ? (needsPossessive ? "Your" : "You") : (log.userName?.trim() || log.userEmail);
                                return (
                                  <div key={log._id} className="rounded-lg p-2.5 transition-colors" style={{ background: "var(--bg)" }}>
                                    <div className="flex items-start gap-2">
                                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[8px] font-bold"
                                        style={{ background: lc.bg, color: lc.fg }}>
                                        {logAvatarLabel(log)}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[11px] leading-snug" style={{ color: "var(--fg)" }}>
                                          <span className="font-semibold">{displayName}</span>{" "}
                                          <span style={{ color: "var(--fg-secondary)" }}>{log.action}</span>
                                        </p>
                                        {log.details && (
                                          <p className="text-[10px] line-clamp-2 mt-0.5" style={{ color: "var(--fg-tertiary)" }}>{log.details}</p>
                                        )}
                                        <div className="flex items-center gap-2 mt-1">
                                          <span className="text-[9px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{timeAgo(log.createdAt)}</span>
                                          {log.entity === "task" && log.entityId && (() => {
                                            const linkedTask = taskList.find((t) => t._id === log.entityId);
                                            if (!linkedTask) return null;
                                            const sc = linkedTask.status === "completed" ? "var(--teal)" : linkedTask.status === "inProgress" ? "var(--primary)" : "var(--amber)";
                                            const sl = linkedTask.status === "completed" ? "Done" : linkedTask.status === "inProgress" ? "Working" : "Pending";
                                            const canAct = linkedTask.status !== "completed";
                                            return (
                                              <motion.button type="button" onClick={canAct ? () => requestCycleTask(linkedTask) : undefined} disabled={!canAct}
                                                whileHover={canAct ? { scale: 1.06 } : undefined} whileTap={canAct ? { scale: 0.94 } : undefined}
                                                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold transition-all disabled:cursor-default"
                                                style={{ borderColor: `color-mix(in srgb, ${sc} 30%, transparent)`, background: `color-mix(in srgb, ${sc} 12%, transparent)`, color: sc, cursor: canAct ? "pointer" : "default" }}>
                                                <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: sc }}>
                                                  {linkedTask.status === "inProgress" && <span className="absolute inset-0 animate-ping rounded-full opacity-50" style={{ background: sc }} />}
                                                </span>
                                                {sl}
                                                {canAct && <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>}
                                              </motion.button>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
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
          <motion.button type="button" onClick={handleSaveTask} disabled={taskSaving || !fTitle.trim() || fAssignees.length === 0} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary flex-1">{taskSaving ? "Saving…" : editingTask ? "Update" : fAssignees.length > 1 ? `Create ${fAssignees.length} Tasks` : "Create"}</motion.button>
          <button type="button" onClick={() => setTaskModalOpen(false)} className="btn btn-secondary flex-1">Cancel</button>
        </>}
      >
        <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Title</label><input type="text" value={fTitle} onChange={(e) => setFTitle(e.target.value)} className="input" autoFocus required /></div>
        <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Description</label><textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={2} className="input" /></div>
        {canReassignTasks && allEmployees.length > 0 && (() => {
          const camp = fCampaign ? campaignList.find((c) => c._id === fCampaign) : null;
          const assignable = camp ? allEmployees.filter((e) => camp.tags.employees.some((te) => te._id === e._id)) : allEmployees;
          return assignable.length > 0 ? (
            <div>
              <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">
                Assign To
                <span className="font-normal ml-1" style={{ color: "var(--fg-tertiary)" }}>({fAssignees.length}/{assignable.length})</span>
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {assignable.map((e) => (
                  <button key={e._id} type="button"
                    onClick={() => setFAssignees((prev) => prev.includes(e._id) ? prev.filter((id) => id !== e._id) : [...prev, e._id])}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${fAssignees.includes(e._id) ? "text-white shadow-sm" : "text-[var(--fg-secondary)]"}`}
                    style={fAssignees.includes(e._id) ? { background: "var(--purple)" } : { background: "var(--bg-grouped)" }}>{e.label}</button>
                ))}
              </div>
            </div>
          ) : <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No employees tagged in this campaign.</p>;
        })()}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Priority</label><select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className="input"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
          <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Deadline</label><input type="date" value={fDeadline} onChange={(e) => setFDeadline(e.target.value)} className="input" /></div>
        </div>
        {!fParentTask && (
          <div>
            <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Recurrence</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {([["", "One-time"], ["weekly", "Weekly"], ["monthly", "Monthly"]] as const).map(([val, label]) => (
                <button key={val} type="button"
                  onClick={() => { setFRecurFreq(val); setFRecurDays([]); }}
                  className="rounded-lg px-3 py-1.5 text-[11px] font-semibold border transition-all"
                  style={{ background: fRecurFreq === val ? "var(--primary)" : "var(--bg-grouped)", color: fRecurFreq === val ? "white" : "var(--fg-secondary)", borderColor: fRecurFreq === val ? "var(--primary)" : "var(--border)" }}>{label}</button>
              ))}
            </div>
            {fRecurFreq === "weekly" && (
              <div className="flex flex-wrap gap-1.5">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, idx) => (
                  <button key={idx} type="button"
                    onClick={() => setFRecurDays((prev) => prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx])}
                    className="rounded-lg px-2 py-1 text-[11px] font-semibold border transition-all"
                    style={{ background: fRecurDays.includes(idx) ? "var(--primary)" : "var(--bg-grouped)", color: fRecurDays.includes(idx) ? "white" : "var(--fg-secondary)", borderColor: fRecurDays.includes(idx) ? "var(--primary)" : "var(--border)" }}>{label}</button>
                ))}
              </div>
            )}
            {fRecurFreq === "monthly" && (
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <button key={d} type="button"
                    onClick={() => setFRecurDays((prev) => prev.includes(d) ? prev.filter((v) => v !== d) : [...prev, d])}
                    className="h-7 w-7 rounded-lg text-[10px] font-semibold border transition-all flex items-center justify-center"
                    style={{ background: fRecurDays.includes(d) ? "var(--primary)" : "var(--bg-grouped)", color: fRecurDays.includes(d) ? "white" : "var(--fg-secondary)", borderColor: fRecurDays.includes(d) ? "var(--primary)" : "var(--border)" }}>{d}</button>
                ))}
              </div>
            )}
          </div>
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
        <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Status</label><select value={cStatus} onChange={(e) => setCStatus(e.target.value as CampaignStatus)} className="input"><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Start</label><input type="date" value={cStart} onChange={(e) => setCStart(e.target.value)} className="input" /></div>
          {!cOngoing ? (
            <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">End</label><input type="date" value={cEnd} onChange={(e) => setCEnd(e.target.value)} className="input" /></div>
          ) : (
            <div className="flex items-center gap-2 self-end pb-2">
              <ToggleSwitch size="sm" checked={cOngoing} onChange={() => { setCOngoing((v) => !v); if (!cOngoing) setCEnd(""); }} />
              <label className="text-xs font-medium" style={{ color: "var(--fg-secondary)" }}>Ongoing</label>
            </div>
          )}
        </div>
        {!cOngoing && (
          <div className="flex items-center gap-2">
            <ToggleSwitch size="sm" checked={cOngoing} onChange={() => { setCOngoing((v) => !v); if (!cOngoing) setCEnd(""); }} />
            <label className="text-xs font-medium" style={{ color: "var(--fg-secondary)" }}>Ongoing (no end date)</label>
          </div>
        )}
        {canTagEntities && allDepartments.length > 0 && (
          <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Tag Departments</label><div className="flex flex-wrap gap-1.5">{allDepartments.map((d) => (<button key={d._id} type="button" onClick={() => { const next = toggleArr(cTagDepts, d._id); setCTagDepts(next); if (next.length > 0) setCTagEmployees((prev) => prev.filter((eid) => { const emp = allEmployees.find((x) => x._id === eid); return emp?.departmentId && next.includes(emp.departmentId); })); }} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${cTagDepts.includes(d._id) ? "text-white shadow-sm" : "text-[var(--fg-secondary)]"}`} style={cTagDepts.includes(d._id) ? { background: "var(--primary)" } : { background: "var(--bg-grouped)" }}>{d.label}</button>))}</div></div>
        )}
        {canTagEntities && allEmployees.length > 0 && cTagDepts.length > 0 && (() => {
          const filtered = allEmployees.filter((e) => e.departmentId && cTagDepts.includes(e.departmentId));
          return filtered.length > 0 ? (
            <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Tag Employees<span className="font-normal ml-1" style={{ color: "var(--fg-tertiary)" }}>({filtered.length} in selected dept{cTagDepts.length > 1 ? "s" : ""})</span></label><div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">{filtered.map((e) => (<button key={e._id} type="button" onClick={() => setCTagEmployees(toggleArr(cTagEmployees, e._id))} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${cTagEmployees.includes(e._id) ? "text-white shadow-sm" : "text-[var(--fg-secondary)]"}`} style={cTagEmployees.includes(e._id) ? { background: "var(--purple)" } : { background: "var(--bg-grouped)" }}>{e.label}</button>))}</div></div>
          ) : <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No employees in selected department{cTagDepts.length > 1 ? "s" : ""}.</p>;
        })()}
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

      {/* ── status change confirm ── */}
      <ConfirmDialog
        open={!!statusConfirm}
        title={statusConfirm?.type === "task"
          ? `Mark as ${statusConfirm.label}?`
          : statusConfirm?.currentDone ? "Undo completion?" : "Mark as done?"}
        description={statusConfirm?.type === "task"
          ? `Change "${statusConfirm.task.title}" status to ${statusConfirm.label}.`
          : statusConfirm?.currentDone
            ? `Unmark "${statusConfirm?.title}" as completed for today.`
            : `Mark "${statusConfirm?.title}" as completed for today.`}
        confirmLabel={statusConfirm?.type === "task" ? statusConfirm.label : statusConfirm?.currentDone ? "Undo" : "Done"}
        variant={statusConfirm?.type === "task" && statusConfirm.next === "pending" ? "warning" : "default"}
        loading={statusUpdating}
        onConfirm={handleStatusConfirm}
        onCancel={() => setStatusConfirm(null)}
      />
    </div>
  );
}
