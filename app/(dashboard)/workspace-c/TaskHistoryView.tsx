"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MiniCalendar, useCalendarNav } from "../components/MiniCalendar";
import { usePermissions } from "@/lib/usePermissions";

/* ───── Types ───── */

interface CampaignSummary {
  _id: string;
  name: string;
  tasks: TaskSummary[];
}
interface TaskSummary {
  _id: string;
  title: string;
  parentTask?: string | null;
  recurrence?: { frequency: string; days: number[] } | null;
  subtasks?: TaskSummary[];
}

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

interface EmpCard {
  _id: string;
  name: string;
  email: string;
  todayDone: number;
  todayTotal: number;
  totalTasks?: number;
  byDate?: { date: string; done: number; total: number }[];
  taskChecklist?: { _id: string; title: string; done: boolean }[];
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

interface EmpDayCard {
  _id: string;
  name: string;
  email: string;
  todayDone: number;
  todayTotal: number;
  tasks: EmpTaskNode[];
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

/* ───── Sub-components ───── */

function EmployeeCardGrid({ employees, onEmployeeClick, loading }: {
  employees: EmpCard[];
  onEmployeeClick: (empId: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="rounded-xl border p-3 space-y-2" style={{ borderColor: "var(--border)", background: "var(--bg-grouped)" }}>
            <div className="shimmer h-3.5 w-24 rounded" />
            <div className="shimmer h-2 w-full rounded" />
            <div className="shimmer h-2.5 w-16 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-[11px] font-medium" style={{ color: "var(--fg-tertiary)" }}>No employees found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
      {employees.map((emp) => {
        const pct = emp.todayTotal > 0 ? Math.round((emp.todayDone / emp.todayTotal) * 100) : 0;
        const allDone = emp.todayTotal > 0 && emp.todayDone >= emp.todayTotal;
        const barColor = allDone ? "var(--green)" : pct > 0 ? "var(--primary)" : "var(--fg-quaternary)";

        return (
          <motion.button type="button" key={emp._id} onClick={() => onEmployeeClick(emp._id)}
            className="rounded-xl border p-3 text-left transition-colors hover:border-[var(--primary)]"
            style={{ borderColor: "var(--border)", background: "var(--bg-grouped)" }}
            whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold truncate" style={{ color: "var(--fg)" }}>{emp.name}</span>
              <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: barColor }}>
                {emp.todayDone}/{emp.todayTotal}
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 w-full rounded-full overflow-hidden mb-2" style={{ background: "var(--bg)" }}>
              <motion.div className="h-full rounded-full" style={{ background: barColor }}
                initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: "easeOut" }} />
            </div>
            {/* Task checklist (campaign view only) */}
            {emp.taskChecklist && emp.taskChecklist.length > 0 && (
              <div className="space-y-0.5 mb-2">
                {emp.taskChecklist.map((t) => (
                  <div key={t._id} className="flex items-center gap-1.5">
                    <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded-sm"
                      style={{ background: t.done ? "color-mix(in srgb, var(--green) 16%, transparent)" : "color-mix(in srgb, var(--fg-tertiary) 10%, transparent)" }}>
                      {t.done ? (
                        <svg className="h-2 w-2" style={{ color: "var(--green)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" d="M5 13l4 4L19 7" /></svg>
                      ) : (
                        <svg className="h-2 w-2" style={{ color: "var(--fg-quaternary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      )}
                    </span>
                    <span className="text-[11px] truncate" style={{ color: t.done ? "var(--fg-secondary)" : "var(--fg-tertiary)", textDecoration: t.done ? "line-through" : "none" }}>
                      {t.title}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

/* ───── Task Card (workspace-style) ───── */

function ProgressTaskCard({ task, onTaskClick, onEmployeeClick, isSubtask }: {
  task: TaskNode;
  onTaskClick: (taskId: string) => void;
  onEmployeeClick: (empId: string) => void;
  isSubtask?: boolean;
}) {
  const hasSubtasks = task.subtasks.length > 0;
  const [expanded, setExpanded] = useState(hasSubtasks);
  const recurLabel = fmtRecurrence(task.recurrence);
  const pillColor = task.recurrence ? "#8b5cf6" : (task.doneCount === task.totalCount && task.totalCount > 0 ? "var(--green)" : "var(--amber)");
  const pillLabel = task.recurrence ? recurLabel : `${task.doneCount}/${task.totalCount}`;

  return (
    <div className={isSubtask ? "mb-1" : "mb-1.5"}>
      <div className="group relative rounded-xl border transition-all"
        style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
        <span className="pill-glass absolute -top-2.5 right-2 z-[5] rounded-full px-1.5 py-px text-[11px] font-semibold"
          style={{
            background: `color-mix(in srgb, ${pillColor} 15%, var(--dock-frosted-bg))`,
            color: pillColor,
            border: `1px solid color-mix(in srgb, ${pillColor} 30%, var(--border))`,
          }}>
          {pillLabel}
        </span>
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          {(hasSubtasks || !isSubtask) && (
            <button type="button" onClick={() => setExpanded(!expanded)} className="shrink-0" style={{ color: "var(--fg-tertiary)" }}>
              <motion.svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" animate={{ rotate: expanded ? 90 : 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </motion.svg>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-semibold truncate block" style={{ color: "var(--fg)" }}>{task.title}</span>
            {task.description && <span className="text-[11px] truncate block" style={{ color: "var(--fg-tertiary)" }}>{task.description}</span>}
            {/* employee completion pills */}
            <div className="flex items-center gap-1 flex-wrap mt-0.5">
              {task.employees.map((emp) => (
                <button key={emp._id} type="button" onClick={(e) => { e.stopPropagation(); onEmployeeClick(emp._id); }}
                  className="rounded-full px-1.5 py-px text-[11px] font-medium transition-colors hover:opacity-80"
                  style={{
                    background: emp.done ? "color-mix(in srgb, var(--green) 12%, transparent)" : "var(--bg-grouped)",
                    color: emp.done ? "var(--green)" : "var(--fg-secondary)",
                  }}>
                  {emp.done && <svg className="inline-block h-2 w-2 mr-0.5 -mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" d="M5 13l4 4L19 7" /></svg>}
                  {emp.name}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => onTaskClick(task._id)}
            className="h-5 w-5 flex items-center justify-center rounded-md shrink-0 transition-colors opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-grouped)]"
            style={{ color: "var(--fg-tertiary)" }} title="View timeline">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
          </button>
        </div>
      </div>
      {/* subtasks */}
      <AnimatePresence initial={false}>
        {expanded && hasSubtasks && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="ml-4 border-l pl-2 pr-1 py-1 space-y-1.5" style={{ borderColor: "color-mix(in srgb, var(--fg-tertiary) 15%, transparent)" }}>
              {task.subtasks.map((sub) => (
                <ProgressTaskCard key={sub._id} task={sub} onTaskClick={onTaskClick} onEmployeeClick={onEmployeeClick} isSubtask />
              ))}
            </div>
          </motion.div>
        )}
        {expanded && !hasSubtasks && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="ml-4 border-l pl-2 pr-1 py-1" style={{ borderColor: "color-mix(in srgb, var(--fg-tertiary) 15%, transparent)" }}>
              <p className="text-[11px] py-0.5 px-1" style={{ color: "var(--fg-tertiary)" }}>No subtasks</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───── Employee Task Card (workspace-style, single employee's status) ───── */

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
        <span className="pill-glass absolute -top-2.5 right-2 z-[5] rounded-full px-1.5 py-px text-[11px] font-semibold"
          style={{
            background: `color-mix(in srgb, ${pillColor} 15%, var(--dock-frosted-bg))`,
            color: pillColor,
            border: `1px solid color-mix(in srgb, ${pillColor} 30%, var(--border))`,
          }}>
          {pillLabel}
        </span>
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          {/* done/pending icon */}
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
            {task.description && <span className="text-[11px] truncate block" style={{ color: "var(--fg-tertiary)" }}>{task.description}</span>}
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

/* ───── Main Component ───── */

interface ViewProps {
  campaigns: CampaignSummary[];
  preSelectedTaskId?: string;
  preSelectedCampaignId?: string;
  /** Outer container className override. */
  className?: string;
}

export function TaskHistoryView({ campaigns, preSelectedTaskId, preSelectedCampaignId, className }: ViewProps) {
  const { isSuperAdmin, can: canPerm } = usePermissions();
  const isPrivileged = isSuperAdmin || canPerm("tasks_view");

  const { defaultYear, defaultMonth, prevMonth, nextMonth } = useCalendarNav();
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(preSelectedCampaignId ?? null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(preSelectedTaskId ?? null);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());

  const [dailyData, setDailyData] = useState<DailyEntry[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [detailData, setDetailData] = useState<DetailGroup[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Employee cards data (single campaign view)
  const [empCards, setEmpCards] = useState<EmpCard[]>([]);
  const [empCardsLoading, setEmpCardsLoading] = useState(false);
  // Grouped campaign cards (default "all" view)
  const [campaignGroups, setCampaignGroups] = useState<CampaignGroup[]>([]);
  const [campaignGroupsLoading, setCampaignGroupsLoading] = useState(false);

  // When an employee card is clicked, show their timeline
  const [inspectEmpId, setInspectEmpId] = useState<string | null>(null);
  const [empTimeline, setEmpTimeline] = useState<HistoryEvent[]>([]);
  const [empTimelineLoading, setEmpTimelineLoading] = useState(false);

  // Campaign day-detail: employee cards with task status for a specific date
  const [dayEmpCards, setDayEmpCards] = useState<EmpDayCard[]>([]);
  const [dayEmpCardsLoading, setDayEmpCardsLoading] = useState(false);

  const [sidebarSearch, setSidebarSearch] = useState("");

  useEffect(() => {
    if (preSelectedCampaignId) {
      setSelectedCampaignId(preSelectedCampaignId);
      setExpandedCampaigns(new Set([preSelectedCampaignId]));
    }
    if (preSelectedTaskId) setSelectedTaskId(preSelectedTaskId);
  }, [preSelectedCampaignId, preSelectedTaskId]);

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

  // View mode: "grid" (campaign cards) | "timeline" (calendar + events) | "employee-detail" (single employee)
  const viewMode = useMemo(() => {
    if (inspectEmpId) return "employee-detail" as const;
    if (selectedTaskId || selectedCampaignId) return "timeline" as const;
    return "grid" as const;
  }, [inspectEmpId, selectedTaskId, selectedCampaignId]);

  /* ─── Data fetchers ─── */

  // Fetch employee cards (campaign-specific or grouped-by-campaign)
  const loadEmpCards = useCallback(async () => {
    if (viewMode !== "grid") return;
    if (selectedCampaignId) {
      setEmpCardsLoading(true);
      try {
        const params = new URLSearchParams({ type: "campaign-employees", days: "1", campaignId: selectedCampaignId });
        const res = await fetch(`/api/tasks/history?${params}`);
        if (res.ok) {
          const data = await res.json();
          setEmpCards(data.employees || []);
          setCampaignGroups([]);
        } else {
          setEmpCards([]);
        }
      } catch { setEmpCards([]); }
      setEmpCardsLoading(false);
    } else {
      setCampaignGroupsLoading(true);
      try {
        const params = new URLSearchParams({ type: "campaign-employees", days: "1" });
        const res = await fetch(`/api/tasks/history?${params}`);
        if (res.ok) {
          const data = await res.json();
          if (data.grouped) {
            setCampaignGroups(data.campaigns || []);
            setEmpCards([]);
          } else {
            setEmpCards(data.employees || []);
            setCampaignGroups([]);
          }
        } else {
          setCampaignGroups([]);
        }
      } catch { setCampaignGroups([]); }
      setCampaignGroupsLoading(false);
    }
  }, [selectedCampaignId, viewMode]);

  useEffect(() => { loadEmpCards(); }, [loadEmpCards]);

  // Fetch daily calendar data (for timeline and employee detail views)
  const loadDaily = useCallback(async () => {
    if (viewMode === "grid" && !inspectEmpId) return;
    setDailyLoading(true);
    try {
      const params = new URLSearchParams({ type: "daily", year: String(year), month: String(month) });
      if (selectedCampaignId) params.set("campaignId", selectedCampaignId);
      if (selectedTaskId) params.set("taskId", selectedTaskId);
      if (inspectEmpId) params.set("userId", inspectEmpId);
      const res = await fetch(`/api/tasks/history?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDailyData(Array.isArray(data) ? data : []);
      } else {
        setDailyData([]);
      }
    } catch { setDailyData([]); }
    setDailyLoading(false);
  }, [year, month, selectedCampaignId, selectedTaskId, inspectEmpId, viewMode]);

  useEffect(() => { loadDaily(); }, [loadDaily]);

  // Fetch detail events for a specific day
  const loadDetail = useCallback(async (date: string) => {
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({ type: "detail", date });
      if (selectedCampaignId) params.set("campaignId", selectedCampaignId);
      if (selectedTaskId) params.set("taskId", selectedTaskId);
      if (inspectEmpId) params.set("userId", inspectEmpId);
      const res = await fetch(`/api/tasks/history?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDetailData(Array.isArray(data) ? data : []);
      } else {
        setDetailData([]);
      }
    } catch { setDetailData([]); }
    setDetailLoading(false);
  }, [selectedCampaignId, selectedTaskId, inspectEmpId]);

  useEffect(() => {
    if (selectedDay && (viewMode === "timeline" || viewMode === "employee-detail")) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
      loadDetail(dateStr);
    }
  }, [selectedDay, year, month, loadDetail, viewMode]);

  // Fetch employee-specific timeline when inspecting an employee from grid
  const loadEmpTimeline = useCallback(async () => {
    if (!inspectEmpId) return;
    setEmpTimelineLoading(true);
    try {
      const params = new URLSearchParams({ type: "employee-timeline", userId: inspectEmpId, limit: "100" });
      if (selectedCampaignId) params.set("campaignId", selectedCampaignId);
      const daysInMonth = new Date(year, month, 0).getDate();
      params.set("from", `${year}-${String(month).padStart(2, "0")}-01`);
      params.set("to", `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`);
      const res = await fetch(`/api/tasks/history?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmpTimeline(data.logs || []);
      } else {
        setEmpTimeline([]);
      }
    } catch { setEmpTimeline([]); }
    setEmpTimelineLoading(false);
  }, [inspectEmpId, selectedCampaignId, year, month]);

  useEffect(() => { loadEmpTimeline(); }, [loadEmpTimeline]);

  // Fetch campaign employee cards (always when campaign selected, for today or selected day)
  const loadDayEmpCards = useCallback(async () => {
    if (!selectedCampaignId || selectedTaskId || inspectEmpId) {
      setDayEmpCards([]);
      return;
    }
    setDayEmpCardsLoading(true);
    try {
      const params = new URLSearchParams({ type: "campaign-employees", days: "1", campaignId: selectedCampaignId });
      if (selectedDay) {
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
        params.set("date", dateStr);
      }
      const res = await fetch(`/api/tasks/history?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDayEmpCards(data.employees || []);
      } else {
        setDayEmpCards([]);
      }
    } catch { setDayEmpCards([]); }
    setDayEmpCardsLoading(false);
  }, [selectedCampaignId, selectedDay, selectedTaskId, inspectEmpId, year, month]);

  useEffect(() => { loadDayEmpCards(); }, [loadDayEmpCards]);

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

  const filteredCampaigns = useMemo(() => {
    if (!sidebarSearch.trim()) return campaigns;
    const q = sidebarSearch.toLowerCase();
    return campaigns.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.tasks.some((t) => t.title.toLowerCase().includes(q) || t.subtasks?.some((s) => s.title.toLowerCase().includes(q)))
    );
  }, [campaigns, sidebarSearch]);

  const selectScope = useCallback((campaignId: string | null, taskId: string | null) => {
    setSelectedCampaignId(campaignId);
    setSelectedTaskId(taskId);
    setSelectedDay(null);
    setInspectEmpId(null);
    if (campaignId) setExpandedCampaigns((prev) => new Set(prev).add(campaignId));
  }, []);

  const toggleCampaignExpand = useCallback((cid: string) => {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid); else next.add(cid);
      return next;
    });
  }, []);

  const currentLabel = useMemo(() => {
    if (inspectEmpId) {
      const emp = empCards.find((e) => e._id === inspectEmpId);
      return { campaign: selectedCampaignId ? campaigns.find((c) => c._id === selectedCampaignId)?.name ?? null : null, task: null, employee: emp?.name ?? "Employee" };
    }
    if (selectedTaskId) {
      for (const c of campaigns) {
        for (const t of c.tasks) {
          if (t._id === selectedTaskId) return { campaign: c.name, task: t.title, employee: null };
          for (const s of t.subtasks ?? []) {
            if (s._id === selectedTaskId) return { campaign: c.name, task: s.title, employee: null };
          }
        }
      }
    }
    if (selectedCampaignId) {
      const c = campaigns.find((c) => c._id === selectedCampaignId);
      if (c) return { campaign: c.name, task: null, employee: null };
    }
    return { campaign: null, task: null, employee: null };
  }, [campaigns, selectedCampaignId, selectedTaskId, inspectEmpId, empCards]);

  const handleEmployeeClick = useCallback((empId: string) => {
    setInspectEmpId(empId);
    setSelectedDay(null);
  }, []);

  const handleBackToGrid = useCallback(() => {
    setInspectEmpId(null);
    setSelectedDay(null);
  }, []);

  const eventsToShow = selectedDay ? detailEvents : (viewMode === "employee-detail" ? empTimeline : allTimelineEvents);
  const eventsLoading = selectedDay ? detailLoading : (viewMode === "employee-detail" ? empTimelineLoading : dailyLoading);

  return (
    <div className={className ?? "flex h-full w-full gap-4"}>
      {/* ── Left Sidebar: two stacked cards (content top, calendar bottom) ── */}
      <aside className="hidden sm:flex w-[280px] shrink-0 flex-col gap-3 overflow-hidden">
        {/* Top card: search + campaigns tree */}
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          <div className="shrink-0 p-2.5 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" />
              </svg>
              <input type="text" value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} placeholder="Search campaigns…"
                className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-[12px] outline-none transition-colors focus:border-[var(--primary)]"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--fg)" }}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-1 py-1">
            <button type="button" onClick={() => selectScope(null, null)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors mb-1"
              style={{ background: !selectedCampaignId && !selectedTaskId ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent", color: !selectedCampaignId && !selectedTaskId ? "var(--primary)" : "var(--fg-secondary)" }}>
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
              All Campaigns
            </button>

            {filteredCampaigns.map((c) => {
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
                                          className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11px] transition-colors"
                                          style={{ background: isTaskActive ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent", color: isTaskActive ? "var(--primary)" : "var(--fg-secondary)" }}>
                                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.recurrence ? "var(--purple)" : "var(--teal)" }} />
                                          <span className="truncate">{t.title}</span>
                                        </button>
                                        {hasSubtasks && t.subtasks!.map((s) => {
                                          const isSubActive = selectedTaskId === s._id;
                                          return (
                                            <button key={s._id} type="button" onClick={() => selectScope(c._id, s._id)}
                                              className="flex w-full items-center gap-1.5 rounded-lg py-0.5 pl-4 pr-1.5 text-[11px] transition-colors"
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

        {/* Bottom card: calendar */}
        <div
          className={`shrink-0 rounded-xl border px-1.5 py-1.5 space-y-1 transition-opacity ${viewMode === "grid" ? "opacity-40 pointer-events-none" : ""}`}
          style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
        >
          {selectedDay && viewMode !== "grid" && (
            <button type="button" onClick={() => setSelectedDay(null)}
              className="flex w-full items-center justify-center gap-1 rounded-lg py-1 text-[10px] font-semibold transition-colors hover:bg-[var(--hover-bg)]"
              style={{ color: "var(--fg-tertiary)" }}>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
              Clear date
            </button>
          )}
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
              { label: viewMode === "employee-detail" ? "Undone" : "Mixed", color: "var(--amber)" },
              ...(viewMode !== "employee-detail" ? [{ label: "Other", color: "var(--fg-tertiary)" }] : []),
            ]}
          />
        </div>
      </aside>

      {/* ── Right Panel (separate card) ── */}
      <div
        className="relative flex min-w-0 flex-1 flex-col rounded-xl border overflow-hidden"
        style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
      >
        {/* Back strip: only shown when inspecting an employee */}
        {inspectEmpId && (
          <div className="shrink-0 flex items-center px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
            <button type="button" onClick={handleBackToGrid}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors hover:bg-[var(--hover-bg)]"
              style={{ color: "var(--fg-secondary)" }}>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M15 19l-7-7 7-7" /></svg>
              <span className="truncate">{currentLabel.employee ?? "Back"}</span>
            </button>
          </div>
        )}

        {/* ── GRID VIEW ── */}
                  {viewMode === "grid" && (
                    <div className="flex-1 overflow-y-auto p-3">
                      {selectedCampaignId ? (
                        <>
                          <div className="mb-3 flex items-center justify-between">
                            <h4 className="text-[11px] font-bold" style={{ color: "var(--fg)" }}>Employee Progress</h4>
                            <span className="text-[11px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
                              {empCards.length} employee{empCards.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <EmployeeCardGrid employees={empCards} onEmployeeClick={handleEmployeeClick} loading={empCardsLoading} />
                        </>
                      ) : (
                        <>
                          <div className="mb-3">
                            <h4 className="text-[11px] font-bold" style={{ color: "var(--fg)" }}>Today&apos;s Progress</h4>
                          </div>
                          {campaignGroupsLoading ? (
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
                                const totalDone = cg.tasks.reduce((s, t) => s + t.doneCount, 0);
                                const totalPossible = cg.tasks.reduce((s, t) => s + t.totalCount, 0);
                                return (
                                  <div key={cg._id} className="rounded-xl border overflow-hidden flex flex-col" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                                    {/* card header — matches workspace campaign card */}
                                    <button type="button" onClick={() => selectScope(cg._id, null)}
                                      className="flex items-center gap-1.5 px-3 py-2 border-b transition-colors hover:bg-[var(--hover-bg)]"
                                      style={{ borderColor: "var(--border)" }}>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[12px] font-bold truncate" style={{ color: "var(--fg)" }}>{cg.name}</span>
                                          {totalPossible > 0 && (
                                            <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                                              style={{ background: totalDone === totalPossible ? "color-mix(in srgb, var(--teal) 10%, transparent)" : "color-mix(in srgb, var(--amber) 10%, transparent)", color: totalDone === totalPossible ? "var(--teal)" : "var(--amber)" }}>
                                              {totalDone}/{totalPossible}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="text-[11px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
                                          {cg.employeeCount} member{cg.employeeCount !== 1 ? "s" : ""}
                                        </span>
                                        <svg className="h-3 w-3" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                      </div>
                                    </button>
                                    {/* card body — task rows matching workspace style */}
                                    <div className="flex-1 min-h-0 overflow-y-auto p-2 pt-3 space-y-2">
                                      {cg.tasks.length === 0 ? (
                                        <p className="text-[11px] py-2 px-1 text-center" style={{ color: "var(--fg-tertiary)" }}>No tasks</p>
                                      ) : cg.tasks.map((task) => (
                                        <ProgressTaskCard key={task._id} task={task} onTaskClick={(tid) => selectScope(cg._id, tid)} onEmployeeClick={handleEmployeeClick} />
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* ── TIMELINE VIEW: Events / Employee Day Grid ── */}
                  {viewMode === "timeline" && (
                    <>
                      {/* Campaign selected → always show employee cards grid */}
                      {selectedCampaignId && !selectedTaskId ? (
                        <div className="flex-1 overflow-y-auto px-3 pb-3 pt-3">
                          {dayEmpCardsLoading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="rounded-xl border p-3 space-y-2" style={{ borderColor: "var(--border)", background: "var(--bg-grouped)" }}>
                                  <div className="shimmer h-3.5 w-24 rounded" />
                                  <div className="shimmer h-2 w-full rounded" />
                                  <div className="space-y-1.5">
                                    {[1, 2].map((j) => <div key={j} className="shimmer h-8 w-full rounded-lg" />)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : dayEmpCards.length === 0 ? (
                            <div className="py-8 text-center">
                              <p className="text-[11px] font-medium" style={{ color: "var(--fg-tertiary)" }}>No employee data{selectedDay ? " for this date" : ""}.</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {dayEmpCards.map((emp) => {
                                const pct = emp.todayTotal > 0 ? Math.round((emp.todayDone / emp.todayTotal) * 100) : 0;
                                const allDone = emp.todayTotal > 0 && emp.todayDone >= emp.todayTotal;
                                const barColor = allDone ? "var(--green)" : pct > 0 ? "var(--primary)" : "var(--fg-quaternary)";
                                return (
                                  <div key={emp._id} className="rounded-xl border overflow-hidden flex flex-col" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                                    <div className="flex items-center gap-1.5 px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[12px] font-bold truncate" style={{ color: "var(--fg)" }}>{emp.name}</span>
                                          <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                                            style={{ background: allDone ? "color-mix(in srgb, var(--teal) 10%, transparent)" : "color-mix(in srgb, var(--amber) 10%, transparent)", color: allDone ? "var(--teal)" : "var(--amber)" }}>
                                            {emp.todayDone}/{emp.todayTotal}
                                          </span>
                                        </div>
                                      </div>
                                      <button type="button" onClick={() => handleEmployeeClick(emp._id)}
                                        className="text-[11px] font-semibold shrink-0 transition-colors hover:opacity-80" style={{ color: "var(--primary)" }}>
                                        Timeline
                                      </button>
                                    </div>
                                    <div className="px-3 pt-2">
                                      <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: "var(--bg-grouped)" }}>
                                        <motion.div className="h-full rounded-full" style={{ background: barColor }}
                                          initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: "easeOut" }} />
                                      </div>
                                    </div>
                                    <div className="flex-1 min-h-0 overflow-y-auto p-2 pt-3 space-y-2">
                                      {emp.tasks.map((t) => (
                                        <EmpTaskCard key={t._id} task={t} onTaskClick={(tid) => selectScope(selectedCampaignId, tid)} />
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <TimelinePanel
                          events={eventsToShow}
                          loading={eventsLoading}
                          selectedDay={selectedDay}
                          month={month}
                          year={year}
                          onClearDay={() => setSelectedDay(null)}
                        />
                      )}
                    </>
                  )}

        {/* ── EMPLOYEE DETAIL VIEW: Employee Timeline ── */}
        {viewMode === "employee-detail" && (
          <>
            <TimelinePanel
              events={selectedDay ? detailEvents : empTimeline}
              loading={selectedDay ? detailLoading : empTimelineLoading}
              selectedDay={selectedDay}
              month={month}
              year={year}
              onClearDay={() => setSelectedDay(null)}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ───── Timeline Panel (shared between timeline and employee-detail views) ───── */

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
          <button type="button" onClick={onClearDay} className="text-[11px] font-semibold transition-colors" style={{ color: "var(--primary)" }}>
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
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white mt-0.5"
                  style={{ background: ev.employee?._id ? avatarColor(ev.employee._id) : "var(--fg-tertiary)" }}>
                  {empInitials(ev.employee)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold" style={{ color: "var(--fg)" }}>{empName(ev.employee)}</span>
                    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-semibold"
                      style={{ background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}>
                      <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} /></svg>
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {ev.campaign && (
                      <span className="rounded-full px-1.5 py-px text-[11px] font-semibold" style={{ background: "color-mix(in srgb, var(--teal) 12%, transparent)", color: "var(--teal)" }}>
                        {ev.campaign.name}
                      </span>
                    )}
                    {ev.task && (
                      <span className="text-[11px] truncate" style={{ color: "var(--fg-secondary)" }}>{ev.task.title}</span>
                    )}
                  </div>
                  {ev.note && (
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{ev.note}</p>
                  )}
                </div>
                <span className="shrink-0 text-[11px] tabular-nums mt-0.5" style={{ color: "var(--fg-tertiary)" }}>
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
