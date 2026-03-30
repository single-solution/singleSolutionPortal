"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SidebarModal from "../components/SidebarModal";
import { buttonHover, slideUpItem, staggerContainer } from "@/lib/motion";
import { useSession } from "next-auth/react";

interface Task {
  _id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  deadline?: string;
  assignedTo?: { _id: string; about?: { firstName: string; lastName: string }; email?: string; userRole?: string };
  createdAt: string;
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
const PRIORITY_COLORS: Record<string, string> = { low: "var(--primary)", medium: "var(--amber)", high: "var(--rose)", urgent: "#ef4444" };
const PRIORITY_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
const TASK_STATUS_LABELS: Record<string, string> = { pending: "Pending", inProgress: "In Progress", completed: "Completed" };

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", status: "pending", assignedTo: "", deadline: "" });

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
    return list;
  }, [tasks, prioFilter, search]);

  const pendingCount = useMemo(() => tasks.filter((t) => t.status === "pending").length, [tasks]);

  function openCreate() {
    setEditing(null);
    setForm({ title: "", description: "", priority: "medium", status: "pending", assignedTo: "", deadline: "" });
    setSidebarOpen(true);
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
    setSidebarOpen(true);
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
      setSidebarOpen(false);
      await load();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    await load();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2 flex-1"><div className="shimmer h-4 w-1/4 rounded" /><div className="shimmer h-7 w-1/3 rounded" /></div>
          <div className="shimmer h-9 w-28 rounded-full" />
        </div>
        <div className="shimmer h-10 w-64 rounded-xl" />
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="shimmer h-20 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <motion.div className="flex flex-col gap-4" variants={staggerContainer} initial="hidden" animate="visible">
      {/* Header */}
      <motion.div className="flex items-start justify-between gap-3" variants={slideUpItem}>
        <div>
          <h1 className="text-title"><span className="gradient-text">Tasks</span></h1>
          <p className="text-subhead mt-1">{tasks.length} total · {pendingCount} pending</p>
        </div>
        {isAdmin && (
          <motion.button type="button" whileHover={buttonHover} onClick={openCreate} className="btn btn-primary btn-sm shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Create Task
          </motion.button>
        )}
      </motion.div>

      {/* Search + Priority filter */}
      <motion.div className="flex flex-col gap-3" variants={slideUpItem}>
        <div className="relative max-w-xs">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks..." className="input text-sm" style={{ paddingLeft: "40px" }} />
        </div>
        <div className="flex items-center gap-0.5 rounded-xl border-[0.5px] p-0.5" style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)" }}>
          {(["all", "low", "medium", "high", "urgent"] as PriorityFilter[]).map((f) => {
            const active = prioFilter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setPrioFilter(f)}
                className={`px-2.5 py-1 rounded-[10px] text-xs font-medium transition-colors ${
                  active
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                }`}
              >
                {f === "all" ? "All" : PRIORITY_LABELS[f]}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Task cards */}
      <motion.div className="flex flex-col gap-3" variants={staggerContainer} initial="hidden" animate="visible">
        <AnimatePresence mode="popLayout">
          {filtered.map((task) => {
            const assignee = task.assignedTo;
            const gi = assignee ? stableHash(assignee._id ?? "") : 0;
            return (
              <motion.div key={task._id} variants={slideUpItem} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="card-static flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)" }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{task.title}</p>
                      <span className="text-caption rounded-md px-1.5 py-0.5 font-semibold" style={{ background: `color-mix(in srgb, ${PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)"} 15%, transparent)`, color: PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)" }}>
                        {PRIORITY_LABELS[task.priority] ?? task.priority}
                      </span>
                    </div>
                    {task.description && <p className="text-caption mt-1 line-clamp-1">{task.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {assignee?.about && (
                        <span className="flex items-center gap-1.5 text-caption">
                          <span className={`flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br text-[9px] font-bold text-white ${AVATAR_GRADIENTS[gi % AVATAR_GRADIENTS.length]}`}>
                            {initials(assignee.about.firstName, assignee.about.lastName)}
                          </span>
                          {assignee.about.firstName} {assignee.about.lastName}
                        </span>
                      )}
                      {task.deadline && (
                        <span className="text-caption tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                          Due {new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:shrink-0">
                  {!isAdmin && task.assignedTo?._id === session?.user?.id ? (
                    <select
                      className="badge cursor-pointer border-0 text-xs font-semibold"
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
                    <span className="badge shrink-0" style={{
                      background: task.status === "completed" ? "rgba(48,209,88,0.12)" : task.status === "inProgress" ? "var(--primary-light)" : "var(--glass-bg)",
                      color: task.status === "completed" ? "var(--teal)" : task.status === "inProgress" ? "var(--primary)" : "var(--fg-secondary)",
                    }}>
                      {TASK_STATUS_LABELS[task.status] ?? task.status}
                    </span>
                  )}
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openEdit(task)} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--primary)" }} title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </motion.button>
                      <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleDelete(task._id)} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--rose)" }} title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                      </motion.button>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {filtered.length === 0 && <p className="py-8 text-center text-callout" style={{ color: "var(--fg-tertiary)" }}>No tasks found</p>}
      </motion.div>

      {/* Create/Edit Sidebar */}
      <SidebarModal
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        title={editing ? "Edit Task" : "Create Task"}
        subtitle="Assign a new task to a team member."
      >
        <form id="task-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Title</label>
            <input className="input" placeholder="Task title..." required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Description</label>
            <textarea className="input" rows={3} placeholder="Describe the task..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {isAdmin && (
            <div>
              <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Assign To</label>
              <select className="input" required value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
                <option value="">Select employee</option>
                {employees.filter((e) => e.userRole !== "superadmin").map((e) => (
                  <option key={e._id} value={e._id}>{e.about.firstName} {e.about.lastName} — {DESIGNATION_LABELS[e.userRole] ?? e.userRole}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Priority</label>
              <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Deadline</label>
              <input className="input" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </div>
          </div>
          {editing && (
            <div>
              <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="pending">Pending</option>
                <option value="inProgress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          )}
          <motion.button type="submit" disabled={saving} className="btn btn-primary w-full" whileHover={buttonHover} whileTap={{ scale: 0.97 }}>
            {saving ? "Saving..." : editing ? "Update Task" : "Create Task"}
          </motion.button>
        </form>
      </SidebarModal>
    </motion.div>
  );
}
