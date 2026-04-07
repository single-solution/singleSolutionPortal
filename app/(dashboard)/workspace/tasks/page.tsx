"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMemo, useState, useCallback, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@/lib/useQuery";

/* ─── types ─── */

type CampaignStatus = "active" | "paused" | "completed" | "cancelled";
interface Campaign { _id: string; name: string; status: CampaignStatus; tags: { employees: { _id: string; about: { firstName: string; lastName: string } }[]; departments: { _id: string; title: string }[]; teams: { _id: string; name: string }[] } }
interface Task { _id: string; title: string; description?: string; priority: string; status: string; deadline?: string; assignedTo?: { _id: string; about?: { firstName: string; lastName: string }; department?: { _id: string; title: string } | string }; createdAt: string }

type ViewMode = "all" | "by-status" | "by-assignee" | "by-campaign" | "by-priority";
type StatusFilter = "all" | "pending" | "inProgress" | "completed";

const PRIORITY_COLORS: Record<string, string> = { low: "var(--primary)", medium: "var(--amber)", high: "var(--rose)", urgent: "#ef4444" };
const PRIORITY_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
const TASK_STATUS_LABELS: Record<string, string> = { pending: "Pending", inProgress: "In Progress", completed: "Completed" };
const VIEW_LABELS: Record<ViewMode, string> = { all: "All Tasks", "by-status": "By Status", "by-assignee": "By Assignee", "by-campaign": "By Campaign", "by-priority": "By Priority" };
const VIEW_ICONS: Record<ViewMode, string> = {
  all: "M4 6h16M4 10h16M4 14h16M4 18h16",
  "by-status": "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  "by-assignee": "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
  "by-campaign": "M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z",
  "by-priority": "M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12",
};

function formatDate(d?: string) { if (!d) return "—"; return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function deptIdOf(a: Task["assignedTo"]): string | null { const d = a?.department; if (!d) return null; if (typeof d === "string") return d; if (typeof d === "object" && "_id" in d) return String((d as { _id: string })._id); return null; }

function primaryCampaignForTask(task: Task, campaigns: Campaign[]): Campaign | null {
  const aid = task.assignedTo?._id;
  const did = deptIdOf(task.assignedTo);
  for (const c of campaigns) {
    if (aid && c.tags.employees.some((e) => e._id === aid)) return c;
    if (did && c.tags.departments.some((d) => d._id === did)) return c;
  }
  return null;
}

function NavPill({ active, onClick, children, badge }: { active: boolean; onClick: () => void; children: ReactNode; badge?: number }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
      style={{ borderColor: active ? "var(--primary)" : "var(--border)", background: active ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--bg-elevated)", color: active ? "var(--primary)" : "var(--fg-secondary)" }}>
      {children}
      {badge !== undefined && <span className="tabular-nums rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>{badge}</span>}
    </button>
  );
}

/* ─── main ─── */

export default function TasksPage() {
  const { data: session, status: sessionStatus } = useSession();
  const role = session?.user?.role;
  const isAdmin = role === "superadmin" || role === "manager" || role === "teamLead";

  const { data: tasks, loading } = useQuery<Task[]>("/api/tasks", "workspace-tasks");
  const { data: campaigns } = useQuery<Campaign[]>("/api/campaigns", "workspace-campaigns");
  const taskList = useMemo(() => tasks ?? [], [tasks]);
  const campaignList = useMemo(() => campaigns ?? [], [campaigns]);

  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = taskList;
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => {
        const name = t.assignedTo?.about ? `${t.assignedTo.about.firstName} ${t.assignedTo.about.lastName}` : "";
        return t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q) || name.toLowerCase().includes(q);
      });
    }
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [taskList, statusFilter, search]);

  const grouped = useMemo(() => {
    if (viewMode === "all") return [{ key: "all", label: `All tasks (${filtered.length})`, items: filtered }];
    const map = new Map<string, Task[]>();
    const push = (key: string, t: Task) => { const arr = map.get(key) ?? []; arr.push(t); map.set(key, arr); };
    for (const t of filtered) {
      if (viewMode === "by-status") push(TASK_STATUS_LABELS[t.status] ?? t.status, t);
      else if (viewMode === "by-assignee") { const a = t.assignedTo?.about; push(a ? `${a.firstName} ${a.lastName}` : "Unassigned", t); }
      else if (viewMode === "by-priority") push(PRIORITY_LABELS[t.priority] ?? t.priority, t);
      else push(primaryCampaignForTask(t, campaignList)?.name ?? "No linked campaign", t);
    }
    return [...map.entries()].map(([label, items]) => ({ key: label, label: `${label} (${items.length})`, items })).sort((a, b) => a.key.localeCompare(b.key));
  }, [filtered, viewMode, campaignList]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = { all: taskList.length, pending: 0, inProgress: 0, completed: 0 };
    for (const t of taskList) m[t.status] = (m[t.status] ?? 0) + 1;
    return m;
  }, [taskList]);

  /* ── sidebar ── */
  const sidebar = (
    <div className="flex flex-col gap-1">
      <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Group by</p>
      {(Object.keys(VIEW_LABELS) as ViewMode[]).map((v) => (
        <button key={v} type="button" onClick={() => setViewMode(v)}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium transition-colors"
          style={{ background: viewMode === v ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent", color: viewMode === v ? "var(--primary)" : "var(--fg)" }}>
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={VIEW_ICONS[v]} /></svg>
          {VIEW_LABELS[v]}
        </button>
      ))}
      <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
        <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Filter by status</p>
        {(["all", "pending", "inProgress", "completed"] as StatusFilter[]).map((s) => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors"
            style={{ background: statusFilter === s ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "transparent", color: statusFilter === s ? "var(--primary)" : "var(--fg-secondary)" }}>
            {s === "all" ? "All statuses" : TASK_STATUS_LABELS[s]}
            <span className="tabular-nums text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{statusCounts[s] ?? 0}</span>
          </button>
        ))}
      </div>
    </div>
  );

  /* ── mobile pills ── */
  const mobilePills = (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {(["all", "pending", "inProgress", "completed"] as StatusFilter[]).map((s) => (
        <NavPill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} badge={statusCounts[s]}>
          {s === "all" ? "All" : TASK_STATUS_LABELS[s]}
        </NavPill>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 max-w-md">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks..." className="input w-full" style={{ paddingLeft: "40px" }} />
        </div>
        {sessionStatus !== "loading" && isAdmin && (
          <Link href="/tasks" className="btn btn-primary btn-sm shrink-0 justify-center sm:justify-start">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            New Task
          </Link>
        )}
      </div>

      <div className="mb-4 md:hidden">{mobilePills}</div>

      <div className="flex gap-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-20 frosted rounded-2xl p-3 max-h-[calc(100vh-140px)] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {sidebar}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="card-xl overflow-hidden">
            {loading ? (
              <div className="divide-y p-4" style={{ borderColor: "var(--border)" }}>
                {[1, 2, 3, 4, 5].map((i) => <div key={i} className="py-3"><div className="shimmer mb-2 h-3 w-1/3 rounded" /><div className="shimmer h-3 w-full rounded" /></div>)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center" style={{ color: "var(--fg-secondary)" }}>No tasks found.</div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {grouped.map((group) => (
                  <div key={group.key}>
                    {viewMode !== "all" && (
                      <div className="sticky top-0 z-[1] border-b px-4 py-2 text-xs font-semibold backdrop-blur-sm"
                        style={{ background: "color-mix(in srgb, var(--bg-elevated) 88%, transparent)", borderColor: "var(--border)", color: "var(--fg-secondary)" }}>
                        {group.label}
                      </div>
                    )}
                    <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] gap-3 border-b px-4 py-2 text-[10px] font-bold uppercase tracking-wide sm:grid"
                      style={{ borderColor: "var(--border)", color: "var(--fg-tertiary)" }}>
                      <span>Title</span><span>Assignee</span><span>Priority</span><span>Status</span><span>Deadline</span>
                    </div>
                    {group.items.map((task) => {
                      const name = task.assignedTo?.about ? `${task.assignedTo.about.firstName} ${task.assignedTo.about.lastName}` : "—";
                      const pc = PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)";
                      return (
                        <div key={task._id} className="grid grid-cols-1 gap-2 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] sm:items-center sm:gap-3" style={{ borderColor: "var(--border)" }}>
                          <div className="min-w-0"><p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>{task.title}</p>{task.description && <p className="mt-0.5 line-clamp-1 text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{task.description}</p>}</div>
                          <div className="text-[12px] sm:text-[13px]" style={{ color: "var(--fg)" }}><span className="sm:hidden text-[10px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>Assignee · </span>{name}</div>
                          <div><span className="sm:hidden text-[10px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>Priority · </span><span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `color-mix(in srgb, ${pc} 15%, transparent)`, color: pc }}>{PRIORITY_LABELS[task.priority] ?? task.priority}</span></div>
                          <div><span className="sm:hidden text-[10px] font-semibold uppercase" style={{ color: "var(--fg-tertiary)" }}>Status · </span><span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{
                            background: task.status === "completed" ? "rgba(48,209,88,0.12)" : task.status === "inProgress" ? "var(--primary-light)" : "var(--bg-grouped)",
                            color: task.status === "completed" ? "var(--teal)" : task.status === "inProgress" ? "var(--primary)" : "var(--fg-secondary)",
                          }}>{TASK_STATUS_LABELS[task.status] ?? task.status}</span></div>
                          <div className="tabular-nums text-[12px]" style={{ color: "var(--fg-tertiary)" }}><span className="sm:hidden text-[10px] font-semibold uppercase">Deadline · </span>{task.deadline ? formatDate(task.deadline) : "—"}</div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
