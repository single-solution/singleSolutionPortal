"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Portal } from "../components/Portal";
import { useSession } from "next-auth/react";

interface Task {
  _id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  deadline?: string;
  assignedTo?: { _id: string; about?: { firstName: string; lastName: string }; email?: string; userRole?: string; department?: { _id: string; title: string } | string };
  createdAt: string;
  updatedAt?: string;
}

interface Employee {
  _id: string;
  about: { firstName: string; lastName: string };
  email: string;
  userRole: string;
}

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

const DESIGNATION_LABELS: Record<string, string> = {
  manager: "Manager", businessDeveloper: "Business Developer", developer: "Developer",
};

type PriorityFilter = "all" | "low" | "medium" | "high" | "urgent";
type SortMode = "recent" | "deadline" | "priority";
const PRIORITY_COLORS: Record<string, string> = { low: "var(--primary)", medium: "var(--amber)", high: "var(--rose)", urgent: "#ef4444" };
const PRIORITY_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
const TASK_STATUS_LABELS: Record<string, string> = { pending: "Pending", inProgress: "In Progress", completed: "Completed" };
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

function stableHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

export default function TasksPage() {
  const { data: session } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
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

  const isAdmin = session?.user?.role === "superadmin" || session?.user?.role === "manager";

  const load = useCallback(async () => {
    const [taskRes, empRes] = await Promise.all([
      fetch("/api/tasks").then((r) => r.json()),
      isAdmin ? fetch("/api/employees").then((r) => r.json()) : Promise.resolve([]),
    ]);
    setTasks(Array.isArray(taskRes) ? taskRes : []);
    setEmployees(Array.isArray(empRes) ? empRes : []);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = tasks;
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
  }, [tasks, prioFilter, search, sortMode]);

  const pendingCount = useMemo(() => tasks.filter((t) => t.status === "pending").length, [tasks]);

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
      await load();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/tasks/${deleteTarget._id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await load();
    } catch { /* ignore */ }
    setDeleting(false);
  }

  if (loading) {
    return (
      <motion.div
        className="flex flex-col gap-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="shimmer h-8 w-32 rounded" />
            <div className="shimmer h-4 w-44 rounded" />
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
            <div className="shimmer h-7 w-14 rounded-md" />
            <div className="shimmer h-7 w-20 rounded-md" />
            <div className="shimmer h-7 w-14 rounded-md" />
          </div>
        </div>
        <div className="card-static mb-4 flex items-center gap-3 p-4">
          <div className="relative h-10 flex-1">
            <div className="shimmer h-10 w-full rounded-lg" />
          </div>
          <div className="shimmer h-9 w-36 shrink-0 rounded-lg" />
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="shimmer h-7 w-16 rounded-md" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card card-shine flex h-full flex-col overflow-hidden">
              <div className="flex-1 p-3 sm:p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="shimmer h-5 w-16 rounded-full" />
                  <div className="shimmer h-5 w-24 rounded-full" />
                </div>
                <div className="shimmer h-4 w-full max-w-[220px] rounded" />
                <div className="shimmer mt-1 h-3 w-full max-w-sm rounded" />
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="shimmer h-6 w-6 shrink-0 rounded-full" />
                    <div className="min-w-0 space-y-1">
                      <div className="shimmer h-3 w-32 rounded" />
                      <div className="shimmer h-3 w-24 rounded" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="shimmer h-3 w-3 rounded" />
                    <div className="shimmer h-3 w-36 rounded" />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t px-3 py-2.5 sm:px-4" style={{ borderColor: "var(--border)" }}>
                <div className="shimmer h-3 w-28 rounded" />
                <div className="flex items-center gap-1">
                  <div className="shimmer h-7 w-7 rounded-lg" />
                  <div className="shimmer h-7 w-7 rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex flex-col gap-0"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header: title left, sort right */}
      <motion.div
        className="flex items-center justify-between gap-3 mb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="text-title">Tasks</h1>
          <p className="text-subhead hidden sm:block">{tasks.length} total · {pendingCount} pending</p>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          {(["recent", "deadline", "priority"] as SortMode[]).map((s) => (
            <motion.button
              key={s}
              type="button"
              onClick={() => setSortMode(s)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
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
      </motion.div>

      {/* Search + Create row */}
      <motion.div
        className="card-static p-4 mb-4 flex gap-3 items-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks..." className="input flex-1" style={{ paddingLeft: "40px" }} />
        </div>
        {isAdmin && (
          <motion.button type="button" onClick={openCreate} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Create Task
          </motion.button>
        )}
      </motion.div>

      {/* Priority filter */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          {(["all", "low", "medium", "high", "urgent"] as PriorityFilter[]).map((f) => {
            const active = prioFilter === f;
            return (
              <motion.button
                key={f}
                type="button"
                onClick={() => setPrioFilter(f)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
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
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
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
              const gi = assignee ? stableHash(assignee._id ?? "") : 0;
              const grad = AVATAR_GRADIENTS[gi % AVATAR_GRADIENTS.length];
              const prioColor = PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)";
              return (
                <motion.div
                  key={task._id}
                  layout
                  className="h-full"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <div className="card card-shine group relative overflow-hidden flex h-full flex-col">
                    <div className="p-3 sm:p-4 flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${prioColor} 15%, transparent)`, color: prioColor }}>
                          {PRIORITY_LABELS[task.priority] ?? task.priority}
                        </span>
                        {!isAdmin && task.assignedTo?._id === session?.user?.id ? (
                          <select
                            className="rounded-full px-2 py-0.5 text-[11px] font-semibold cursor-pointer border-0 bg-transparent transition-colors duration-200"
                            style={{
                              background: task.status === "completed" ? "rgba(48,209,88,0.12)" : task.status === "inProgress" ? "var(--primary-light)" : "var(--glass-bg)",
                              color: task.status === "completed" ? "var(--teal)" : task.status === "inProgress" ? "var(--primary)" : "var(--fg-secondary)",
                            }}
                            value={task.status}
                            onChange={async (e) => {
                              await fetch(`/api/tasks/${task._id}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: e.target.value }),
                              });
                              await load();
                            }}
                          >
                            <option value="pending">Pending</option>
                            <option value="inProgress">In Progress</option>
                            <option value="completed">Completed</option>
                          </select>
                        ) : (
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors duration-200" style={{
                            background: task.status === "completed" ? "rgba(48,209,88,0.12)" : task.status === "inProgress" ? "var(--primary-light)" : "var(--glass-bg)",
                            color: task.status === "completed" ? "var(--teal)" : task.status === "inProgress" ? "var(--primary)" : "var(--fg-secondary)",
                          }}>
                            {TASK_STATUS_LABELS[task.status] ?? task.status}
                          </span>
                        )}
                      </div>

                      <p className="font-semibold" style={{ color: "var(--fg)" }}>{task.title}</p>
                      {task.description && <p className="text-caption mt-1 line-clamp-2">{task.description}</p>}

                      <div className="mt-3 space-y-1.5 text-[13px]">
                        {assignee?.about && (
                          <div className="flex items-center gap-2">
                            <span className={`flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white ${grad}`}>
                              {initials(assignee.about.firstName, assignee.about.lastName)}
                            </span>
                            <div className="min-w-0">
                              <span className="font-medium" style={{ color: "var(--fg)" }}>{assignee.about.firstName} {assignee.about.lastName}</span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {assignee.userRole && (
                                  <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{DESIGNATION_LABELS[assignee.userRole] ?? assignee.userRole}</span>
                                )}
                                {assignee.department && typeof assignee.department === "object" && "title" in assignee.department && (
                                  <>
                                    <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>·</span>
                                    <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{assignee.department.title}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        {task.deadline && (
                          <div className="flex items-center gap-1.5">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                            <span className="tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                              {new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer: date left, actions right (matches employee card) */}
                    <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-t" style={{ borderColor: "var(--border)" }}>
                      <span className="text-[11px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                        {task.updatedAt && task.updatedAt !== task.createdAt
                          ? `Updated ${new Date(task.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                          : new Date(task.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      {isAdmin && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openEdit(task)} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--primary)" }} title="Edit">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </motion.button>
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setDeleteTarget(task)} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--rose)" }} title="Delete">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
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
      </div>

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
              className="w-full max-w-lg shadow-2xl bg-[var(--glass-bg-heavy)] backdrop-blur-3xl border border-[var(--glass-border)] rounded-3xl overflow-hidden"
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
                        {employees.filter((e) => e.userRole !== "superadmin").map((e) => (
                          <option key={e._id} value={e._id}>{e.about.firstName} {e.about.lastName} — {DESIGNATION_LABELS[e.userRole] ?? e.userRole}</option>
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
    </motion.div>
  );
}
