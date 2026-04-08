"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainerFast, cardVariants } from "@/lib/motion";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Portal } from "../components/Portal";

interface DeptItem {
  _id: string;
  title: string;
  description?: string;
  isActive: boolean;
  employeeCount: number;
  teamCount: number;
  manager?: { _id: string; about: { firstName: string; lastName: string }; email: string } | null;
}

interface EmpOption {
  _id: string;
  about: { firstName: string; lastName: string };
  email: string;
}

interface DepartmentsPanelProps {
  departments: DeptItem[];
  employees: EmpOption[];
  loading: boolean;
  refetch: () => Promise<void>;
}

export function DepartmentsPanel({ departments, employees, loading, refetch }: DepartmentsPanelProps) {
  const list = departments ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formManager, setFormManager] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeptItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openCreate = useCallback(() => {
    setModalMode("create");
    setEditingId(null);
    setFormTitle("");
    setFormDescription("");
    setFormManager("");
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((d: DeptItem) => {
    setModalMode("edit");
    setEditingId(d._id);
    setFormTitle(d.title);
    setFormDescription(d.description ?? "");
    setFormManager(d.manager?._id ?? "");
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingId(null);
    setSaveLoading(false);
  }, []);

  async function submitModal() {
    if (!formTitle.trim()) return;
    setSaveLoading(true);
    try {
      const body: Record<string, unknown> = { title: formTitle.trim(), description: formDescription };
      body.managerId = formManager || null;
      if (modalMode === "create") {
        const res = await fetch("/api/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) { setSaveLoading(false); return; }
      } else if (editingId) {
        const res = await fetch(`/api/departments/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) { setSaveLoading(false); return; }
      }
      closeModal();
      await refetch();
    } catch {
      setSaveLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/departments/${deleteTarget._id}`, { method: "DELETE" });
      if (res.ok) { setDeleteTarget(null); await refetch(); }
    } catch { /* ignore */ }
    setDeleting(false);
  }

  const sorted = useMemo(() => [...list].sort((a, b) => a.title.localeCompare(b.title)), [list]);

  function mgrName(d: DeptItem): string | null {
    if (!d.manager) return null;
    return `${d.manager.about.firstName} ${d.manager.about.lastName}`.trim();
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Departments</h2>
            <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
              {loading && list.length === 0 ? "Loading…" : `${sorted.length} department${sorted.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <motion.button
            type="button" onClick={openCreate} whileTap={{ scale: 0.96 }}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
            style={{ background: "#8b5cf6", color: "white" }} title="Add Department">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          </motion.button>
        </div>

        <motion.div className="flex flex-col gap-1.5" variants={staggerContainerFast} initial="hidden" animate="visible">
          <AnimatePresence mode="popLayout">
            {loading && list.length === 0 ? (
              [1, 2, 3].map((i) => (
                <motion.div key={`skel-${i}`} variants={cardVariants} custom={i}><div className="flex items-center gap-2 rounded-lg p-2"><div className="shimmer h-3 w-3 rounded-full" /><div className="shimmer h-3 w-24 rounded" /></div></motion.div>
              ))
            ) : sorted.length === 0 ? (
              <p className="text-[11px] p-2" style={{ color: "var(--fg-tertiary)" }}>No departments yet.</p>
            ) : (
              sorted.map((d, i) => (
                <motion.div key={d._id} variants={cardVariants} custom={i} layout layoutId={`dept-panel-${d._id}`} exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }} className="group">
                  <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all ${!d.isActive ? "opacity-40 grayscale" : ""}`} style={{ background: "var(--bg-grouped)" }}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background: "#8b5cf6", color: "white" }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium" style={{ color: "var(--fg)" }}>{d.title}</p>
                      <p className="truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
                        {d.employeeCount} people · {d.teamCount} team{d.teamCount !== 1 ? "s" : ""}
                        {mgrName(d) && <> · <span style={{ color: "var(--amber)" }}>★ {mgrName(d)}</span></>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button type="button" onClick={() => openEdit(d)} className="flex h-5 w-5 items-center justify-center rounded transition-colors" style={{ color: "var(--primary)" }} title="Edit">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      <button type="button" onClick={() => setDeleteTarget(d)} className="flex h-5 w-5 items-center justify-center rounded transition-colors" style={{ color: "var(--rose)" }} title="Delete">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete department"
        description={`Remove "${deleteTarget?.title}"? Employees and teams in this department will be unaffected but the department will be deactivated.`}
        confirmLabel="Delete" variant="danger" loading={deleting}
        onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)}
      />

      <Portal>
        <AnimatePresence>
          {modalOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md"
              style={{ WebkitBackdropFilter: "saturate(200%) blur(24px)" }} onClick={closeModal}>
              <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                className="card-xl flex w-full max-w-md flex-col overflow-hidden shadow-2xl"
                style={{ borderColor: "var(--border-strong)" }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                  <h2 className="text-base font-semibold" style={{ color: "var(--fg)" }}>{modalMode === "create" ? "New Department" : "Edit Department"}</h2>
                  <button type="button" onClick={closeModal} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-secondary)" }} aria-label="Close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>

                <div className="px-5 py-4 space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: "var(--fg-secondary)" }}>Title <span style={{ color: "var(--rose)" }}>*</span></label>
                    <input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} className="input w-full" placeholder="e.g. Engineering" autoFocus />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: "var(--fg-secondary)" }}>Description</label>
                    <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} className="input w-full" placeholder="Optional short description" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: "var(--fg-secondary)" }}>
                      Manager
                      <span className="ml-1 text-[10px] font-normal" style={{ color: "var(--fg-tertiary)" }}>Head of department</span>
                    </label>
                    <select value={formManager} onChange={(e) => setFormManager(e.target.value)} className="input w-full">
                      <option value="">None</option>
                      {(employees ?? []).map((e) => (
                        <option key={e._id} value={e._id}>{e.about.firstName} {e.about.lastName} — {e.email}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--border)" }}>
                  <button type="button" onClick={closeModal} className="btn btn-secondary btn-sm">Cancel</button>
                  <motion.button type="button" onClick={submitModal} disabled={saveLoading || !formTitle.trim()} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm">
                    {saveLoading ? "Saving…" : modalMode === "create" ? "Create" : "Save"}
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
