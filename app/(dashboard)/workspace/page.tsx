"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { cardHover, cardVariants, staggerContainerFast, tabIndicatorTransition } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { useGuide } from "@/lib/useGuide";
import { workspaceTour } from "@/lib/tourConfigs";
import { Portal } from "../components/Portal";

type CampaignStatus = "active" | "paused" | "completed" | "cancelled";

interface TaggedEmployee {
  _id: string;
  about: { firstName: string; lastName: string };
  email: string;
  userRole: string;
}

interface TaggedDept {
  _id: string;
  title: string;
}

interface Campaign {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  status: CampaignStatus;
  startDate?: string;
  endDate?: string;
  budget?: string;
  tags: {
    employees: TaggedEmployee[];
    departments: TaggedDept[];
    teams: { _id: string; name: string }[];
  };
  notes?: string;
  isActive: boolean;
  createdBy?: { about: { firstName: string; lastName: string } };
  createdAt: string;
  updatedAt?: string;
}

interface Task {
  _id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  deadline?: string;
  assignedTo?: {
    _id: string;
    about?: { firstName: string; lastName: string };
    email?: string;
    userRole?: string;
    department?: { _id: string; title: string } | string;
  };
  createdAt: string;
  updatedAt?: string;
}

interface LogEntry {
  _id: string;
  userEmail: string;
  userName: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "var(--teal)", bg: "color-mix(in srgb, var(--teal) 12%, transparent)" },
  paused: { label: "Paused", color: "var(--amber)", bg: "color-mix(in srgb, var(--amber) 12%, transparent)" },
  completed: { label: "Completed", color: "var(--primary)", bg: "color-mix(in srgb, var(--primary) 12%, transparent)" },
  cancelled: { label: "Cancelled", color: "var(--rose)", bg: "color-mix(in srgb, var(--rose) 12%, transparent)" },
};

type StatusFilter = "all" | CampaignStatus;
type WorkspaceTab = "campaigns" | "tasks" | "updates";
type TaskGroupMode = "none" | "campaign" | "assignee" | "status";
type TaskStatusFilter = "all" | "pending" | "inProgress" | "completed";
type PriorityFilter = "all" | "low" | "medium" | "high" | "urgent";

const PRIORITY_COLORS: Record<string, string> = {
  low: "var(--primary)",
  medium: "var(--amber)",
  high: "var(--rose)",
  urgent: "#ef4444",
};
const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};
const TASK_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  inProgress: "In Progress",
  completed: "Completed",
};

function formatDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function deptIdOf(assignee: Task["assignedTo"]): string | null {
  const d = assignee?.department;
  if (!d) return null;
  if (typeof d === "string") return d;
  if (typeof d === "object" && d && "_id" in d) return String((d as { _id: string })._id);
  return null;
}

function tasksLinkedToCampaign(c: Campaign, tasks: Task[]): Task[] {
  const empIds = new Set(c.tags.employees.map((e) => e._id));
  const deptIds = new Set(c.tags.departments.map((d) => d._id));
  return tasks.filter((t) => {
    const aid = t.assignedTo?._id;
    if (aid && empIds.has(aid)) return true;
    const did = deptIdOf(t.assignedTo);
    return !!(did && deptIds.has(did));
  });
}

function campaignProgress(c: Campaign, tasks: Task[]): { done: number; total: number; pct: number } {
  const linked = tasksLinkedToCampaign(c, tasks);
  const total = linked.length;
  const done = linked.filter((t) => t.status === "completed").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, pct };
}

function primaryCampaignForTask(task: Task, campaigns: Campaign[]): Campaign | null {
  const aid = task.assignedTo?._id;
  const did = deptIdOf(task.assignedTo);
  for (const c of campaigns) {
    if (aid && c.tags.employees.some((e) => e._id === aid)) return c;
    if (did && c.tags.departments.some((d) => d._id === did)) return c;
  }
  return null;
}

function logAvatarLabel(log: LogEntry) {
  const n = (log.userName || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
    return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
  }
  const email = log.userEmail || "?";
  return email.slice(0, 2).toUpperCase();
}

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "campaigns", label: "Campaigns" },
  { id: "tasks", label: "Tasks" },
  { id: "updates", label: "Updates" },
];

export default function WorkspacePage() {
  const { data: session, status: sessionStatus } = useSession();
  const { registerTour } = useGuide();
  useEffect(() => { registerTour("workspace", workspaceTour); }, [registerTour]);
  const role = session?.user?.role;
  const isAdmin =
    role === "superadmin" || role === "manager" || role === "teamLead";

  const [tab, setTab] = useState<WorkspaceTab>("campaigns");

  const { data: campaigns, loading: campaignsLoading } = useQuery<Campaign[]>("/api/campaigns", "workspace-campaigns");
  const { data: tasks, loading: tasksLoading } = useQuery<Task[]>("/api/tasks", "workspace-tasks");
  const {
    data: logsPayload,
    loading: logsLoading,
    refetch: refetchLogs,
  } = useQuery<{ logs: LogEntry[] }>("/api/activity-logs?limit=50", "workspace-activity");

  const campaignList = useMemo(() => campaigns ?? [], [campaigns]);
  const taskList = useMemo(() => tasks ?? [], [tasks]);
  const logs = logsPayload?.logs ?? [];

  useEffect(() => {
    if (tab !== "updates") return;
    const handler = () => {
      if (document.visibilityState === "visible") void refetchLogs();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [tab, refetchLogs]);

  /* ── Campaigns ── */
  const [campSearch, setCampSearch] = useState("");
  const [campStatus, setCampStatus] = useState<StatusFilter>("all");
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {
      all: campaignList.length,
      active: 0,
      paused: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const c of campaignList) m[c.status] = (m[c.status] ?? 0) + 1;
    return m;
  }, [campaignList]);

  const filteredCampaigns = useMemo(() => {
    let list = campaignList;
    if (campStatus !== "all") list = list.filter((c) => c.status === campStatus);
    if (campSearch.trim()) {
      const q = campSearch.toLowerCase();
      list = list.filter((c) =>
        `${c.name} ${c.description ?? ""} ${c.tags.employees.map((e) => `${e.about.firstName} ${e.about.lastName}`).join(" ")} ${c.tags.departments.map((d) => d.title).join(" ")}`
          .toLowerCase()
          .includes(q),
      );
    }
    return [...list].sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime());
  }, [campaignList, campStatus, campSearch]);

  /* ── Tasks ── */
  const [taskSearch, setTaskSearch] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>("all");
  const [prioFilter, setPrioFilter] = useState<PriorityFilter>("all");
  const [groupMode, setGroupMode] = useState<TaskGroupMode>("none");

  const filteredTasks = useMemo(() => {
    let list = taskList;
    if (taskStatusFilter !== "all") list = list.filter((t) => t.status === taskStatusFilter);
    if (prioFilter !== "all") list = list.filter((t) => t.priority === prioFilter);
    if (taskSearch.trim()) {
      const q = taskSearch.toLowerCase();
      list = list.filter((t) => {
        const name = t.assignedTo?.about ? `${t.assignedTo.about.firstName} ${t.assignedTo.about.lastName}` : "";
        return (
          t.title.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          name.toLowerCase().includes(q)
        );
      });
    }
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [taskList, taskStatusFilter, prioFilter, taskSearch]);

  const groupedTasks = useMemo(() => {
    if (groupMode === "none") return [{ key: "all", label: "All tasks", items: filteredTasks }];

    const map = new Map<string, Task[]>();
    const push = (key: string, t: Task) => {
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    };

    for (const t of filteredTasks) {
      if (groupMode === "status") {
        push(TASK_STATUS_LABELS[t.status] ?? t.status, t);
      } else if (groupMode === "assignee") {
        const a = t.assignedTo?.about;
        const label = a ? `${a.firstName} ${a.lastName}` : "Unassigned";
        push(label, t);
      } else {
        const c = primaryCampaignForTask(t, campaignList);
        push(c?.name ?? "No linked campaign", t);
      }
    }

    return [...map.entries()]
      .map(([label, items]) => ({
        key: label,
        label,
        items: [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredTasks, groupMode, campaignList]);

  return (
    <div className="flex flex-col gap-0 pb-24">
      <div className="mb-4">
        <h1 className="text-title">Workspace</h1>
        <p className="text-subhead" style={{ color: "var(--fg-secondary)" }}>
          Campaigns, tasks, and team activity in one place.
        </p>
      </div>

      {/* Section tabs */}
      <div className="card-xl mb-4 p-1.5 sm:p-2">
        <LayoutGroup id="workspace-section-tabs">
          <div
            className="relative flex w-full flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center"
            style={{ borderColor: "var(--border-strong)" }}
          >
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className="relative flex-1 rounded-lg px-3 py-2.5 text-center text-sm font-semibold transition-colors sm:flex-initial sm:px-5 sm:py-2"
                  style={{ color: active ? "var(--primary)" : "var(--fg-secondary)" }}
                >
                  {active && (
                    <motion.span
                      layoutId="workspace-tab-pill"
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: "var(--primary-light)",
                        border: "0.5px solid color-mix(in srgb, var(--primary) 25%, transparent)",
                        boxShadow: "inset 0 0.5px 0 var(--glass-border-inner, rgba(255,255,255,0.06))",
                      }}
                      transition={tabIndicatorTransition}
                    />
                  )}
                  <span className="relative z-[1]">{t.label}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>
      </div>

      <AnimatePresence mode="wait">
        {tab === "campaigns" && (
          <motion.div
            key="campaigns"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-4"
          >
            <div className="card-xl flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <svg
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: "var(--fg-tertiary)" }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  value={campSearch}
                  onChange={(e) => setCampSearch(e.target.value)}
                  placeholder="Search campaigns..."
                  className="input w-full"
                  style={{ paddingLeft: "40px" }}
                />
              </div>
              {sessionStatus !== "loading" && (
                <Link href="/campaigns" className="btn btn-primary btn-sm shrink-0 justify-center sm:justify-start">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  New Campaign
                </Link>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                className="flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5"
                style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}
              >
                {(["all", "active", "paused", "completed", "cancelled"] as StatusFilter[]).map((s) => (
                  <motion.button
                    key={s}
                    type="button"
                    onClick={() => setCampStatus(s)}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all whitespace-nowrap ${
                      campStatus === s ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                    }`}
                  >
                    {s === "all" ? `All (${statusCounts.all})` : `${STATUS_CONFIG[s].label} (${statusCounts[s] ?? 0})`}
                  </motion.button>
                ))}
              </div>
              {(campSearch || campStatus !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setCampSearch("");
                    setCampStatus("all");
                  }}
                  className="text-xs font-medium transition-colors"
                  style={{ color: "var(--primary)" }}
                >
                  Clear
                </button>
              )}
            </div>

            <motion.div
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              variants={staggerContainerFast}
              initial="hidden"
              animate="visible"
            >
              <AnimatePresence mode="popLayout">
                {campaignsLoading && !campaigns ? (
                  [1, 2, 3, 4, 5, 6].map((i) => (
                    <motion.div key={`c-skel-${i}`} variants={cardVariants} custom={i} className="h-full">
                      <div className="card-xl flex h-full flex-col overflow-hidden p-3">
                        <div className="shimmer h-4 w-3/4 rounded" />
                        <div className="mt-2 shimmer h-2 w-1/2 rounded" />
                        <div className="mt-3 shimmer h-2 w-full rounded" />
                      </div>
                    </motion.div>
                  ))
                ) : filteredCampaigns.length === 0 ? (
                  <motion.div
                    key="c-empty"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card-xl col-span-full p-12 text-center"
                  >
                    <p style={{ color: "var(--fg-secondary)" }}>No campaigns match your filters.</p>
                  </motion.div>
                ) : (
                  filteredCampaigns.map((c, i) => {
                    const sc = STATUS_CONFIG[c.status];
                    const { done, total, pct } = campaignProgress(c, taskList);
                    const isSelected = selectedCampaign?._id === c._id;

                    return (
                      <motion.button
                        key={c._id}
                        type="button"
                        variants={cardVariants}
                        custom={i}
                        whileHover={cardHover}
                        layout
                        onClick={() => setSelectedCampaign(isSelected ? null : c)}
                        className={`h-full text-left ${isSelected ? "ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--bg)]" : ""}`}
                        style={{ borderRadius: "var(--radius-xl, 1rem)" }}
                      >
                        <div
                          className={`card-xl flex h-full flex-col overflow-hidden transition-opacity ${c.isActive === false ? "opacity-60 grayscale" : ""}`}
                        >
                          <div className="flex flex-1 flex-col p-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: "var(--fg)" }}>
                                {c.name}
                              </p>
                              <span
                                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                                style={{ background: sc.bg, color: sc.color }}
                              >
                                {sc.label}
                              </span>
                            </div>
                            <div className="mt-1.5 text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                              {formatDate(c.startDate)} — {formatDate(c.endDate)}
                            </div>

                            {(c.tags.departments.length > 0 || c.tags.employees.length > 0) && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {c.tags.departments.map((d) => (
                                  <span
                                    key={d._id}
                                    className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                    style={{
                                      background: "color-mix(in srgb, var(--primary) 10%, transparent)",
                                      color: "var(--primary)",
                                    }}
                                  >
                                    {d.title}
                                  </span>
                                ))}
                                {c.tags.employees.map((e) => (
                                  <span
                                    key={e._id}
                                    className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                    style={{
                                      background: "color-mix(in srgb, var(--purple) 10%, transparent)",
                                      color: "var(--purple)",
                                    }}
                                  >
                                    {e.about.firstName} {e.about.lastName}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="mt-3">
                              <div className="mb-1 flex items-center justify-between text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
                                <span>Task progress</span>
                                <span className="tabular-nums">
                                  {total === 0 ? "No linked tasks" : `${done}/${total} done`}
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bg-grouped)" }}>
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{ background: "var(--teal)" }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${total === 0 ? 0 : pct}%` }}
                                  transition={{ type: "spring", stiffness: 200, damping: 28 }}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="border-t px-3 py-2 text-[10px]" style={{ borderColor: "var(--border)", color: "var(--fg-tertiary)" }}>
                            Tap for details
                          </div>
                        </div>
                      </motion.button>
                    );
                  })
                )}
              </AnimatePresence>
            </motion.div>

            {/* Inline expand on small screens */}
            <AnimatePresence>
              {selectedCampaign && (
                <motion.div
                  key="inline-detail"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden lg:hidden"
                >
                  <div className="card-xl mt-2 space-y-3 p-4">
                    <CampaignDetailBody c={selectedCampaign} taskList={taskList} onClose={() => setSelectedCampaign(null)} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {tab === "tasks" && (
          <motion.div
            key="tasks"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-4"
          >
            <div className="card-xl flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <svg
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: "var(--fg-tertiary)" }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  placeholder="Search tasks..."
                  className="input w-full"
                  style={{ paddingLeft: "40px" }}
                />
              </div>
              {sessionStatus !== "loading" && isAdmin && (
                <Link href="/tasks" className="btn btn-primary btn-sm shrink-0 justify-center sm:justify-start">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  New Task
                </Link>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div
                className="flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5"
                style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}
              >
                {(["all", "pending", "inProgress", "completed"] as TaskStatusFilter[]).map((s) => (
                  <motion.button
                    key={s}
                    type="button"
                    onClick={() => setTaskStatusFilter(s)}
                    whileTap={{ scale: 0.97 }}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                      taskStatusFilter === s ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                    }`}
                  >
                    {s === "all" ? "All statuses" : TASK_STATUS_LABELS[s] ?? s}
                  </motion.button>
                ))}
              </div>
              <div
                className="flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5"
                style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}
              >
                {(["all", "low", "medium", "high", "urgent"] as PriorityFilter[]).map((f) => (
                  <motion.button
                    key={f}
                    type="button"
                    onClick={() => setPrioFilter(f)}
                    whileTap={{ scale: 0.97 }}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                      prioFilter === f ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                    }`}
                  >
                    {f === "all" ? "All priority" : PRIORITY_LABELS[f]}
                  </motion.button>
                ))}
              </div>
              <div
                className="flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5"
                style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}
              >
                {(
                  [
                    ["none", "None"],
                    ["campaign", "Campaign"],
                    ["assignee", "Assignee"],
                    ["status", "Status"],
                  ] as const
                ).map(([id, label]) => (
                  <motion.button
                    key={id}
                    type="button"
                    onClick={() => setGroupMode(id)}
                    whileTap={{ scale: 0.97 }}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                      groupMode === id ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                    }`}
                  >
                    {label}
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="card-xl overflow-hidden">
              {tasksLoading && !tasks ? (
                <div className="divide-y p-4" style={{ borderColor: "var(--border)" }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="py-3">
                      <div className="shimmer mb-2 h-3 w-1/3 rounded" />
                      <div className="shimmer h-3 w-full rounded" />
                    </div>
                  ))}
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="p-12 text-center" style={{ color: "var(--fg-secondary)" }}>
                  No tasks found.
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {groupedTasks.map((group) => (
                    <div key={group.key}>
                      {groupMode !== "none" && (
                        <div
                          className="sticky top-0 z-[1] border-b px-4 py-2 text-xs font-semibold backdrop-blur-sm"
                          style={{
                            background: "color-mix(in srgb, var(--bg-elevated) 88%, transparent)",
                            borderColor: "var(--border)",
                            color: "var(--fg-secondary)",
                          }}
                        >
                          {group.label}
                          <span className="ml-2 tabular-nums font-normal opacity-80">({group.items.length})</span>
                        </div>
                      )}
                      {/* Header row — desktop table */}
                      <div
                        className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] gap-3 border-b px-4 py-2 text-[10px] font-bold uppercase tracking-wide sm:grid"
                        style={{ borderColor: "var(--border)", color: "var(--fg-tertiary)" }}
                      >
                        <span>Title</span>
                        <span>Assignee</span>
                        <span>Priority</span>
                        <span>Status</span>
                        <span>Deadline</span>
                      </div>
                      {group.items.map((task) => {
                        const assignee = task.assignedTo;
                        const name = assignee?.about ? `${assignee.about.firstName} ${assignee.about.lastName}` : "—";
                        const prioColor = PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)";
                        return (
                          <div
                            key={task._id}
                            className="grid grid-cols-1 gap-2 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] sm:items-center sm:gap-3"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>
                                {task.title}
                              </p>
                              {task.description && (
                                <p className="mt-0.5 line-clamp-1 text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                                  {task.description}
                                </p>
                              )}
                            </div>
                            <div className="text-[12px] sm:text-[13px]" style={{ color: "var(--fg)" }}>
                              <span className="sm:hidden text-[10px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>
                                Assignee ·{" "}
                              </span>
                              {name}
                            </div>
                            <div>
                              <span className="sm:hidden text-[10px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>
                                Priority ·{" "}
                              </span>
                              <span
                                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                style={{
                                  background: `color-mix(in srgb, ${prioColor} 15%, transparent)`,
                                  color: prioColor,
                                }}
                              >
                                {PRIORITY_LABELS[task.priority] ?? task.priority}
                              </span>
                            </div>
                            <div>
                              <span className="sm:hidden text-[10px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>
                                Status ·{" "}
                              </span>
                              <span
                                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                style={{
                                  background:
                                    task.status === "completed"
                                      ? "rgba(48,209,88,0.12)"
                                      : task.status === "inProgress"
                                        ? "var(--primary-light)"
                                        : "var(--bg-grouped)",
                                  color:
                                    task.status === "completed"
                                      ? "var(--teal)"
                                      : task.status === "inProgress"
                                        ? "var(--primary)"
                                        : "var(--fg-secondary)",
                                }}
                              >
                                {TASK_STATUS_LABELS[task.status] ?? task.status}
                              </span>
                            </div>
                            <div className="tabular-nums text-[12px]" style={{ color: "var(--fg-tertiary)" }}>
                              <span className="sm:hidden text-[10px] font-semibold uppercase">Deadline · </span>
                              {task.deadline ? formatDate(task.deadline) : "—"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {tab === "updates" && (
          <motion.div
            key="updates"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-4"
          >
            <div className="card-xl flex items-center justify-between gap-3 p-4">
              <div>
                <h2 className="text-headline text-base">Activity</h2>
                <p className="text-footnote" style={{ color: "var(--fg-tertiary)" }}>
                  Refreshes when you return to this tab or the page becomes visible.
                </p>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => void refetchLogs()}
                className="btn btn-sm shrink-0"
                style={{ borderColor: "var(--border-strong)" }}
              >
                Refresh
              </motion.button>
            </div>

            <motion.div
              className="card-xl relative overflow-hidden p-0"
              variants={staggerContainerFast}
              initial="hidden"
              animate="visible"
            >
              {logsLoading && !logsPayload ? (
                <div className="divide-y p-4" style={{ borderColor: "var(--border)" }}>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="flex gap-3 py-3">
                      <div className="shimmer h-10 w-10 shrink-0 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <div className="shimmer h-3 w-2/3 rounded" />
                        <div className="shimmer h-2.5 w-1/3 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : logs.length === 0 ? (
                <div className="p-12 text-center text-sm" style={{ color: "var(--fg-tertiary)" }}>
                  No activity yet.
                </div>
              ) : (
                <div className="relative pl-4 pr-4 pt-2 pb-4">
                  <div
                    className="absolute bottom-4 left-[27px] top-4 w-px sm:left-[31px]"
                    style={{ background: "var(--border-strong)" }}
                    aria-hidden
                  />
                  <ul className="relative space-y-0">
                    {logs.map((log, i) => (
                      <motion.li
                        key={log._id}
                        variants={cardVariants}
                        custom={i}
                        className="relative flex gap-3 py-3 pl-10 sm:pl-12"
                      >
                        <div
                          className="absolute left-0 top-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold sm:left-1 sm:h-10 sm:w-10 sm:text-[11px]"
                          style={{
                            background: "color-mix(in srgb, var(--primary) 14%, transparent)",
                            color: "var(--primary)",
                            border: "2px solid var(--bg-elevated)",
                          }}
                        >
                          {logAvatarLabel(log)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] leading-snug" style={{ color: "var(--fg)" }}>
                            <span className="font-semibold">{log.userName?.trim() || log.userEmail}</span>{" "}
                            <span style={{ color: "var(--fg-secondary)" }}>{log.action}</span>
                            {log.details && log.entity !== "security" && (
                              <span className="block text-[12px] font-normal mt-0.5 line-clamp-2" style={{ color: "var(--fg-tertiary)" }}>
                                {log.details}
                              </span>
                            )}
                          </p>
                          <p className="mt-1 text-[11px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                            {timeAgo(log.createdAt)} · {new Date(log.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide-in detail — large screens */}
      <Portal>
        <AnimatePresence>
          {selectedCampaign && (
            <motion.div
              key="camp-panel"
              className="fixed inset-0 z-[70] hidden lg:flex lg:justify-end"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.button
                type="button"
                aria-label="Close panel"
                className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedCampaign(null)}
              />
              <motion.aside
                className="relative flex h-full w-full max-w-md flex-col border-l shadow-2xl"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 320, damping: 34 }}
              >
                <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
                  <h2 className="text-headline truncate text-base pr-2">{selectedCampaign.name}</h2>
                  <button
                    type="button"
                    onClick={() => setSelectedCampaign(null)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-[var(--hover-bg)]"
                    style={{ color: "var(--fg-secondary)" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <CampaignDetailBody c={selectedCampaign} taskList={taskList} onClose={() => setSelectedCampaign(null)} />
                </div>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}

function CampaignDetailBody({
  c,
  taskList,
  onClose,
}: {
  c: Campaign;
  taskList: Task[];
  onClose: () => void;
}) {
  const sc = STATUS_CONFIG[c.status];
  const linked = tasksLinkedToCampaign(c, taskList);
  const { done, total, pct } = campaignProgress(c, taskList);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase" style={{ background: sc.bg, color: sc.color }}>
          {sc.label}
        </span>
        {c.isActive === false && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
            Inactive
          </span>
        )}
      </div>
      <div className="text-sm" style={{ color: "var(--fg-secondary)" }}>
        <span className="font-medium" style={{ color: "var(--fg-tertiary)" }}>
          Duration:{" "}
        </span>
        {formatDate(c.startDate)} — {formatDate(c.endDate)}
      </div>
      {c.description && (
        <p className="text-sm leading-relaxed" style={{ color: "var(--fg)" }}>
          {c.description}
        </p>
      )}
      {c.budget && (
        <p className="text-sm">
          <span style={{ color: "var(--fg-tertiary)" }}>Budget: </span>
          <span className="font-medium" style={{ color: "var(--fg)" }}>
            {c.budget}
          </span>
        </p>
      )}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--fg-tertiary)" }}>
          Progress
        </p>
        <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-grouped)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${total === 0 ? 0 : pct}%`, background: "var(--teal)" }} />
        </div>
        <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>
          {total === 0 ? "No tasks linked via tagged people or departments." : `${done} of ${total} linked tasks completed.`}
        </p>
      </div>
      {(c.tags.departments.length > 0 || c.tags.employees.length > 0) && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--fg-tertiary)" }}>
            Tags
          </p>
          <div className="flex flex-wrap gap-1">
            {c.tags.departments.map((d) => (
              <span
                key={d._id}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--primary)" }}
              >
                {d.title}
              </span>
            ))}
            {c.tags.employees.map((e) => (
              <span
                key={e._id}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: "color-mix(in srgb, var(--purple) 10%, transparent)", color: "var(--purple)" }}
              >
                {e.about.firstName} {e.about.lastName}
              </span>
            ))}
          </div>
        </div>
      )}
      {c.notes && (
        <p className="text-sm italic" style={{ color: "var(--fg-secondary)" }}>
          {c.notes}
        </p>
      )}
      {linked.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--fg-tertiary)" }}>
            Linked tasks
          </p>
          <ul className="space-y-2">
            {linked.slice(0, 12).map((t) => (
              <li key={t._id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate" style={{ color: "var(--fg)" }}>
                  {t.title}
                </span>
                <span className="shrink-0 text-[10px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>
                  {TASK_STATUS_LABELS[t.status] ?? t.status}
                </span>
              </li>
            ))}
          </ul>
          {linked.length > 12 && (
            <p className="mt-2 text-xs" style={{ color: "var(--fg-tertiary)" }}>
              +{linked.length - 12} more
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-2">
        <Link href="/campaigns" onClick={onClose} className="btn btn-primary btn-sm">
          Open Campaigns
        </Link>
        <Link href="/tasks" onClick={onClose} className="btn btn-sm" style={{ borderColor: "var(--border-strong)" }}>
          View Tasks
        </Link>
      </div>
    </div>
  );
}
