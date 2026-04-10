"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainerFast, cardVariants, cardHover } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { StatusToggle } from "../components/DataTable";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Portal } from "../components/Portal";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { useGuide } from "@/lib/useGuide";
import { campaignsTour } from "@/lib/tourConfigs";
import { formatShortDate } from "@/lib/formatters";

type CampaignStatus = "active" | "paused" | "completed" | "cancelled";

interface TaggedEmployee {
  _id: string;
  about: { firstName: string; lastName: string };
  email: string;
}

interface TaggedDept {
  _id: string;
  title: string;
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

type StatusFilter = "all" | CampaignStatus;
type SortMode = "recent" | "name";

const formatDate = formatShortDate;

export default function CampaignsPage() {
  const { status: sessionStatus } = useSession();
  const { registerTour } = useGuide();
  useEffect(() => { registerTour("campaigns", campaignsTour); }, [registerTour]);
  const { can: canPerm, canAny: canAnyPerm } = usePermissions();
  const canManageCampaigns = canAnyPerm("campaigns_create", "campaigns_edit");
  const canDeleteCampaigns = canPerm("campaigns_delete");
  const canViewCampaigns = canPerm("campaigns_view");
  const canTagEntities = canPerm("campaigns_tagEntities");
  const { data: campaigns, loading: campaignsLoading, refetch: refetchCampaigns, mutate: mutateCampaigns } = useQuery<Campaign[]>(canViewCampaigns ? "/api/campaigns" : null, "campaigns");
  const { data: employeesRaw } = useQuery<Array<Record<string, unknown>>>(canTagEntities ? "/api/employees/dropdown" : null, "employees");
  const { data: deptsRaw } = useQuery<Array<Record<string, unknown>>>(canTagEntities ? "/api/departments" : null, "departments");

  const campaignList = campaigns ?? [];
  const allEmployees: SelectOption[] = useMemo(
    () =>
      (employeesRaw ?? []).map((e) => ({
        _id: e._id as string,
        label: `${(e.about as { firstName: string; lastName: string }).firstName} ${(e.about as { firstName: string; lastName: string }).lastName}`,
      })),
    [employeesRaw],
  );
  const allDepartments: SelectOption[] = useMemo(
    () => (deptsRaw ?? []).map((d) => ({ _id: d._id as string, label: d.title as string })),
    [deptsRaw],
  );
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
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState(false);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = { all: campaignList.length, active: 0, paused: 0, completed: 0, cancelled: 0 };
    for (const c of campaignList) m[c.status] = (m[c.status] ?? 0) + 1;
    return m;
  }, [campaignList]);

  const filtered = useMemo(() => {
    let list = campaignList;
    if (statusFilter !== "all") list = list.filter((c) => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        `${c.name} ${c.description ?? ""} ${c.tags.employees.map((e) => `${e.about.firstName} ${e.about.lastName}`).join(" ")} ${c.tags.departments.map((d) => d.title).join(" ")}`.toLowerCase().includes(q),
      );
    }
    if (sortMode === "name") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list = [...list].sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime());
    }
    return list;
  }, [campaignList, statusFilter, search, sortMode]);

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
    setModalOpen(true);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: formName.trim(),
        description: formDesc,
        status: formStatus,
        startDate: formStart || null,
        endDate: formEnd || null,
        budget: formBudget,
        notes: formNotes,
        tagEmployees: formTagEmployees,
        tagDepartments: formTagDepts,
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
      await refetchCampaigns();
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
      await refetchCampaigns();
    } catch {
      /* ignore */
    }
    setDeleting(false);
  }

  async function toggleActive(c: Campaign) {
    const newStatus = !(c.isActive !== false);
    mutateCampaigns((prev) =>
      prev ? prev.map((x) => (x._id === c._id ? { ...x, isActive: newStatus } : x)) : prev,
    );
    try {
      const res = await fetch(`/api/campaigns/${c._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newStatus }),
      });
      if (!res.ok) {
        mutateCampaigns((prev) =>
          prev ? prev.map((x) => (x._id === c._id ? { ...x, isActive: !newStatus } : x)) : prev,
        );
      }
    } catch {
      mutateCampaigns((prev) =>
        prev ? prev.map((x) => (x._id === c._id ? { ...x, isActive: !newStatus } : x)) : prev,
      );
    }
  }

  async function quickStatus(c: Campaign, newStatus: CampaignStatus) {
    await fetch(`/api/campaigns/${c._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await refetchCampaigns();
  }

  function toggleArrayItem(arr: string[], item: string): string[] {
    return arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <div data-tour="campaigns-header" className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-title">Campaigns</h1>
          <p className="text-subhead">
            {campaignsLoading && !campaigns ? (
              <span className="inline-block h-3 w-44 max-w-[55vw] rounded align-middle shimmer" aria-hidden />
            ) : (
              <>
                {campaignList.length} campaign{campaignList.length !== 1 ? "s" : ""} · {statusCounts.active} active
                <span className="text-[var(--fg-tertiary)]"> — tag departments and people; several depts can share one campaign.</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          {(["recent", "name"] as SortMode[]).map((s) => (
            <motion.button
              key={s}
              type="button"
              onClick={() => setSortMode(s)}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                sortMode === s ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
              }`}
            >
              {s === "recent" ? "Recent" : "A – Z"}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Search + Add */}
      <div className="card-static mb-4 flex items-center gap-3 p-4">
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
        {canManageCampaigns && sessionStatus !== "loading" && (
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
        )}
      </div>

      {/* Status filter pills */}
      <div data-tour="campaigns-filters" className="mb-4 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          {(["all", "active", "paused", "completed", "cancelled"] as StatusFilter[]).map((s) => (
            <motion.button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              whileTap={{ scale: 0.97 }}
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
      <motion.div data-tour="campaigns-grid" className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4" variants={staggerContainerFast} initial="hidden" animate="visible">
        <AnimatePresence mode="popLayout">
          {campaignsLoading && !campaigns ? (
            [1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <motion.div key={`skel-${i}`} variants={cardVariants} custom={i} className="h-full">
                <div className="card flex h-full flex-col overflow-hidden">
                  <div className="flex-1 p-2.5">
                    <div className="flex items-center justify-between">
                      <div className="shimmer h-3.5 w-28 rounded" />
                      <div className="shimmer h-4 w-14 rounded-full" />
                    </div>
                    <div className="shimmer mt-0.5 h-2.5 w-full max-w-[160px] rounded" />
                    <div className="mt-1.5 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <div className="shimmer h-2.5 w-14 rounded" />
                        <div className="shimmer h-2.5 w-32 rounded" />
                      </div>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        <div className="shimmer h-4 w-14 rounded-full" />
                        <div className="shimmer h-4 w-16 rounded-full" />
                      </div>
                    </div>
                    <div className="mt-1 flex gap-1">
                      <div className="shimmer h-5 w-12 rounded-md" />
                      <div className="shimmer h-5 w-14 rounded-md" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t px-2.5 py-1.5" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-2">
                      <div className="shimmer h-5 w-10 rounded-full" />
                      <div className="shimmer h-2.5 w-24 rounded" />
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="shimmer h-6 w-6 rounded-lg" />
                      <div className="shimmer h-6 w-6 rounded-lg" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          ) : filtered.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="col-span-full card p-12 text-center">
              <p style={{ color: "var(--fg-secondary)" }}>No campaigns found. Create one above.</p>
            </motion.div>
          ) : (
            filtered.map((c, i) => {
              const sc = STATUS_CONFIG[c.status];
              const totalTags = c.tags.employees.length + c.tags.departments.length;

              return (
                <motion.div
                  key={c._id}
                  variants={cardVariants}
                  custom={i}
                  whileHover={cardHover}
                  layout
                  layoutId={c._id}
                  className="h-full"
                  exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                  transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
                >
                  <div className={`card group relative overflow-hidden flex h-full flex-col transition-opacity duration-300 ${c.isActive === false ? "opacity-50 grayscale" : ""}`}>
                    <div className="flex-1 p-2.5">
                      {/* Header row */}
                      <div className="flex items-start gap-2 justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            <p className="text-[13px] font-semibold truncate flex-1 min-w-0" style={{ color: "var(--fg)" }}>{c.name}</p>
                            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: sc.bg, color: sc.color }}>
                              {sc.label}
                            </span>
                          </div>
                          {c.description && <p className="text-caption line-clamp-1 mt-0.5 text-[10px]" style={{ color: "var(--fg-secondary)" }}>{c.description}</p>}
                        </div>
                      </div>

                      {/* Info rows */}
                      <div className="mt-1.5 space-y-0.5 text-[11px]">
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
                            <span className="text-[11px] font-medium block mb-0.5" style={{ color: "var(--fg-tertiary)" }}>Departments & people</span>
                            <div className="flex flex-wrap gap-1">
                              {c.tags.departments.map((d) => (
                                <span key={d._id} className="rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--primary)" }}>
                                  {d.title}
                                </span>
                              ))}
                              {c.tags.employees.map((e) => (
                                <span key={e._id} className="rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ background: "color-mix(in srgb, var(--purple) 10%, transparent)", color: "var(--purple)" }}>
                                  {e.about.firstName} {e.about.lastName}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {c.notes && (
                          <p className="line-clamp-1 text-[10px] mt-1 italic" style={{ color: "var(--fg-secondary)" }}>{c.notes}</p>
                        )}
                      </div>

                      {canManageCampaigns && c.status === "active" && (
                        <div className="mt-1.5 flex gap-1">
                          <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => quickStatus(c, "paused")} className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold transition-colors" style={{ background: STATUS_CONFIG.paused.bg, color: STATUS_CONFIG.paused.color }}>
                            Pause
                          </motion.button>
                          <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => quickStatus(c, "completed")} className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold transition-colors" style={{ background: STATUS_CONFIG.completed.bg, color: STATUS_CONFIG.completed.color }}>
                            Complete
                          </motion.button>
                        </div>
                      )}
                      {canManageCampaigns && c.status === "paused" && (
                        <div className="mt-1.5 flex gap-1">
                          <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => quickStatus(c, "active")} className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold transition-colors" style={{ background: STATUS_CONFIG.active.bg, color: STATUS_CONFIG.active.color }}>
                            Resume
                          </motion.button>
                          <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => quickStatus(c, "cancelled")} className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold transition-colors" style={{ background: STATUS_CONFIG.cancelled.bg, color: STATUS_CONFIG.cancelled.color }}>
                            Cancel
                          </motion.button>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-2.5 py-1.5 border-t" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center gap-2">
                        {canManageCampaigns && <StatusToggle active={c.isActive !== false} onChange={() => toggleActive(c)} />}
                        <span className="text-[10px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                          {c.updatedAt && c.updatedAt !== c.createdAt
                            ? `Updated ${new Date(c.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                            : `Created ${new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
                        </span>
                      </div>
                      {(canManageCampaigns || canDeleteCampaigns) && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        {canManageCampaigns && (
                          <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => openEditModal(c)} className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--primary)" }} title="Edit">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </motion.button>
                        )}
                        {canDeleteCampaigns && (
                          <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => setDeleteTarget(c)} className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--rose)" }} title="Delete">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                          </motion.button>
                        )}
                      </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </motion.div>

      {/* Create/Edit Modal */}
      <Portal>
      <AnimatePresence>
        {modalOpen && (
          <motion.div className="fixed inset-0 z-[60] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
            <motion.div
              className="relative w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto rounded-2xl border p-6 shadow-xl"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
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
                {canTagEntities && allDepartments.length > 0 && (
                  <div>
                    <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Tag Departments</label>
                    <div className="flex flex-wrap gap-1.5">
                      {allDepartments.map((d) => {
                        const active = formTagDepts.includes(d._id);
                        return (
                          <motion.button key={d._id} type="button" onClick={() => setFormTagDepts(toggleArrayItem(formTagDepts, d._id))} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${active ? "text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"}`} style={active ? { background: "var(--primary)" } : { background: "var(--bg-grouped)" }}>
                            {d.label}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Tag: Employees */}
                {canTagEntities && allEmployees.length > 0 && (
                  <div>
                    <label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Tag Employees</label>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {allEmployees.map((e) => {
                        const active = formTagEmployees.includes(e._id);
                        return (
                          <motion.button key={e._id} type="button" onClick={() => setFormTagEmployees(toggleArrayItem(formTagEmployees, e._id))} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${active ? "text-white shadow-sm" : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"}`} style={active ? { background: "var(--purple)" } : { background: "var(--bg-grouped)" }}>
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
    </div>
  );
}
