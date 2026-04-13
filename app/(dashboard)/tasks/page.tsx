"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainerFast, cardVariants, cardHover } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SearchField, SegmentedControl, PageHeader, EmptyState, ModalShell } from "../components/ui";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { useGuide } from "@/lib/useGuide";
import { tasksTour } from "@/lib/tourConfigs";

interface Task {
  _id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  deadline?: string;
  assignedTo?: { _id: string; about?: { firstName: string; lastName: string }; email?: string; department?: { _id: string; title: string } | string };
  createdAt: string;
  updatedAt?: string;
}

interface Employee {
  _id: string;
  about: { firstName: string; lastName: string };
  email: string;
}

type PriorityFilter = "all" | "low" | "medium" | "high" | "urgent";
type SortMode = "recent" | "deadline" | "priority";
const PRIORITY_COLORS: Record<string, string> = { low: "var(--primary)", medium: "var(--amber)", high: "var(--rose)", urgent: "#ef4444" };
const PRIORITY_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
const TASK_STATUS_LABELS: Record<string, string> = { pending: "Pending", inProgress: "In Progress", completed: "Completed" };
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export default function TasksPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { registerTour } = useGuide();
  useEffect(() => { registerTour("tasks", tasksTour); }, [registerTour]);
  const { can: canPerm, canAny: canAnyPerm } = usePermissions();
  const canCreateTasks = canPerm("tasks_create");
  const canEditTasks = canPerm("tasks_edit");
  const canDeleteTasks = canPerm("tasks_delete");
  const canManageTasks = canAnyPerm("tasks_create", "tasks_edit");
  const canViewTasks = canPerm("tasks_view");
  const canAssignTasks = canPerm("tasks_reassign");

  const [prioFilter, setPrioFilter] = useState<PriorityFilter>("all");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", status: "pending", assignedTo: "", deadline: "" });

  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: tasks, loading: tasksLoading, refetch: refetchTasks } = useQuery<Task[]>(canViewTasks ? "/api/tasks" : null, "tasks");
  const { data: employeesRaw } = useQuery<Employee[]>(canAssignTasks ? "/api/employees/dropdown" : null, "employees");

  const taskList = tasks ?? [];
  const employees = employeesRaw ?? [];

  const filtered = useMemo(() => {
    let list = taskList;
    if (prioFilter !== "all") list = list.filter((t) => t.priority === prioFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => {
        const name = t.assignedTo?.about ? `${t.assignedTo.about.firstName} ${t.assignedTo.about.lastName}` : "";
        return t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q) || name.toLowerCase().includes(q);
      });
    }
    if (sortMode === "deadline") {
      list = [...list].sort((a, b) => {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      });
    } else if (sortMode === "priority") {
      list = [...list].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4));
    } else {
      list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return list;
  }, [taskList, prioFilter, search, sortMode]);

  const pendingCount = useMemo(() => taskList.filter((t) => t.status === "pending").length, [taskList]);

  const taskInsights = useMemo(() => {
    const now = Date.now();
    const weekEnd = new Date(); weekEnd.setHours(23, 59, 59); weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
    let overdue = 0, dueSoon = 0, dueThisWeek = 0, noDeadline = 0;
    let low = 0, medium = 0, high = 0, urgent = 0;
    let inProgress = 0, completed = 0, unassigned = 0;
    let assignedToMe = 0, createdByMe = 0;
    let completedThisWeek = 0, completedThisMonth = 0;
    const deptCounts = new Map<string, number>();
    const cal = new Date();
    const dow = cal.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const weekStartCal = new Date(cal);
    weekStartCal.setDate(weekStartCal.getDate() + mondayOffset);
    weekStartCal.setHours(0, 0, 0, 0);
    const weekEndCal = new Date(weekStartCal);
    weekEndCal.setDate(weekEndCal.getDate() + 7);
    weekEndCal.setMilliseconds(-1);
    const monthStart = new Date(cal.getFullYear(), cal.getMonth(), 1, 0, 0, 0, 0);
    const monthEnd = new Date(cal.getFullYear(), cal.getMonth() + 1, 0, 23, 59, 59, 999);
    const userId = session?.user?.id;
    for (const t of taskList) {
      if (t.status === "inProgress") inProgress++;
      if (t.status === "completed") completed++;
      if (t.status === "completed") {
        const doneAt = t.updatedAt ?? t.createdAt;
        if (doneAt) {
          const ts = new Date(doneAt).getTime();
          if (ts >= weekStartCal.getTime() && ts <= weekEndCal.getTime()) completedThisWeek++;
          if (ts >= monthStart.getTime() && ts <= monthEnd.getTime()) completedThisMonth++;
        }
      }
      if (t.deadline) {
        const dl = new Date(t.deadline).getTime();
        if (t.status !== "completed") {
          if (dl < now) overdue++;
          else if (dl - now < 2 * 86400000) dueSoon++;
          if (dl <= weekEnd.getTime() && dl >= now) dueThisWeek++;
        }
      } else if (t.status !== "completed") noDeadline++;
      if (t.priority === "low") low++;
      else if (t.priority === "medium") medium++;
      else if (t.priority === "high") high++;
      else if (t.priority === "urgent") urgent++;
      if (!t.assignedTo) unassigned++;
      if (userId && t.assignedTo?._id === userId) assignedToMe++;
      if (userId && (t as unknown as { createdBy?: { _id?: string } }).createdBy?._id === userId) createdByMe++;
      const dep = t.assignedTo?.department;
      if (dep) {
        const title = typeof dep === "string" ? dep : dep.title;
        if (title) deptCounts.set(title, (deptCounts.get(title) ?? 0) + 1);
      }
    }
    const deptBreakdown = [...deptCounts.entries()]
      .map(([dept, count]) => ({ dept, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    const completionRate = taskList.length > 0 ? Math.round((completed / taskList.length) * 100) : 0;
    return {
      overdue, dueSoon, dueThisWeek, noDeadline, low, medium, high, urgent, highUrgent: high + urgent, inProgress, completed, unassigned, assignedToMe, createdByMe, completionRate,
      deptBreakdown, completedThisWeek, completedThisMonth,
    };
  }, [taskList, session?.user?.id]);

  function openCreate() {
    setEditing(null);
    setForm({ title: "", description: "", priority: "medium", status: "pending", assignedTo: "", deadline: "" });
    setModalOpen(true);
  }

  function openEdit(task: Task) {
    setEditing(task);
    setForm({
      title: task.title,
      description: task.description ?? "",
      priority: task.priority,
      status: task.status,
      assignedTo: task.assignedTo?._id ?? "",
      deadline: task.deadline ? new Date(task.deadline).toISOString().split("T")[0] : "",
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, deadline: form.deadline || undefined };
      if (editing) {
        await fetch(`/api/tasks/${editing._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      setModalOpen(false);
      await refetchTasks();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/tasks/${deleteTarget._id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await refetchTasks();
    } catch { /* ignore */ }
    setDeleting(false);
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Header: title left, sort right */}
      <div data-tour="tasks-header" className="mb-4 flex items-center justify-between gap-3">
        <PageHeader
          title="Tasks"
          loading={tasksLoading && !tasks}
          subtitle={`${taskList.length} total · ${pendingCount} pending · ${taskInsights.inProgress} working · ${taskInsights.completionRate}% done${taskInsights.overdue > 0 ? ` · ${taskInsights.overdue} overdue` : ""}`}
          shimmerWidth="w-36"
        />
        <SegmentedControl
          value={sortMode}
          onChange={setSortMode}
          options={[
            { value: "recent" as SortMode, label: "Latest" },
            { value: "deadline" as SortMode, label: "Deadline" },
            { value: "priority" as SortMode, label: "Priority" },
          ]}
        />
      </div>

      {/* Search + Create row */}
      <div className="card-static mb-4 flex items-center gap-3 p-4">
        <SearchField value={search} onChange={setSearch} placeholder="Search tasks..." />
        {sessionStatus !== "loading" && canCreateTasks && (
          <motion.button type="button" onClick={openCreate} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Create Task
          </motion.button>
        )}
      </div>

      {/* Priority filter */}
      <div data-tour="tasks-filters" className="mb-4 flex items-center gap-2 flex-wrap">
        <SegmentedControl
          value={prioFilter}
          onChange={setPrioFilter}
          options={[
            { value: "all" as PriorityFilter, label: "All" },
            { value: "low" as PriorityFilter, label: PRIORITY_LABELS.low },
            { value: "medium" as PriorityFilter, label: PRIORITY_LABELS.medium },
            { value: "high" as PriorityFilter, label: PRIORITY_LABELS.high },
            { value: "urgent" as PriorityFilter, label: PRIORITY_LABELS.urgent },
          ]}
        />
        {(search || prioFilter !== "all") && (
          <button type="button" onClick={() => { setSearch(""); setPrioFilter("all"); }} className="text-xs font-medium transition-colors" style={{ color: "var(--primary)" }}>
            Clear
          </button>
        )}
      </div>

      {/* Insights strip */}
      {!tasksLoading && taskList.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold" style={{ color: "var(--fg-tertiary)" }}>
          {taskInsights.overdue > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--rose) 12%, transparent)", color: "var(--rose)" }}>{taskInsights.overdue} overdue</span>}
          {taskInsights.dueSoon > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--amber) 12%, transparent)", color: "var(--amber)" }}>{taskInsights.dueSoon} due soon</span>}
          {taskInsights.dueThisWeek > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{taskInsights.dueThisWeek} due this week</span>}
          {taskInsights.highUrgent > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--rose) 8%, transparent)", color: "var(--rose)" }}>{taskInsights.highUrgent} high/urgent</span>}
          {taskInsights.unassigned > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{taskInsights.unassigned} unassigned</span>}
          {taskInsights.noDeadline > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{taskInsights.noDeadline} no deadline</span>}
          {taskInsights.deptBreakdown.map(({ dept, count }) => (
            <span key={dept} className="max-w-[140px] truncate rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }} title={`${dept}: ${count}`}>{count} {dept}</span>
          ))}
          {taskInsights.completedThisWeek > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--green) 10%, transparent)", color: "var(--green)" }}>{taskInsights.completedThisWeek} done this week</span>}
          {taskInsights.completedThisMonth > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--green) 10%, transparent)", color: "var(--green)" }}>{taskInsights.completedThisMonth} done this month</span>}
          {taskInsights.assignedToMe > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--primary)" }}>{taskInsights.assignedToMe} assigned to me</span>}
          {taskInsights.createdByMe > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>{taskInsights.createdByMe} created by me</span>}
          {taskInsights.completed > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--green) 10%, transparent)", color: "var(--green)" }}>{taskInsights.completed} completed</span>}
          <span className="rounded-full px-2 py-0.5" style={{ background: "var(--bg-grouped)" }}>L:{taskInsights.low} M:{taskInsights.medium} H:{taskInsights.high} U:{taskInsights.urgent}</span>
        </div>
      )}

      {/* Task Card Grid */}
      <motion.div data-tour="tasks-grid" className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" variants={staggerContainerFast} initial="hidden" animate="visible">
        <AnimatePresence mode="popLayout">
          {tasksLoading && !tasks ? (
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
              <motion.div key={`skel-${i}`} variants={cardVariants} custom={i} className="h-full">
                <div className="card flex h-full flex-col overflow-hidden">
                  <div className="flex-1 p-2.5">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="shimmer h-4 w-12 rounded-full" />
                      <div className="shimmer h-4 w-16 rounded-full" />
                    </div>
                    <div className="shimmer h-3.5 w-full max-w-[180px] rounded" />
                    <div className="shimmer mt-0.5 h-2.5 w-full max-w-[140px] rounded" />
                    <div className="mt-1.5 space-y-0.5">
                      <div className="shimmer h-2.5 w-28 rounded" />
                      <div className="flex items-center gap-1">
                        <div className="shimmer h-2.5 w-2.5 rounded" />
                        <div className="shimmer h-2.5 w-24 rounded" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t px-2.5 py-1.5" style={{ borderColor: "var(--border)" }}>
                    <div className="shimmer h-2.5 w-20 rounded" />
                    <div className="flex items-center gap-1">
                      <div className="shimmer h-6 w-6 rounded-lg" />
                      <div className="shimmer h-6 w-6 rounded-lg" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          ) : filtered.length === 0 ? (
            <div className="col-span-full">
              <EmptyState message="No tasks found." />
            </div>
          ) : (
            filtered.map((task, i) => {
              const assignee = task.assignedTo;
              const prioColor = PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)";
              return (
                <motion.div
                  key={task._id}
                  variants={cardVariants}
                  custom={i}
                  whileHover={cardHover}
                  layout
                  layoutId={task._id}
                  className="h-full"
                  exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                  transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
                >
                  <div className="card group relative overflow-hidden flex h-full flex-col">
                    <div className="p-2.5 flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ background: `color-mix(in srgb, ${prioColor} 15%, transparent)`, color: prioColor }}>
                          {PRIORITY_LABELS[task.priority] ?? task.priority}
                        </span>
                        {!canManageTasks && task.assignedTo?._id === session?.user?.id ? (
                          <select
                            className="rounded-full px-2 py-0.5 text-[9px] font-semibold cursor-pointer border-0 bg-transparent transition-colors duration-200"
                            style={{
                              background: task.status === "completed" ? "rgba(48,209,88,0.12)" : task.status === "inProgress" ? "var(--primary-light)" : "var(--bg-grouped)",
                              color: task.status === "completed" ? "var(--teal)" : task.status === "inProgress" ? "var(--primary)" : "var(--fg-secondary)",
                            }}
                            value={task.status}
                            onChange={async (e) => {
                              await fetch(`/api/tasks/${task._id}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: e.target.value }),
                              });
                              await refetchTasks();
                            }}
                          >
                            <option value="pending">Pending</option>
                            <option value="inProgress">In Progress</option>
                            <option value="completed">Completed</option>
                          </select>
                        ) : (
                          <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold transition-colors duration-200" style={{
                            background: task.status === "completed" ? "rgba(48,209,88,0.12)" : task.status === "inProgress" ? "var(--primary-light)" : "var(--bg-grouped)",
                            color: task.status === "completed" ? "var(--teal)" : task.status === "inProgress" ? "var(--primary)" : "var(--fg-secondary)",
                          }}>
                            {TASK_STATUS_LABELS[task.status] ?? task.status}
                          </span>
                        )}
                      </div>

                      <p className="text-[13px] font-semibold truncate" style={{ color: "var(--fg)" }}>{task.title}</p>
                      {task.description && <p className="text-[10px] mt-1 line-clamp-1">{task.description}</p>}

                      <div className="mt-1.5 space-y-0.5 text-[11px]">
                        {assignee?.about && (
                          <div className="flex items-center gap-1 text-[11px]">
                            <span className="font-medium" style={{ color: "var(--fg)" }}>{assignee.about.firstName} {assignee.about.lastName}</span>
                            {assignee.email && (
                              <>
                                <span style={{ color: "var(--fg-tertiary)" }}>·</span>
                                <span className="truncate" style={{ color: "var(--fg-tertiary)" }}>{assignee.email}</span>
                              </>
                            )}
                          </div>
                        )}
                        {task.deadline && (
                          <div className="flex items-center gap-1.5">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                            <span className="tabular-nums text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
                              {new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer: date left, actions right (matches employee card) */}
                    <div className="flex items-center justify-between px-2.5 py-1.5 border-t" style={{ borderColor: "var(--border)" }}>
                      <span className="text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                        {task.updatedAt && task.updatedAt !== task.createdAt
                          ? `Updated ${new Date(task.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                          : new Date(task.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      {(canEditTasks || canDeleteTasks) && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          {canEditTasks && (
                            <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openEdit(task)} className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--primary)" }} title="Edit">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            </motion.button>
                          )}
                          {canDeleteTasks && (
                            <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setDeleteTarget(task)} className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--rose)" }} title="Delete">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                            </motion.button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </motion.div>

      {/* Create/Edit Task Modal */}
      <ModalShell
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Task" : "Create Task"}
        subtitle={editing ? "Update task details." : "Assign a new task to a team member."}
        footer={<>
          <motion.button type="submit" form="task-form" disabled={saving} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary flex-1">
            {saving ? "Saving..." : editing ? "Update Task" : "Create Task"}
          </motion.button>
          <button type="button" onClick={() => setModalOpen(false)} className="btn btn-secondary flex-1">Cancel</button>
        </>}
      >
        <form id="task-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Title</label>
            <input className="input" placeholder="Task title..." required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Description</label>
            <textarea className="input" rows={3} placeholder="Describe the task..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {canAssignTasks && (
            <div>
              <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Assign To</label>
              <select className="input" required value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
                <option value="">Select employee</option>
                {employees.map((e) => (
                  <option key={e._id} value={e._id}>{e.about.firstName} {e.about.lastName}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Priority</label>
              <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Deadline</label>
              <input className="input" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </div>
          </div>
          {editing && (
            <div>
              <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="pending">Pending</option>
                <option value="inProgress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          )}
        </form>
      </ModalShell>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Task"
        description={`Delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
