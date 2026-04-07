"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainerFast, cardVariants, cardHover } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { StatusToggle } from "../components/DataTable";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Portal } from "../components/Portal";
import { useSession } from "next-auth/react";
import {
  PERMISSION_CATEGORIES,
  PERMISSION_KEYS,
  VIEW_ONLY_PERMISSIONS,
  type IPermissions,
} from "@/lib/permissions.shared";

interface Designation {
  _id: string;
  name: string;
  description?: string;
  color: string;
  isSystem: boolean;
  isActive: boolean;
  defaultPermissions: IPermissions;
  createdAt: string;
  updatedAt: string;
}

type CategoryPreset = "full" | "view" | "none" | "custom";

function emptyPermissions(): IPermissions {
  const o: Record<string, boolean> = {};
  for (const k of PERMISSION_KEYS) o[k] = false;
  return o as unknown as IPermissions;
}

function clonePermissions(src: IPermissions | undefined | null): IPermissions {
  const o = emptyPermissions();
  if (!src) return o;
  for (const k of PERMISSION_KEYS) {
    if (typeof src[k] === "boolean") o[k] = src[k];
  }
  return o;
}

function categoryPreset(keys: (keyof IPermissions)[], perms: IPermissions): CategoryPreset {
  const allOn = keys.every((k) => perms[k]);
  const allOff = keys.every((k) => !perms[k]);
  if (allOn) return "full";
  if (allOff) return "none";
  const matchesView = keys.every((k) => perms[k] === VIEW_ONLY_PERMISSIONS.has(k));
  if (matchesView) return "view";
  return "custom";
}

function applyCategoryPreset(
  perms: IPermissions,
  keys: (keyof IPermissions)[],
  preset: "full" | "view" | "none",
): IPermissions {
  const next = { ...perms };
  for (const k of keys) {
    if (preset === "full") next[k] = true;
    else if (preset === "none") next[k] = false;
    else next[k] = VIEW_ONLY_PERMISSIONS.has(k);
  }
  return next;
}

function permissionKeyLabel(key: keyof IPermissions): string {
  return String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DesignationsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const role = session?.user?.role;
  const isSuperAdminFlag = session?.user?.isSuperAdmin === true;
  const canAccess =
    sessionStatus === "authenticated" && (role === "superadmin" || isSuperAdminFlag);

  const { data: designations, loading, refetch, mutate } = useQuery<Designation[]>(
    "/api/designations",
    "designations",
    { enabled: canAccess },
  );

  const list = designations ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formColor, setFormColor] = useState("#6366f1");
  const [formPermissions, setFormPermissions] = useState<IPermissions>(() => emptyPermissions());
  const [expandedCategory, setExpandedCategory] = useState<Record<number, boolean>>({});
  const [saveLoading, setSaveLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Designation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingToggleId, setSavingToggleId] = useState<string | null>(null);

  const openCreate = useCallback(() => {
    setModalMode("create");
    setEditingId(null);
    setFormName("");
    setFormDescription("");
    setFormColor("#6366f1");
    setFormPermissions(emptyPermissions());
    setExpandedCategory({});
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((d: Designation) => {
    setModalMode("edit");
    setEditingId(d._id);
    setFormName(d.name);
    setFormDescription(d.description ?? "");
    setFormColor(d.color || "#6366f1");
    setFormPermissions(clonePermissions(d.defaultPermissions));
    setExpandedCategory({});
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingId(null);
    setSaveLoading(false);
  }, []);

  async function submitModal() {
    if (!formName.trim()) return;
    setSaveLoading(true);
    try {
      if (modalMode === "create") {
        const res = await fetch("/api/designations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription,
            color: formColor.trim(),
            defaultPermissions: formPermissions,
          }),
        });
        if (!res.ok) {
          setSaveLoading(false);
          return;
        }
      } else if (editingId) {
        const res = await fetch(`/api/designations/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription,
            color: formColor.trim(),
            defaultPermissions: formPermissions,
          }),
        });
        if (!res.ok) {
          setSaveLoading(false);
          return;
        }
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
      if (res.ok) {
        setDeleteTarget(null);
        await refetch();
      }
    } catch {
      /* ignore */
    }
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

  if (sessionStatus === "loading") {
    return (
      <div className="flex flex-col gap-4 p-2">
        <div className="shimmer h-8 w-48 max-w-[70vw] rounded" />
        <div className="shimmer h-4 w-72 max-w-[85vw] rounded" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="card-xl p-10 text-center">
        <h1 className="text-title mb-2">Access Denied</h1>
        <p className="text-subhead" style={{ color: "var(--fg-secondary)" }}>
          Only super administrators can manage designation templates.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-title">Manage Designations</h1>
          <p className="text-subhead">
            {loading && !designations ? (
              <span className="inline-block h-3 w-56 max-w-[60vw] rounded align-middle shimmer" aria-hidden />
            ) : (
              <>
                Define reusable permission templates for roles. {sorted.length} designation
                {sorted.length !== 1 ? "s" : ""} total.
              </>
            )}
          </p>
        </div>
        <motion.button
          type="button"
          onClick={openCreate}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="btn btn-primary btn-sm shrink-0 self-start sm:self-auto"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Designation
        </motion.button>
      </div>

      <motion.div
        className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        variants={staggerContainerFast}
        initial="hidden"
        animate="visible"
      >
        <AnimatePresence mode="popLayout">
          {loading && !designations ? (
            [1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <motion.div key={`skel-${i}`} variants={cardVariants} custom={i} className="h-full">
                <div className="card-xl flex h-full flex-col overflow-hidden">
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="flex items-center gap-2">
                      <div className="shimmer h-3 w-3 rounded-full" />
                      <div className="shimmer h-3.5 w-28 rounded" />
                    </div>
                    <div className="shimmer h-2.5 w-full rounded" />
                    <div className="shimmer h-2.5 w-2/3 rounded" />
                  </div>
                  <div
                    className="flex items-center justify-between border-t px-3 py-2"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="shimmer h-5 w-14 rounded-full" />
                    <div className="flex gap-1">
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
              className="card-xl col-span-full p-12 text-center"
            >
              <p style={{ color: "var(--fg-secondary)" }}>No designations yet. Create one to get started.</p>
            </motion.div>
          ) : (
            sorted.map((d, i) => (
              <motion.div
                key={d._id}
                variants={cardVariants}
                custom={i}
                whileHover={cardHover}
                layout
                layoutId={d._id}
                className="h-full"
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
              >
                <div
                  className={`card-xl group relative flex h-full flex-col overflow-hidden transition-opacity duration-300 ${
                    d.isActive === false ? "opacity-50 grayscale" : ""
                  }`}
                >
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/20"
                        style={{ background: d.color || "var(--primary)" }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold" style={{ color: "var(--fg)" }}>
                          {d.name}
                        </p>
                        {d.description ? (
                          <p className="mt-0.5 line-clamp-2 text-[11px]" style={{ color: "var(--fg-secondary)" }}>
                            {d.description}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[11px] italic" style={{ color: "var(--fg-tertiary)" }}>
                            No description
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {d.isSystem && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            background: "var(--bg-grouped)",
                            color: "var(--primary)",
                            border: "1px solid var(--border-strong)",
                          }}
                        >
                          System
                        </span>
                      )}
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          background: d.isActive !== false ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "var(--bg-grouped)",
                          color: d.isActive !== false ? "var(--primary)" : "var(--fg-tertiary)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {d.isActive !== false ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  <div
                    className="flex items-center justify-between border-t px-3 py-2"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <StatusToggle
                      active={d.isActive !== false}
                      onChange={() => savingToggleId !== d._id && toggleActive(d)}
                    />
                    <div className="flex items-center gap-1 opacity-0 transition-all group-hover:opacity-100">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => openEdit(d)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
                        style={{ color: "var(--primary)" }}
                        title="Edit"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </motion.button>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => !d.isSystem && setDeleteTarget(d)}
                        disabled={d.isSystem}
                        className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                        style={{ color: "var(--rose)" }}
                        title={d.isSystem ? "System designations cannot be deleted" : "Delete"}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </motion.button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </motion.div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Deactivate designation"
        description={`Soft-delete "${deleteTarget?.name}"? It will be hidden from new assignments but existing data stays intact.`}
        confirmLabel="Deactivate"
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
                className="card-xl flex max-h-[min(90vh,840px)] w-full max-w-2xl flex-col overflow-hidden shadow-2xl"
                style={{ borderColor: "var(--border-strong)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex items-center justify-between border-b px-5 py-4"
                  style={{ borderColor: "var(--border)" }}
                >
                  <h2 className="text-lg font-semibold" style={{ color: "var(--fg)" }}>
                    {modalMode === "create" ? "New designation" : "Edit designation"}
                  </h2>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-grouped)]"
                    style={{ color: "var(--fg-secondary)" }}
                    aria-label="Close"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium" style={{ color: "var(--fg-secondary)" }}>
                        Name <span style={{ color: "var(--rose)" }}>*</span>
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
                      <textarea
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        className="input w-full"
                        rows={2}
                        placeholder="Optional summary of this role template"
                      />
                    </div>
                    <div className="flex flex-wrap items-end gap-4">
                      <div>
                        <label className="mb-1 block text-xs font-medium" style={{ color: "var(--fg-secondary)" }}>
                          Color
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={formColor}
                            onChange={(e) => setFormColor(e.target.value)}
                            className="h-10 w-14 cursor-pointer rounded-lg border p-1"
                            style={{ borderColor: "var(--border)" }}
                          />
                          <input
                            type="text"
                            value={formColor}
                            onChange={(e) => setFormColor(e.target.value)}
                            className="input w-32 font-mono text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--fg-tertiary)" }}>
                        Default permissions
                      </p>
                      <div className="space-y-2">
                        {PERMISSION_CATEGORIES.map((cat, catIdx) => {
                          const preset = categoryPreset(cat.keys, formPermissions);
                          const expanded = expandedCategory[catIdx] === true;
                          return (
                            <div
                              key={cat.label}
                              className="rounded-xl border"
                              style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                            >
                              <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                                <span className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                                  {cat.label}
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                  <div
                                    className="flex rounded-lg border p-0.5"
                                    style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}
                                  >
                                    {(["full", "view", "none"] as const).map((p) => (
                                      <button
                                        key={p}
                                        type="button"
                                        aria-pressed={preset === p}
                                        onClick={() =>
                                          setFormPermissions((prev) => applyCategoryPreset(prev, cat.keys, p))
                                        }
                                        className={`rounded-md px-1.5 py-1 text-[10px] font-medium transition-all sm:px-2 sm:text-[11px] ${
                                          preset === p
                                            ? "bg-[var(--primary)] text-white shadow-sm"
                                            : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                                        }`}
                                      >
                                        {p === "full" ? "Full Access" : p === "view" ? "View Only" : "No Access"}
                                      </button>
                                    ))}
                                  </div>
                                  <button
                                    type="button"
                                    aria-expanded={expanded}
                                    onClick={() =>
                                      setExpandedCategory((prev) => ({ ...prev, [catIdx]: !prev[catIdx] }))
                                    }
                                    className="text-[11px] font-medium underline-offset-2 hover:underline"
                                    style={{ color: "var(--primary)" }}
                                  >
                                    {expanded ? "Hide" : "Customize"}
                                  </button>
                                </div>
                              </div>
                              <AnimatePresence>
                                {expanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden border-t"
                                    style={{ borderColor: "var(--border)" }}
                                  >
                                    <div className="grid gap-2 p-3 sm:grid-cols-2">
                                      {cat.keys.map((key) => (
                                        <label
                                          key={key}
                                          className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px]"
                                          style={{ background: "var(--bg-grouped)" }}
                                        >
                                          <span style={{ color: "var(--fg-secondary)" }}>{permissionKeyLabel(key)}</span>
                                          <input
                                            type="checkbox"
                                            checked={!!formPermissions[key]}
                                            onChange={(e) =>
                                              setFormPermissions((prev) => ({
                                                ...prev,
                                                [key]: e.target.checked,
                                              }))
                                            }
                                            className="h-4 w-4 shrink-0 rounded border"
                                            style={{ accentColor: "var(--primary)" }}
                                          />
                                        </label>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className="flex justify-end gap-2 border-t px-5 py-4"
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
                    {saveLoading ? "Saving…" : modalMode === "create" ? "Create" : "Save changes"}
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}
