"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainerFast, cardVariants } from "@/lib/motion";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Portal } from "../components/Portal";

interface TeamItem {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  department: { _id: string; title: string } | null;
  memberCount: number;
}

interface Dept {
  _id: string;
  title: string;
}

interface TeamsPanelProps {
  teams: TeamItem[];
  departments: Dept[];
  loading: boolean;
  refetch: () => Promise<void>;
}

export function TeamsPanel({ teams, departments, loading, refetch }: TeamsPanelProps) {
  const list = teams ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDepartment, setFormDepartment] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TeamItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openCreate = useCallback(() => {
    setModalMode("create");
    setEditingId(null);
    setFormName("");
    setFormDescription("");
    setFormDepartment(departments[0]?._id ?? "");
    setModalOpen(true);
  }, [departments]);

  const openEdit = useCallback((t: TeamItem) => {
    setModalMode("edit");
    setEditingId(t._id);
    setFormName(t.name);
    setFormDescription(t.description ?? "");
    setFormDepartment(t.department?._id ?? "");
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingId(null);
    setSaveLoading(false);
  }, []);

  async function submitModal() {
    if (!formName.trim() || !formDepartment) return;
    setSaveLoading(true);
    try {
      const body = { name: formName.trim(), description: formDescription, department: formDepartment };
      if (modalMode === "create") {
        const res = await fetch("/api/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) { setSaveLoading(false); return; }
      } else if (editingId) {
        const res = await fetch(`/api/teams/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
      const res = await fetch(`/api/teams/${deleteTarget._id}`, { method: "DELETE" });
      if (res.ok) { setDeleteTarget(null); await refetch(); }
    } catch { /* ignore */ }
    setDeleting(false);
  }

  const sorted = useMemo(() => [...list].sort((a, b) => a.name.localeCompare(b.name)), [list]);

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Teams</h2>
            <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
              {loading && list.length === 0 ? "Loading…" : `${sorted.length} team${sorted.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <motion.button
            type="button"
            onClick={openCreate}
            whileTap={{ scale: 0.96 }}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
            style={{ background: "var(--teal)", color: "white" }}
            title="Add Team"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </motion.button>
        </div>

        <motion.div className="flex flex-col gap-1.5" variants={staggerContainerFast} initial="hidden" animate="visible">
          <AnimatePresence mode="popLayout">
            {loading && list.length === 0 ? (
              [1, 2, 3].map((i) => (
                <motion.div key={`skel-${i}`} variants={cardVariants} custom={i}>
                  <div className="flex items-center gap-2 rounded-lg p-2">
                    <div className="shimmer h-3 w-3 rounded-full" />
                    <div className="shimmer h-3 w-24 rounded" />
                  </div>
                </motion.div>
              ))
            ) : sorted.length === 0 ? (
              <p className="text-[11px] p-2" style={{ color: "var(--fg-tertiary)" }}>
                No teams yet.
              </p>
            ) : (
              sorted.map((t, i) => (
                <motion.div
                  key={t._id}
                  variants={cardVariants}
                  custom={i}
                  layout
                  layoutId={`team-panel-${t._id}`}
                  exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                  className="group"
                >
                  <div
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all ${!t.isActive ? "opacity-40 grayscale" : ""}`}
                    style={{ background: "var(--bg-grouped)" }}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background: "var(--teal)", color: "white" }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium" style={{ color: "var(--fg)" }}>{t.name}</p>
                      <p className="truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
                        {t.department?.title ?? "No dept"} · {t.memberCount} member{t.memberCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        className="flex h-5 w-5 items-center justify-center rounded transition-colors"
                        style={{ color: "var(--primary)" }}
                        title="Edit"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(t)}
                        className="flex h-5 w-5 items-center justify-center rounded transition-colors"
                        style={{ color: "var(--rose)" }}
                        title="Delete"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
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
        title="Delete team"
        description={`Remove "${deleteTarget?.name}"? Members will be unassigned from this team.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <Portal>
        <AnimatePresence>
          {modalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md"
              style={{ WebkitBackdropFilter: "saturate(200%) blur(24px)" }}
              onClick={closeModal}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                className="card-xl flex w-full max-w-md flex-col overflow-hidden shadow-2xl"
                style={{ borderColor: "var(--border-strong)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                  <h2 className="text-base font-semibold" style={{ color: "var(--fg)" }}>
                    {modalMode === "create" ? "New Team" : "Edit Team"}
                  </h2>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-grouped)]"
                    style={{ color: "var(--fg-secondary)" }}
                    aria-label="Close"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>

                <div className="px-5 py-4 space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: "var(--fg-secondary)" }}>
                      Name <span style={{ color: "var(--rose)" }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="input w-full"
                      placeholder="e.g. Engineering Alpha"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: "var(--fg-secondary)" }}>
                      Department <span style={{ color: "var(--rose)" }}>*</span>
                    </label>
                    <select value={formDepartment} onChange={(e) => setFormDepartment(e.target.value)} className="input w-full">
                      <option value="">Select department…</option>
                      {departments.map((d) => <option key={d._id} value={d._id}>{d.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: "var(--fg-secondary)" }}>
                      Description
                    </label>
                    <input
                      type="text"
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      className="input w-full"
                      placeholder="Optional short description"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--border)" }}>
                  <button type="button" onClick={closeModal} className="btn btn-secondary btn-sm">Cancel</button>
                  <motion.button
                    type="button"
                    onClick={submitModal}
                    disabled={saveLoading || !formName.trim() || !formDepartment}
                    whileTap={{ scale: 0.98 }}
                    className="btn btn-primary btn-sm"
                  >
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
