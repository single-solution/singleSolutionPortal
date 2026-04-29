"use client";

import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cardVariants, staggerContainerFast } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RefreshBtn, SearchField, EmptyState, ModalShell } from "../components/ui";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { HeaderStatPill } from "../components/StatChips";
import toast from "react-hot-toast";
import { formatShortDate, timeAgo } from "@/lib/formatters";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TaskHistoryModal } from "./TaskHistoryModal";

/* ─── types ─── */

type CampaignStatus = "active" | "paused" | "completed" | "cancelled";
type TaskStatus = "pending" | "inProgress" | "completed";

interface TaggedEmployee { _id: string; about: { firstName: string; lastName: string }; email: string }
interface TaggedDept { _id: string; title: string }
interface Recurrence { frequency: "weekly" | "monthly"; days: number[] }
interface Campaign {
  _id: string; name: string; slug: string; description?: string; status: CampaignStatus;
  startDate?: string; endDate?: string; budget?: string;
  tags: { employees: TaggedEmployee[]; departments: TaggedDept[] };
  taskStats?: { total: number; completed: number; recurring: number; todayDue: number; todayDone: number };
  todayChecklist?: { _id: string; title: string; done: boolean }[];
  todayChecklistByEmployee?: Record<string, string[]>;
  notes?: string; isActive: boolean;
  createdBy?: { _id: string; about: { firstName: string; lastName: string } };
  createdAt: string; updatedAt?: string;
}
interface UserStatusEntry {
  user: { _id?: string; about?: { firstName: string; lastName: string }; email?: string } | string;
  status: string;
  updatedAt?: string;
}
interface Task {
  _id: string; title: string; description?: string; status: TaskStatus;
  deadline?: string;
  parentTask?: string | null;
  recurrence?: Recurrence;
  campaign?: { _id: string; name: string; status: CampaignStatus } | null;
  assignedTo?: { _id: string; about?: { firstName: string; lastName: string }; email?: string }[];
  createdBy?: { _id: string; about?: { firstName: string; lastName: string }; email?: string };
  createdAt: string;
  userStatuses?: UserStatusEntry[];
  isActive?: boolean;
}

function isTaskAssigned(task: Task, userId: string): boolean {
  return Array.isArray(task.assignedTo) ? task.assignedTo.some((a) => a._id === userId) : false;
}

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL_WORKING = [1, 2, 3, 4, 5];

function formatRecurrence(r?: Recurrence): string {
  if (!r) return "Recurring";
  const freq = r.frequency === "weekly" ? "Weekly" : "Monthly";
  const days = [...(r.days ?? [])].sort((a, b) => a - b);
  if (r.frequency === "weekly") {
    if (days.length === 7) return "Daily";
    if (days.length === 5 && ALL_WORKING.every((d) => days.includes(d))) return "Weekly all working days";
    return `${freq} ${days.map((d) => DAY_ABBR[d] ?? d).join("/")}`;
  }
  return `${freq} day ${days.join(", ")}`;
}

function taskSubmittedInfo(task: Task, checklistByEmp?: Record<string, string[]>): { done: number; total: number; label: string; color: string } {
  const total = task.assignedTo?.length ?? 0;
  if (total === 0) return { done: 0, total: 0, label: "No assignees", color: "var(--fg-tertiary)" };

  if (task.recurrence && checklistByEmp) {
    const completedEmps = checklistByEmp[task._id] ?? [];
    const done = completedEmps.length;
    if (done >= total) return { done, total, label: `${done}/${total} completed`, color: "var(--teal)" };
    if (done > 0) return { done, total, label: `${done}/${total} completed`, color: "var(--primary)" };
    return { done: 0, total, label: `0/${total} completed`, color: "var(--amber)" };
  }

  const us = task.userStatuses ?? [];
  const done = us.filter((e) => e.status === "completed").length;
  if (done === total) return { done, total, label: `${done}/${total} completed`, color: "var(--teal)" };
  if (done > 0) return { done, total, label: `${done}/${total} submitted`, color: "var(--primary)" };
  const inProg = us.filter((e) => e.status === "inProgress").length;
  if (inProg > 0) return { done: 0, total, label: `${inProg}/${total} in progress`, color: "var(--primary)" };
  return { done: 0, total, label: `0/${total} submitted`, color: "var(--amber)" };
}

interface SelectOption { _id: string; label: string; departmentId?: string }

interface LogEntry {
  _id: string; userEmail: string; userName: string; action: string;
  entity: string; entityId?: string; details?: string; createdAt: string;
}

/* ─── constants ─── */

const WS_ENTITIES = new Set(["task", "campaign"]);
const WS_LOG_COLORS: Record<string, { bg: string; fg: string }> = {
  task:     { bg: "color-mix(in srgb, var(--primary) 14%, transparent)", fg: "var(--primary)" },
  campaign: { bg: "color-mix(in srgb, #8b5cf6 14%, transparent)", fg: "#8b5cf6" },
};
const WS_LOG_LABELS: Record<string, string> = { task: "Task updates", campaign: "Campaign updates" };
function resolveLogName(log: LogEntry) {
  const n = (log.userName || "").trim();
  if (n) return n;
  if (!log.userEmail) return "Unknown";
  const local = log.userEmail.split("@")[0] ?? "";
  if (/^admin$/i.test(local)) return "Admin";
  return local.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function logAvatarLabel(log: LogEntry) {
  const n = resolveLogName(log);
  const parts = n.split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

/* ─── helpers ─── */

const formatDate = formatShortDate;
function assigneeName(t: Task) {
  if (Array.isArray(t.assignedTo) && t.assignedTo.length > 0) {
    return t.assignedTo.map((a) => a.about ? `${a.about.firstName} ${a.about.lastName}` : a.email ?? "Unknown").join(", ");
  }
  return "Unassigned";
}

function deadlineUrgency(deadline?: string): "overdue" | "soon" | "normal" | "none" {
  if (!deadline) return "none";
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff < 0) return "overdue";
  if (diff < 2 * 86400000) return "soon";
  return "normal";
}

/* ─── sortable task row wrapper ─── */

function SortableTaskRow({ id, children, canReorder = true }: { id: string; children: React.ReactNode; canReorder?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !canReorder });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, position: "relative", zIndex: isDragging ? 10 : undefined }} {...attributes}>
      <div className="flex items-stretch">
        {canReorder && (
          <button type="button" {...listeners} className="shrink-0 flex items-center px-0.5 cursor-grab active:cursor-grabbing touch-none" style={{ color: "var(--fg-tertiary)" }} title="Drag to reorder">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="4" r="2" /><circle cx="16" cy="4" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="8" cy="20" r="2" /><circle cx="16" cy="20" r="2" /></svg>
          </button>
        )}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

/* ─── main page ─── */

export default function WorkspacePage() {
  const { data: session, status: sessionStatus } = useSession();
  const { can: canPerm, isSuperAdmin, subordinateIds } = usePermissions();

  const canCreateTasks = canPerm("tasks_create");
  const canEditTasks = canPerm("tasks_edit");
  const canDeleteTasks = canPerm("tasks_delete");
  const canReassignTasks = canPerm("tasks_reassign");
  const canToggleActive = canPerm("tasks_toggleActive");
  const canReorderTasks = canPerm("tasks_reorder");
  const canCreateCampaigns = canPerm("campaigns_create");
  const canEditCampaigns = canPerm("campaigns_edit");
  const canDeleteCampaigns = canPerm("campaigns_delete");
  const canToggleCampaign = canPerm("campaigns_toggleStatus");
  const canTagEntities = canPerm("campaigns_tagEntities");
  const canViewCampaigns = canPerm("campaigns_view");
  const canViewLogs = canPerm("activityLogs_view");

  const myHierarchy = useMemo(() => {
    const set = new Set<string>();
    if (session?.user?.id) set.add(session.user.id);
    for (const id of subordinateIds) set.add(id);
    return set;
  }, [session?.user?.id, subordinateIds]);

  const isInMyHierarchy = useCallback((creatorId?: string) => {
    if (isSuperAdmin) return true;
    if (!creatorId) return false;
    return myHierarchy.has(creatorId);
  }, [isSuperAdmin, myHierarchy]);

  /* ── data ── */
  const { data: tasks, loading: tasksLoading, refetch: refetchTasks, mutate: mutateTasks } = useQuery<Task[]>("/api/tasks", "ws-tasks");
  const { data: campaigns, loading: campaignsLoading, refetch: refetchCampaigns, mutate: mutateCampaigns } = useQuery<Campaign[]>("/api/campaigns", "ws-campaigns");
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
  const [search, setSearch] = useState("");
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

  /* ── subtasks state ── */
  const [subtasksByParent, setSubtasksByParent] = useState<Map<string, Task[]>>(new Map());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [subtaskLoading, setSubtaskLoading] = useState<string | null>(null);
  const loadSubtasks = useCallback(async (taskId: string) => {
    setSubtaskLoading(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/subtasks`);
      if (res.ok) {
        const data = await res.json();
        setSubtasksByParent((prev) => new Map(prev).set(taskId, data));
      }
    } catch { toast.error("Failed to load subtasks"); }
    setSubtaskLoading(null);
  }, []);

  const toggleTaskExpanded = useCallback((taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const rootTaskIds = useMemo(() => taskList.filter((t) => !t.parentTask).map((t) => t._id), [taskList]);
  const subtasksLoadedRef = useRef(false);
  useEffect(() => {
    if (rootTaskIds.length === 0 || subtasksLoadedRef.current) return;
    subtasksLoadedRef.current = true;
    setExpandedTasks(new Set(rootTaskIds));
    for (const id of rootTaskIds) {
      if (!subtasksByParent.has(id)) void loadSubtasks(id);
    }
  }, [rootTaskIds, loadSubtasks, subtasksByParent]);

  /* ── global history modal ── */
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyPreCampaignId, setHistoryPreCampaignId] = useState<string | undefined>();
  const [historyPreTaskId, setHistoryPreTaskId] = useState<string | undefined>();
  const openHistoryModal = useCallback((campaignId?: string, taskId?: string) => {
    setHistoryPreCampaignId(campaignId);
    setHistoryPreTaskId(taskId);
    setHistoryModalOpen(true);
  }, []);

  /* ── task modal ── */
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fAssignees, setFAssignees] = useState<string[]>([]);
  const [fCampaign, setFCampaign] = useState("");
  const [fDeadline, setFDeadline] = useState("");
  const [fRecurFreq, setFRecurFreq] = useState<string>("");
  const [fRecurDays, setFRecurDays] = useState<number[]>([]);
  const [taskSaving, setTaskSaving] = useState(false);
  const [fParentTask, setFParentTask] = useState("");

  function openCreateTask(campaignId: string, parentTaskId?: string) {
    setEditingTask(null); setFTitle(""); setFDesc(""); setFAssignees([]); setFCampaign(campaignId); setFDeadline(""); setFRecurDays([]);
    if (parentTaskId) {
      const parent = taskList.find((t) => t._id === parentTaskId);
      setFRecurFreq(parent?.recurrence?.frequency ? "weekly" : "");
      setFParentTask(parentTaskId);
    } else {
      setFRecurFreq("");
      setFParentTask("");
    }
    setTaskModalOpen(true);
  }
  function openEditTask(t: Task) {
    setEditingTask(t); setFTitle(t.title); setFDesc(t.description ?? ""); setFAssignees(Array.isArray(t.assignedTo) ? t.assignedTo.map((a) => a._id) : []); setFCampaign(t.campaign?._id ?? ""); setFDeadline(t.deadline ? t.deadline.slice(0, 10) : "");
    setFRecurFreq(t.recurrence?.frequency ?? ""); setFRecurDays(t.recurrence?.days ?? []); setFParentTask(t.parentTask ?? "");
    setTaskModalOpen(true);
  }
  async function handleSaveTask() {
    if (!fTitle.trim() || fAssignees.length === 0) return;
    setTaskSaving(true);
    try {
      const basePayload: Record<string, unknown> = { title: fTitle.trim(), description: fDesc, status: "pending", campaign: fCampaign || null, deadline: fRecurFreq === "" && fDeadline ? fDeadline : undefined };
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

      toast.success(editingTask ? "Task updated" : "Task created");
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
  const [cTagEmployees, setCTagEmployees] = useState<string[]>([]);
  const [cTagDepts, setCTagDepts] = useState<string[]>([]);
  const [campaignSaving, setCampaignSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function openCreateCampaign() {
    setEditingCampaign(null); setCName(""); setCDesc(""); setCTagEmployees([]); setCTagDepts([]); setCampaignModalOpen(true);
  }
  function openEditCampaign(c: Campaign) {
    setEditingCampaign(c); setCName(c.name); setCDesc(c.description ?? ""); setCTagEmployees(c.tags.employees.map((e) => e._id)); setCTagDepts(c.tags.departments.map((d) => d._id)); setCampaignModalOpen(true);
  }
  async function toggleTaskActive(taskId: string, currentlyActive: boolean) {
    if (!canToggleActive || togglingId) return;
    setTogglingId(taskId);
    mutateTasks((prev) => prev?.map((t) => t._id === taskId ? { ...t, isActive: !currentlyActive } : t) ?? null);
    if (currentlyActive) {
      setSubtasksByParent((prev) => {
        const subs = prev.get(taskId);
        if (!subs) return prev;
        const next = new Map(prev);
        next.set(taskId, subs.map((s) => ({ ...s, isActive: false })));
        return next;
      });
    }
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !currentlyActive }) });
      if (res.ok) { toast.success(currentlyActive ? "Task deactivated" : "Task activated"); void refetchTasks(); if (currentlyActive && subtasksByParent.has(taskId)) void loadSubtasks(taskId); }
      else { mutateTasks((prev) => prev?.map((t) => t._id === taskId ? { ...t, isActive: currentlyActive } : t) ?? null); toast.error("Failed to update task"); }
    } catch { mutateTasks((prev) => prev?.map((t) => t._id === taskId ? { ...t, isActive: currentlyActive } : t) ?? null); toast.error("Network error"); }
    setTogglingId(null);
  }

  async function toggleSubtaskActive(parentId: string, subtaskId: string, currentlyActive: boolean) {
    if (!canToggleActive || togglingId) return;
    setTogglingId(subtaskId);
    setSubtasksByParent((prev) => {
      const subs = prev.get(parentId);
      if (!subs) return prev;
      const next = new Map(prev);
      next.set(parentId, subs.map((s) => s._id === subtaskId ? { ...s, isActive: !currentlyActive } : s));
      return next;
    });
    try {
      const res = await fetch(`/api/tasks/${subtaskId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !currentlyActive }) });
      if (res.ok) { toast.success(currentlyActive ? "Subtask deactivated" : "Subtask activated"); void loadSubtasks(parentId); }
      else {
        setSubtasksByParent((prev) => {
          const subs = prev.get(parentId);
          if (!subs) return prev;
          const next = new Map(prev);
          next.set(parentId, subs.map((s) => s._id === subtaskId ? { ...s, isActive: currentlyActive } : s));
          return next;
        });
        toast.error("Failed to update subtask");
      }
    } catch {
      setSubtasksByParent((prev) => {
        const subs = prev.get(parentId);
        if (!subs) return prev;
        const next = new Map(prev);
        next.set(parentId, subs.map((s) => s._id === subtaskId ? { ...s, isActive: currentlyActive } : s));
        return next;
      });
      toast.error("Network error");
    }
    setTogglingId(null);
  }

  async function toggleCampaignActive(campaignId: string, currentStatus: CampaignStatus) {
    if (!canToggleCampaign || togglingId) return;
    const next: CampaignStatus = currentStatus === "active" ? "paused" : "active";
    setTogglingId(campaignId);
    mutateCampaigns((prev) => prev?.map((c) => c._id === campaignId ? { ...c, status: next } : c) ?? null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
      if (res.ok) { toast.success(next === "active" ? "Campaign activated" : "Campaign paused"); void refetchCampaigns(); }
      else { mutateCampaigns((prev) => prev?.map((c) => c._id === campaignId ? { ...c, status: currentStatus } : c) ?? null); toast.error("Failed to update campaign"); }
    } catch { mutateCampaigns((prev) => prev?.map((c) => c._id === campaignId ? { ...c, status: currentStatus } : c) ?? null); toast.error("Network error"); }
    setTogglingId(null);
  }

  async function handleSaveCampaign() {
    if (!cName.trim()) return;
    setCampaignSaving(true);
    try {
      const payload: Record<string, unknown> = { name: cName.trim(), description: cDesc, status: editingCampaign ? editingCampaign.status : "active", tagEmployees: cTagEmployees, tagDepartments: cTagDepts };
      const res = editingCampaign
        ? await fetch(`/api/campaigns/${editingCampaign._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const err = await res.json().catch(() => null); toast.error(err?.error ?? "Failed to save campaign"); setCampaignSaving(false); return; }
      toast.success(editingCampaign ? "Campaign updated" : "Campaign created");
      setCampaignModalOpen(false); await refetchCampaigns();
    } catch { toast.error("Network error"); }
    setCampaignSaving(false);
  }
  function toggleArr(arr: string[], item: string): string[] { return arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item]; }

  /* ── delete ── */
  const [deleteTarget, setDeleteTarget] = useState<{ type: "task" | "campaign"; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ── deactivation confirmations ── */
  const [deactivateTaskTarget, setDeactivateTaskTarget] = useState<{ id: string; name: string; hasSubtasks: boolean } | null>(null);
  const [pauseCampaignTarget, setPauseCampaignTarget] = useState<{ id: string; name: string; status: CampaignStatus } | null>(null);
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const endpoint = deleteTarget.type === "task" ? `/api/tasks/${deleteTarget.id}` : `/api/campaigns/${deleteTarget.id}`;
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) { const err = await res.json().catch(() => null); toast.error(err?.error ?? "Delete failed"); setDeleting(false); return; }
      toast.success(deleteTarget.type === "task" ? "Task deleted" : "Campaign deleted");
      setDeleteTarget(null);
      if (deleteTarget.type === "task") await refetchTasks();
      else await refetchCampaigns();
    } catch { toast.error("Network error"); }
    setDeleting(false);
  }

  /* ── quick status update with confirmation ── */
  const [statusConfirm, setStatusConfirm] = useState<{ campaignId: string; taskId: string; title: string; currentDone: boolean } | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  async function handleStatusConfirm() {
    if (!statusConfirm) return;
    setStatusUpdating(true);
    try {
      setChecklistOverrides((prev) => new Map(prev).set(statusConfirm.taskId, !statusConfirm.currentDone));
      try {
        await fetch(`/api/campaigns/${statusConfirm.campaignId}/checklist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: statusConfirm.taskId }) });
      } catch {
        setChecklistOverrides((prev) => { const n = new Map(prev); n.delete(statusConfirm.taskId); return n; });
      }
      toast.success(statusConfirm.currentDone ? "Unmarked" : "Marked as done");
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

  const historyCampaigns = useMemo(() => {
    return campaignList.map((c) => {
      const tasks = campaignTaskMap.get(c._id) ?? [];
      const parentTasks = tasks.filter((t) => !t.parentTask);
      return {
        _id: c._id,
        name: c.name,
        tasks: parentTasks.map((t) => ({
          _id: t._id,
          title: t.title,
          parentTask: t.parentTask,
          recurrence: t.recurrence ?? null,
          subtasks: (subtasksByParent.get(t._id) ?? []).map((s) => ({
            _id: s._id,
            title: s.title,
            parentTask: s.parentTask,
            recurrence: s.recurrence ?? null,
          })),
        })),
      };
    });
  }, [campaignList, campaignTaskMap, subtasksByParent]);

  /* ── filtering ── */
  const filteredCampaignTasks = useMemo(() => {
    const result = new Map<string, Task[]>();
    for (const [cid, tasks] of campaignTaskMap) {
      let list = tasks;
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
  }, [campaignTaskMap, search]);

  /* ── drag-and-drop reorder ── */
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragEnd = useCallback(async (campaignId: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const tasks = filteredCampaignTasks.get(campaignId) ?? [];
    const oneTime = tasks.filter((t) => !t.recurrence);
    const oldIdx = oneTime.findIndex((t) => t._id === active.id);
    const newIdx = oneTime.findIndex((t) => t._id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(oneTime, oldIdx, newIdx);
    const orderedIds = reordered.map((t) => t._id);
    try {
      const res = await fetch("/api/tasks/reorder", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderedIds }) });
      if (res.ok) { toast.success("Reordered", { duration: 1500 }); await refetchTasks(); }
      else toast.error("Reorder failed");
    } catch { toast.error("Reorder failed"); }
  }, [filteredCampaignTasks, refetchTasks]);

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
      if (userId && isTaskAssigned(t, userId)) assignedToMe++;
      if (userId && t.createdBy?._id === userId) createdByMe++;
      if (!t.assignedTo || t.assignedTo.length === 0) unassigned++;
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
    return { overdue, dueSoon, dueThisWeek, noDeadline, assignedToMe, createdByMe, unassigned, weeklyRecur, monthlyRecur, recurring, oneTime, completionRate, completedToday, completedThisWeek, completedThisMonth, createdToday, createdThisWeek, createdThisMonth };
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
    let list = [...campaignList];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => {
        if (c.name.toLowerCase().includes(q)) return true;
        const tasks = filteredCampaignTasks.get(c._id) ?? [];
        return tasks.length > 0;
      });
    }
    list.sort((a, b) => {
      const aActive = a.status === "active" ? 0 : 1;
      const bActive = b.status === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [campaignList, search, filteredCampaignTasks]);

  const loading = tasksLoading || campaignsLoading;
  const ready = sessionStatus !== "loading";

  /* ─── render ─── */
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col" style={{ height: "calc(93dvh - 80px)" }}>
      {/* ── header ── */}
      <div className="mb-4 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-headline text-lg font-bold" style={{ color: "var(--fg)" }}>Workspace</h1>
          {loading ? (
            <span className="shimmer inline-block h-4 w-44 rounded" />
          ) : (
            <>
              <HeaderStatPill label={campaignList.length === 1 ? "campaign" : "campaigns"} value={campaignList.length} dotColor="var(--teal)" />
              <HeaderStatPill label="completion rate" value={`${taskInsights.completionRate}%`} dotColor="var(--green)" />
              {taskInsights.overdue > 0 && <HeaderStatPill label={taskInsights.overdue === 1 ? "task overdue" : "tasks overdue"} value={taskInsights.overdue} dotColor="var(--rose)" />}
              {taskInsights.dueSoon > 0 && <HeaderStatPill label={taskInsights.dueSoon === 1 ? "due soon" : "due soon"} value={taskInsights.dueSoon} dotColor="var(--amber)" />}
              {taskInsights.dueThisWeek > 0 && <HeaderStatPill label="due this week" value={taskInsights.dueThisWeek} dotColor="var(--fg-tertiary)" />}
              {taskInsights.unassigned > 0 && <HeaderStatPill label="unassigned" value={taskInsights.unassigned} dotColor="var(--fg-tertiary)" />}
              {taskInsights.noDeadline > 0 && <HeaderStatPill label="no deadline" value={taskInsights.noDeadline} dotColor="var(--fg-tertiary)" />}
              <HeaderStatPill label="recurring" value={`${taskInsights.recurring} (${taskInsights.weeklyRecur}w · ${taskInsights.monthlyRecur}m)`} dotColor="#8b5cf6" />
              {taskInsights.assignedToMe > 0 && <HeaderStatPill label="assigned to me" value={taskInsights.assignedToMe} dotColor="var(--primary)" />}
              {taskInsights.createdByMe > 0 && <HeaderStatPill label="created by me" value={taskInsights.createdByMe} dotColor="var(--fg-tertiary)" />}
              {taskInsights.completedToday > 0 && <HeaderStatPill label="done today" value={taskInsights.completedToday} dotColor="var(--green)" />}
              {taskInsights.completedThisWeek > 0 && <HeaderStatPill label="done this week" value={taskInsights.completedThisWeek} dotColor="var(--green)" />}
              {taskInsights.completedThisMonth > 0 && <HeaderStatPill label="completed this month" value={taskInsights.completedThisMonth} dotColor="var(--green)" />}
              {taskInsights.createdToday > 0 && <HeaderStatPill label="created today" value={taskInsights.createdToday} dotColor="var(--fg-tertiary)" />}
              {campaignInsights.active > 0 && <HeaderStatPill label={campaignInsights.active === 1 ? "active campaign" : "active campaigns"} value={campaignInsights.active} dotColor="var(--green)" />}
              {campaignInsights.completed > 0 && <HeaderStatPill label="done campaigns" value={campaignInsights.completed} dotColor="var(--fg-tertiary)" />}
              {campaignInsights.completionRate > 0 && <HeaderStatPill label="campaigns done" value={`${campaignInsights.completionRate}%`} dotColor="var(--fg-tertiary)" />}
              {campaignInsights.noTasks > 0 && <HeaderStatPill label="empty campaigns" value={campaignInsights.noTasks} dotColor="var(--fg-tertiary)" />}
              {campaignInsights.pastEnd > 0 && <HeaderStatPill label="past end date" value={campaignInsights.pastEnd} dotColor="var(--rose)" />}
              {campaignInsights.nearingEnd > 0 && <HeaderStatPill label="nearing end" value={campaignInsights.nearingEnd} dotColor="var(--amber)" />}
            </>
          )}
        </div>
      </div>

      {/* ── search + create ── */}
      <div data-tour="workspace-toolbar" className="mb-4 flex shrink-0 items-center gap-3 rounded-xl p-2" style={{ background: "var(--bg-grouped)" }}>
        <SearchField value={search} onChange={setSearch} placeholder="Search campaigns and tasks…" />
        <motion.button type="button" onClick={() => openHistoryModal()} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors shrink-0"
          style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg)" }}>
          <svg className="h-3.5 w-3.5" style={{ color: "var(--purple)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Progress
        </motion.button>
        {ready && canCreateCampaigns && (
          <motion.button type="button" onClick={openCreateCampaign} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            New Campaign
          </motion.button>
        )}
      </div>

      {/* ── main + feed ── */}
      <div className="flex min-h-0 flex-1 gap-4" style={{ containerType: "size" }}>
        {/* ── campaign card grid ── */}
        <div className="min-w-0 min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[1, 2, 3, 4, 5, 6].map((g) => (
                <div key={g} className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
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
            <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-3" variants={staggerContainerFast} initial="hidden" animate="visible">
              {visibleCampaigns.map((c, ci) => {
                const allTasks = campaignTaskMap.get(c._id) ?? [];
                const visibleTasks = filteredCampaignTasks.get(c._id) ?? [];
                const oneTimeTasks = visibleTasks.filter((t) => !t.recurrence);
                const todayChecklist = c.todayChecklist ?? [];
                const todayDone = todayChecklist.filter((t) => checklistOverrides.has(t._id) ? checklistOverrides.get(t._id) : t.done).length;
                const isInactive = c.status !== "active";

                const totalTasks = allTasks.length;
                const inProgressTasks = allTasks.filter((t) => t.status === "inProgress").length;
                const completedTasks = allTasks.filter((t) => t.status === "completed").length;
                const empCount = c.tags.employees.length;
                const recurCount = c.taskStats?.recurring ?? 0;
                const isMyCampaign = isInMyHierarchy(c.createdBy?._id);

                return (
                  <motion.div key={c._id} variants={cardVariants} custom={ci}
                    className="rounded-xl border overflow-hidden flex flex-col transition-opacity"
                    style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", opacity: isInactive ? 0.4 : 1, height: "60cqh", minHeight: 216 }}>
                    {/* ── card header ── */}
                    <div className="flex items-center gap-1.5 px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-bold truncate" style={{ color: "var(--fg)" }}>{c.name}</span>
                          {todayChecklist.length > 0 && (
                            <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums" style={{ background: todayDone === todayChecklist.length ? "color-mix(in srgb, var(--teal) 10%, transparent)" : "color-mix(in srgb, var(--amber) 10%, transparent)", color: todayDone === todayChecklist.length ? "var(--teal)" : "var(--amber)" }}>
                              {todayDone}/{todayChecklist.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center shrink-0 gap-1">
                        {canCreateTasks && isMyCampaign && (
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openCreateTask(c._id)}
                            className="h-5 w-5 flex items-center justify-center rounded transition-colors hover:bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
                            style={{ color: "var(--primary)" }} title="Add task">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                          </motion.button>
                        )}
                        {canEditCampaigns && isMyCampaign && (
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openEditCampaign(c)} className="h-5 w-5 flex items-center justify-center rounded transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--primary)" }} title="Edit">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </motion.button>
                        )}
                        {canDeleteCampaigns && isMyCampaign && (
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setDeleteTarget({ type: "campaign", id: c._id, name: c.name })} className="h-5 w-5 flex items-center justify-center rounded transition-colors hover:bg-[color-mix(in_srgb,var(--rose)_10%,transparent)]" style={{ color: "var(--rose)" }} title="Delete">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                          </motion.button>
                        )}
                      </div>
                    </div>

                    {/* ── card body ── */}
                    <div className="flex-1 min-h-0 overflow-y-auto p-2 pt-3">
                      {todayChecklist.length > 0 && (
                        <div className="mb-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wider px-1 mb-0.5" style={{ color: "var(--fg-tertiary)" }}>Recurring{canEditTasks && isMyCampaign && <span className="font-normal"> (drag to sequence)</span>}</p>
                          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={(e) => {
                            const { active, over } = e;
                            if (!over || active.id === over.id) return;
                            const ids = todayChecklist.map((t) => t._id);
                            const oldIdx = ids.indexOf(active.id as string);
                            const newIdx = ids.indexOf(over.id as string);
                            if (oldIdx < 0 || newIdx < 0) return;
                            const reordered = arrayMove(ids, oldIdx, newIdx);
                            fetch("/api/tasks/reorder", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderedIds: reordered }) })
                              .then((r) => { if (r.ok) refetchTasks(); else toast.error("Reorder failed"); }).catch(() => toast.error("Reorder failed"));
                          }}>
                            <SortableContext items={todayChecklist.map((t) => t._id)} strategy={verticalListSortingStrategy}>
                              {todayChecklist.map((item) => {
                                const fullTask = taskList.find((t) => t._id === item._id);
                                const taskActive = fullTask?.isActive !== false;
                                const recurLabel = formatRecurrence(fullTask?.recurrence);
                                const isMyTask = isInMyHierarchy(fullTask?.createdBy?._id);
                                return (
                                  <SortableTaskRow key={item._id} id={item._id} canReorder={canReorderTasks && isMyTask}>
                                    <div className="mb-1.5">
                                      <div className="group relative rounded-xl border transition-all"
                                        style={{
                                          background: "var(--bg-elevated)",
                                          borderColor: "var(--border)",
                                          opacity: taskActive ? 1 : 0.45,
                                        }}>
                                        <span className="pill-glass absolute -top-2.5 right-2 z-[5] rounded-full px-1.5 py-px text-[11px] font-semibold" style={{ background: "color-mix(in srgb, #8b5cf6 15%, var(--dock-frosted-bg))", color: "#8b5cf6", border: "1px solid color-mix(in srgb, #8b5cf6 30%, var(--border))" }}>{recurLabel}</span>
                                        <div className="flex items-center gap-1.5 px-2 py-1.5">
                                          <button type="button" onClick={() => {
                                            toggleTaskExpanded(item._id);
                                            if (!subtasksByParent.has(item._id)) void loadSubtasks(item._id);
                                          }} className="shrink-0" style={{ color: "var(--fg-tertiary)" }}>
                                            <motion.svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" animate={{ rotate: expandedTasks.has(item._id) ? 90 : 0 }}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </motion.svg>
                                          </button>
                                          {canToggleActive && isMyTask && <ToggleSwitch size="sm" checked={taskActive} disabled={togglingId === item._id} onChange={() => taskActive ? setDeactivateTaskTarget({ id: item._id, name: item.title, hasSubtasks: (subtasksByParent.get(item._id) ?? []).length > 0 }) : toggleTaskActive(item._id, false)} />}
                                          <div className="flex-1 min-w-0">
                                            <span className="text-[11px] font-semibold truncate block" style={{ color: taskActive ? "var(--fg)" : "var(--fg-tertiary)" }}>{item.title}</span>
                                            {fullTask?.description && <span className="text-[11px] truncate block" style={{ color: "var(--fg-tertiary)" }}>{fullTask.description}</span>}
                                            <div className="flex items-center gap-1 flex-wrap">
                                              {fullTask?.assignedTo?.map((a) => (
                                                <span key={a._id} className="rounded-full px-1.5 py-px text-[11px] font-medium" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>{a.about ? `${a.about.firstName} ${a.about.lastName}` : a.email ?? "Unknown"}</span>
                                              ))}
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-0.5 shrink-0">
                                            {canEditTasks && isMyTask && fullTask && (
                                              <button type="button" onClick={() => openEditTask(fullTask)} className="h-5 w-5 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--primary)" }} title="Edit">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                              </button>
                                            )}
                                            {canDeleteTasks && isMyTask && (
                                              <button type="button" onClick={() => setDeleteTarget({ type: "task", id: item._id, name: item.title })} className="h-5 w-5 flex items-center justify-center rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--rose)_10%,transparent)]" style={{ color: "var(--rose)" }} title="Delete">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <AnimatePresence initial={false}>
                                        {expandedTasks.has(item._id) && (
                                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                            <div className="ml-4 border-l pl-2 pr-1 py-1 space-y-1.5" style={{ borderColor: "color-mix(in srgb, var(--fg-tertiary) 15%, transparent)" }}>
                                              {subtaskLoading === item._id ? (
                                                <div className="space-y-1">{[1, 2].map((i) => <div key={i} className="shimmer h-4 w-full rounded" />)}</div>
                                              ) : (subtasksByParent.get(item._id) ?? []).length === 0 ? (
                                                <p className="text-[11px] py-0.5 px-1" style={{ color: "var(--fg-tertiary)" }}>No subtasks</p>
                                              ) : (
                                                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={(ev) => {
                                                  const { active, over } = ev;
                                                  if (!over || active.id === over.id) return;
                                                  const subList = subtasksByParent.get(item._id) ?? [];
                                                  const ids = subList.map((s) => s._id);
                                                  const oI = ids.indexOf(active.id as string);
                                                  const nI = ids.indexOf(over.id as string);
                                                  if (oI < 0 || nI < 0) return;
                                                  const reordered = arrayMove(ids, oI, nI);
                                                  fetch("/api/tasks/reorder", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderedIds: reordered }) })
                                                    .then((r) => { if (r.ok) loadSubtasks(item._id); else toast.error("Reorder failed"); }).catch(() => toast.error("Reorder failed"));
                                                }}>
                                                  <SortableContext items={(subtasksByParent.get(item._id) ?? []).map((s) => s._id)} strategy={verticalListSortingStrategy}>
                                                    {(subtasksByParent.get(item._id) ?? []).map((sub) => {
                                                      const subInfo = taskSubmittedInfo(sub, c.todayChecklistByEmployee);
                                                      const isSubMyTask = isInMyHierarchy(sub.createdBy?._id);
                                                      const subActive = sub.isActive !== false;
                                                      const parentOff = !taskActive;
                                                      return (
                                                        <SortableTaskRow key={sub._id} id={sub._id} canReorder={canReorderTasks && isSubMyTask}>
                                                          <div className="mb-1.5">
                                                            <div className="group relative rounded-xl border transition-all" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", opacity: parentOff ? 0.35 : !subActive ? 0.45 : subInfo.done === subInfo.total && subInfo.total > 0 ? 0.65 : 1 }}>
                                                              <span className="pill-glass absolute -top-2.5 right-2 z-[5] rounded-full px-1.5 py-px text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${subInfo.color} 15%, var(--dock-frosted-bg))`, color: subInfo.color, border: `1px solid color-mix(in srgb, ${subInfo.color} 30%, var(--border))` }}>{subInfo.label}</span>
                                                              <div className="flex items-center gap-1.5 px-2 py-1.5">
                                                                {canToggleActive && isSubMyTask && <ToggleSwitch size="sm" checked={subActive} disabled={parentOff || togglingId === sub._id} onChange={() => toggleSubtaskActive(item._id, sub._id, subActive)} />}
                                                                <div className="flex-1 min-w-0">
                                                                  <span className="text-[11px] font-semibold truncate block" style={{ color: sub.status === "completed" || !subActive ? "var(--fg-tertiary)" : "var(--fg)" }}>{sub.title}</span>
                                                                  {sub.description && <span className="text-[11px] truncate block" style={{ color: "var(--fg-tertiary)" }}>{sub.description}</span>}
                                                                  <div className="flex items-center gap-1 flex-wrap">
                                                                    {sub.assignedTo?.map((a) => (
                                                                      <span key={a._id} className="rounded-full px-1.5 py-px text-[11px] font-medium" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>{a.about ? `${a.about.firstName} ${a.about.lastName}` : a.email ?? "Unknown"}</span>
                                                                    ))}
                                                                  </div>
                                                                </div>
                                                                <div className="flex items-center gap-0.5 shrink-0">
                                                                  {canEditTasks && isSubMyTask && (
                                                                    <button type="button" onClick={() => openEditTask(sub)} className="h-5 w-5 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--primary)" }} title="Edit">
                                                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                                    </button>
                                                                  )}
                                                                  {canDeleteTasks && isSubMyTask && (
                                                                    <button type="button" onClick={() => setDeleteTarget({ type: "task", id: sub._id, name: sub.title })} className="h-5 w-5 flex items-center justify-center rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--rose)_10%,transparent)]" style={{ color: "var(--rose)" }} title="Delete">
                                                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                                                    </button>
                                                                  )}
                                                                </div>
                                                              </div>
                                                            </div>
                                                          </div>
                                                        </SortableTaskRow>
                                                      );
                                                    })}
                                                  </SortableContext>
                                                </DndContext>
                                              )}
                                              {canCreateTasks && isMyTask && (
                                                <button type="button" onClick={() => openCreateTask(c._id, item._id)}
                                                  className="flex items-center gap-1 text-[11px] font-medium transition-colors hover:opacity-80 px-1 py-0.5 rounded"
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
                                  </SortableTaskRow>
                                );
                              })}
                            </SortableContext>
                          </DndContext>
                        </div>
                      )}

                      {oneTimeTasks.length > 0 && (
                        <div>
                          {todayChecklist.length > 0 && <p className="text-[11px] font-semibold uppercase tracking-wider px-1 mb-0.5 mt-1" style={{ color: "var(--fg-tertiary)" }}>Tasks{canEditTasks && isMyCampaign && <span className="font-normal"> (drag to prioritize)</span>}</p>}
                          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(c._id, e)}>
                            <SortableContext items={oneTimeTasks.map((t) => t._id)} strategy={verticalListSortingStrategy}>
                              {oneTimeTasks.map((task) => {
                                const isTaskExpanded = expandedTasks.has(task._id);
                                const subs = subtasksByParent.get(task._id) ?? [];
                                const taskActive = task.isActive !== false;
                                const isMyTask = isInMyHierarchy(task.createdBy?._id);
                                return (
                                  <SortableTaskRow key={task._id} id={task._id} canReorder={canReorderTasks && isMyTask}>
                                    <div className="mb-1.5">
                                      <div className="group relative rounded-xl border transition-all"
                                        style={{
                                          background: "var(--bg-elevated)",
                                          borderColor: "var(--border)",
                                          opacity: taskActive ? 1 : 0.45,
                                        }}>
                                        {(() => {
                                          const info = taskSubmittedInfo(task, c.todayChecklistByEmployee);
                                          return <span className="pill-glass absolute -top-2.5 right-2 z-[5] rounded-full px-1.5 py-px text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${info.color} 15%, var(--dock-frosted-bg))`, color: info.color, border: `1px solid color-mix(in srgb, ${info.color} 30%, var(--border))` }}>{info.label}</span>;
                                        })()}
                                        <div className="flex items-center gap-1.5 px-2 py-1.5">
                                          <button type="button" onClick={() => {
                                            toggleTaskExpanded(task._id);
                                            if (!subtasksByParent.has(task._id)) void loadSubtasks(task._id);
                                          }} className="shrink-0" style={{ color: "var(--fg-tertiary)" }}>
                                            <motion.svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" animate={{ rotate: isTaskExpanded ? 90 : 0 }}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </motion.svg>
                                          </button>
                                          {canToggleActive && isMyTask && <ToggleSwitch size="sm" checked={taskActive} disabled={togglingId === task._id} onChange={() => taskActive ? setDeactivateTaskTarget({ id: task._id, name: task.title, hasSubtasks: (subtasksByParent.get(task._id) ?? []).length > 0 }) : toggleTaskActive(task._id, false)} />}
                                          <div className="flex-1 min-w-0">
                                            <span className="text-[11px] font-semibold truncate block" style={{ color: taskActive ? "var(--fg)" : "var(--fg-tertiary)" }}>{task.title}</span>
                                            {task.description && <span className="text-[11px] truncate block" style={{ color: "var(--fg-tertiary)" }}>{task.description}</span>}
                                            <div className="flex items-center gap-1 flex-wrap">
                                              {task.assignedTo?.map((a) => (
                                                <span key={a._id} className="rounded-full px-1.5 py-px text-[11px] font-medium" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>{a.about ? `${a.about.firstName} ${a.about.lastName}` : a.email ?? "Unknown"}</span>
                                              ))}
                                              {task.deadline && <span className="rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums" style={{ background: deadlineUrgency(task.deadline) === "overdue" ? "color-mix(in srgb, var(--rose) 12%, transparent)" : "var(--bg-grouped)", color: deadlineUrgency(task.deadline) === "overdue" ? "var(--rose)" : "var(--fg-tertiary)" }}>{formatDate(task.deadline)}</span>}
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-0.5 shrink-0">
                                            {canEditTasks && isMyTask && (
                                              <button type="button" onClick={() => openEditTask(task)} className="h-5 w-5 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--primary)" }} title="Edit">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                              </button>
                                            )}
                                            {canDeleteTasks && isMyTask && (
                                              <button type="button" onClick={() => setDeleteTarget({ type: "task", id: task._id, name: task.title })} className="h-5 w-5 flex items-center justify-center rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--rose)_10%,transparent)]" style={{ color: "var(--rose)" }} title="Delete">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <AnimatePresence initial={false}>
                                        {isTaskExpanded && (
                                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                            <div className="ml-4 border-l pl-2 pr-1 py-1 space-y-1.5" style={{ borderColor: "color-mix(in srgb, var(--fg-tertiary) 15%, transparent)" }}>
                                              {subtaskLoading === task._id ? (
                                                <div className="space-y-1">{[1, 2].map((i) => <div key={i} className="shimmer h-4 w-full rounded" />)}</div>
                                              ) : subs.length === 0 ? (
                                                <p className="text-[11px] py-0.5 px-1" style={{ color: "var(--fg-tertiary)" }}>No subtasks</p>
                                              ) : (
                                                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={(ev) => {
                                                  const { active, over } = ev;
                                                  if (!over || active.id === over.id) return;
                                                  const ids = subs.map((s) => s._id);
                                                  const oI = ids.indexOf(active.id as string);
                                                  const nI = ids.indexOf(over.id as string);
                                                  if (oI < 0 || nI < 0) return;
                                                  const reordered = arrayMove(ids, oI, nI);
                                                  fetch("/api/tasks/reorder", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderedIds: reordered }) })
                                                    .then((r) => { if (r.ok) loadSubtasks(task._id); else toast.error("Reorder failed"); }).catch(() => toast.error("Reorder failed"));
                                                }}>
                                                  <SortableContext items={subs.map((s) => s._id)} strategy={verticalListSortingStrategy}>
                                                    {subs.map((sub) => {
                                                      const subInfo = taskSubmittedInfo(sub, c.todayChecklistByEmployee);
                                                      const isSubMyTask = isInMyHierarchy(sub.createdBy?._id);
                                                      const subActive = sub.isActive !== false;
                                                      const parentOff = !taskActive;
                                                      return (
                                                        <SortableTaskRow key={sub._id} id={sub._id} canReorder={canReorderTasks && isSubMyTask}>
                                                          <div className="mb-1.5">
                                                            <div className="group relative rounded-xl border transition-all" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", opacity: parentOff ? 0.35 : !subActive ? 0.45 : subInfo.done === subInfo.total && subInfo.total > 0 ? 0.65 : 1 }}>
                                                              <span className="pill-glass absolute -top-2.5 right-2 z-[5] rounded-full px-1.5 py-px text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${subInfo.color} 15%, var(--dock-frosted-bg))`, color: subInfo.color, border: `1px solid color-mix(in srgb, ${subInfo.color} 30%, var(--border))` }}>{subInfo.label}</span>
                                                              <div className="flex items-center gap-1.5 px-2 py-1.5">
                                                                {canToggleActive && isSubMyTask && <ToggleSwitch size="sm" checked={subActive} disabled={parentOff || togglingId === sub._id} onChange={() => toggleSubtaskActive(task._id, sub._id, subActive)} />}
                                                                <div className="flex-1 min-w-0">
                                                                  <span className="text-[11px] font-semibold truncate block" style={{ color: sub.status === "completed" || !subActive ? "var(--fg-tertiary)" : "var(--fg)" }}>{sub.title}</span>
                                                                  {sub.description && <span className="text-[11px] truncate block" style={{ color: "var(--fg-tertiary)" }}>{sub.description}</span>}
                                                                  <div className="flex items-center gap-1 flex-wrap">
                                                                    {sub.assignedTo?.map((a) => (
                                                                      <span key={a._id} className="rounded-full px-1.5 py-px text-[11px] font-medium" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>{a.about ? `${a.about.firstName} ${a.about.lastName}` : a.email ?? "Unknown"}</span>
                                                                    ))}
                                                                    {sub.deadline && <span className="rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums" style={{ background: deadlineUrgency(sub.deadline) === "overdue" ? "color-mix(in srgb, var(--rose) 12%, transparent)" : "var(--bg-grouped)", color: deadlineUrgency(sub.deadline) === "overdue" ? "var(--rose)" : "var(--fg-tertiary)" }}>{formatDate(sub.deadline)}</span>}
                                                                  </div>
                                                                </div>
                                                                <div className="flex items-center gap-0.5 shrink-0">
                                                                  {canEditTasks && isSubMyTask && (
                                                                    <button type="button" onClick={() => openEditTask(sub)} className="h-5 w-5 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--primary)" }} title="Edit">
                                                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                                    </button>
                                                                  )}
                                                                  {canDeleteTasks && isSubMyTask && (
                                                                    <button type="button" onClick={() => setDeleteTarget({ type: "task", id: sub._id, name: sub.title })} className="h-5 w-5 flex items-center justify-center rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--rose)_10%,transparent)]" style={{ color: "var(--rose)" }} title="Delete">
                                                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                                                    </button>
                                                                  )}
                                                                </div>
                                                              </div>
                                                            </div>
                                                          </div>
                                                        </SortableTaskRow>
                                                      );
                                                    })}
                                                  </SortableContext>
                                                </DndContext>
                                              )}
                                              {canCreateTasks && isMyTask && (
                                                <button type="button" onClick={() => openCreateTask(c._id, task._id)}
                                                  className="flex items-center gap-1 text-[11px] font-medium transition-colors hover:opacity-80 px-1 py-0.5 rounded"
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
                                  </SortableTaskRow>
                                );
                              })}
                            </SortableContext>
                          </DndContext>
                        </div>
                      )}

                      {visibleTasks.length === 0 && todayChecklist.length === 0 && (
                        <p className="text-[11px] py-2 text-center" style={{ color: "var(--fg-tertiary)" }}>No tasks yet</p>
                      )}
                    </div>

                    {/* ── card footer: stat pills ── */}
                    <div className="border-t px-2 py-1.5 flex items-center gap-1 flex-wrap" style={{ borderColor: "var(--border)" }}>
                      {canToggleCampaign && isMyCampaign && <ToggleSwitch size="sm" checked={c.status === "active"} disabled={togglingId === c._id} onChange={() => c.status === "active" ? setPauseCampaignTarget({ id: c._id, name: c.name, status: c.status }) : toggleCampaignActive(c._id, c.status)} />}
                      {totalTasks > 0 && <span className="rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>{totalTasks} task{totalTasks !== 1 ? "s" : ""}</span>}
                      {inProgressTasks > 0 && <span className="rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" }}>{inProgressTasks} in progress</span>}
                      {completedTasks > 0 && <span className="rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums" style={{ background: "color-mix(in srgb, var(--teal) 12%, transparent)", color: "var(--teal)" }}>{completedTasks} completed</span>}
                      {recurCount > 0 && <span className="rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums" style={{ background: "color-mix(in srgb, #8b5cf6 12%, transparent)", color: "#8b5cf6" }}>{recurCount} recurring</span>}
                      {empCount > 0 && <span className="rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>{empCount} team member{empCount !== 1 ? "s" : ""}</span>}
                      {c.startDate && <span className="text-[11px] tabular-nums ml-auto" style={{ color: "var(--fg-tertiary)" }}>{formatDate(c.startDate)}{c.endDate ? ` — ${formatDate(c.endDate)}` : " · ongoing"}</span>}
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
              <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center min-w-0">
                  <h3 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>Workspace activity</h3>
                  <RefreshBtn onRefresh={() => void refetchLogs()} />
                  {wsTotalUnread > 0 && (
                    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold text-white ml-2" style={{ background: "var(--rose)" }}>
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
                <p className="text-center text-[11px] py-8 flex-1" style={{ color: "var(--fg-tertiary)" }}>No workspace activity yet</p>
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
                              <span className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>{label}</span>
                              {group.unread > 0 && (
                                <span className="flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[11px] font-bold text-white" style={{ background: "var(--rose)" }}>
                                  {group.unread}
                                </span>
                              )}
                            </button>
                            {group.unread > 0 && (
                              <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => markWsEntityRead(entity)}
                                className="shrink-0 h-5 w-5 flex items-center justify-center rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--teal)_10%,transparent)]"
                                style={{ color: "var(--teal)" }} title="Mark as read">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                              </motion.button>
                            )}
                            <button type="button" onClick={() => toggleActivityGroup(entity)} className="shrink-0" style={{ color: "var(--fg-tertiary)" }}>
                              <motion.svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.15 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </motion.svg>
                            </button>
                          </div>
                          <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                              className="flex-1 min-h-0 overflow-hidden"
                            >
                            <div className="overflow-y-auto px-2 pb-2 space-y-1.5 h-full">
                              {group.logs.map((log) => {
                                const isSelf = session?.user?.email && log.userEmail?.toLowerCase() === session.user.email.toLowerCase();
                                const needsPossessive = /^(location|account|profile|password|session)\b/i.test(log.action);
                                const displayName = isSelf ? (needsPossessive ? "Your" : "You") : resolveLogName(log);
                                return (
                                  <div key={log._id} className="rounded-lg p-2.5 transition-colors" style={{ background: "var(--bg)" }}>
                                    <div className="flex items-start gap-2">
                                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                                        style={{ background: lc.bg, color: lc.fg }}>
                                        {logAvatarLabel(log)}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[11px] leading-snug" style={{ color: "var(--fg)" }}>
                                          <span className="font-semibold">{displayName}</span>{" "}
                                          <span style={{ color: "var(--fg-secondary)" }}>{log.action}</span>
                                        </p>
                                        {log.details && (
                                          <p className="text-[11px] line-clamp-2 mt-0.5" style={{ color: "var(--fg-tertiary)" }}>{log.details}</p>
                                        )}
                                        <div className="flex items-center justify-between mt-1">
                                          <span className="text-[11px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{timeAgo(log.createdAt)}</span>
                                          {log.entity === "task" && log.entityId && (() => {
                                            const linkedTask = taskList.find((t) => t._id === log.entityId);
                                            if (!linkedTask) return null;
                                            const info = taskSubmittedInfo(linkedTask);
                                            return (
                                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                                style={{ background: `color-mix(in srgb, ${info.color} 12%, transparent)`, color: info.color }}>
                                                <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: info.color }}>
                                                  {info.done > 0 && info.done < info.total && <span className="absolute inset-0 animate-ping rounded-full opacity-50" style={{ background: info.color }} />}
                                                </span>
                                                {info.label}
                                              </span>
                                            );
                                          })()}
                                        </div>
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
        <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Brief description</label><input type="text" value={fDesc} onChange={(e) => setFDesc(e.target.value)} className="input" placeholder="Brief summary" maxLength={120} /></div>
        {(editingTask ? canReassignTasks : (canCreateTasks || canReassignTasks)) && allEmployees.length > 0 && (() => {
          let assignable: SelectOption[];
          if (fParentTask) {
            const parent = taskList.find((t) => t._id === fParentTask);
            const parentIds = parent?.assignedTo?.map((a) => a._id) ?? [];
            assignable = allEmployees.filter((e) => parentIds.includes(e._id));
          } else {
            const camp = fCampaign ? campaignList.find((c) => c._id === fCampaign) : null;
            assignable = camp ? allEmployees.filter((e) => camp.tags.employees.some((te) => te._id === e._id)) : allEmployees;
          }
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
          ) : <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{fParentTask ? "No employees on parent task." : "No employees tagged in this campaign."}</p>;
        })()}
        {(() => {
          const parentIsRecurring = fParentTask ? !!taskList.find((t) => t._id === fParentTask)?.recurrence : false;
          if (fParentTask && !parentIsRecurring) return null;
          const freqOptions: [string, string][] = fParentTask
            ? [["weekly", "Weekly"], ["monthly", "Monthly"]]
            : [["", "One-time"], ["weekly", "Weekly"], ["monthly", "Monthly"]];
          return (
            <div>
              <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Recurrence{fParentTask ? " (inherits recurring type)" : ""}</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {freqOptions.map(([val, label]) => (
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
                      className="h-7 w-7 rounded-lg text-[11px] font-semibold border transition-all flex items-center justify-center"
                      style={{ background: fRecurDays.includes(d) ? "var(--primary)" : "var(--bg-grouped)", color: fRecurDays.includes(d) ? "white" : "var(--fg-secondary)", borderColor: fRecurDays.includes(d) ? "var(--primary)" : "var(--border)" }}>{d}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        {fRecurFreq === "" && (
          <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Deadline</label><input type="date" value={fDeadline} onChange={(e) => setFDeadline(e.target.value)} className="input" /></div>
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
        <div><label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Short description</label><input type="text" value={cDesc} onChange={(e) => setCDesc(e.target.value)} placeholder="Brief summary" className="input" maxLength={120} /></div>
        
        
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
        title={statusConfirm?.currentDone ? "Undo completion?" : "Mark as done?"}
        description={statusConfirm?.currentDone
          ? `Unmark "${statusConfirm?.title}" as completed for today.`
          : `Mark "${statusConfirm?.title}" as completed for today.`}
        confirmLabel={statusConfirm?.currentDone ? "Undo" : "Mark complete"}
        loading={statusUpdating}
        onConfirm={handleStatusConfirm}
        onCancel={() => setStatusConfirm(null)}
      />

      {/* ── deactivate task confirm ── */}
      <ConfirmDialog
        open={!!deactivateTaskTarget}
        title="Deactivate Task"
        description={`Deactivate "${deactivateTaskTarget?.name}"?${deactivateTaskTarget?.hasSubtasks ? " All subtasks will also be deactivated." : ""} You can reactivate it later.`}
        confirmLabel={togglingId === deactivateTaskTarget?.id ? "Deactivating…" : "Deactivate"}
        variant="warning"
        loading={togglingId === deactivateTaskTarget?.id}
        onConfirm={async () => { if (deactivateTaskTarget) { await toggleTaskActive(deactivateTaskTarget.id, true); setDeactivateTaskTarget(null); } }}
        onCancel={() => setDeactivateTaskTarget(null)}
      />

      {/* ── pause campaign confirm ── */}
      <ConfirmDialog
        open={!!pauseCampaignTarget}
        title="Pause Campaign"
        description={`Pause "${pauseCampaignTarget?.name}"? Tasks will remain but no new checklist entries will be generated. You can resume it later.`}
        confirmLabel={togglingId === pauseCampaignTarget?.id ? "Pausing…" : "Pause"}
        variant="warning"
        loading={togglingId === pauseCampaignTarget?.id}
        onConfirm={async () => { if (pauseCampaignTarget) { await toggleCampaignActive(pauseCampaignTarget.id, pauseCampaignTarget.status); setPauseCampaignTarget(null); } }}
        onCancel={() => setPauseCampaignTarget(null)}
      />

      {/* ── Task History Modal ── */}
      <TaskHistoryModal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        campaigns={historyCampaigns}
        preSelectedCampaignId={historyPreCampaignId}
        preSelectedTaskId={historyPreTaskId}
      />
    </div>
  );
}
