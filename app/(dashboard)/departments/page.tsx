"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainerFast, cardVariants, cardHover } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { StatusToggle } from "../components/DataTable";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useSession } from "next-auth/react";
import { useGuide } from "@/lib/useGuide";
import { departmentsTour } from "@/lib/tourConfigs";

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
  manager?: { _id: string; about: { firstName: string; lastName: string }; email?: string };
  parentDepartment?: { _id: string; title: string } | null;
  employeeCount: number;
  teamCount: number;
  isActive: boolean;
  createdAt: string;
}

type SortMode = "most" | "name";

export default function DepartmentsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { registerTour } = useGuide();
  useEffect(() => { registerTour("departments", departmentsTour); }, [registerTour]);
  const canManageDepts = session?.user?.isSuperAdmin === true;
  const { data: departments, loading: deptsLoading, refetch: refetchDepts, mutate: mutateDepts } = useQuery<Department[]>("/api/departments", "departments");
  const { data: managersRaw } = useQuery<Employee[]>("/api/employees/dropdown", "employees");

  const deptList = departments ?? [];
  const managers = useMemo(() => managersRaw ?? [], [managersRaw]);

  const [saving, setSaving] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("most");
  const [search, setSearch] = useState("");

  // Inline add
  const [addingOpen, setAddingOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [addingSaving, setAddingSaving] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editManagerId, setEditManagerId] = useState("");
  const [editParentId, setEditParentId] = useState("");

  // Quick-add parent
  const [newParentId, setNewParentId] = useState("");

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState(false);

  const totalEmployees = useMemo(() => deptList.reduce((s, d) => s + (d.employeeCount || 0), 0), [deptList]);

  const sorted = useMemo(() => {
    let list = [...deptList];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((d) => d.title.toLowerCase().includes(q) || (d.manager ? `${d.manager.about.firstName} ${d.manager.about.lastName}`.toLowerCase().includes(q) : false));
    }
    if (sortMode === "name") list.sort((a, b) => a.title.localeCompare(b.title));
    else list.sort((a, b) => b.employeeCount - a.employeeCount);
    return list;
  }, [deptList, sortMode, search]);

  async function handleQuickAdd() {
    if (!newTitle.trim()) return;
    setAddingSaving(true);
    try {
      await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), description: "", managerId: "", parentId: newParentId }),
      });
      setNewTitle("");
      setNewParentId("");
      setAddingOpen(false);
      await refetchDepts();
    } catch { /* ignore */ }
    setAddingSaving(false);
  }

  function startEdit(dept: Department) {
    setEditingId(dept._id);
    setEditTitle(dept.title);
    setEditDescription(dept.description ?? "");
    setEditManagerId(dept.manager?._id ?? "");
    setEditParentId(dept.parentDepartment?._id ?? "");
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
        body: JSON.stringify({ title: editTitle.trim(), description: editDescription, managerId: editManagerId, parentId: editParentId }),
      });
      setEditingId(null);
      await refetchDepts();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/departments/${deleteTarget._id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await refetchDepts();
    } catch { /* ignore */ }
    setDeleting(false);
  }

  async function toggleActive(dept: Department) {
    const newStatus = !(dept.isActive !== false);
    mutateDepts((prev) =>
      prev ? prev.map((d) => (d._id === dept._id ? { ...d, isActive: newStatus } : d)) : prev,
    );
    try {
      const res = await fetch(`/api/departments/${dept._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newStatus }),
      });
      if (!res.ok) {
        mutateDepts((prev) =>
          prev ? prev.map((d) => (d._id === dept._id ? { ...d, isActive: !newStatus } : d)) : prev,
        );
      }
    } catch {
      mutateDepts((prev) =>
        prev ? prev.map((d) => (d._id === dept._id ? { ...d, isActive: !newStatus } : d)) : prev,
      );
    }
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Header — static shell avoids route loading.tsx + contentReveal double flicker */}
      <div data-tour="departments-header" className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-title">Departments</h1>
          <p className="text-subhead">
            {deptsLoading && !departments ? (
              <span className="inline-block h-3 w-44 max-w-[55vw] rounded align-middle shimmer" aria-hidden />
            ) : (
              <>
                {deptList.length} department{deptList.length !== 1 ? "s" : ""} · {totalEmployees} team member{totalEmployees !== 1 ? "s" : ""}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          {(["most", "name"] as SortMode[]).map((s) => (
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
              {s === "most" ? "Most Employees" : "Name"}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Search + Add row */}
      <div data-tour="departments-search" className="card-static mb-4 flex items-center gap-3 p-4">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search departments..."
            className="input flex-1"
            style={{ paddingLeft: "40px" }}
          />
        </div>
        {sessionStatus !== "loading" && canManageDepts && (
          <motion.button
            type="button"
            onClick={() => { setAddingOpen(!addingOpen); if (!addingOpen) setNewTitle(""); }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn btn-primary btn-sm shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Department
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {addingOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden mb-4"
          >
            <div className="card-static p-4 flex gap-3 items-center flex-wrap">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleQuickAdd()}
                placeholder="Department name..."
                className="input flex-1 min-w-[140px]"
                autoFocus
              />
              <select
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value)}
                className="input w-auto min-w-[160px]"
              >
                <option value="">No parent department</option>
                {deptList.map((d) => <option key={d._id} value={d._id}>{d.title}</option>)}
              </select>
              <motion.button
                type="button"
                onClick={handleQuickAdd}
                disabled={addingSaving || !newTitle.trim()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="btn btn-primary btn-sm shrink-0"
              >
                {addingSaving ? "Adding..." : "Create"}
              </motion.button>
              <motion.button
                type="button"
                onClick={() => { setAddingOpen(false); setNewTitle(""); }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="btn btn-secondary btn-sm shrink-0"
              >
                Cancel
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Department Card Grid */}
      <motion.div
        data-tour="departments-grid"
        className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        variants={staggerContainerFast}
        initial="hidden"
        animate="visible"
      >
        <AnimatePresence mode="popLayout">
          {deptsLoading && !departments ? (
            [1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <motion.div key={`skel-${i}`} variants={cardVariants} custom={i} className="h-full">
                <div className="card flex h-full flex-col overflow-hidden">
                  <div className="flex-1 p-2.5">
                    <div className="shimmer h-3.5 w-24 rounded" />
                    <div className="shimmer mt-0.5 h-2.5 w-20 rounded" />
                    <div className="mt-1.5"><div className="shimmer h-2.5 w-32 rounded" /></div>
                    <div className="shimmer mt-1 h-2.5 w-full rounded" />
                    <div className="shimmer mt-1 h-2.5 w-20 rounded" />
                  </div>
                  <div className="flex items-center justify-between border-t px-2.5 py-1.5" style={{ borderColor: "var(--border)" }}>
                    <div className="shimmer h-5 w-10 rounded-full" />
                    <div className="flex items-center gap-1">
                      <div className="shimmer h-6 w-6 rounded-lg" />
                      <div className="shimmer h-6 w-6 rounded-lg" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          ) : sorted.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="col-span-full card p-12 text-center"
            >
              <p style={{ color: "var(--fg-secondary)" }}>No departments yet. Add one above.</p>
            </motion.div>
          ) : sorted.map((dept, i) => {
            const pct = totalEmployees > 0 ? Math.round((dept.employeeCount / totalEmployees) * 100) : 0;
            const isEditing = editingId === dept._id;

            return (
              <motion.div
                key={dept._id}
                variants={cardVariants}
                custom={i}
                whileHover={cardHover}
                layout
                layoutId={dept._id}
                className="h-full"
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
              >
                <div className={`card group relative overflow-hidden flex h-full flex-col transition-opacity duration-300 ${dept.isActive === false ? "opacity-50 grayscale" : ""}`}>
                  <div className="flex-1 p-2.5">
                    <div>
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
                          <p className="text-[13px] font-semibold truncate" style={{ color: "var(--fg)" }}>{dept.title}</p>
                          <p className="text-[10px] truncate" style={{ color: "var(--fg-secondary)" }}>
                            {dept.manager
                              ? `${dept.manager.about.firstName} ${dept.manager.about.lastName}`
                              : "No manager"}
                          </p>
                          {dept.parentDepartment && (
                            <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--fg-tertiary)" }}>
                              ↳ {dept.parentDepartment.title}
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    {/* Inline edit fields for description + manager */}
                    <AnimatePresence>
                      {isEditing && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-1.5 space-y-2.5 overflow-hidden"
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
                          <select
                            value={editParentId}
                            onChange={(e) => setEditParentId(e.target.value)}
                            className="input text-sm w-full"
                          >
                            <option value="">No parent department</option>
                            {deptList.filter((d) => d._id !== dept._id).map((d) => <option key={d._id} value={d._id}>{d.title}</option>)}
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

                    {/* Count + % (only when not editing) */}
                    {!isEditing && (
                      <div className="mt-1.5 space-y-0.5">
                        <p className="text-[11px]" style={{ color: "var(--fg-secondary)" }}>
                          {dept.employeeCount} employee{dept.employeeCount !== 1 ? "s" : ""}
                          {dept.teamCount > 0 && <span> · {dept.teamCount} team{dept.teamCount !== 1 ? "s" : ""}</span>}
                          <span style={{ color: "var(--fg-tertiary)" }}> · {pct}%</span>
                        </p>
                      </div>
                    )}

                    {!isEditing && dept.description && (
                      <p className="mt-1.5 text-[10px] line-clamp-1" style={{ color: "var(--fg-secondary)" }}>{dept.description}</p>
                    )}

                    {!isEditing && (
                      <p className="mt-1.5 text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                        Created {new Date(dept.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      </p>
                    )}
                  </div>

                  {/* Footer: toggle left, actions right (matches employee card) */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 border-t" style={{ borderColor: "var(--border)" }}>
                    {canManageDepts && <StatusToggle active={dept.isActive !== false} onChange={() => toggleActive(dept)} />}
                    {canManageDepts && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => startEdit(dept)} className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--primary)" }} title="Edit">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </motion.button>
                        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => setDeleteTarget(dept)} className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--rose)" }} title="Delete">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                        </motion.button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

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
