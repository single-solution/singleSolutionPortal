"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Portal } from "../components/Portal";
import { MiniCalendar, useCalendarNav } from "../components/MiniCalendar";
import { usePermissions } from "@/lib/usePermissions";

/* ───── Types ───── */

interface HistoryEvent {
  _id: string;
  task: { _id: string; title: string; recurrence?: { frequency: string; days: number[] }; parentTask?: string } | null;
  campaign: { _id: string; name: string } | null;
  employee: { _id: string; about?: { firstName: string; lastName: string }; email?: string } | null;
  changedBy?: { _id: string; about?: { firstName: string; lastName: string }; email?: string } | null;
  status: string;
  eventType: string;
  changedAt: string;
  note?: string;
}

interface DailyEntry {
  date: string;
  completedCount: number;
  undoneCount: number;
  totalEvents: number;
  events: HistoryEvent[];
}

interface DetailGroup {
  campaign: { _id: string; name: string };
  events: HistoryEvent[];
}

interface EmployeeInfo {
  _id: string;
  about?: { firstName: string; lastName: string };
  email?: string;
}

interface TaskEmployee {
  _id: string;
  name: string;
  done: boolean;
}

interface EmpTaskNode {
  _id: string;
  title: string;
  recurrence: { frequency?: string; days?: number[] } | null;
  description: string | null;
  done: boolean;
  subtasks: EmpTaskNode[];
}

interface TaskNode {
  _id: string;
  title: string;
  recurrence: { frequency?: string; days?: number[] } | null;
  description: string | null;
  doneCount: number;
  totalCount: number;
  employees: TaskEmployee[];
  subtasks: TaskNode[];
}

interface CampaignGroup {
  _id: string;
  name: string;
  totalTasks: number;
  employeeCount: number;
  tasks: TaskNode[];
}

interface SidebarTask {
  _id: string;
  title: string;
  recurrence?: { frequency?: string; days?: number[] } | null;
  subtasks?: SidebarTask[];
}

interface SidebarCampaign {
  _id: string;
  name: string;
  tasks: SidebarTask[];
}

/* ───── Helpers ───── */

const MN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const AVATAR_COLORS = ["var(--primary)", "var(--teal)", "var(--purple)", "var(--amber)", "var(--rose)", "var(--green)", "var(--fg-secondary)"];
function avatarColor(id?: string | null): string {
  if (!id) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function empName(e: { about?: { firstName: string; lastName: string }; email?: string } | null): string {
  if (!e) return "Unknown";
  return `${e.about?.firstName ?? ""} ${e.about?.lastName ?? ""}`.trim() || e.email || "Unknown";
}

function empInitials(e: { about?: { firstName: string; lastName: string } } | null): string {
  if (!e) return "?";
  return ((e.about?.firstName?.[0] ?? "") + (e.about?.lastName?.[0] ?? "")).toUpperCase() || "?";
}

function fmtTime(d: string): string {
  return new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function fmtRecurrence(r: { frequency?: string; days?: number[] } | null): string {
  if (!r?.frequency) return "One-time";
  if (r.frequency === "daily") return "Daily";
  if (r.frequency === "weekly" && r.days?.length) {
    if (r.days.length >= 5) return "Weekly all working days";
    return `Weekly ${r.days.map((d) => DAY_NAMES[d] || "?").join("/")}`;
  }
  if (r.frequency === "monthly") return "Monthly";
  return r.frequency.charAt(0).toUpperCase() + r.frequency.slice(1);
}

function statusMeta(status: string, eventType: string): { label: string; color: string; icon: string } {
  if (eventType === "checklistComplete" || status === "completed") return { label: "Completed", color: "var(--green)", icon: "M5 13l4 4L19 7" };
  if (eventType === "checklistUndo" || status === "undone") return { label: "Undone", color: "var(--amber)", icon: "M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" };
  if (status === "inProgress") return { label: "In Progress", color: "var(--primary)", icon: "M13 10V3L4 14h7v7l9-11h-7" };
  if (status === "pending") return { label: "Pending", color: "var(--fg-tertiary)", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" };
  if (eventType === "taskDisabled" || status === "disabled") return { label: "Disabled", color: "var(--rose)", icon: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" };
  if (eventType === "taskEnabled" || status === "enabled") return { label: "Enabled", color: "var(--teal)", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" };
  return { label: status, color: "var(--fg-tertiary)", icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" };
}

function mapTaskNodeToEmpTask(task: TaskNode, uid: string): EmpTaskNode {
  return {
    _id: task._id,
    title: task.title,
    recurrence: task.recurrence,
    description: task.description,
    done: task.employees.some((e) => e._id === uid && e.done),
    subtasks: task.subtasks.map((s) => mapTaskNodeToEmpTask(s, uid)),
  };
}

function countLeafProgress(nodes: EmpTaskNode[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const n of nodes) {
    if (n.subtasks.length > 0) {
      const sub = countLeafProgress(n.subtasks);
      done += sub.done;
      total += sub.total;
    } else {
      total += 1;
      if (n.done) done += 1;
    }
  }
  return { done, total };
}

function taskNodeToSidebarTask(t: TaskNode): SidebarTask {
  return {
    _id: t._id,
    title: t.title,
    recurrence: t.recurrence ?? undefined,
    subtasks: t.subtasks.map(taskNodeToSidebarTask),
  };
}

function findTaskTitleInNodes(tasks: TaskNode[], taskId: string): string | null {
  for (const t of tasks) {
    if (t._id === taskId) return t.title;
    const sub = findTaskTitleInNodes(t.subtasks, taskId);
    if (sub) return sub;
  }
  return null;
}

/* ───── Sub-components (match TaskHistoryModal) ───── */

function EmpTaskCard({ task, onTaskClick, isSubtask }: {
  task: EmpTaskNode;
  onTaskClick: (taskId: string) => void;
  isSubtask?: boolean;
}) {
  const hasSubtasks = task.subtasks.length > 0;
  const [expanded, setExpanded] = useState(hasSubtasks);
  const recurLabel = fmtRecurrence(task.recurrence);
  const pillColor = task.done ? "var(--green)" : task.recurrence ? "#8b5cf6" : "var(--amber)";
  const pillLabel = task.done ? "Done" : (task.recurrence ? recurLabel : "Pending");

  return (
    <div className={isSubtask ? "mb-1" : "mb-1.5"}>
      <div className="group relative rounded-xl border transition-all"
        style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", opacity: task.done ? 0.65 : 1 }}>
        <span className="pill-glass absolute -top-2.5 right-2 z-[5] rounded-full px-1.5 py-px text-[9px] font-semibold"
          style={{
            background: `color-mix(in srgb, ${pillColor} 15%, var(--dock-frosted-bg))`,
            color: pillColor,
            border: `1px solid color-mix(in srgb, ${pillColor} 30%, var(--border))`,
          }}>
          {pillLabel}
        </span>
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md"
            style={{ background: task.done ? "color-mix(in srgb, var(--green) 14%, transparent)" : "color-mix(in srgb, var(--fg-tertiary) 8%, transparent)" }}>
            {task.done ? (
              <svg className="h-2.5 w-2.5" style={{ color: "var(--green)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="h-2.5 w-2.5" style={{ color: "var(--fg-quaternary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
          </span>
          {hasSubtasks && (
            <button type="button" onClick={() => setExpanded(!expanded)} className="shrink-0" style={{ color: "var(--fg-tertiary)" }}>
              <motion.svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" animate={{ rotate: expanded ? 90 : 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </motion.svg>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-semibold truncate block" style={{ color: task.done ? "var(--fg-tertiary)" : "var(--fg)", textDecoration: task.done ? "line-through" : "none" }}>
              {task.title}
            </span>
            {task.description && <span className="text-[9px] truncate block" style={{ color: "var(--fg-tertiary)" }}>{task.description}</span>}
          </div>
          <button type="button" onClick={() => onTaskClick(task._id)}
            className="h-5 w-5 flex items-center justify-center rounded-md shrink-0 transition-colors opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-grouped)]"
            style={{ color: "var(--fg-tertiary)" }} title="View timeline">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {expanded && hasSubtasks && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="ml-4 border-l pl-2 pr-1 py-1 space-y-1.5" style={{ borderColor: "color-mix(in srgb, var(--fg-tertiary) 15%, transparent)" }}>
              {task.subtasks.map((sub) => (
                <EmpTaskCard key={sub._id} task={sub} onTaskClick={onTaskClick} isSubtask />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TimelinePanel({ events, loading, selectedDay, month, year, onClearDay }: {
  events: HistoryEvent[];
  loading: boolean;
  selectedDay: number | null;
  month: number;
  year: number;
  onClearDay: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-3 pb-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-bold" style={{ color: "var(--fg)" }}>
          {selectedDay ? `${MN[month - 1]} ${selectedDay} — Activity` : `${MN[month - 1]} ${year} — Timeline`}
        </h4>
        {selectedDay && (
          <button type="button" onClick={onClearDay} className="text-[10px] font-semibold transition-colors" style={{ color: "var(--primary)" }}>
            Show full month
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--bg-grouped)" }}>
              <div className="shimmer h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1.5"><div className="shimmer h-3 w-40 rounded" /><div className="shimmer h-2.5 w-28 rounded" /></div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="py-12 text-center">
          <svg className="mx-auto mb-2 h-8 w-8" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[11px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
            {selectedDay ? "No activity on this day." : "No activity this month."}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {events.map((ev) => {
            const meta = statusMeta(ev.status, ev.eventType);
            return (
              <motion.div key={ev._id} className="flex items-start gap-2.5 rounded-xl px-3 py-2 transition-colors" style={{ background: "var(--bg-grouped)" }}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white mt-0.5"
                  style={{ background: ev.employee?._id ? avatarColor(ev.employee._id) : "var(--fg-tertiary)" }}>
                  {empInitials(ev.employee)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold" style={{ color: "var(--fg)" }}>{empName(ev.employee)}</span>
                    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] font-semibold"
                      style={{ background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}>
                      <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} /></svg>
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {ev.campaign && (
                      <span className="rounded-full px-1.5 py-px text-[9px] font-semibold" style={{ background: "color-mix(in srgb, var(--teal) 12%, transparent)", color: "var(--teal)" }}>
                        {ev.campaign.name}
                      </span>
                    )}
                    {ev.task && (
                      <span className="text-[10px] truncate" style={{ color: "var(--fg-secondary)" }}>{ev.task.title}</span>
                    )}
                  </div>
                  {ev.note && (
                    <p className="mt-0.5 text-[9px]" style={{ color: "var(--fg-tertiary)" }}>{ev.note}</p>
                  )}
                </div>
                <span className="shrink-0 text-[9px] tabular-nums mt-0.5" style={{ color: "var(--fg-tertiary)" }}>
                  {fmtTime(ev.changedAt)}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ───── Main ───── */

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
}

export function EmployeeTasksModal({ open, onClose, userId }: Props) {
  const { isSuperAdmin, can: canPerm } = usePermissions();
  const isPrivileged = isSuperAdmin || canPerm("tasks_view");

  const { defaultYear, defaultMonth, prevMonth, nextMonth } = useCalendarNav();
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());

  const [campaignGroups, setCampaignGroups] = useState<CampaignGroup[]>([]);
  const [campaignGroupsLoading, setCampaignGroupsLoading] = useState(false);

  const [dailyData, setDailyData] = useState<DailyEntry[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [detailData, setDetailData] = useState<DetailGroup[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [campaignEmpTasks, setCampaignEmpTasks] = useState<EmpTaskNode[]>([]);
  const [campaignEmpTasksLoading, setCampaignEmpTasksLoading] = useState(false);

  const [sidebarSearch, setSidebarSearch] = useState("");

  const viewMode = useMemo(() => {
    if (selectedTaskId) return "task" as const;
    if (selectedCampaignId) return "campaign" as const;
    return "grid" as const;
  }, [selectedCampaignId, selectedTaskId]);

  const handlePrevMonth = useCallback(() => {
    const p = prevMonth(year, month);
    setYear(p.year);
    setMonth(p.month);
    setSelectedDay(null);
  }, [year, month, prevMonth]);

  const handleNextMonth = useCallback(() => {
    const n = nextMonth(year, month);
    setYear(n.year);
    setMonth(n.month);
    setSelectedDay(null);
  }, [year, month, nextMonth]);

  useEffect(() => {
    if (!open) {
      setSelectedCampaignId(null);
      setSelectedTaskId(null);
      setSelectedDay(null);
      setExpandedCampaigns(new Set());
      setSidebarSearch("");
      setCampaignEmpTasks([]);
      setDetailData([]);
    }
  }, [open]);

  useEffect(() => {
    if (selectedCampaignId) {
      setExpandedCampaigns((prev) => new Set(prev).add(selectedCampaignId));
    }
  }, [selectedCampaignId]);

  const loadEmployeeProfile = useCallback(async () => {
    if (!open || !userId) return;
    try {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const daysInMonth = new Date(y, m, 0).getDate();
      const from = `${y}-${String(m).padStart(2, "0")}-01`;
      const to = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
      const params = new URLSearchParams({ type: "employee-timeline", userId, from, to, limit: "1" });
      const res = await fetch(`/api/tasks/history?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmployee(data.employee ?? null);
      }
    } catch { /* ignore */ }
  }, [open, userId]);

  useEffect(() => { loadEmployeeProfile(); }, [loadEmployeeProfile]);

  const loadCampaignGroups = useCallback(async () => {
    if (!open || !userId || !isPrivileged) return;
    setCampaignGroupsLoading(true);
    try {
      const params = new URLSearchParams({ type: "campaign-employees", days: "1" });
      const res = await fetch(`/api/tasks/history?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (data.grouped) setCampaignGroups(data.campaigns || []);
        else setCampaignGroups([]);
      } else setCampaignGroups([]);
    } catch { setCampaignGroups([]); }
    setCampaignGroupsLoading(false);
  }, [open, userId, isPrivileged]);

  useEffect(() => { loadCampaignGroups(); }, [loadCampaignGroups]);

  const loadDaily = useCallback(async () => {
    if (!open || !userId) return;
    if (viewMode === "grid") return;
    setDailyLoading(true);
    try {
      const params = new URLSearchParams({ type: "daily", year: String(year), month: String(month), userId });
      if (selectedCampaignId) params.set("campaignId", selectedCampaignId);
      if (selectedTaskId) params.set("taskId", selectedTaskId);
      const res = await fetch(`/api/tasks/history?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDailyData(Array.isArray(data) ? data : []);
      } else setDailyData([]);
    } catch { setDailyData([]); }
    setDailyLoading(false);
  }, [open, userId, year, month, selectedCampaignId, selectedTaskId, viewMode]);

  useEffect(() => { loadDaily(); }, [loadDaily]);

  const loadDetail = useCallback(async (date: string) => {
    if (!userId) return;
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({ type: "detail", date, userId });
      if (selectedCampaignId) params.set("campaignId", selectedCampaignId);
      if (selectedTaskId) params.set("taskId", selectedTaskId);
      const res = await fetch(`/api/tasks/history?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDetailData(Array.isArray(data) ? data : []);
      } else setDetailData([]);
    } catch { setDetailData([]); }
    setDetailLoading(false);
  }, [userId, selectedCampaignId, selectedTaskId]);

  useEffect(() => {
    if (selectedDay && viewMode === "task") {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
      loadDetail(dateStr);
    }
  }, [selectedDay, year, month, loadDetail, viewMode]);

  const loadCampaignEmpTasks = useCallback(async () => {
    if (!open || !userId || !selectedCampaignId || selectedTaskId) {
      setCampaignEmpTasks([]);
      return;
    }
    setCampaignEmpTasksLoading(true);
    try {
      const params = new URLSearchParams({ type: "campaign-employees", days: "1", campaignId: selectedCampaignId });
      if (selectedDay) {
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
        params.set("date", dateStr);
      }
      const res = await fetch(`/api/tasks/history?${params}`);
      if (res.ok) {
        const data = await res.json();
        const list = data.employees || [];
        const emp = list.find((e: { _id: string }) => e._id === userId);
        setCampaignEmpTasks(emp?.tasks || []);
      } else setCampaignEmpTasks([]);
    } catch { setCampaignEmpTasks([]); }
    setCampaignEmpTasksLoading(false);
  }, [open, userId, selectedCampaignId, selectedTaskId, selectedDay, year, month]);

  useEffect(() => { loadCampaignEmpTasks(); }, [loadCampaignEmpTasks]);

  const dailyMap = useMemo(() => {
    const m = new Map<number, DailyEntry>();
    for (const entry of dailyData) {
      const d = parseInt(entry.date.split("-")[2], 10);
      m.set(d, entry);
    }
    return m;
  }, [dailyData]);

  const allTimelineEvents = useMemo(() => {
    if (selectedDay) return [];
    return dailyData.flatMap((d) => d.events).sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  }, [dailyData, selectedDay]);

  const detailEvents = useMemo(() => {
    return detailData.flatMap((g) => g.events.map((e) => ({ ...e, campaign: g.campaign }))).sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  }, [detailData]);

  const sidebarCampaigns: SidebarCampaign[] = useMemo(
    () => campaignGroups.map((cg) => ({ _id: cg._id, name: cg.name, tasks: cg.tasks.map(taskNodeToSidebarTask) })),
    [campaignGroups],
  );

  const filteredSidebarCampaigns = useMemo(() => {
    if (!sidebarSearch.trim()) return sidebarCampaigns;
    const q = sidebarSearch.toLowerCase();
    return sidebarCampaigns.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      const walk = (tasks: SidebarTask[]): boolean =>
        tasks.some((t) => t.title.toLowerCase().includes(q) || (t.subtasks && walk(t.subtasks)));
      return walk(c.tasks);
    });
  }, [sidebarCampaigns, sidebarSearch]);

  const selectScope = useCallback((campaignId: string | null, taskId: string | null) => {
    setSelectedCampaignId(campaignId);
    setSelectedTaskId(taskId);
    setSelectedDay(null);
    if (campaignId) setExpandedCampaigns((prev) => new Set(prev).add(campaignId));
  }, []);

  const toggleCampaignExpand = useCallback((cid: string) => {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  }, []);

  const scopeSubtitle = useMemo(() => {
    if (viewMode === "grid") return "All Campaigns";
    const cg = campaignGroups.find((c) => c._id === selectedCampaignId);
    const cname = cg?.name ?? null;
    if (viewMode === "campaign") {
      return cname ?? "Campaign";
    }
    const tname = cg && selectedTaskId ? findTaskTitleInNodes(cg.tasks, selectedTaskId) : null;
    if (cname && tname) return `${cname} · ${tname}`;
    return tname || cname || "Task";
  }, [viewMode, campaignGroups, selectedCampaignId, selectedTaskId]);

  const eventsToShow = selectedDay ? detailEvents : allTimelineEvents;
  const eventsLoading = selectedDay ? detailLoading : dailyLoading;

  if (!open) return null;

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <motion.div
              className="relative mx-4 flex flex-col rounded-xl border shadow-xl overflow-hidden w-full max-w-7xl h-[85vh]"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* ── Header ── */}
              <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-4 min-w-0">
                  {employee && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: avatarColor(employee._id) }}>
                      {empInitials(employee)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="text-[12px] font-bold truncate" style={{ color: "var(--fg)" }}>
                      {employee ? empName(employee) : "Employee tasks"}
                    </h3>
                    <p className="text-[11px] truncate" style={{ color: "var(--fg-tertiary)" }}>
                      {scopeSubtitle}
                      {selectedDay && ` · ${MN[month - 1]} ${selectedDay}, ${year}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border p-0.5 shrink-0" style={{ borderColor: "var(--border)" }}>
                    <button type="button" onClick={handlePrevMonth} className="rounded-lg p-1 transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-secondary)" }}>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <span className="px-2 text-[11px] font-semibold min-w-[8rem] text-center" style={{ color: "var(--fg)" }}>
                      {MN[month - 1]} {year}
                    </span>
                    <button type="button" onClick={handleNextMonth} className="rounded-lg p-1 transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-secondary)" }}>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                </div>
                <button type="button" onClick={onClose} className="rounded-lg p-1 transition-colors hover:bg-[var(--bg-grouped)] shrink-0" style={{ color: "var(--fg-secondary)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>

              <div className="flex min-h-0 flex-1 overflow-hidden">
                {/* ── Sidebar ── */}
                <div className="hidden md:flex w-[280px] shrink-0 flex-col border-r overflow-hidden" style={{ borderColor: "var(--border)" }}>
                  <div className={`shrink-0 p-3 border-b transition-opacity ${viewMode === "grid" ? "opacity-40 pointer-events-none" : ""}`} style={{ borderColor: "var(--border)" }}>
                    <MiniCalendar
                      compact
                      year={year}
                      month={month}
                      onPrevMonth={handlePrevMonth}
                      onNextMonth={handleNextMonth}
                      selectedDay={selectedDay}
                      onSelectDay={(d) => setSelectedDay(d)}
                      loading={dailyLoading}
                      getDayMeta={(day) => {
                        if (viewMode === "grid") return { dotColor: "transparent" };
                        const entry = dailyMap.get(day);
                        if (!entry || entry.totalEvents === 0) return { dotColor: "transparent" };
                        if (entry.completedCount > 0 && entry.undoneCount === 0) return { dotColor: "var(--green)" };
                        if (entry.undoneCount > 0 && entry.completedCount === 0) return { dotColor: "var(--amber)" };
                        if (entry.completedCount > 0) return { dotColor: "var(--green)" };
                        return { dotColor: "var(--fg-tertiary)" };
                      }}
                      showLegend={viewMode !== "grid"}
                      legendItems={[
                        { label: "Completed", color: "var(--green)" },
                        { label: "Undone", color: "var(--amber)" },
                      ]}
                    />
                    {selectedDay && viewMode !== "grid" && (
                      <button type="button" onClick={() => setSelectedDay(null)} className="mt-2 w-full rounded-lg py-1 text-center text-[10px] font-semibold transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--primary)" }}>
                        Back to today
                      </button>
                    )}
                  </div>
                  <div className="shrink-0 px-2 pt-2 pb-1">
                    <div className="flex items-center gap-2 rounded-xl border px-3 py-1.5" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
                      <svg className="pointer-events-none h-3 w-3 shrink-0" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                      <input type="text" value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} placeholder="Search…" className="flex-1 min-w-0 bg-transparent text-[11px] outline-none" style={{ color: "var(--fg)", border: "none" }} />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto px-1 pb-2">
                    <button type="button" onClick={() => selectScope(null, null)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors mb-1"
                      style={{ background: !selectedCampaignId && !selectedTaskId ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent", color: !selectedCampaignId && !selectedTaskId ? "var(--primary)" : "var(--fg-secondary)" }}>
                      <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                      All Campaigns
                    </button>

                    {filteredSidebarCampaigns.map((c) => {
                      const isExpanded = expandedCampaigns.has(c._id);
                      const isCampaignActive = selectedCampaignId === c._id && !selectedTaskId;
                      return (
                        <div key={c._id} className="mb-0.5">
                          <div className="flex items-center">
                            <button type="button" onClick={() => toggleCampaignExpand(c._id)}
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-[var(--hover-bg)]">
                              <svg className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M9 5l7 7-7 7" /></svg>
                            </button>
                            <button type="button" onClick={() => selectScope(c._id, null)}
                              className="flex-1 min-w-0 rounded-lg px-1.5 py-1 text-left text-[11px] font-semibold truncate transition-colors"
                              style={{ background: isCampaignActive ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent", color: isCampaignActive ? "var(--primary)" : "var(--fg)" }}>
                              {c.name}
                            </button>
                          </div>
                          <AnimatePresence initial={false}>
                            {isExpanded && c.tasks.length > 0 && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                                <div className="ml-5 border-l pl-1.5" style={{ borderColor: "var(--border)" }}>
                                  {c.tasks.map((t) => {
                                    const isTaskActive = selectedTaskId === t._id;
                                    const hasSubtasks = (t.subtasks?.length ?? 0) > 0;
                                    return (
                                      <div key={t._id}>
                                        <button type="button" onClick={() => selectScope(c._id, t._id)}
                                          className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-[10px] transition-colors"
                                          style={{ background: isTaskActive ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent", color: isTaskActive ? "var(--primary)" : "var(--fg-secondary)" }}>
                                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.recurrence ? "var(--purple)" : "var(--teal)" }} />
                                          <span className="truncate">{t.title}</span>
                                        </button>
                                        {hasSubtasks && t.subtasks!.map((s) => {
                                          const isSubActive = selectedTaskId === s._id;
                                          return (
                                            <button key={s._id} type="button" onClick={() => selectScope(c._id, s._id)}
                                              className="flex w-full items-center gap-1.5 rounded-lg py-0.5 pl-4 pr-1.5 text-[10px] transition-colors"
                                              style={{ background: isSubActive ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent", color: isSubActive ? "var(--primary)" : "var(--fg-tertiary)" }}>
                                              <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: s.recurrence ? "var(--purple)" : "var(--teal)" }} />
                                              <span className="truncate">{s.title}</span>
                                            </button>
                                          );
                                        })}
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
                </div>

                {/* ── Right panel ── */}
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                  {viewMode === "grid" && (
                    <div className="flex-1 overflow-y-auto p-3">
                      <div className="mb-3">
                        <h4 className="text-[11px] font-bold" style={{ color: "var(--fg)" }}>Campaigns</h4>
                      </div>
                      {!isPrivileged ? (
                        <div className="py-12 text-center">
                          <p className="text-[11px] font-medium" style={{ color: "var(--fg-tertiary)" }}>You don&apos;t have access to this data.</p>
                        </div>
                      ) : campaignGroupsLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
                              <div className="p-3 space-y-2.5">
                                <div className="shimmer h-4 w-36 rounded" />
                                <div className="space-y-1.5">
                                  {[1, 2, 3].map((j) => <div key={j} className="shimmer h-8 w-full rounded-lg" />)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : campaignGroups.length === 0 ? (
                        <div className="py-12 text-center">
                          <p className="text-[11px] font-medium" style={{ color: "var(--fg-tertiary)" }}>No active campaigns.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {campaignGroups.map((cg) => {
                            const empTasks = cg.tasks.map((t) => mapTaskNodeToEmpTask(t, userId));
                            const { done: totalDone, total: totalPossible } = countLeafProgress(empTasks);
                            return (
                              <div key={cg._id} className="rounded-xl border overflow-hidden flex flex-col" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                                <button type="button" onClick={() => selectScope(cg._id, null)}
                                  className="flex items-center gap-1.5 px-3 py-2 border-b transition-colors hover:bg-[var(--hover-bg)]"
                                  style={{ borderColor: "var(--border)" }}>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[12px] font-bold truncate" style={{ color: "var(--fg)" }}>{cg.name}</span>
                                      {totalPossible > 0 && (
                                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                                          style={{ background: totalDone === totalPossible ? "color-mix(in srgb, var(--teal) 10%, transparent)" : "color-mix(in srgb, var(--amber) 10%, transparent)", color: totalDone === totalPossible ? "var(--teal)" : "var(--amber)" }}>
                                          {totalDone}/{totalPossible}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[9px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
                                      {cg.totalTasks} task{cg.totalTasks !== 1 ? "s" : ""}
                                    </span>
                                    <svg className="h-3 w-3" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                  </div>
                                </button>
                                <div className="flex-1 min-h-0 overflow-y-auto p-2 pt-3 space-y-2">
                                  {cg.tasks.length === 0 ? (
                                    <p className="text-[10px] py-2 px-1 text-center" style={{ color: "var(--fg-tertiary)" }}>No tasks</p>
                                  ) : empTasks.map((task) => (
                                    <EmpTaskCard key={task._id} task={task} onTaskClick={(tid) => selectScope(cg._id, tid)} />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {viewMode === "campaign" && (
                    <div className="flex-1 overflow-y-auto px-3 pb-3">
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="text-[11px] font-bold" style={{ color: "var(--fg)" }}>
                          {selectedDay ? `${MN[month - 1]} ${selectedDay}` : "Today"} — Tasks
                        </h4>
                        {selectedDay && (
                          <button type="button" onClick={() => setSelectedDay(null)} className="text-[10px] font-semibold transition-colors" style={{ color: "var(--primary)" }}>
                            Back to today
                          </button>
                        )}
                      </div>
                      {campaignEmpTasksLoading ? (
                        <div className="space-y-2">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="shimmer h-10 w-full rounded-xl" />
                          ))}
                        </div>
                      ) : campaignEmpTasks.length === 0 ? (
                        <div className="py-8 text-center">
                          <p className="text-[11px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
                            No tasks for this employee{selectedDay ? " on this date" : ""}.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {campaignEmpTasks.map((t) => (
                            <EmpTaskCard key={t._id} task={t} onTaskClick={(tid) => selectScope(selectedCampaignId, tid)} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {viewMode === "task" && selectedCampaignId && (
                    <TimelinePanel
                      events={eventsToShow}
                      loading={eventsLoading}
                      selectedDay={selectedDay}
                      month={month}
                      year={year}
                      onClearDay={() => setSelectedDay(null)}
                    />
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
