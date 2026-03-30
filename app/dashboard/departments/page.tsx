"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StatusToggle } from "../components/DataTable";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface Employee {
  _id: string;
  about: { firstName: string; lastName: string };
  userRole: string;
}

interface Department {
  _id: string;
  title: string;
  slug: string;
  description?: string;
  manager?: { _id: string; about: { firstName: string; lastName: string } };
  employeeCount: number;
  isActive: boolean;
  createdAt: string;
}

const DEPT_GRADIENTS = [
  "from-blue-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-purple-500 to-pink-400",
  "from-amber-500 to-orange-400",
  "from-rose-500 to-red-400",
  "from-indigo-500 to-blue-400",
];

type SortMode = "most" | "name";

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [managers, setManagers] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("most");

  // Inline add
  const [newTitle, setNewTitle] = useState("");
  const [addingSaving, setAddingSaving] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editManagerId, setEditManagerId] = useState("");

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const [deptRes, empRes] = await Promise.all([
      fetch("/api/departments").then((r) => r.json()),
      fetch("/api/employees").then((r) => r.json()),
    ]);
    setDepartments(Array.isArray(deptRes) ? deptRes : []);
    const emps: Employee[] = Array.isArray(empRes) ? empRes : [];
    setManagers(emps.filter((e) => e.userRole === "manager"));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalEmployees = useMemo(() => departments.reduce((s, d) => s + (d.employeeCount || 0), 0), [departments]);

  const sorted = useMemo(() => {
    const list = [...departments];
    if (sortMode === "name") list.sort((a, b) => a.title.localeCompare(b.title));
    else list.sort((a, b) => b.employeeCount - a.employeeCount);
    return list;
  }, [departments, sortMode]);

  async function handleQuickAdd() {
    if (!newTitle.trim()) return;
    setAddingSaving(true);
    try {
      await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), description: "", managerId: "" }),
      });
      setNewTitle("");
      await load();
    } catch { /* ignore */ }
    setAddingSaving(false);
  }

  function startEdit(dept: Department) {
    setEditingId(dept._id);
    setEditTitle(dept.title);
    setEditDescription(dept.description ?? "");
    setEditManagerId(dept.manager?._id ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(dept: Department) {
    if (!editTitle.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/departments/${dept._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), description: editDescription, managerId: editManagerId }),
      });
      setEditingId(null);
      await load();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/departments/${deleteTarget._id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await load();
    } catch { /* ignore */ }
    setDeleting(false);
  }

  async function toggleActive(dept: Department) {
    await fetch(`/api/departments/${dept._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !dept.isActive }),
    });
    await load();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="space-y-2"><div className="shimmer h-5 w-28 rounded" /><div className="shimmer h-8 w-40 rounded" /></div>
          <div className="shimmer h-9 w-36 rounded-lg" />
        </div>
        <div className="shimmer h-12 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => <div key={i} className="shimmer h-40 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between gap-3 mb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="text-title">Departments</h1>
          <p className="text-subhead hidden sm:block">{departments.length} department{departments.length !== 1 ? "s" : ""} · {totalEmployees} team member{totalEmployees !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          {(["most", "name"] as SortMode[]).map((s) => (
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
              {s === "most" ? "Most Employees" : "Name"}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Inline Add Row */}
      <motion.div
        className="card-static p-4 mb-4 flex gap-3 items-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleQuickAdd()}
          placeholder="New department name..."
          className="input flex-1"
        />
        <motion.button
          type="button"
          onClick={handleQuickAdd}
          disabled={addingSaving || !newTitle.trim()}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="btn btn-primary btn-sm shrink-0"
        >
          {addingSaving ? "Adding..." : "Add Department"}
        </motion.button>
      </motion.div>

      {/* Department Card Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {sorted.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full card p-12 text-center">
              <p style={{ color: "var(--fg-secondary)" }}>No departments yet. Add one above.</p>
            </motion.div>
          ) : sorted.map((dept, i) => {
            const pct = totalEmployees > 0 ? Math.round((dept.employeeCount / totalEmployees) * 100) : 0;
            const grad = DEPT_GRADIENTS[i % DEPT_GRADIENTS.length];
            const isEditing = editingId === dept._id;

            return (
              <motion.div
                key={dept._id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.3) }}
              >
                <div className="card group relative overflow-hidden">
                  <div className="p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white ${grad}`}>
                        {dept.title.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input
                            autoFocus
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(dept);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            disabled={saving}
                            className="input text-sm py-1 w-full"
                          />
                        ) : (
                          <>
                            <p className="font-semibold truncate" style={{ color: "var(--fg)" }}>{dept.title}</p>
                            <p className="text-caption truncate mt-0.5">
                              {dept.manager ? `${dept.manager.about.firstName} ${dept.manager.about.lastName}` : "No manager"}
                            </p>
                          </>
                        )}
                      </div>
                      {/* Hover actions */}
                      {!isEditing && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => startEdit(dept)} className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ color: "var(--primary)" }} title="Edit">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </motion.button>
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setDeleteTarget(dept)} className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ color: "var(--rose)" }} title="Delete">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                          </motion.button>
                        </div>
                      )}
                    </div>

                    {/* Inline edit fields for description + manager */}
                    <AnimatePresence>
                      {isEditing && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 space-y-2.5 overflow-hidden"
                        >
                          <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="Description (optional)"
                            rows={2}
                            className="input text-sm w-full"
                          />
                          <select
                            value={editManagerId}
                            onChange={(e) => setEditManagerId(e.target.value)}
                            className="input text-sm w-full"
                          >
                            <option value="">No manager</option>
                            {managers.map((m) => <option key={m._id} value={m._id}>{m.about.firstName} {m.about.lastName}</option>)}
                          </select>
                          <div className="flex gap-2">
                            <motion.button
                              type="button"
                              onClick={() => saveEdit(dept)}
                              disabled={saving || !editTitle.trim()}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              className="btn btn-primary btn-sm flex-1"
                            >
                              {saving ? "Saving..." : "Save"}
                            </motion.button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="btn btn-secondary btn-sm flex-1"
                            >
                              Cancel
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Count + % + progress (only when not editing) */}
                    {!isEditing && (
                      <div className="mt-3">
                        <div className="flex items-baseline justify-between mb-1.5">
                          <span className="text-[13px] font-medium" style={{ color: "var(--fg)" }}>{dept.employeeCount} employee{dept.employeeCount !== 1 ? "s" : ""}</span>
                          <span className="text-[12px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                          <motion.div
                            className={`h-full rounded-full bg-gradient-to-r ${grad}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, delay: 0.2 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                          />
                        </div>
                      </div>
                    )}

                    {!isEditing && dept.description && (
                      <p className="mt-2.5 text-caption line-clamp-2">{dept.description}</p>
                    )}
                  </div>

                  {/* Footer: toggle */}
                  <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-t" style={{ borderColor: "var(--border)" }}>
                    <StatusToggle active={dept.isActive !== false} onChange={() => toggleActive(dept)} />
                    <span className="text-[11px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                      {new Date(dept.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Department"
        description={`Delete "${deleteTarget?.title}"? This won't affect employees already in this department.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
