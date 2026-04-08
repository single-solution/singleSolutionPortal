"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainerFast, cardVariants, cardHover } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Portal } from "../components/Portal";
import { useSession } from "next-auth/react";
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained for consistency / future use
const AVATAR_GRADIENTS = [
  "from-blue-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-purple-500 to-pink-400",
  "from-amber-500 to-orange-400",
  "from-rose-500 to-red-400",
  "from-indigo-500 to-blue-400",
  "from-green-500 to-lime-400",
  "from-fuchsia-500 to-purple-400",
];

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
  const isAdmin = session?.user?.isSuperAdmin === true;

  const [prioFilter, setPrioFilter] = useState<PriorityFilter>("all");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  // Centered modal for create/edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", status: "pending", assignedTo: "", deadline: "" });

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: tasks, loading: tasksLoading, refetch: refetchTasks } = useQuery<Task[]>("/api/tasks", "tasks");
  const { data: employeesRaw } = useQuery<Employee[]>(isAdmin ? "/api/employees/dropdown" : null, "employees");

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
        <div>
          <h1 className="text-title">Tasks</h1>
          <p className="text-subhead">
            {tasksLoading && !tasks ? (
              <span className="inline-block h-3 w-36 max-w-[50vw] rounded align-middle shimmer" aria-hidden />
            ) : (
              <>
                {taskList.length} total · {pendingCount} pending
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          {(["recent", "deadline", "priority"] as SortMode[]).map((s) => (
            <motion.button
              key={s}
              type="button"
              onClick={() => setSortMode(s)}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                sortMode === s
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
              }`}
            >
              {s === "recent" ? "Latest" : s === "deadline" ? "Deadline" : "Priority"}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Search + Create row */}
      <div className="card-static mb-4 flex items-center gap-3 p-4">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks..." className="input flex-1" style={{ paddingLeft: "40px" }} />
        </div>
        {sessionStatus !== "loading" && isAdmin && (
          <motion.button type="button" onClick={openCreate} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Create Task
          </motion.button>
        )}
      </div>

      {/* Priority filter */}
      <div data-tour="tasks-filters" className="mb-4 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          {(["all", "low", "medium", "high", "urgent"] as PriorityFilter[]).map((f) => {
            const active = prioFilter === f;
            return (
              <motion.button
                key={f}
                type="button"
                onClick={() => setPrioFilter(f)}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  active
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                }`}
              >
                {f === "all" ? "All" : PRIORITY_LABELS[f]}
              </motion.button>
            );
          })}
        </div>
        {(search || prioFilter !== "all") && (
          <button type="button" onClick={() => { setSearch(""); setPrioFilter("all"); }} className="text-xs font-medium transition-colors" style={{ color: "var(--primary)" }}>
            Clear
          </button>
        )}
      </div>

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
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="col-span-full card p-12 text-center"
            >
              <p style={{ color: "var(--fg-secondary)" }}>No tasks found.</p>
            </motion.div>
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
                        {!isAdmin && task.assignedTo?._id === session?.user?.id ? (
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
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
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
                      {isAdmin && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openEdit(task)} className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--primary)" }} title="Edit">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </motion.button>
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setDeleteTarget(task)} className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--rose)" }} title="Delete">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                          </motion.button>
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

      {/* Centered Glass Modal for Create/Edit Task */}
      <Portal>
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4"
            style={{ WebkitBackdropFilter: "saturate(200%) blur(24px)" }}
            onClick={() => setModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-lg shadow-2xl bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl overflow-hidden"
              style={{ WebkitBackdropFilter: "saturate(200%) blur(60px)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
                <div>
                  <h3 className="text-lg font-bold text-[var(--fg)]">{editing ? "Edit Task" : "Create Task"}</h3>
                  <p className="text-xs text-[var(--fg-secondary)] mt-0.5">
                    {editing ? "Update task details." : "Assign a new task to a team member."}
                  </p>
                </div>
                <button type="button" onClick={() => setModalOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-secondary)" }}>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSubmit} className="p-6 max-h-[70vh] overflow-y-auto">
                <motion.div
                  className="space-y-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                >
                  <div>
                    <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Title</label>
                    <input className="input" placeholder="Task title..." required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Description</label>
                    <textarea className="input" rows={3} placeholder="Describe the task..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  {isAdmin && (
                    <div>
                      <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Assign To</label>
                      <select className="input transition-colors duration-200" required value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
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
                      <select className="input transition-colors duration-200" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
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
                      <select className="input transition-colors duration-200" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        <option value="pending">Pending</option>
                        <option value="inProgress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  )}

                  {/* Modal Footer */}
                  <div className="flex gap-3 pt-2">
                    <motion.button
                      type="submit"
                      disabled={saving}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="btn btn-primary flex-1"
                    >
                      {saving ? "Saving..." : editing ? "Update Task" : "Create Task"}
                    </motion.button>
                    <button type="button" onClick={() => setModalOpen(false)} className="btn btn-secondary flex-1">
                      Cancel
                    </button>
                  </div>
                </motion.div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </Portal>

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
