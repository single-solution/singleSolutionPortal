"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { staggerContainerFast, cardVariants } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Portal } from "../components/Portal";
import { PERMISSION_KEYS, PERMISSION_META, PERMISSION_CATEGORIES } from "@/lib/permissions.shared";

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

interface DesignationPerms {
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canToggleStatus?: boolean;
  canSetPermissions?: boolean;
}

export function DesignationsPanel({ canManage = false, perms = {}, onToggle }: { canManage?: boolean; perms?: DesignationPerms; onToggle?: () => void }) {
  const canCreate = perms.canCreate ?? canManage;
  const canEdit = perms.canEdit ?? canManage;
  const canDelete = perms.canDelete ?? canManage;
  const canToggleStatus = perms.canToggleStatus ?? canManage;
  const canSetPermissions = perms.canSetPermissions ?? canManage;
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
  const [permsOpen, setPermsOpen] = useState(true);
  const [permSearch, setPermSearch] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Designation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingToggleId, setSavingToggleId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Designation | null>(null);

  const openCreate = useCallback(() => {
    setModalMode("create");
    setEditingId(null);
    setFormName("");
    setFormDescription("");
    setFormColor("#6366f1");
    const p: Record<string, boolean> = {};
    for (const k of PERMISSION_KEYS) p[k] = false;
    setFormPerms(p);
    setPermsOpen(true);
    setPermSearch("");
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
    setPermsOpen(true);
    setPermSearch("");
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
      const body: Record<string, unknown> = {
        name: formName.trim(),
        description: formDescription,
        color: formColor.trim(),
      };
      if (canSetPermissions) body.defaultPermissions = formPerms;
      if (modalMode === "create") {
        const res = await fetch("/api/designations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { const err = await res.json().catch(() => null); toast.error(err?.error ?? "Failed to create designation"); setSaveLoading(false); return; }
      } else if (editingId) {
        const res = await fetch(`/api/designations/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) { toast.error(data?.error ?? "Failed to save designation"); setSaveLoading(false); return; }
        if (canSetPermissions && data?.syncedCount > 0) {
          toast.success(`Permissions synced to ${data.syncedCount} membership${data.syncedCount !== 1 ? "s" : ""}`);
        }
      }
      toast.success(modalMode === "create" ? "Designation created" : "Designation updated");
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
      const res = await fetch(`/api/designations/${deleteTarget._id}`, { method: "DELETE" });
      if (res.ok) { toast.success("Designation deleted"); setDeleteTarget(null); await refetch(); }
      else { const err = await res.json().catch(() => null); toast.error(err?.error ?? "Failed to delete designation"); }
    } catch { toast.error("Something went wrong"); }
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
        toast.error("Failed to update status");
      } else {
        const data = await res.json().catch(() => ({}));
        const count = (data as Record<string, number>).cascadeCount ?? 0;
        if (newStatus) {
          toast.success(count > 0 ? `${d.name} activated — ${count} membership${count !== 1 ? "s" : ""} restored` : `${d.name} activated`);
        } else {
          toast.success(count > 0 ? `${d.name} deactivated — ${count} membership${count !== 1 ? "s" : ""} suspended` : `${d.name} deactivated`);
        }
        await refetch();
        onToggle?.();
      }
    } catch {
      mutate((prev) =>
        prev ? prev.map((x) => (x._id === d._id ? { ...x, isActive: d.isActive } : x)) : prev,
      );
      toast.error("Something went wrong");
    }
    setSavingToggleId(null);
  }

  const sorted = useMemo(() => [...list].sort((a, b) => a.name.localeCompare(b.name)), [list]);

  return (
    <>
      {/* ── Card header ── */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
        <h3 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>Designations</h3>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums" style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--primary)" }}>
            {loading && !designations ? "…" : sorted.length}
          </span>
          {canCreate && (
            <motion.button
              type="button"
              onClick={openCreate}
              whileTap={{ scale: 0.96 }}
              className="flex h-5 w-5 items-center justify-center rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
              style={{ color: "var(--primary)" }}
              title="Add Designation"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </motion.button>
          )}
        </div>
      </div>

      {/* ── Card content ── */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
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
                      <p className="truncate text-[11px] font-semibold" style={{ color: "var(--fg)" }}>
                        {d.name}
                      </p>
                      {d.description && (
                        <p className="truncate text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                          {d.description}
                        </p>
                      )}
                    </div>
                    {(canEdit || canDelete || canToggleStatus) && (
                      <div className="flex items-center gap-1.5">
                        {canEdit && (
                          <button type="button" onClick={() => openEdit(d)} className="flex h-5 w-5 items-center justify-center rounded transition-colors" style={{ color: "var(--primary)" }} title="Edit">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                        )}
                        {canDelete && !d.isSystem && (
                          <button type="button" onClick={() => setDeleteTarget(d)} className="flex h-5 w-5 items-center justify-center rounded transition-colors" style={{ color: "var(--rose)" }} title="Delete">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                          </button>
                        )}
                        {canToggleStatus && (
                          <ToggleSwitch
                            size="sm"
                            checked={d.isActive !== false}
                            onChange={() => d.isActive !== false ? setDeactivateTarget(d) : toggleActive(d)}
                            disabled={savingToggleId === d._id}
                            loading={savingToggleId === d._id}
                          />
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
        title="Delete Designation"
        description={`Remove "${deleteTarget?.name}"? Existing assignments will keep their data.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmDialog
        open={deactivateTarget !== null}
        title="Deactivate Designation"
        description={`Deactivate "${deactivateTarget?.name}"? All memberships using this designation will be suspended. You can reactivate it later.`}
        confirmLabel={savingToggleId === deactivateTarget?._id ? "Deactivating…" : "Deactivate"}
        variant="warning"
        loading={savingToggleId === deactivateTarget?._id}
        onConfirm={async () => { if (deactivateTarget) { await toggleActive(deactivateTarget); setDeactivateTarget(null); } }}
        onCancel={() => setDeactivateTarget(null)}
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
                className="rounded-xl border flex w-full max-w-2xl max-h-[min(90vh,900px)] flex-col overflow-hidden shadow-xl"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="shrink-0 flex items-center justify-between px-3 py-2 border-b"
                  style={{ borderColor: "var(--border)" }}
                >
                  <h3 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>
                    {modalMode === "create" ? "New Designation" : "Edit Designation"}
                  </h3>
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
                    <div className="flex flex-wrap gap-2.5">
                      {PRESET_COLORS.map((c) => {
                        const selected = formColor === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setFormColor(c)}
                            className="h-6 w-6 rounded-full transition-transform hover:scale-110"
                            style={{
                              background: selected ? "transparent" : c,
                              boxShadow: selected ? `inset 0 0 0 4px ${c}, inset 0 0 0 6px var(--bg-elevated), 0 0 0 2px ${c}` : "none",
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Default Privileges ── */}
                  {canSetPermissions && (
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
                          <span className="ml-1.5 text-[11px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
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
                            <div className="flex items-center gap-2">
                              <div className="flex flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                                <svg className="pointer-events-none h-3.5 w-3.5 shrink-0" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                </svg>
                                <input type="text" value={permSearch} onChange={(e) => setPermSearch(e.target.value)} placeholder="Search privileges…" className="flex-1 min-w-0 bg-transparent text-[11px] outline-none" style={{ color: "var(--fg)", border: "none" }} />
                              </div>
                              <button type="button" onClick={() => { const p: Record<string, boolean> = {}; for (const k of PERMISSION_KEYS) p[k] = true; setFormPerms(p); }} className="text-[11px] font-semibold rounded-lg px-2 py-1 transition-colors shrink-0" style={{ color: "var(--green)", background: "color-mix(in srgb, var(--green) 10%, transparent)" }}>All On</button>
                              <button type="button" onClick={() => { const p: Record<string, boolean> = {}; for (const k of PERMISSION_KEYS) p[k] = false; setFormPerms(p); }} className="text-[11px] font-semibold rounded-lg px-2 py-1 transition-colors shrink-0" style={{ color: "var(--rose)", background: "color-mix(in srgb, var(--rose) 10%, transparent)" }}>All Off</button>
                            </div>
                            {PERMISSION_CATEGORIES.map((cat) => {
                              const q = permSearch.trim().toLowerCase();
                              const filteredKeys = q ? cat.keys.filter((k) => { const m = PERMISSION_META[k]; return m.label.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q) || k.toLowerCase().includes(q); }) : cat.keys;
                              if (filteredKeys.length === 0) return null;
                              return (
                              <div key={cat.label}>
                                <div className="flex items-center gap-1.5 mb-2">
                                  <svg className="h-3.5 w-3.5" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d={cat.icon} />
                                  </svg>
                                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>{cat.label}</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                                  {filteredKeys.map((k) => {
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
                                          <p className="text-[11px] leading-tight" style={{ color: "var(--fg-tertiary)" }}>{meta.desc}</p>
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  )}
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
