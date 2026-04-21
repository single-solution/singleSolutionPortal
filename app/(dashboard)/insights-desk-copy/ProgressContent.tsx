"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { MiniCalendar } from "../components/MiniCalendar";
import { usePermissions } from "@/lib/usePermissions";
import { useCachedState } from "@/lib/useQuery";
import toast from "react-hot-toast";

/* ───── Types ───── */

interface DropdownEmp {
  _id: string;
  about?: { firstName?: string; lastName?: string };
  email?: string;
  department?: { id: string; title: string } | null;
}

interface DeptGroup {
  id: string;
  title: string;
  employees: DropdownEmp[];
}

interface TaskEmployee {
  _id: string;
  name: string;
  done: boolean;
}

interface TaskNode {
  _id: string;
  title: string;
  recurrence?: { frequency?: string; days?: number[] } | null;
  description?: string | null;
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

interface DetailEvent {
  _id: string;
  task: { _id: string; title: string; recurrence?: { frequency: string; days: number[] }; parentTask?: string } | null;
  employee?: { _id: string; about?: { firstName: string; lastName: string }; email?: string } | null;
  changedBy?: { _id: string; about?: { firstName: string; lastName: string }; email?: string } | null;
  status: string;
  eventType: string;
  changedAt: string;
  note?: string;
}

interface DetailGroup {
  campaign: { _id: string; name: string };
  events: DetailEvent[];
}

interface TimelineLog {
  _id: string;
  task: { _id: string; title: string; recurrence?: { frequency: string; days: number[] }; parentTask?: string } | null;
  campaign: { _id: string; name: string } | null;
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
  events: TimelineLog[];
}

interface EmployeeInfo {
  _id: string;
  about?: { firstName: string; lastName: string };
  email?: string;
}

/* ───── Helpers ───── */

const MN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function nameOf(u: DropdownEmp): string {
  return `${u.about?.firstName ?? ""} ${u.about?.lastName ?? ""}`.trim() || u.email || "—";
}
function initials(u: DropdownEmp | null): string {
  if (!u) return "?";
  return ((u.about?.firstName?.[0] ?? "") + (u.about?.lastName?.[0] ?? "")).toUpperCase() || "?";
}
const AVATAR_COLORS = ["var(--primary)", "var(--teal)", "var(--purple)", "var(--amber)", "var(--rose)", "var(--green)", "var(--fg-secondary)"];
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function fmtTime(d: string): string {
  return new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtDate(d: string): string {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
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

function flatLeafCount(nodes: TaskNode[], empId: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const n of nodes) {
    if (n.subtasks.length > 0) {
      const s = flatLeafCount(n.subtasks, empId);
      done += s.done;
      total += s.total;
    } else {
      total += 1;
      if (n.employees.some((e) => e._id === empId && e.done)) done += 1;
    }
  }
  return { done, total };
}

interface EmpTask {
  _id: string;
  title: string;
  done: boolean;
  recurrence?: { frequency?: string; days?: number[] } | null;
  subtasks: EmpTask[];
}

function mapNodeForEmp(node: TaskNode, empId: string): EmpTask {
  return {
    _id: node._id,
    title: node.title,
    done: node.employees.some((e) => e._id === empId && e.done),
    recurrence: node.recurrence,
    subtasks: node.subtasks.map((s) => mapNodeForEmp(s, empId)),
  };
}

/* ───── Component ───── */

interface Props {
  userId: string;
  year: number;
  month: number;
}

export function ProgressContent({ userId: preUserId, year, month }: Props) {
  const { data: session } = useSession();
  const { isSuperAdmin, can: canPerm } = usePermissions();
  const isPrivileged = isSuperAdmin || canPerm("tasks_view") || canPerm("tasks_viewTeamProgress");

  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const [userId, setUserId] = useState(preUserId);
  const [employees, setEmployees] = useCachedState<DropdownEmp[]>("$tasks-inline/employees", []);

  const [campaignGroups, setCampaignGroups] = useState<CampaignGroup[]>([]);
  const [campaignGroupsLoading, setCampaignGroupsLoading] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  const [, setEmployee] = useState<EmployeeInfo | null>(null);
  const [dailyData, setDailyData] = useState<DailyEntry[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [timeline, setTimeline] = useState<TimelineLog[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineTotal, setTimelineTotal] = useState(0);
  const [timelinePage, setTimelinePage] = useState(1);

  const [dayCampaigns, setDayCampaigns] = useState<CampaignGroup[]>([]);
  const [dayDetail, setDayDetail] = useState<DetailGroup[]>([]);
  const [dayLoading, setDayLoading] = useState(false);

  useEffect(() => { setUserId(preUserId); }, [preUserId]);

  useEffect(() => {
    if (!isPrivileged && !preUserId && session?.user?.id) {
      setUserId(session.user.id);
    }
  }, [isPrivileged, preUserId, session?.user?.id]);

  useEffect(() => {
    setSelectedDay(null);
  }, [year, month]);

  const allMode = isPrivileged && !userId;

  /* ── Fetch employee list ── */
  useEffect(() => {
    if (!isPrivileged) return;
    const ac = new AbortController();
    fetch("/api/employees/dropdown", { signal: ac.signal })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setEmployees(Array.isArray(d) ? d : []))
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setEmployees([]); toast.error("Failed to load employees");
      });
    return () => ac.abort();
  }, [isPrivileged]);

  /* ── Fetch today's campaign-employee progress ── */
  useEffect(() => {
    if (!isPrivileged) { setCampaignGroups([]); return; }
    const ac = new AbortController();
    setCampaignGroupsLoading(true);
    fetch("/api/tasks/history?type=campaign-employees&days=1", { signal: ac.signal })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setCampaignGroups(d.campaigns || []))
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setCampaignGroups([]); toast.error("Failed to load campaigns");
      })
      .finally(() => setCampaignGroupsLoading(false));
    return () => ac.abort();
  }, [isPrivileged]);

  /* ── Fetch individual employee calendar data ── */
  const loadDaily = useCallback(async (signal?: AbortSignal) => {
    if (!userId) return;
    setDailyLoading(true);
    try {
      const params = new URLSearchParams({ type: "daily", year: String(year), month: String(month), userId });
      const res = await fetch(`/api/tasks/history?${params}`, { signal });
      if (res.ok) {
        const data = await res.json();
        setDailyData(Array.isArray(data) ? data : []);
      } else { setDailyData([]); toast.error("Failed to load daily data"); }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setDailyData([]); toast.error("Failed to load daily data");
    }
    setDailyLoading(false);
  }, [userId, year, month]);

  useEffect(() => {
    if (!userId) return;
    const ac = new AbortController();
    loadDaily(ac.signal);
    return () => ac.abort();
  }, [loadDaily, userId]);

  /* ── Fetch employee timeline (full month, no day selected) ── */
  const loadTimeline = useCallback(async (page: number, signal?: AbortSignal) => {
    if (!userId) return;
    setTimelineLoading(true);
    try {
      const daysInMonth = new Date(year, month, 0).getDate();
      const from = `${year}-${String(month).padStart(2, "0")}-01`;
      const to = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
      const params = new URLSearchParams({ type: "employee-timeline", userId, from, to, page: String(page), limit: "100" });
      const res = await fetch(`/api/tasks/history?${params}`, { signal });
      if (res.ok) {
        const data = await res.json();
        setEmployee(data.employee ?? null);
        setTimeline((prev) => page === 1 ? (data.logs ?? []) : [...prev, ...(data.logs ?? [])]);
        setTimelineTotal(data.total ?? 0);
        setTimelinePage(data.page ?? 1);
      } else {
        if (page === 1) { setTimeline([]); setTimelineTotal(0); }
        toast.error("Failed to load timeline");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error("Failed to load timeline");
    }
    setTimelineLoading(false);
  }, [userId, year, month]);

  useEffect(() => {
    if (!userId) return;
    const ac = new AbortController();
    loadTimeline(1, ac.signal);
    return () => ac.abort();
  }, [loadTimeline, userId]);

  /* ── Fetch day detail: campaign cards + activity events ── */
  const loadDayDetail = useCallback(async (signal?: AbortSignal) => {
    if (!userId || !selectedDay) {
      setDayCampaigns([]);
      setDayDetail([]);
      return;
    }
    setDayLoading(true);
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
    try {
      const [campRes, detailRes] = await Promise.all([
        fetch(`/api/tasks/history?type=campaign-employees&days=1&date=${dateStr}`, { signal }),
        fetch(`/api/tasks/history?type=detail&date=${dateStr}&userId=${userId}`, { signal }),
      ]);
      if (campRes.ok) {
        const d = await campRes.json();
        setDayCampaigns(d.campaigns || []);
      } else { setDayCampaigns([]); toast.error("Failed to load day campaigns"); }
      if (detailRes.ok) {
        const d = await detailRes.json();
        setDayDetail(Array.isArray(d) ? d : []);
      } else { setDayDetail([]); toast.error("Failed to load day details"); }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setDayCampaigns([]);
      setDayDetail([]);
      toast.error("Failed to load day details");
    }
    setDayLoading(false);
  }, [userId, selectedDay, year, month]);

  useEffect(() => {
    const ac = new AbortController();
    loadDayDetail(ac.signal);
    return () => ac.abort();
  }, [loadDayDetail]);

  /* ── Derived data ── */

  const deptGroups = useMemo(() => {
    const grouped = new Map<string, DeptGroup>();
    const ungrouped: DropdownEmp[] = [];
    for (const emp of employees) {
      if (emp.department) {
        const ex = grouped.get(emp.department.id);
        if (ex) ex.employees.push(emp);
        else grouped.set(emp.department.id, { id: emp.department.id, title: emp.department.title, employees: [emp] });
      } else ungrouped.push(emp);
    }
    const groups = [...grouped.values()].sort((a, b) => a.title.localeCompare(b.title));
    if (ungrouped.length > 0) groups.push({ id: "__none", title: "Unassigned", employees: ungrouped });
    for (const g of groups) g.employees.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return groups;
  }, [employees]);

  const empProgress = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const cg of campaignGroups) {
      for (const emp of employees) {
        const { done, total } = flatLeafCount(cg.tasks, emp._id);
        if (total === 0) continue;
        const prev = map.get(emp._id) || { done: 0, total: 0 };
        map.set(emp._id, { done: prev.done + done, total: prev.total + total });
      }
    }
    return map;
  }, [campaignGroups, employees]);

  const userCampaignCards = useMemo(() => {
    if (!userId || campaignGroups.length === 0) return [];
    return campaignGroups
      .map((cg) => {
        const tasks = cg.tasks.map((t) => mapNodeForEmp(t, userId));
        const total = tasks.length;
        if (total === 0) return null;
        return { campaignId: cg._id, campaignName: cg.name, tasks };
      })
      .filter(Boolean) as { campaignId: string; campaignName: string; tasks: EmpTask[] }[];
  }, [userId, campaignGroups]);

  const dailyMap = useMemo(() => {
    const m = new Map<number, DailyEntry>();
    for (const entry of dailyData) {
      const d = parseInt(entry.date.split("-")[2], 10);
      m.set(d, entry);
    }
    return m;
  }, [dailyData]);

  const filteredTimeline = useMemo(() => {
    if (selectedDay) return [];
    return timeline;
  }, [timeline, selectedDay]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, TimelineLog[]>();
    for (const log of filteredTimeline) {
      const d = new Date(log.changedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(log);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredTimeline]);

  const dayEventsMap = useMemo(() => {
    const map = new Map<string, DetailEvent[]>();
    for (const dg of dayDetail) {
      map.set(dg.campaign._id, dg.events);
    }
    return map;
  }, [dayDetail]);

  const dayCampaignCards = useMemo(() => {
    if (!selectedDay || !userId) return [];

    const seen = new Set<string>();
    const cards: { campaignId: string; campaignName: string; tasks: EmpTask[]; events: DetailEvent[] }[] = [];

    for (const cg of dayCampaigns) {
      seen.add(cg._id);
      const empTasks = cg.tasks.map((t) => mapNodeForEmp(t, userId));
      const events = dayEventsMap.get(cg._id) || [];
      cards.push({ campaignId: cg._id, campaignName: cg.name, tasks: empTasks, events });
    }

    for (const dg of dayDetail) {
      if (seen.has(dg.campaign._id)) continue;
      seen.add(dg.campaign._id);
      const taskMap = new Map<string, { title: string; done: boolean }>();
      for (const ev of dg.events) {
        if (!ev.task) continue;
        const existing = taskMap.get(ev.task._id);
        const isDone = ev.status === "completed" || ev.eventType === "checklistComplete";
        if (!existing) {
          taskMap.set(ev.task._id, { title: ev.task.title, done: isDone });
        } else {
          existing.done = isDone;
        }
      }
      const tasks: EmpTask[] = Array.from(taskMap.entries()).map(([id, t]) => ({
        _id: id, title: t.title, done: t.done, subtasks: [],
      }));
      cards.push({ campaignId: dg.campaign._id, campaignName: dg.campaign.name, tasks, events: dg.events });
    }

    return cards;
  }, [selectedDay, userId, dayCampaigns, dayDetail, dayEventsMap]);

  const selectEmployee = useCallback((uid: string) => {
    setUserId(uid);
    setSelectedDay(null);
  }, []);


  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ═══ Content ═══ */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* ── All Employees: Today's progress by department ── */}
          {allMode ? (
            <div className="flex-1 overflow-y-auto p-3">
              {campaignGroupsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[1, 2, 3].map((i) => <div key={i} className="shimmer h-48 rounded-xl" />)}
                </div>
              ) : deptGroups.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-[12px] font-medium" style={{ color: "var(--fg-tertiary)" }}>No employees found.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {deptGroups.map((dept) => {
                    const deptDone = dept.employees.reduce((s, e) => s + (empProgress.get(e._id)?.done ?? 0), 0);
                    const deptTotal = dept.employees.reduce((s, e) => s + (empProgress.get(e._id)?.total ?? 0), 0);
                    const deptPct = deptTotal > 0 ? Math.round((deptDone / deptTotal) * 100) : 0;
                    const deptBarColor = deptPct === 100 ? "var(--green)" : deptPct > 0 ? "var(--amber)" : "var(--fg-quaternary)";
                    return (
                      <motion.div key={dept.id}
                        className="flex flex-col rounded-xl border overflow-hidden h-56"
                        style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                        <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                          <h4 className="text-[12px] font-bold uppercase tracking-wider truncate flex-1" style={{ color: "var(--fg)" }}>{dept.title}</h4>
                          {deptTotal > 0 && (
                            <span className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums"
                              style={{ background: `color-mix(in srgb, ${deptBarColor} 15%, transparent)`, color: deptBarColor, border: `1px solid color-mix(in srgb, ${deptBarColor} 30%, var(--border))` }}>
                              {deptDone}/{deptTotal} · {deptPct}%
                            </span>
                          )}
                        </div>
                        {deptTotal > 0 && (
                          <div className="shrink-0 px-3 pt-1.5 pb-0.5">
                            <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "var(--bg)" }}>
                              <motion.div className="h-full rounded-full" style={{ background: deptBarColor }}
                                initial={{ width: 0 }} animate={{ width: `${deptPct}%` }} transition={{ duration: 0.4, ease: "easeOut" }} />
                            </div>
                          </div>
                        )}
                        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                          {dept.employees.map((emp) => {
                            const prog = empProgress.get(emp._id);
                            const done = prog?.done ?? 0;
                            const total = prog?.total ?? 0;
                            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                            const allDone = total > 0 && done >= total;
                            const barColor = allDone ? "var(--green)" : pct > 0 ? "var(--primary)" : "var(--fg-quaternary)";
                            return (
                              <button type="button" key={emp._id} onClick={() => selectEmployee(emp._id)}
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--hover-bg)]"
                                style={{ background: "var(--bg-grouped)" }}>
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: avatarColor(emp._id) }}>{initials(emp)}</span>
                                <span className="text-[11px] font-semibold truncate flex-1 min-w-0" style={{ color: "var(--fg)" }}>{nameOf(emp)}</span>
                                {total > 0 ? (
                                  <div className="shrink-0 flex items-center gap-1.5 w-20">
                                    <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: "var(--bg)" }}>
                                      <div className="h-full rounded-full" style={{ background: barColor, width: `${pct}%` }} />
                                    </div>
                                    <span className="text-[10px] font-bold tabular-nums w-7 text-right" style={{ color: barColor }}>{pct}%</span>
                                  </div>
                                ) : (
                                  <span className="shrink-0 text-[10px]" style={{ color: "var(--fg-quaternary)" }}>—</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* ── Individual Employee ── */
            <>
              {!isPrivileged && (
                <div className="shrink-0 p-3 border-b" style={{ borderColor: "var(--border)" }}>
                  <div className="max-w-xs mx-auto">
                    <MiniCalendar
                      compact year={year} month={month}
                      onPrevMonth={() => {}} onNextMonth={() => {}}
                      selectedDay={selectedDay} onSelectDay={(d) => setSelectedDay(d)}
                      loading={dailyLoading}
                      getDayMeta={(day) => {
                        const entry = dailyMap.get(day);
                        if (!entry || entry.totalEvents === 0) return { dotColor: "transparent" };
                        if (entry.completedCount > 0 && entry.undoneCount === 0) return { dotColor: "var(--green)" };
                        if (entry.undoneCount > 0 && entry.completedCount === 0) return { dotColor: "var(--amber)" };
                        if (entry.completedCount > 0) return { dotColor: "var(--green)" };
                        return { dotColor: "var(--fg-tertiary)" };
                      }}
                      showLegend legendItems={[{ label: "Completed", color: "var(--green)" }, { label: "Mixed", color: "var(--amber)" }]}
                    />
                  </div>
                </div>
              )}

              <div className="flex-1 min-w-0 overflow-y-auto">
                {/* ── Day selected: Campaign cards view ── */}
                {selectedDay ? (
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>
                        {MN[month - 1]} {selectedDay}, {year}
                      </h4>
                      <button type="button" onClick={() => setSelectedDay(null)} className="text-[12px] font-semibold transition-colors" style={{ color: "var(--primary)" }}>
                        Show full month
                      </button>
                    </div>

                    {dayLoading ? (
                      <div className="space-y-3">
                        {[1, 2].map((i) => (
                          <div key={i} className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                            <div className="p-3 space-y-2">
                              <div className="shimmer h-4 w-40 rounded" />
                              <div className="space-y-1.5">{[1, 2, 3].map((j) => <div key={j} className="shimmer h-8 rounded-lg" />)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : dayCampaignCards.length === 0 ? (
                      <div className="py-12 text-center">
                        <svg className="mx-auto mb-2 h-8 w-8" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <p className="text-[12px] font-medium" style={{ color: "var(--fg-tertiary)" }}>No campaigns found for this day.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {dayCampaignCards.map((card) => {
                          const doneCount = card.tasks.filter((t) => t.done).length;
                          const totalCount = card.tasks.length;
                          const allDone = totalCount > 0 && doneCount === totalCount;
                          const badgeColor = allDone ? "var(--green)" : doneCount > 0 ? "var(--amber)" : "var(--fg-tertiary)";

                          return (
                            <motion.div key={card.campaignId}
                              className="rounded-xl border overflow-hidden"
                              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                              {/* Campaign header */}
                              <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                                <span className="text-[12px] font-bold truncate flex-1" style={{ color: "var(--fg)" }}>{card.campaignName}</span>
                                <span className="pill-glass shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums"
                                  style={{
                                    background: `color-mix(in srgb, ${badgeColor} 15%, var(--dock-frosted-bg))`,
                                    color: badgeColor,
                                    border: `1px solid color-mix(in srgb, ${badgeColor} 30%, var(--border))`,
                                  }}>
                                  {doneCount}/{totalCount}
                                </span>
                              </div>

                              {/* Task cards */}
                              <div className="p-2 space-y-1">
                                {card.tasks.map((task) => (
                                  <div key={task._id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-grouped)", opacity: task.done ? 0.65 : 1 }}>
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md"
                                      style={{ background: task.done ? "color-mix(in srgb, var(--green) 14%, transparent)" : "color-mix(in srgb, var(--fg-tertiary) 8%, transparent)" }}>
                                      {task.done ? (
                                        <svg className="h-2.5 w-2.5" style={{ color: "var(--green)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" d="M5 13l4 4L19 7" /></svg>
                                      ) : (
                                        <svg className="h-2.5 w-2.5" style={{ color: "var(--fg-quaternary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                      )}
                                    </span>
                                    <span className="text-[12px] font-medium truncate flex-1" style={{ color: task.done ? "var(--fg-tertiary)" : "var(--fg)", textDecoration: task.done ? "line-through" : "none" }}>
                                      {task.title}
                                    </span>
                                    {task.recurrence && (
                                      <span className="shrink-0 rounded-full px-1.5 py-px text-[12px] font-semibold" style={{ background: "color-mix(in srgb, var(--purple) 12%, transparent)", color: "var(--purple)" }}>
                                        Recurring
                                      </span>
                                    )}
                                  </div>
                                ))}
                                {card.tasks.length === 0 && (
                                  <p className="text-[12px] py-1 px-2" style={{ color: "var(--fg-tertiary)" }}>No task data available</p>
                                )}
                              </div>

                              {/* Activity events */}
                              {card.events.length > 0 && (
                                <div className="border-t px-2 py-1.5 space-y-1" style={{ borderColor: "var(--border)" }}>
                                  <p className="text-[12px] font-bold uppercase tracking-wider px-1 mb-1" style={{ color: "var(--fg-tertiary)" }}>Activity</p>
                                  {card.events.map((ev) => {
                                    const meta = statusMeta(ev.status, ev.eventType);
                                    return (
                                      <div key={ev._id} className="flex items-center gap-2 px-1 py-0.5">
                                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full"
                                          style={{ background: `color-mix(in srgb, ${meta.color} 18%, transparent)` }}>
                                          <svg className="h-2 w-2" style={{ color: meta.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} /></svg>
                                        </span>
                                        <span className="inline-flex items-center rounded-full px-1 py-px text-[12px] font-semibold"
                                          style={{ background: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color }}>
                                          {meta.label}
                                        </span>
                                        {ev.task && <span className="text-[12px] truncate flex-1" style={{ color: "var(--fg-secondary)" }}>{ev.task.title}</span>}
                                        <span className="shrink-0 text-[12px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{fmtTime(ev.changedAt)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── No day selected: Campaign cards + collapsible timeline ── */
                  <div className="p-3 space-y-3">
                    {/* Campaign cards */}
                    {campaignGroupsLoading ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[1, 2, 3].map((i) => <div key={i} className="shimmer h-56 rounded-xl" />)}
                      </div>
                    ) : userCampaignCards.length === 0 ? (
                      <div className="py-8 text-center">
                        <svg className="mx-auto mb-2 h-8 w-8" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <p className="text-[12px] font-medium" style={{ color: "var(--fg-tertiary)" }}>No campaigns assigned.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {userCampaignCards.map((card) => {
                          const doneCount = card.tasks.filter((t) => t.done).length;
                          const totalCount = card.tasks.length;
                          const allDone = totalCount > 0 && doneCount === totalCount;
                          const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
                          const badgeColor = allDone ? "var(--green)" : doneCount > 0 ? "var(--amber)" : "var(--fg-tertiary)";
                          return (
                            <motion.div key={card.campaignId}
                              className="flex flex-col rounded-xl border overflow-hidden h-56"
                              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                              <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                                <span className="text-[12px] font-bold truncate flex-1" style={{ color: "var(--fg)" }}>{card.campaignName}</span>
                                <span className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums"
                                  style={{ background: `color-mix(in srgb, ${badgeColor} 15%, transparent)`, color: badgeColor, border: `1px solid color-mix(in srgb, ${badgeColor} 30%, var(--border))` }}>
                                  {doneCount}/{totalCount} · {pct}%
                                </span>
                              </div>
                              {totalCount > 0 && (
                                <div className="shrink-0 px-3 pt-1.5 pb-0.5">
                                  <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "var(--bg)" }}>
                                    <motion.div className="h-full rounded-full" style={{ background: badgeColor }}
                                      initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: "easeOut" }} />
                                  </div>
                                </div>
                              )}
                              <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                                {card.tasks.map((task) => (
                                  <div key={task._id} className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "var(--bg-grouped)", opacity: task.done ? 0.65 : 1 }}>
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md"
                                      style={{ background: task.done ? "color-mix(in srgb, var(--green) 14%, transparent)" : "color-mix(in srgb, var(--fg-tertiary) 8%, transparent)" }}>
                                      {task.done ? (
                                        <svg className="h-2.5 w-2.5" style={{ color: "var(--green)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" d="M5 13l4 4L19 7" /></svg>
                                      ) : (
                                        <svg className="h-2.5 w-2.5" style={{ color: "var(--fg-quaternary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                      )}
                                    </span>
                                    <span className="text-[11px] font-medium truncate flex-1" style={{ color: task.done ? "var(--fg-tertiary)" : "var(--fg)", textDecoration: task.done ? "line-through" : "none" }}>
                                      {task.title}
                                    </span>
                                    {task.recurrence && (
                                      <span className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold" style={{ background: "color-mix(in srgb, var(--purple) 12%, transparent)", color: "var(--purple)" }}>
                                        Recurring
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}

                    {/* Collapsible activity timeline */}
                    {timelineTotal > 0 && (
                      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
                        <button type="button" onClick={() => setTimelineOpen((p) => !p)}
                          className="flex w-full items-center gap-2 px-3 py-2 transition-colors hover:bg-[var(--hover-bg)]">
                          <svg className="h-3 w-3 shrink-0 transition-transform" style={{ color: "var(--fg-tertiary)", transform: timelineOpen ? "rotate(0deg)" : "rotate(-90deg)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M19 9l-7 7-7-7" /></svg>
                          <span className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>Activity</span>
                          <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--fg-tertiary)" }}>· {timelineTotal} event{timelineTotal !== 1 ? "s" : ""}</span>
                        </button>
                        <AnimatePresence>
                          {timelineOpen && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                              <div className="border-t px-3 pb-3" style={{ borderColor: "var(--border)" }}>
                                {timelineLoading ? (
                                  <div className="space-y-2 mt-2">
                                    {[1, 2, 3].map((i) => (
                                      <div key={i} className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--bg-grouped)" }}>
                                        <div className="shimmer h-3 w-3 rounded-full" />
                                        <div className="flex-1 space-y-1.5"><div className="shimmer h-3 w-52 rounded" /><div className="shimmer h-2.5 w-32 rounded" /></div>
                                      </div>
                                    ))}
                                  </div>
                                ) : groupedByDate.length === 0 ? (
                                  <p className="py-4 text-center text-[12px] font-medium" style={{ color: "var(--fg-tertiary)" }}>No activity this month.</p>
                                ) : (
                                  <div className="space-y-3 mt-2">
                                    {groupedByDate.map(([dateKey, logs]) => (
                                      <div key={dateKey}>
                                        <div className="flex items-center gap-2 mb-1.5 py-0.5">
                                          <span className="h-px flex-1" style={{ background: "var(--border)" }} />
                                          <span className="text-[12px] font-bold shrink-0" style={{ color: "var(--fg-tertiary)" }}>{fmtDate(dateKey)}</span>
                                          <span className="h-px flex-1" style={{ background: "var(--border)" }} />
                                        </div>
                                        <div className="space-y-1">
                                          {logs.map((log) => {
                                            const meta = statusMeta(log.status, log.eventType);
                                            return (
                                              <div key={log._id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-grouped)" }}>
                                                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                                                  style={{ background: `color-mix(in srgb, ${meta.color} 18%, transparent)` }}>
                                                  <svg className="h-2.5 w-2.5" style={{ color: meta.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} /></svg>
                                                </span>
                                                <span className="inline-flex items-center rounded-full px-1 py-px text-[12px] font-semibold"
                                                  style={{ background: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color }}>
                                                  {meta.label}
                                                </span>
                                                {log.task && <span className="text-[12px] font-medium truncate flex-1" style={{ color: "var(--fg-secondary)" }}>{log.task.title}</span>}
                                                <span className="shrink-0 text-[12px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{fmtTime(log.changedAt)}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                    {timelineTotal > filteredTimeline.length && (
                                      <div className="text-center py-1">
                                        <button type="button" onClick={() => loadTimeline(timelinePage + 1)} disabled={timelineLoading}
                                          className="text-[12px] font-semibold transition-colors disabled:opacity-50" style={{ color: "var(--primary)" }}>
                                          {timelineLoading ? "Loading…" : "Load more…"}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
