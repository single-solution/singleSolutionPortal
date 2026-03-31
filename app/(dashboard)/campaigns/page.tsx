"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StatusToggle } from "../components/DataTable";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Portal } from "../components/Portal";

type CampaignStatus = "active" | "paused" | "completed" | "cancelled";

interface TaggedEmployee {
  _id: string;
  about: { firstName: string; lastName: string };
  email: string;
  userRole: string;
}

interface TaggedDept {
  _id: string;
  title: string;
}

interface TaggedTeam {
  _id: string;
  name: string;
}

interface Campaign {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  status: CampaignStatus;
  startDate?: string;
  endDate?: string;
  budget?: string;
  tags: {
    employees: TaggedEmployee[];
    departments: TaggedDept[];
    teams: TaggedTeam[];
  };
  notes?: string;
  isActive: boolean;
  createdBy?: { about: { firstName: string; lastName: string } };
  createdAt: string;
  updatedAt?: string;
}

interface SelectOption {
  _id: string;
  label: string;
}

const STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "var(--teal)", bg: "color-mix(in srgb, var(--teal) 12%, transparent)" },
  paused: { label: "Paused", color: "var(--amber)", bg: "color-mix(in srgb, var(--amber) 12%, transparent)" },
  completed: { label: "Completed", color: "var(--primary)", bg: "color-mix(in srgb, var(--primary) 12%, transparent)" },
  cancelled: { label: "Cancelled", color: "var(--rose)", bg: "color-mix(in srgb, var(--rose) 12%, transparent)" },
};

const CARD_GRADIENTS = [
  "from-indigo-500 to-purple-400",
  "from-teal-500 to-emerald-400",
  "from-amber-500 to-orange-400",
  "from-rose-500 to-pink-400",
  "from-blue-500 to-cyan-400",
  "from-fuchsia-500 to-purple-400",
  "from-green-500 to-lime-400",
  "from-red-500 to-rose-400",
];

type StatusFilter = "all" | CampaignStatus;
type SortMode = "recent" | "name";

function formatDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [allEmployees, setAllEmployees] = useState<SelectOption[]>([]);
  const [allDepartments, setAllDepartments] = useState<SelectOption[]>([]);
  const [allTeams, setAllTeams] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  // Create/edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formStatus, setFormStatus] = useState<CampaignStatus>("active");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formBudget, setFormBudget] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formTagEmployees, setFormTagEmployees] = useState<string[]>([]);
  const [formTagDepts, setFormTagDepts] = useState<string[]>([]);
  const [formTagTeams, setFormTagTeams] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const [cRes, eRes, dRes, tRes] = await Promise.all([
      fetch("/api/campaigns").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/employees").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/departments").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/teams").then((r) => (r.ok ? r.json() : [])),
    ]);
    setCampaigns(Array.isArray(cRes) ? cRes : []);
    setAllEmployees(
      (Array.isArray(eRes) ? eRes : []).map((e: Record<string, unknown>) => ({
        _id: e._id as string,
        label: `${(e.about as { firstName: string; lastName: string }).firstName} ${(e.about as { firstName: string; lastName: string }).lastName}`,
      })),
    );
    setAllDepartments(
      (Array.isArray(dRes) ? dRes : []).map((d: Record<string, unknown>) => ({
        _id: d._id as string,
        label: d.title as string,
      })),
    );
    setAllTeams(
      (Array.isArray(tRes) ? tRes : []).map((t: Record<string, unknown>) => ({
        _id: t._id as string,
        label: t.name as string,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = { all: campaigns.length, active: 0, paused: 0, completed: 0, cancelled: 0 };
    for (const c of campaigns) m[c.status] = (m[c.status] ?? 0) + 1;
    return m;
  }, [campaigns]);

  const filtered = useMemo(() => {
    let list = campaigns;
    if (statusFilter !== "all") list = list.filter((c) => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        `${c.name} ${c.description ?? ""} ${c.tags.employees.map((e) => `${e.about.firstName} ${e.about.lastName}`).join(" ")} ${c.tags.departments.map((d) => d.title).join(" ")} ${c.tags.teams.map((t) => t.name).join(" ")}`.toLowerCase().includes(q),
      );
    }
    if (sortMode === "name") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list = [...list].sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime());
    }
    return list;
  }, [campaigns, statusFilter, search, sortMode]);

  function openCreateModal() {
    setEditingCampaign(null);
    setFormName("");
    setFormDesc("");
    setFormStatus("active");
    setFormStart("");
    setFormEnd("");
    setFormBudget("");
    setFormNotes("");
    setFormTagEmployees([]);
    setFormTagDepts([]);
    setFormTagTeams([]);
    setModalOpen(true);
  }

  function openEditModal(c: Campaign) {
    setEditingCampaign(c);
    setFormName(c.name);
    setFormDesc(c.description ?? "");
    setFormStatus(c.status);
    setFormStart(c.startDate ? c.startDate.slice(0, 10) : "");
    setFormEnd(c.endDate ? c.endDate.slice(0, 10) : "");
    setFormBudget(c.budget ?? "");
    setFormNotes(c.notes ?? "");
    setFormTagEmployees(c.tags.employees.map((e) => e._id));
    setFormTagDepts(c.tags.departments.map((d) => d._id));
    setFormTagTeams(c.tags.teams.map((t) => t._id));
    setModalOpen(true);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        description: formDesc,
        status: formStatus,
        startDate: formStart || null,
        endDate: formEnd || null,
        budget: formBudget,
        notes: formNotes,
        tagEmployees: formTagEmployees,
        tagDepartments: formTagDepts,
        tagTeams: formTagTeams,
      };
      if (editingCampaign) {
        await fetch(`/api/campaigns/${editingCampaign._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/campaigns", {
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
      await fetch(`/api/campaigns/${deleteTarget._id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await load();
    } catch {
      /* ignore */
    }
    setDeleting(false);
  }

  async function toggleActive(c: Campaign) {
    await fetch(`/api/campaigns/${c._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    await load();
  }

  async function quickStatus(c: Campaign, newStatus: CampaignStatus) {
    await fetch(`/api/campaigns/${c._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await load();
  }

  function toggleArrayItem(arr: string[], item: string): string[] {
    return arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];
  }

  if (loading) {
    return (
      <motion.div className="space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="space-y-2"><div className="shimmer h-5 w-28 rounded" /><div className="shimmer h-8 w-48 rounded" /></div>
          <div className="shimmer h-9 w-36 rounded-lg" />
        </div>
        <div className="shimmer h-12 rounded-2xl" />
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="shimmer h-52 rounded-2xl" />)}
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
          <h1 className="text-title">Campaigns</h1>
          <p className="text-subhead hidden sm:block">
            {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""} · {statusCounts.active} active
          </p>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          {(["recent", "name"] as SortMode[]).map((s) => (
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
              {s === "recent" ? "Recent" : "A – Z"}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Search + Add */}
      <motion.div
        className="card-static p-4 mb-4 flex gap-3 items-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns..."
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
          New Campaign
        </motion.button>
      </motion.div>

      {/* Status filter pills */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          {(["all", "active", "paused", "completed", "cancelled"] as StatusFilter[]).map((s) => (
            <motion.button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                statusFilter === s ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
              }`}
            >
              {s === "all" ? `All (${statusCounts.all})` : `${STATUS_CONFIG[s].label} (${statusCounts[s] ?? 0})`}
            </motion.button>
          ))}
        </div>
        {(search || statusFilter !== "all") && (
          <button type="button" onClick={() => { setSearch(""); setStatusFilter("all"); }} className="text-xs font-medium transition-colors" style={{ color: "var(--primary)" }}>
            Clear
          </button>
        )}
      </div>

      {/* Cards */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="col-span-full card card-shine p-12 text-center">
              <p style={{ color: "var(--fg-secondary)" }}>No campaigns found. Create one above.</p>
            </motion.div>
          ) : (
            filtered.map((c, i) => {
              const grad = CARD_GRADIENTS[i % CARD_GRADIENTS.length];
              const sc = STATUS_CONFIG[c.status];
              const totalTags = c.tags.employees.length + c.tags.departments.length + c.tags.teams.length;

              return (
                <motion.div
                  key={c._id}
                  layout
                  className="h-full"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.3) }}
                >
                  <div className="card card-shine group relative overflow-hidden flex h-full flex-col">
                    <div className="flex-1 p-3 sm:p-4">
                      {/* Header row */}
                      <div className="flex items-start gap-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white ${grad}`}>
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate" style={{ color: "var(--fg)" }}>{c.name}</p>
                          {c.description && <p className="text-caption line-clamp-1 mt-0.5">{c.description}</p>}
                        </div>
                        {/* Status badge */}
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: sc.bg, color: sc.color }}>
                          {sc.label}
                        </span>
                      </div>

                      {/* Info rows */}
                      <div className="mt-3 space-y-1.5 text-[13px]">
                        <div className="flex items-center justify-between">
                          <span style={{ color: "var(--fg-tertiary)" }}>Duration</span>
                          <span className="font-medium" style={{ color: "var(--fg)" }}>
                            {formatDate(c.startDate)} — {formatDate(c.endDate)}
                          </span>
                        </div>
                        {c.budget && (
                          <div className="flex items-center justify-between">
                            <span style={{ color: "var(--fg-tertiary)" }}>Budget</span>
                            <span className="font-medium" style={{ color: "var(--fg)" }}>{c.budget}</span>
                          </div>
                        )}

                        {/* Tagged entities */}
                        {totalTags > 0 && (
                          <div className="pt-1">
                            <span className="text-[11px] font-medium block mb-1" style={{ color: "var(--fg-tertiary)" }}>Tagged</span>
                            <div className="flex flex-wrap gap-1">
                              {c.tags.departments.map((d) => (
                                <span key={d._id} className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--primary)" }}>
                                  {d.title}
                                </span>
                              ))}
                              {c.tags.teams.map((t) => (
                                <span key={t._id} className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "color-mix(in srgb, var(--teal) 10%, transparent)", color: "var(--teal)" }}>
                                  {t.name}
                                </span>
                              ))}
                              {c.tags.employees.map((e) => (
                                <span key={e._id} className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "color-mix(in srgb, var(--purple) 10%, transparent)", color: "var(--purple)" }}>
                                  {e.about.firstName} {e.about.lastName}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {c.notes && (
                          <p className="text-caption line-clamp-2 mt-1 italic">{c.notes}</p>
                        )}
                      </div>

                      {/* Quick status actions */}
                      {c.status === "active" && (
                        <div className="mt-2.5 flex gap-1.5">
                          <motion.button type="button" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} onClick={() => quickStatus(c, "paused")} className="rounded-md px-2 py-1 text-[10px] font-semibold transition-colors" style={{ background: STATUS_CONFIG.paused.bg, color: STATUS_CONFIG.paused.color }}>
                            Pause
                          </motion.button>
                          <motion.button type="button" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} onClick={() => quickStatus(c, "completed")} className="rounded-md px-2 py-1 text-[10px] font-semibold transition-colors" style={{ background: STATUS_CONFIG.completed.bg, color: STATUS_CONFIG.completed.color }}>
                            Complete
                          </motion.button>
                        </div>
                      )}
                      {c.status === "paused" && (
                        <div className="mt-2.5 flex gap-1.5">
                          <motion.button type="button" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} onClick={() => quickStatus(c, "active")} className="rounded-md px-2 py-1 text-[10px] font-semibold transition-colors" style={{ background: STATUS_CONFIG.active.bg, color: STATUS_CONFIG.active.color }}>
                            Resume
                          </motion.button>
                          <motion.button type="button" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} onClick={() => quickStatus(c, "cancelled")} className="rounded-md px-2 py-1 text-[10px] font-semibold transition-colors" style={{ background: STATUS_CONFIG.cancelled.bg, color: STATUS_CONFIG.cancelled.color }}>
                            Cancel
                          </motion.button>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-t" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center gap-2">
                        <StatusToggle active={c.isActive !== false} onChange={() => toggleActive(c)} />
                        <span className="text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                          {c.updatedAt && c.updatedAt !== c.createdAt
                            ? `Updated ${new Date(c.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                            : `Created ${new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openEditModal(c)} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--primary)" }} title="Edit">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </motion.button>
                        <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setDeleteTarget(c)} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--rose)" }} title="Delete">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
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
          <motion.div className="fixed inset-0 z-[60] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
            <motion.div
              className="relative w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto rounded-2xl border p-6 shadow-xl"
              style={{ background: "var(--glass-bg-heavy)", borderColor: "var(--glass-border)" }}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <h2 className="text-headline text-lg mb-4">{editingCampaign ? "Edit Campaign" : "New Campaign"}</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Campaign Name</label>
                  <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Q2 Marketing Push" className="input w-full" autoFocus />
                </div>
                <div>
                  <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Description</label>
                  <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="What is this campaign about?" rows={2} className="input w-full" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Status</label>
                    <select value={formStatus} onChange={(e) => setFormStatus(e.target.value as CampaignStatus)} className="input w-full">
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Budget</label>
                    <input type="text" value={formBudget} onChange={(e) => setFormBudget(e.target.value)} placeholder="$10,000" className="input w-full" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Start Date</label>
                    <input type="date" value={formStart} onChange={(e) => setFormStart(e.target.value)} className="input w-full" />
                  </div>
                  <div>
                    <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>End Date</label>
                    <input type="date" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} className="input w-full" />
                  </div>
                </div>

                {/* Tag: Departments */}
                {allDepartments.length > 0 && (
                  <div>
                    <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Tag Departments</label>
                    <div className="flex flex-wrap gap-1.5">
                      {allDepartments.map((d) => {
                        const active = formTagDepts.includes(d._id);
                        return (
                          <motion.button key={d._id} type="button" onClick={() => setFormTagDepts(toggleArrayItem(formTagDepts, d._id))} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${active ? "text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"}`} style={active ? { background: "var(--primary)" } : { background: "var(--glass-bg)" }}>
                            {d.label}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Tag: Teams */}
                {allTeams.length > 0 && (
                  <div>
                    <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Tag Teams</label>
                    <div className="flex flex-wrap gap-1.5">
                      {allTeams.map((t) => {
                        const active = formTagTeams.includes(t._id);
                        return (
                          <motion.button key={t._id} type="button" onClick={() => setFormTagTeams(toggleArrayItem(formTagTeams, t._id))} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${active ? "text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"}`} style={active ? { background: "var(--teal)" } : { background: "var(--glass-bg)" }}>
                            {t.label}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Tag: Employees */}
                {allEmployees.length > 0 && (
                  <div>
                    <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Tag Employees</label>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {allEmployees.map((e) => {
                        const active = formTagEmployees.includes(e._id);
                        return (
                          <motion.button key={e._id} type="button" onClick={() => setFormTagEmployees(toggleArrayItem(formTagEmployees, e._id))} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${active ? "text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"}`} style={active ? { background: "var(--purple)" } : { background: "var(--glass-bg)" }}>
                            {e.label}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Notes</label>
                  <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Internal notes..." rows={2} className="input w-full" />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <motion.button type="button" onClick={handleSave} disabled={saving || !formName.trim()} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm flex-1">
                  {saving ? "Saving..." : editingCampaign ? "Update" : "Create"}
                </motion.button>
                <button type="button" onClick={() => setModalOpen(false)} className="btn btn-secondary btn-sm flex-1">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </Portal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Campaign"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </motion.div>
  );
}
