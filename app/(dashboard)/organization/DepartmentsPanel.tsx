"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { staggerContainerFast, cardVariants } from "@/lib/motion";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Portal } from "../components/Portal";
import { ToggleSwitch } from "../components/ToggleSwitch";

interface DeptItem {
  _id: string;
  title: string;
  description?: string;
  isActive: boolean;
  employeeCount: number;
}

interface DepartmentsPanelProps {
  departments: DeptItem[];
  loading: boolean;
  refetch: () => Promise<void>;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function DepartmentsPanel({ departments, loading, refetch, canCreate = false, canEdit = false, canDelete = false }: DepartmentsPanelProps) {
  const list = departments ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeptItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleToggleActive(d: DeptItem) {
    setTogglingId(d._id);
    try {
      const res = await fetch(`/api/departments/${d._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !d.isActive }),
      });
      if (res.ok) await refetch();
      else toast.error("Failed to update status");
    } catch { toast.error("Something went wrong"); }
    setTogglingId(null);
  }

  const openCreate = useCallback(() => {
    setModalMode("create");
    setEditingId(null);
    setFormTitle("");
    setFormDescription("");
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((d: DeptItem) => {
    setModalMode("edit");
    setEditingId(d._id);
    setFormTitle(d.title);
    setFormDescription(d.description ?? "");
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
      if (modalMode === "create") {
        const res = await fetch("/api/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) { const err = await res.json().catch(() => null); toast.error(err?.error ?? "Failed to create department"); setSaveLoading(false); return; }
      } else if (editingId) {
        const res = await fetch(`/api/departments/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) { const err = await res.json().catch(() => null); toast.error(err?.error ?? "Failed to save department"); setSaveLoading(false); return; }
      }
      closeModal();
      await refetch();
    } catch {
      toast.error("Something went wrong");
      setSaveLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/departments/${deleteTarget._id}`, { method: "DELETE" });
      if (res.ok) { setDeleteTarget(null); await refetch(); }
      else toast.error("Failed to delete department");
    } catch { toast.error("Something went wrong"); }
    setDeleting(false);
  }

  const sorted = useMemo(() => [...list].sort((a, b) => a.title.localeCompare(b.title)), [list]);

  return (
    <>
      {/* ── Card header ── */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
        <h3 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>Departments</h3>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums" style={{ background: "color-mix(in srgb, var(--purple) 10%, transparent)", color: "var(--purple)" }}>
            {loading && list.length === 0 ? "…" : sorted.length}
          </span>
          {canCreate && (
            <motion.button
              type="button" onClick={openCreate} whileTap={{ scale: 0.96 }}
              className="flex h-5 w-5 items-center justify-center rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--purple)_10%,transparent)]"
              style={{ color: "var(--purple)" }} title="Add Department">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            </motion.button>
          )}
        </div>
      </div>

      {/* ── Card content ── */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
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
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--purple)", color: "white" }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold" style={{ color: "var(--fg)" }}>{d.title}</p>
                      <p className="truncate text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                        {d.employeeCount} people
                      </p>
                    </div>
                    {(canEdit || canDelete) && (
                      <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                        {canEdit && (
                          <ToggleSwitch
                            checked={d.isActive}
                            onChange={() => handleToggleActive(d)}
                            disabled={togglingId === d._id}
                            color="var(--green)"
                            title={d.isActive ? "Active — click to deactivate" : "Inactive — click to activate"}
                          />
                        )}
                        {canEdit && (
                          <button type="button" onClick={() => openEdit(d)} className="flex h-5 w-5 items-center justify-center rounded transition-colors" style={{ color: "var(--primary)" }} title="Edit">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                        )}
                        {canDelete && (
                          <button type="button" onClick={() => setDeleteTarget(d)} className="flex h-5 w-5 items-center justify-center rounded transition-colors" style={{ color: "var(--rose)" }} title="Delete">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Department"
        description={`Remove "${deleteTarget?.title}"? Employees in this department will be unaffected but the department record will be permanently deleted.`}
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
                className="rounded-xl border flex w-full max-w-md flex-col overflow-hidden shadow-xl"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }} onClick={(e) => e.stopPropagation()}>
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                  <h3 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>{modalMode === "create" ? "New Department" : "Edit Department"}</h3>
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
