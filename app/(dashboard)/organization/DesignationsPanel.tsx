"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainerFast, cardVariants } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { StatusToggle } from "../components/DataTable";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Portal } from "../components/Portal";
import { PERMISSION_KEYS, PERMISSION_META, PERMISSION_CATEGORIES, type IPermissions } from "@/lib/permissions.shared";

interface Designation {
  _id: string;
  name: string;
  description?: string;
  color: string;
  isSystem: boolean;
  isActive: boolean;
  defaultPermissions?: Record<string, boolean>;
  createdAt: string;
}

const PRESET_COLORS = [
  "#6366f1", "#3b82f6", "#8b5cf6", "#ef4444", "#f59e0b",
  "#10b981", "#06b6d4", "#ec4899", "#f97316", "#6b7280",
];

export function DesignationsPanel({ canManage = false }: { canManage?: boolean }) {
  const { data: designations, loading, refetch, mutate } = useQuery<Designation[]>(
    "/api/designations",
    "designations",
  );

  const list = designations ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formColor, setFormColor] = useState("#6366f1");
  const [saveLoading, setSaveLoading] = useState(false);

  const [formPerms, setFormPerms] = useState<Record<string, boolean>>(() => {
    const p: Record<string, boolean> = {};
    for (const k of PERMISSION_KEYS) p[k] = false;
    return p;
  });
  const [permsOpen, setPermsOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Designation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingToggleId, setSavingToggleId] = useState<string | null>(null);

  const openCreate = useCallback(() => {
    setModalMode("create");
    setEditingId(null);
    setFormName("");
    setFormDescription("");
    setFormColor("#6366f1");
    const p: Record<string, boolean> = {};
    for (const k of PERMISSION_KEYS) p[k] = false;
    setFormPerms(p);
    setPermsOpen(false);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((d: Designation) => {
    setModalMode("edit");
    setEditingId(d._id);
    setFormName(d.name);
    setFormDescription(d.description ?? "");
    setFormColor(d.color || "#6366f1");
    const p: Record<string, boolean> = {};
    for (const k of PERMISSION_KEYS) p[k] = Boolean(d.defaultPermissions?.[k]);
    setFormPerms(p);
    setPermsOpen(false);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingId(null);
    setSaveLoading(false);
  }, []);

  const enabledPermsCount = useMemo(() => Object.values(formPerms).filter(Boolean).length, [formPerms]);

  async function submitModal() {
    if (!formName.trim()) return;
    setSaveLoading(true);
    try {
      const body = {
        name: formName.trim(),
        description: formDescription,
        color: formColor.trim(),
        defaultPermissions: formPerms,
      };
      if (modalMode === "create") {
        const res = await fetch("/api/designations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { setSaveLoading(false); return; }
      } else if (editingId) {
        const res = await fetch(`/api/designations/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
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
      const res = await fetch(`/api/designations/${deleteTarget._id}`, { method: "DELETE" });
      if (res.ok) { setDeleteTarget(null); await refetch(); }
    } catch { /* ignore */ }
    setDeleting(false);
  }

  async function toggleActive(d: Designation) {
    const newStatus = d.isActive !== false ? false : true;
    mutate((prev) =>
      prev ? prev.map((x) => (x._id === d._id ? { ...x, isActive: newStatus } : x)) : prev,
    );
    setSavingToggleId(d._id);
    try {
      const res = await fetch(`/api/designations/${d._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newStatus }),
      });
      if (!res.ok) {
        mutate((prev) =>
          prev ? prev.map((x) => (x._id === d._id ? { ...x, isActive: d.isActive } : x)) : prev,
        );
      }
    } catch {
      mutate((prev) =>
        prev ? prev.map((x) => (x._id === d._id ? { ...x, isActive: d.isActive } : x)) : prev,
      );
    }
    setSavingToggleId(null);
  }

  const sorted = useMemo(() => [...list].sort((a, b) => a.name.localeCompare(b.name)), [list]);

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Designations</h2>
            <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
              {loading && !designations ? "Loading…" : `${sorted.length} title${sorted.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          {canManage && (
            <motion.button
              type="button"
              onClick={openCreate}
              whileTap={{ scale: 0.96 }}
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
              style={{ background: "var(--primary)", color: "white" }}
              title="Add Designation"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </motion.button>
          )}
        </div>

        <motion.div className="flex flex-col gap-1.5" variants={staggerContainerFast} initial="hidden" animate="visible">
          <AnimatePresence mode="popLayout">
            {loading && !designations ? (
              [1, 2, 3, 4].map((i) => (
                <motion.div key={`skel-${i}`} variants={cardVariants} custom={i}>
                  <div className="flex items-center gap-2 rounded-lg p-2">
                    <div className="shimmer h-3 w-3 rounded-full" />
                    <div className="shimmer h-3 w-24 rounded" />
                  </div>
                </motion.div>
              ))
            ) : sorted.length === 0 ? (
              <p className="text-[11px] p-2" style={{ color: "var(--fg-tertiary)" }}>
                No designations yet.
              </p>
            ) : (
              sorted.map((d, i) => (
                <motion.div
                  key={d._id}
                  variants={cardVariants}
                  custom={i}
                  layout
                  layoutId={`des-${d._id}`}
                  exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                  className="group"
                >
                  <div
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all ${
                      d.isActive === false ? "opacity-40 grayscale" : ""
                    }`}
                    style={{ background: "var(--bg-grouped)" }}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: d.color || "var(--primary)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium" style={{ color: "var(--fg)" }}>
                        {d.name}
                      </p>
                      {d.description && (
                        <p className="truncate text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
                          {d.description}
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => openEdit(d)}
                          className="flex h-5 w-5 items-center justify-center rounded transition-colors"
                          style={{ color: "var(--primary)" }}
                          title="Edit"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        {!d.isSystem && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(d)}
                            className="flex h-5 w-5 items-center justify-center rounded transition-colors"
                            style={{ color: "var(--rose)" }}
                            title="Delete"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                    {canManage && (
                      <StatusToggle
                        active={d.isActive !== false}
                        onChange={() => savingToggleId !== d._id && toggleActive(d)}
                      />
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
        title="Delete designation"
        description={`Remove "${deleteTarget?.name}"? Existing assignments will keep their data.`}
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
                className="card-xl flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden shadow-2xl"
                style={{ borderColor: "var(--border-strong)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex items-center justify-between border-b px-5 py-4 shrink-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <h2 className="text-base font-semibold" style={{ color: "var(--fg)" }}>
                    {modalMode === "create" ? "New Designation" : "Edit Designation"}
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

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium" style={{ color: "var(--fg-secondary)" }}>
                        Title <span style={{ color: "var(--rose)" }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        className="input w-full"
                        placeholder="e.g. Senior Developer"
                        autoFocus
                      />
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
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: "var(--fg-secondary)" }}>
                      Color
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setFormColor(c)}
                          className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                          style={{
                            background: c,
                            borderColor: formColor === c ? "var(--fg)" : "transparent",
                          }}
                        />
                      ))}
                      <input
                        type="color"
                        value={formColor}
                        onChange={(e) => setFormColor(e.target.value)}
                        className="h-6 w-6 cursor-pointer rounded-full border-0 p-0"
                        title="Custom color"
                      />
                    </div>
                  </div>

                  {/* ── Default Privileges ── */}
                  <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
                    <button
                      type="button"
                      onClick={() => setPermsOpen(!permsOpen)}
                      className="flex w-full items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4" style={{ color: "var(--primary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <span className="text-xs font-semibold" style={{ color: "var(--fg)" }}>
                          Default Privileges
                          <span className="ml-1.5 text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
                            · {enabledPermsCount} of {PERMISSION_KEYS.length} enabled
                          </span>
                        </span>
                      </div>
                      <motion.svg
                        className="h-3.5 w-3.5" style={{ color: "var(--fg-tertiary)" }}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        animate={{ rotate: permsOpen ? 180 : 0 }} transition={{ duration: 0.2 }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </motion.svg>
                    </button>

                    <AnimatePresence>
                      {permsOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 space-y-4">
                            <div className="flex gap-2">
                              <button type="button" onClick={() => { const p: Record<string, boolean> = {}; for (const k of PERMISSION_KEYS) p[k] = true; setFormPerms(p); }} className="text-[10px] font-semibold rounded-md px-2 py-1 transition-colors" style={{ color: "var(--green)", background: "color-mix(in srgb, var(--green) 10%, transparent)" }}>All On</button>
                              <button type="button" onClick={() => { const p: Record<string, boolean> = {}; for (const k of PERMISSION_KEYS) p[k] = false; setFormPerms(p); }} className="text-[10px] font-semibold rounded-md px-2 py-1 transition-colors" style={{ color: "var(--rose)", background: "color-mix(in srgb, var(--rose) 10%, transparent)" }}>All Off</button>
                            </div>
                            {PERMISSION_CATEGORIES.map((cat) => (
                              <div key={cat.label}>
                                <div className="flex items-center gap-1.5 mb-2">
                                  <svg className="h-3.5 w-3.5" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d={cat.icon} />
                                  </svg>
                                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>{cat.label}</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                                  {cat.keys.map((k) => {
                                    const meta = PERMISSION_META[k];
                                    return (
                                      <label key={k} className="flex items-start gap-2 cursor-pointer py-0.5">
                                        <input
                                          type="checkbox"
                                          checked={!!formPerms[k]}
                                          onChange={() => setFormPerms((prev) => ({ ...prev, [k]: !prev[k] }))}
                                          className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 shrink-0"
                                        />
                                        <div className="min-w-0">
                                          <p className="text-[11px] font-medium leading-tight" style={{ color: "var(--fg)" }}>{meta.label}</p>
                                          <p className="text-[9px] leading-tight" style={{ color: "var(--fg-tertiary)" }}>{meta.desc}</p>
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div
                  className="flex justify-end gap-2 border-t px-5 py-3 shrink-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <button type="button" onClick={closeModal} className="btn btn-secondary btn-sm">
                    Cancel
                  </button>
                  <motion.button
                    type="button"
                    onClick={submitModal}
                    disabled={saveLoading || !formName.trim()}
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
