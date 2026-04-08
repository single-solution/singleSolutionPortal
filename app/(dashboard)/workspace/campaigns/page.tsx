"use client";

import { useSession } from "next-auth/react";
import { useMemo, useState, useCallback, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cardHover, cardVariants, staggerContainerFast } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { Portal } from "../../components/Portal";

/* ─── types ─── */

type CampaignStatus = "active" | "paused" | "completed" | "cancelled";
interface TaggedEmployee { _id: string; about: { firstName: string; lastName: string }; email: string }
interface TaggedDept { _id: string; title: string }
interface Campaign {
  _id: string; name: string; slug: string; description?: string; status: CampaignStatus;
  startDate?: string; endDate?: string; budget?: string;
  tags: { employees: TaggedEmployee[]; departments: TaggedDept[]; teams: { _id: string; name: string }[] };
  notes?: string; isActive: boolean;
  createdBy?: { about: { firstName: string; lastName: string } };
  createdAt: string; updatedAt?: string;
}
interface Task {
  _id: string; title: string; description?: string; priority: string; status: string;
  deadline?: string;
  assignedTo?: { _id: string; about?: { firstName: string; lastName: string }; department?: { _id: string; title: string } | string };
  createdAt: string;
}

type Selection = { kind: "none" } | { kind: "status"; status: CampaignStatus } | { kind: "campaign"; id: string };

/* ─── constants ─── */

const STATUS_ORDER: CampaignStatus[] = ["active", "paused", "completed", "cancelled"];
const STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string; bg: string; icon: string }> = {
  active:    { label: "Active",    color: "var(--teal)",    bg: "color-mix(in srgb, var(--teal) 12%, transparent)",    icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
  paused:    { label: "Paused",    color: "var(--amber)",   bg: "color-mix(in srgb, var(--amber) 12%, transparent)",   icon: "M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  completed: { label: "Completed", color: "var(--primary)", bg: "color-mix(in srgb, var(--primary) 12%, transparent)", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  cancelled: { label: "Cancelled", color: "var(--rose)",    bg: "color-mix(in srgb, var(--rose) 12%, transparent)",    icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" },
};
const TASK_STATUS_LABELS: Record<string, string> = { pending: "Pending", inProgress: "In Progress", completed: "Completed" };
const PRIORITY_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
const PRIORITY_COLORS: Record<string, string> = { low: "var(--primary)", medium: "var(--amber)", high: "var(--rose)", urgent: "#ef4444" };

/* ─── helpers ─── */

function formatDate(d?: string) { if (!d) return "—"; return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function deptIdOf(a: Task["assignedTo"]): string | null { const d = a?.department; if (!d) return null; if (typeof d === "string") return d; if (typeof d === "object" && "_id" in d) return String((d as { _id: string })._id); return null; }
function tasksLinkedToCampaign(c: Campaign, tasks: Task[]): Task[] {
  const empIds = new Set(c.tags.employees.map((e) => e._id));
  const deptIds = new Set(c.tags.departments.map((d) => d._id));
  return tasks.filter((t) => { const aid = t.assignedTo?._id; if (aid && empIds.has(aid)) return true; const did = deptIdOf(t.assignedTo); return !!(did && deptIds.has(did)); });
}
function campaignProgress(c: Campaign, tasks: Task[]) { const linked = tasksLinkedToCampaign(c, tasks); const total = linked.length; const done = linked.filter((t) => t.status === "completed").length; return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) }; }

/* ─── sub-components ─── */

function NavPill({ active, onClick, children, badge }: { active: boolean; onClick: () => void; children: ReactNode; badge?: number }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
      style={{ borderColor: active ? "var(--primary)" : "var(--border)", background: active ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--bg-elevated)", color: active ? "var(--primary)" : "var(--fg-secondary)" }}>
      {children}
      {badge !== undefined && <span className="tabular-nums rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>{badge}</span>}
    </button>
  );
}

/* ─── main ─── */

interface SelectOption { _id: string; label: string }

export default function CampaignsPage() {
  const { status: sessionStatus } = useSession();
  const { data: campaigns, loading: campaignsLoading, refetch: refetchCampaigns } = useQuery<Campaign[]>("/api/campaigns", "workspace-campaigns");
  const { data: tasks } = useQuery<Task[]>("/api/tasks", "workspace-tasks");
  const { data: employeesRaw } = useQuery<Array<Record<string, unknown>>>("/api/employees/dropdown", "ws-emp-dropdown");
  const { data: deptsRaw } = useQuery<Array<Record<string, unknown>>>("/api/departments", "ws-dept-dropdown");

  const allEmployees: SelectOption[] = useMemo(() => (employeesRaw ?? []).map((e) => ({ _id: e._id as string, label: `${(e.about as { firstName: string; lastName: string }).firstName} ${(e.about as { firstName: string; lastName: string }).lastName}` })), [employeesRaw]);
  const allDepartments: SelectOption[] = useMemo(() => (deptsRaw ?? []).map((d) => ({ _id: d._id as string, label: d.title as string })), [deptsRaw]);

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

  function openCreate() {
    setEditingCampaign(null); setFormName(""); setFormDesc(""); setFormStatus("active");
    setFormStart(""); setFormEnd(""); setFormBudget(""); setFormNotes("");
    setFormTagEmployees([]); setFormTagDepts([]); setModalOpen(true);
  }
  function openEdit(c: Campaign) {
    setEditingCampaign(c); setFormName(c.name); setFormDesc(c.description ?? ""); setFormStatus(c.status);
    setFormStart(c.startDate ? c.startDate.slice(0, 10) : ""); setFormEnd(c.endDate ? c.endDate.slice(0, 10) : "");
    setFormBudget(c.budget ?? ""); setFormNotes(c.notes ?? "");
    setFormTagEmployees(c.tags.employees.map((e) => e._id)); setFormTagDepts(c.tags.departments.map((d) => d._id));
    setModalOpen(true);
  }
  async function handleSaveCampaign() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { name: formName.trim(), description: formDesc, status: formStatus, startDate: formStart || null, endDate: formEnd || null, budget: formBudget, notes: formNotes, tagEmployees: formTagEmployees, tagDepartments: formTagDepts, tagTeams: editingCampaign ? editingCampaign.tags.teams.map((t) => t._id) : [] };
      if (editingCampaign) await fetch(`/api/campaigns/${editingCampaign._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      else await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setModalOpen(false); await refetchCampaigns();
    } catch { /* ignore */ }
    setSaving(false);
  }
  function toggleArr(arr: string[], item: string): string[] { return arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item]; }
  const campaignList = useMemo(() => campaigns ?? [], [campaigns]);
  const taskList = useMemo(() => tasks ?? [], [tasks]);

  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [expandedStatuses, setExpandedStatuses] = useState<Set<CampaignStatus>>(() => new Set(["active"]));
  const [search, setSearch] = useState("");

  const byStatus = useMemo(() => {
    const m: Record<CampaignStatus, Campaign[]> = { active: [], paused: [], completed: [], cancelled: [] };
    for (const c of campaignList) m[c.status].push(c);
    for (const arr of Object.values(m)) arr.sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime());
    return m;
  }, [campaignList]);

  const toggleStatus = useCallback((s: CampaignStatus) => {
    setExpandedStatuses((prev) => { const next = new Set(prev); if (next.has(s)) next.delete(s); else next.add(s); return next; });
  }, []);

  const selectedCampaign = useMemo(() => {
    if (selection.kind !== "campaign") return null;
    return campaignList.find((c) => c._id === selection.id) ?? null;
  }, [selection, campaignList]);

  const filteredForGrid = useMemo(() => {
    let list = campaignList;
    if (selection.kind === "status") list = byStatus[selection.status];
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter((c) => `${c.name} ${c.description ?? ""}`.toLowerCase().includes(q)); }
    return [...list].sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime());
  }, [campaignList, byStatus, selection, search]);

  const loading = campaignsLoading;

  /* ── sidebar tree ── */
  const sidebarTree = (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={() => setSelection({ kind: "none" })}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold transition-colors"
        style={{ background: selection.kind === "none" ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent", color: selection.kind === "none" ? "var(--primary)" : "var(--fg)" }}>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" /></svg>
        </span>
        All Campaigns
        <span className="ml-auto tabular-nums text-[10px] font-normal" style={{ color: "var(--fg-tertiary)" }}>{campaignList.length}</span>
      </button>

      {STATUS_ORDER.map((status) => {
        const items = byStatus[status];
        if (items.length === 0) return null;
        const expanded = expandedStatuses.has(status);
        const sc = STATUS_CONFIG[status];
        return (
          <div key={status}>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => toggleStatus(status)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors" style={{ color: "var(--fg-tertiary)" }}>
                <motion.svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" animate={{ rotate: expanded ? 90 : 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </motion.svg>
              </button>
              <button type="button"
                onClick={() => { setSelection({ kind: "status", status }); if (!expanded) toggleStatus(status); }}
                className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-sm font-medium transition-colors"
                style={{ background: selection.kind === "status" && selection.status === status ? sc.bg : "transparent", color: selection.kind === "status" && selection.status === status ? sc.color : "var(--fg)" }}>
                <span className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke={sc.color} strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={sc.icon} /></svg>
                  {sc.label}
                </span>
                <span className="text-[10px] font-normal tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{items.length} campaign{items.length !== 1 ? "s" : ""}</span>
              </button>
            </div>
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                  className="ml-7 overflow-hidden border-l pl-2" style={{ borderColor: "var(--border)" }}>
                  {items.map((c) => {
                    const isSelected = selection.kind === "campaign" && selection.id === c._id;
                    return (
                      <button key={c._id} type="button" onClick={() => setSelection({ kind: "campaign", id: c._id })}
                        className="mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors"
                        style={{ background: isSelected ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "transparent", color: isSelected ? "var(--primary)" : "var(--fg-secondary)" }}>
                        <span className="min-w-0 truncate font-medium">{c.name}</span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );

  /* ── mobile pills ── */
  const mobilePills = (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <NavPill active={selection.kind === "none"} onClick={() => setSelection({ kind: "none" })} badge={campaignList.length}>All</NavPill>
      {STATUS_ORDER.map((s) => byStatus[s].length > 0 && (
        <NavPill key={s} active={selection.kind === "status" && selection.status === s} onClick={() => setSelection({ kind: "status", status: s })} badge={byStatus[s].length}>
          {STATUS_CONFIG[s].label}
        </NavPill>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1600px]">
      {/* top bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 max-w-md">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaigns..." className="input w-full" style={{ paddingLeft: "40px" }} />
        </div>
        {sessionStatus !== "loading" && (
          <button type="button" onClick={openCreate} className="btn btn-primary btn-sm shrink-0 justify-center sm:justify-start">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            New Campaign
          </button>
        )}
      </div>

      {/* mobile pills */}
      <div className="mb-4 md:hidden">{mobilePills}</div>

      <div className="flex gap-6">
        {/* sidebar — desktop */}
        <aside className="hidden w-64 shrink-0 md:block">
          <div className="sticky top-20 frosted rounded-2xl p-3 max-h-[calc(100vh-140px)] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {loading ? (
              <div className="space-y-2 p-2">{[1, 2, 3].map((i) => <div key={i} className="shimmer h-8 w-full rounded-lg" />)}</div>
            ) : sidebarTree}
          </div>
        </aside>

        {/* main content */}
        <div className="min-w-0 flex-1">
          {/* campaign detail panel — shown when a specific campaign is selected */}
          <AnimatePresence mode="wait">
            {selectedCampaign ? (
              <motion.div key={`detail-${selectedCampaign._id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                <CampaignDetail c={selectedCampaign} taskList={taskList} onBack={() => setSelection({ kind: "status", status: selectedCampaign.status })} onEdit={() => openEdit(selectedCampaign)} />
              </motion.div>
            ) : (
              <motion.div key="grid" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                <motion.div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" variants={staggerContainerFast} initial="hidden" animate="visible">
                  <AnimatePresence mode="popLayout">
                    {loading ? (
                      [1, 2, 3, 4, 5, 6].map((i) => (
                        <motion.div key={`skel-${i}`} variants={cardVariants} custom={i} className="h-full">
                          <div className="card-xl flex h-full flex-col overflow-hidden p-3"><div className="shimmer h-4 w-3/4 rounded" /><div className="mt-2 shimmer h-2 w-1/2 rounded" /><div className="mt-3 shimmer h-2 w-full rounded" /></div>
                        </motion.div>
                      ))
                    ) : filteredForGrid.length === 0 ? (
                      <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card-xl col-span-full p-12 text-center">
                        <p style={{ color: "var(--fg-secondary)" }}>No campaigns match your filters.</p>
                      </motion.div>
                    ) : (
                      filteredForGrid.map((c, i) => <CampaignCard key={c._id} c={c} i={i} taskList={taskList} onSelect={() => setSelection({ kind: "campaign", id: c._id })} />)
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Portal>
        <AnimatePresence>
          {modalOpen && (
            <motion.div className="fixed inset-0 z-[60] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
              <motion.div
                className="relative w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto rounded-2xl border p-6 shadow-xl"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-headline text-lg mb-4">{editingCampaign ? "Edit Campaign" : "New Campaign"}</h2>
                <div className="space-y-3">
                  <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Name</label><input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Q2 Marketing Push" className="input w-full" autoFocus /></div>
                  <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Description</label><textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} className="input w-full" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Status</label><select value={formStatus} onChange={(e) => setFormStatus(e.target.value as CampaignStatus)} className="input w-full"><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Budget</label><input type="text" value={formBudget} onChange={(e) => setFormBudget(e.target.value)} className="input w-full" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Start</label><input type="date" value={formStart} onChange={(e) => setFormStart(e.target.value)} className="input w-full" /></div>
                    <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>End</label><input type="date" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} className="input w-full" /></div>
                  </div>
                  {allDepartments.length > 0 && (<div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Departments</label><div className="flex flex-wrap gap-1.5">{allDepartments.map((d) => (<button key={d._id} type="button" onClick={() => setFormTagDepts(toggleArr(formTagDepts, d._id))} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${formTagDepts.includes(d._id) ? "text-white shadow-sm" : "text-[var(--fg-secondary)]"}`} style={formTagDepts.includes(d._id) ? { background: "var(--primary)" } : { background: "var(--bg-grouped)" }}>{d.label}</button>))}</div></div>)}
                  {allEmployees.length > 0 && (<div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Employees</label><div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">{allEmployees.map((e) => (<button key={e._id} type="button" onClick={() => setFormTagEmployees(toggleArr(formTagEmployees, e._id))} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${formTagEmployees.includes(e._id) ? "text-white shadow-sm" : "text-[var(--fg-secondary)]"}`} style={formTagEmployees.includes(e._id) ? { background: "var(--purple)" } : { background: "var(--bg-grouped)" }}>{e.label}</button>))}</div></div>)}
                  <div><label className="text-footnote font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Notes</label><textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} className="input w-full" /></div>
                </div>
                <div className="flex gap-2 mt-5">
                  <motion.button type="button" onClick={handleSaveCampaign} disabled={saving || !formName.trim()} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm flex-1">{saving ? "Saving…" : editingCampaign ? "Update" : "Create"}</motion.button>
                  <button type="button" onClick={() => setModalOpen(false)} className="btn btn-secondary btn-sm flex-1">Cancel</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}

/* ─── campaign card ─── */

function CampaignCard({ c, i, taskList, onSelect }: { c: Campaign; i: number; taskList: Task[]; onSelect: () => void }) {
  const sc = STATUS_CONFIG[c.status];
  const { done, total, pct } = campaignProgress(c, taskList);
  return (
    <motion.button type="button" variants={cardVariants} custom={i} whileHover={cardHover} layout onClick={onSelect}
      className="h-full text-left" style={{ borderRadius: "var(--radius-xl, 1rem)" }}>
      <div className={`card-xl flex h-full flex-col overflow-hidden transition-opacity ${c.isActive === false ? "opacity-60 grayscale" : ""}`}>
        <div className="flex flex-1 flex-col p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: "var(--fg)" }}>{c.name}</p>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
          </div>
          <div className="mt-1.5 text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{formatDate(c.startDate)} — {formatDate(c.endDate)}</div>
          {(c.tags.departments.length > 0 || c.tags.employees.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {c.tags.departments.map((d) => <span key={d._id} className="rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--primary)" }}>{d.title}</span>)}
              {c.tags.employees.slice(0, 3).map((e) => <span key={e._id} className="rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ background: "color-mix(in srgb, var(--purple) 10%, transparent)", color: "var(--purple)" }}>{e.about.firstName}</span>)}
              {c.tags.employees.length > 3 && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ color: "var(--fg-tertiary)" }}>+{c.tags.employees.length - 3}</span>}
            </div>
          )}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
              <span>Progress</span><span className="tabular-nums">{total === 0 ? "No linked tasks" : `${done}/${total}`}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bg-grouped)" }}>
              <motion.div className="h-full rounded-full" style={{ background: "var(--teal)" }} initial={{ width: 0 }} animate={{ width: `${total === 0 ? 0 : pct}%` }} transition={{ type: "spring", stiffness: 200, damping: 28 }} />
            </div>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

/* ─── campaign detail ─── */

function CampaignDetail({ c, taskList, onBack, onEdit }: { c: Campaign; taskList: Task[]; onBack: () => void; onEdit?: () => void }) {
  const sc = STATUS_CONFIG[c.status];
  const linked = tasksLinkedToCampaign(c, taskList);
  const { done, total, pct } = campaignProgress(c, taskList);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs font-medium transition-colors hover:underline" style={{ color: "var(--primary)" }}>
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        Back to campaigns
      </button>
      {onEdit && <button type="button" onClick={onEdit} className="flex items-center gap-1 text-xs font-medium transition-colors hover:underline" style={{ color: "var(--fg-secondary)" }}>
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
        Edit
      </button>}
      </div>

      <div className="card-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold" style={{ color: "var(--fg)" }}>{c.name}</h2>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
          {c.isActive === false && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>Inactive</span>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat label="Duration" value={`${formatDate(c.startDate)} — ${formatDate(c.endDate)}`} />
          {c.budget && <MiniStat label="Budget" value={c.budget} />}
          <MiniStat label="Progress" value={total === 0 ? "No tasks" : `${done}/${total} done (${pct}%)`} color="var(--teal)" />
          <MiniStat label="Departments" value={String(c.tags.departments.length)} />
        </div>

        {c.description && <p className="text-sm leading-relaxed" style={{ color: "var(--fg)" }}>{c.description}</p>}

        {/* progress bar */}
        <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-grouped)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${total === 0 ? 0 : pct}%`, background: "var(--teal)" }} />
        </div>

        {/* tags */}
        {(c.tags.departments.length > 0 || c.tags.employees.length > 0) && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--fg-tertiary)" }}>Tags</p>
            <div className="flex flex-wrap gap-1">
              {c.tags.departments.map((d) => <span key={d._id} className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--primary)" }}>{d.title}</span>)}
              {c.tags.employees.map((e) => <span key={e._id} className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "color-mix(in srgb, var(--purple) 10%, transparent)", color: "var(--purple)" }}>{e.about.firstName} {e.about.lastName}</span>)}
            </div>
          </div>
        )}

        {c.notes && <p className="text-sm italic" style={{ color: "var(--fg-secondary)" }}>{c.notes}</p>}
      </div>

      {/* linked tasks */}
      {linked.length > 0 && (
        <div className="card-xl overflow-hidden">
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--fg-tertiary)" }}>Linked Tasks ({linked.length})</p>
          </div>
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] gap-3 border-b px-4 py-2 text-[10px] font-bold uppercase tracking-wide sm:grid"
            style={{ borderColor: "var(--border)", color: "var(--fg-tertiary)" }}>
            <span>Title</span><span>Assignee</span><span>Priority</span><span>Status</span><span>Deadline</span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {linked.map((task) => {
              const name = task.assignedTo?.about ? `${task.assignedTo.about.firstName} ${task.assignedTo.about.lastName}` : "—";
              const pc = PRIORITY_COLORS[task.priority] ?? "var(--fg-tertiary)";
              return (
                <div key={task._id} className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] sm:items-center sm:gap-3">
                  <div className="min-w-0"><p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>{task.title}</p></div>
                  <div className="text-[12px]" style={{ color: "var(--fg)" }}>{name}</div>
                  <div><span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `color-mix(in srgb, ${pc} 15%, transparent)`, color: pc }}>{PRIORITY_LABELS[task.priority] ?? task.priority}</span></div>
                  <div><span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{
                    background: task.status === "completed" ? "rgba(48,209,88,0.12)" : task.status === "inProgress" ? "var(--primary-light)" : "var(--bg-grouped)",
                    color: task.status === "completed" ? "var(--teal)" : task.status === "inProgress" ? "var(--primary)" : "var(--fg-secondary)",
                  }}>{TASK_STATUS_LABELS[task.status] ?? task.status}</span></div>
                  <div className="tabular-nums text-[12px]" style={{ color: "var(--fg-tertiary)" }}>{task.deadline ? formatDate(task.deadline) : "—"}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "var(--bg-grouped)" }}>
      <p className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <p className="text-xs font-bold truncate" style={{ color: color ?? "var(--fg)" }}>{value}</p>
    </div>
  );
}
