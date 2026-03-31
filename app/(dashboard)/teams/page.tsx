"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StatusToggle } from "../components/DataTable";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Portal } from "../components/Portal";

interface Team {
  _id: string;
  name: string;
  slug: string;
  department?: { _id: string; title: string };
  lead?: { _id: string; about: { firstName: string; lastName: string }; email: string; userRole: string };
  description?: string;
  isActive: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt?: string;
}

interface DeptOption {
  _id: string;
  title: string;
}

interface UserOption {
  _id: string;
  about: { firstName: string; lastName: string };
  email: string;
  userRole: string;
}

const TEAM_GRADIENTS = [
  "from-teal-500 to-cyan-400",
  "from-blue-500 to-indigo-400",
  "from-purple-500 to-pink-400",
  "from-amber-500 to-orange-400",
  "from-emerald-500 to-green-400",
  "from-rose-500 to-red-400",
  "from-indigo-500 to-blue-400",
  "from-fuchsia-500 to-purple-400",
];

type SortMode = "most" | "name";
type DeptFilter = "all" | string;

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("most");
  const [deptFilter, setDeptFilter] = useState<DeptFilter>("all");

  // Create/edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [formName, setFormName] = useState("");
  const [formDept, setFormDept] = useState("");
  const [formLead, setFormLead] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const [teamsRes, deptsRes, usersRes] = await Promise.all([
      fetch("/api/teams").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/departments").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/employees").then((r) => (r.ok ? r.json() : [])),
    ]);
    setTeams(Array.isArray(teamsRes) ? teamsRes : []);
    setDepartments(Array.isArray(deptsRes) ? deptsRes : []);
    setUsers(
      (Array.isArray(usersRes) ? usersRes : []).map((u: Record<string, unknown>) => ({
        _id: u._id as string,
        about: u.about as { firstName: string; lastName: string },
        email: u.email as string,
        userRole: u.userRole as string,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalMembers = useMemo(() => teams.reduce((s, t) => s + t.memberCount, 0), [teams]);

  const filtered = useMemo(() => {
    let list = teams;
    if (deptFilter !== "all") list = list.filter((t) => t.department?._id === deptFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        `${t.name} ${t.department?.title ?? ""} ${t.lead?.about.firstName ?? ""} ${t.lead?.about.lastName ?? ""}`.toLowerCase().includes(q),
      );
    }
    if (sortMode === "name") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list = [...list].sort((a, b) => b.memberCount - a.memberCount);
    }
    return list;
  }, [teams, deptFilter, search, sortMode]);

  function openCreateModal() {
    setEditingTeam(null);
    setFormName("");
    setFormDept(departments[0]?._id ?? "");
    setFormLead("");
    setFormDescription("");
    setModalOpen(true);
  }

  function openEditModal(team: Team) {
    setEditingTeam(team);
    setFormName(team.name);
    setFormDept(team.department?._id ?? "");
    setFormLead(team.lead?._id ?? "");
    setFormDescription(team.description ?? "");
    setModalOpen(true);
  }

  async function handleSave() {
    if (!formName.trim() || !formDept) return;
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        department: formDept,
        lead: formLead || null,
        description: formDescription,
      };
      if (editingTeam) {
        await fetch(`/api/teams/${editingTeam._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/teams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      await load();
    } catch {
      /* ignore */
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/teams/${deleteTarget._id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await load();
    } catch {
      /* ignore */
    }
    setDeleting(false);
  }

  async function toggleActive(team: Team) {
    await fetch(`/api/teams/${team._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !team.isActive }),
    });
    await load();
  }

  const leadCandidates = useMemo(() => {
    if (!formDept) return users;
    return users.filter(
      (u) =>
        u.userRole === "teamLead" ||
        u.userRole === "manager" ||
        u.userRole === "developer" ||
        u.userRole === "businessDeveloper",
    );
  }, [users, formDept]);

  if (loading) {
    return (
      <motion.div className="flex flex-col gap-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="shimmer h-8 w-32 rounded" />
            <div className="shimmer h-4 w-48 max-w-[90vw] rounded" />
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
            <div className="shimmer h-7 w-28 rounded-md" />
            <div className="shimmer h-7 w-16 rounded-md" />
          </div>
        </div>
        <div className="card-static mb-4 flex items-center gap-3 p-4">
          <div className="relative h-10 flex-1">
            <div className="shimmer h-10 w-full rounded-lg" />
          </div>
          <div className="shimmer h-9 w-32 shrink-0 rounded-lg" />
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
            <div className="shimmer h-7 w-20 rounded-md" />
            <div className="shimmer h-7 w-24 rounded-md" />
            <div className="shimmer h-7 w-20 rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card card-shine flex h-full flex-col overflow-hidden">
              <div className="flex-1 p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="shimmer h-10 w-10 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="shimmer h-4 w-32 rounded" />
                    <div className="shimmer h-3 w-28 rounded" />
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="shimmer h-3 w-10 rounded" />
                    <div className="shimmer h-3 w-24 rounded" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="shimmer h-3 w-12 rounded" />
                    <div className="shimmer h-3 w-36 rounded" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="shimmer h-3 w-16 rounded" />
                    <div className="shimmer h-5 w-8 rounded-full" />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t px-3 py-2.5 sm:px-4" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2">
                  <div className="shimmer h-7 w-12 rounded-full" />
                  <div className="shimmer h-3 w-28 rounded" />
                </div>
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
      {/* Header */}
      <motion.div
        className="flex items-center justify-between gap-3 mb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="text-title">Teams</h1>
          <p className="text-subhead hidden sm:block">
            {teams.length} team{teams.length !== 1 ? "s" : ""} · {totalMembers} member{totalMembers !== 1 ? "s" : ""}
          </p>
        </div>
        <div
          className="flex items-center gap-0.5 rounded-lg border p-0.5"
          style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}
        >
          {(["most", "name"] as SortMode[]).map((s) => (
            <motion.button
              key={s}
              type="button"
              onClick={() => setSortMode(s)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                sortMode === s ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
              }`}
            >
              {s === "most" ? "Most Members" : "Name"}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Search + Add row */}
      <motion.div
        className="card-static p-4 mb-4 flex gap-3 items-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: "var(--fg-tertiary)" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams..."
            className="input flex-1"
            style={{ paddingLeft: "40px" }}
          />
        </div>
        <motion.button
          type="button"
          onClick={openCreateModal}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="btn btn-primary btn-sm shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Team
        </motion.button>
      </motion.div>

      {/* Department filter */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <div
          className="flex items-center gap-0.5 rounded-lg border p-0.5"
          style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}
        >
          <motion.button
            type="button"
            onClick={() => setDeptFilter("all")}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
              deptFilter === "all" ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
            }`}
          >
            All Depts
          </motion.button>
          {departments.map((d) => (
            <motion.button
              key={d._id}
              type="button"
              onClick={() => setDeptFilter(d._id)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                deptFilter === d._id ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
              }`}
            >
              {d.title}
            </motion.button>
          ))}
        </div>
        {(search || deptFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setDeptFilter("all");
            }}
            className="text-xs font-medium transition-colors"
            style={{ color: "var(--primary)" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Team Card Grid */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="col-span-full card card-shine p-12 text-center"
            >
              <p style={{ color: "var(--fg-secondary)" }}>No teams yet. Add one above.</p>
            </motion.div>
          ) : (
            filtered.map((team, i) => {
              const grad = TEAM_GRADIENTS[i % TEAM_GRADIENTS.length];

              return (
                <motion.div
                  key={team._id}
                  layout
                  className="h-full"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.3) }}
                >
                  <div className="card card-shine group relative overflow-hidden flex h-full flex-col">
                    <div className="flex-1 p-3 sm:p-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white ${grad}`}
                        >
                          {team.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate" style={{ color: "var(--fg)" }}>
                            {team.name}
                          </p>
                          <p className="text-caption truncate mt-0.5">{team.department?.title ?? "No department"}</p>
                        </div>
                      </div>

                      <div className="mt-3 space-y-1.5 text-[13px]">
                        <div className="flex items-center justify-between">
                          <span style={{ color: "var(--fg-tertiary)" }}>Lead</span>
                          <span className="font-medium truncate ml-2" style={{ color: "var(--fg)" }}>
                            {team.lead
                              ? `${team.lead.about.firstName} ${team.lead.about.lastName}`
                              : "—"}
                          </span>
                        </div>
                        {team.lead?.email && (
                          <div className="flex items-center justify-between">
                            <span style={{ color: "var(--fg-tertiary)" }}>Email</span>
                            <span className="text-[11px] truncate ml-2" style={{ color: "var(--fg-secondary)" }}>
                              {team.lead.email}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span style={{ color: "var(--fg-tertiary)" }}>Members</span>
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{
                              background: "color-mix(in srgb, var(--teal) 12%, transparent)",
                              color: "var(--teal)",
                            }}
                          >
                            {team.memberCount}
                          </span>
                        </div>
                        {team.description && (
                          <p className="text-caption line-clamp-2 mt-1">{team.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div
                      className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-t"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="flex items-center gap-2">
                        <StatusToggle active={team.isActive !== false} onChange={() => toggleActive(team)} />
                        <span className="text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                          Created{" "}
                          {new Date(team.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => openEditModal(team)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
                          style={{ color: "var(--primary)" }}
                          title="Edit"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </motion.button>
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => setDeleteTarget(team)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
                          style={{ color: "var(--rose)" }}
                          title="Delete"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* Create/Edit Modal */}
      <Portal>
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
            <motion.div
              className="relative w-full max-w-md mx-4 rounded-2xl border p-6 shadow-xl"
              style={{ background: "var(--glass-bg-heavy)", borderColor: "var(--glass-border)" }}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <h2 className="text-headline text-lg mb-4">{editingTeam ? "Edit Team" : "Create Team"}</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>
                    Team Name
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Node Team"
                    className="input w-full"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>
                    Department
                  </label>
                  <select value={formDept} onChange={(e) => setFormDept(e.target.value)} className="input w-full">
                    <option value="">Select department</option>
                    {departments.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>
                    Team Lead
                  </label>
                  <select value={formLead} onChange={(e) => setFormLead(e.target.value)} className="input w-full">
                    <option value="">No lead</option>
                    {leadCandidates.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.about.firstName} {u.about.lastName} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>
                    Description
                  </label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Optional description..."
                    rows={2}
                    className="input w-full"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <motion.button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !formName.trim() || !formDept}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="btn btn-primary btn-sm flex-1"
                >
                  {saving ? "Saving..." : editingTeam ? "Update" : "Create"}
                </motion.button>
                <button type="button" onClick={() => setModalOpen(false)} className="btn btn-secondary btn-sm flex-1">
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </Portal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Team"
        description={`Delete "${deleteTarget?.name}"? Members will be removed from this team.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </motion.div>
  );
}
