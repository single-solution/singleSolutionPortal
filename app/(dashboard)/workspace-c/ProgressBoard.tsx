"use client";

import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@/lib/useQuery";
import { ModalShell, EmptyState } from "../components/ui";
import toast from "react-hot-toast";

/* ── types ── */

interface CampaignOption { _id: string; name: string; status?: string }
interface DepartmentOption { _id: string; title: string }
interface EmployeeOption { _id: string; about: { firstName: string; lastName: string }; department?: { id: string; title: string } | null }
interface TaskOption { _id: string; title: string; recurrence?: { frequency: string; days: number[] } | null }

interface DailyCell {
  date: string;
  pctChecked: number | null;
  totalChecklists: number;
  doneChecklists: number;
  oneTimeDone: number;
  oneTimeTotal: number;
}
interface EmployeeRow { _id: string; name: string; email: string; days: DailyCell[] }
interface ProgressPayload { dates: string[]; employees: EmployeeRow[] }

/* ── helpers ── */

const RANGE_OPTIONS: { value: 7 | 14 | 30; label: string }[] = [
  { value: 7, label: "7d" },
  { value: 14, label: "14d" },
  { value: 30, label: "30d" },
];

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function shiftIso(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function shortDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
}

function cellColor(pct: number | null, hasOneTime: boolean): { bg: string; fg: string } {
  if (pct === null) {
    return { bg: hasOneTime ? "color-mix(in srgb, #8b5cf6 10%, transparent)" : "var(--bg)", fg: "var(--fg-tertiary)" };
  }
  if (pct >= 100) return { bg: "color-mix(in srgb, var(--teal) 65%, transparent)", fg: "#fff" };
  if (pct >= 75) return { bg: "color-mix(in srgb, var(--teal) 45%, transparent)", fg: "var(--fg)" };
  if (pct >= 50) return { bg: "color-mix(in srgb, var(--amber) 45%, transparent)", fg: "var(--fg)" };
  if (pct >= 25) return { bg: "color-mix(in srgb, var(--amber) 25%, transparent)", fg: "var(--fg)" };
  if (pct > 0) return { bg: "color-mix(in srgb, var(--rose) 25%, transparent)", fg: "var(--fg)" };
  return { bg: "color-mix(in srgb, var(--rose) 14%, transparent)", fg: "var(--fg-secondary)" };
}

export function ProgressBoard() {
  const [range, setRange] = useState<7 | 14 | 30>(14);
  const [campaignId, setCampaignId] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [taskId, setTaskId] = useState<string>("");
  const [drawerRow, setDrawerRow] = useState<EmployeeRow | null>(null);

  const endDate = todayIso();
  const startDate = shiftIso(endDate, -(range - 1));

  /* dropdowns */
  const { data: campaignsRaw } = useQuery<CampaignOption[]>("/api/campaigns", "wsc-progress-campaigns");
  const { data: departmentsRaw } = useQuery<DepartmentOption[]>("/api/departments", "wsc-progress-depts");
  const { data: employeesRaw } = useQuery<Array<Record<string, unknown>>>("/api/employees/dropdown", "wsc-progress-emp");
  const { data: tasksRaw } = useQuery<TaskOption[]>(campaignId ? `/api/tasks?campaignId=${campaignId}` : "/api/tasks", "wsc-progress-tasks");

  const campaigns = useMemo(() => campaignsRaw ?? [], [campaignsRaw]);
  const departments = useMemo(() => departmentsRaw ?? [], [departmentsRaw]);
  const employees = useMemo(() => {
    const raw = (employeesRaw ?? []) as unknown as EmployeeOption[];
    return raw.filter((e) => !departmentId || e.department?.id === departmentId);
  }, [employeesRaw, departmentId]);
  const tasks = useMemo(() => {
    const raw = (tasksRaw ?? []) as Array<TaskOption & { parentTask?: string | null; campaign?: { _id: string } | string | null }>;
    return raw.filter((t) => !t.parentTask).filter((t) => {
      if (!campaignId) return true;
      const cid = typeof t.campaign === "string" ? t.campaign : t.campaign?._id;
      return cid === campaignId;
    });
  }, [tasksRaw, campaignId]);

  /* data */
  const url = useMemo(() => {
    const p = new URLSearchParams();
    p.set("startDate", startDate);
    p.set("endDate", endDate);
    if (campaignId) p.set("campaignId", campaignId);
    if (departmentId) p.set("departmentId", departmentId);
    if (employeeId) p.set("employeeId", employeeId);
    if (taskId) p.set("taskId", taskId);
    return `/api/progress/daily?${p.toString()}`;
  }, [startDate, endDate, campaignId, departmentId, employeeId, taskId]);

  const { data: payload, loading } = useQuery<ProgressPayload>(url, `wsc-progress-${url}`);
  const dates = payload?.dates ?? [];
  const rows = payload?.employees ?? [];

  const resetFilters = useCallback(() => {
    setCampaignId(""); setDepartmentId(""); setEmployeeId(""); setTaskId("");
  }, []);

  const exportCsv = useCallback(() => {
    if (rows.length === 0) { toast.error("Nothing to export"); return; }
    const header = ["Employee", ...dates.map((d) => `${d} (${weekdayLabel(d)})`)];
    const lines: string[] = [header.map(csvCell).join(",")];
    for (const row of rows) {
      const cells = [row.name];
      for (const day of row.days) {
        if (day.pctChecked === null && day.oneTimeTotal === 0) cells.push("-");
        else if (day.pctChecked === null) cells.push(`${day.oneTimeDone}/${day.oneTimeTotal} one-time`);
        else cells.push(`${day.doneChecklists}/${day.totalChecklists} (${day.pctChecked}%)`);
      }
      lines.push(cells.map(csvCell).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `progress_${startDate}_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    toast.success("Export started");
  }, [rows, dates, startDate, endDate]);

  const filterActive = Boolean(campaignId || departmentId || employeeId || taskId);

  return (
    <div className="flex h-full min-h-0 gap-4">
      {/* sidebar */}
      <aside className="hidden lg:flex w-[240px] shrink-0 flex-col gap-3 overflow-hidden">
        <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          <div>
            <p className="text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: "var(--fg-tertiary)" }}>Range</p>
            <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
              {RANGE_OPTIONS.map((o) => (
                <button key={o.value} type="button" onClick={() => setRange(o.value)}
                  className="flex-1 py-1.5 text-[11px] font-semibold transition-colors"
                  style={{ background: range === o.value ? "var(--primary)" : "transparent", color: range === o.value ? "#fff" : "var(--fg-secondary)" }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <FilterSelect label="Campaign" value={campaignId} onChange={(v) => { setCampaignId(v); setTaskId(""); }} placeholder="All campaigns"
            options={campaigns.map((c) => ({ value: c._id, label: c.name }))} />

          <FilterSelect label="Department" value={departmentId} onChange={(v) => { setDepartmentId(v); setEmployeeId(""); }} placeholder="All departments"
            options={departments.map((d) => ({ value: d._id, label: d.title }))} />

          <FilterSelect label="Employee" value={employeeId} onChange={setEmployeeId} placeholder="All employees"
            options={employees.map((e) => ({ value: e._id, label: `${e.about.firstName} ${e.about.lastName}`.trim() }))} />

          <FilterSelect label="Task" value={taskId} onChange={setTaskId} placeholder={campaignId ? "All tasks" : "Select campaign first"}
            disabled={!campaignId}
            options={tasks.map((t) => ({ value: t._id, label: t.title }))} />

          {filterActive && (
            <button type="button" onClick={resetFilters}
              className="w-full rounded-lg border py-1.5 text-[11px] font-semibold transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]"
              style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}>
              Reset filters
            </button>
          )}
        </div>

        <div className="rounded-xl border p-3 text-[11px] leading-relaxed" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--fg-tertiary)" }}>
          <p className="font-semibold mb-1" style={{ color: "var(--fg-secondary)" }}>Legend</p>
          <div className="flex flex-wrap gap-1.5">
            {[{ label: "0", color: "color-mix(in srgb, var(--rose) 14%, transparent)" },
              { label: "1–24%", color: "color-mix(in srgb, var(--rose) 25%, transparent)" },
              { label: "25–49%", color: "color-mix(in srgb, var(--amber) 25%, transparent)" },
              { label: "50–74%", color: "color-mix(in srgb, var(--amber) 45%, transparent)" },
              { label: "75–99%", color: "color-mix(in srgb, var(--teal) 45%, transparent)" },
              { label: "100%", color: "color-mix(in srgb, var(--teal) 65%, transparent)" },
            ].map((l) => (
              <span key={l.label} className="flex items-center gap-1">
                <span className="h-3 w-3 rounded" style={{ background: l.color }} />
                <span>{l.label}</span>
              </span>
            ))}
          </div>
          <p className="mt-2">Cells show recurring check-offs for that day. Purple tint = no recurring due but one-time tasks touched.</p>
        </div>
      </aside>

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        <div className="shrink-0 flex items-center gap-2 flex-wrap">
          <h2 className="text-[13px] font-bold" style={{ color: "var(--fg)" }}>
            Progress · {shortDateLabel(startDate)} – {shortDateLabel(endDate)}
          </h2>
          <span className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{rows.length} employees</span>
          <div className="ml-auto">
            <motion.button type="button" onClick={exportCsv} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold"
              style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export CSV
            </motion.button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          {loading && rows.length === 0 ? (
            <div className="p-3 space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="shimmer h-10 rounded" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState message="No employees match the current filters." />
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 min-w-[180px] max-w-[220px] px-3 py-2 text-left text-[11px] font-bold" style={{ background: "var(--bg-elevated)", color: "var(--fg-secondary)", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>
                    Employee
                  </th>
                  {dates.map((d) => (
                    <th key={d} className="sticky top-0 z-10 px-1.5 py-2 text-center text-[10px] font-semibold whitespace-nowrap"
                      style={{ background: "var(--bg-elevated)", color: "var(--fg-secondary)", borderBottom: "1px solid var(--border)", minWidth: 54 }}>
                      <div>{shortDateLabel(d)}</div>
                      <div className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>{weekdayLabel(d)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id} className="group">
                    <td className="sticky left-0 z-10 px-3 py-1.5 text-[12px] font-semibold cursor-pointer transition-colors group-hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]"
                      style={{ background: "var(--bg-elevated)", borderRight: "1px solid var(--border)", color: "var(--fg)" }}
                      onClick={() => setDrawerRow(row)}
                      title="Click to see this employee's full timeline"
                    >
                      <div className="truncate max-w-[180px]">{row.name}</div>
                    </td>
                    {row.days.map((day) => {
                      const color = cellColor(day.pctChecked, day.oneTimeTotal > 0);
                      const oneTimePart = day.oneTimeTotal > 0 ? `, ${day.oneTimeDone}/${day.oneTimeTotal} one-time` : "";
                      const checklistPart = day.totalChecklists === 0 ? "no recurring due" : `${day.doneChecklists}/${day.totalChecklists} check-offs`;
                      return (
                        <td key={day.date} className="p-0.5">
                          <div
                            className="flex h-8 items-center justify-center rounded text-[10px] font-semibold tabular-nums cursor-help"
                            style={{ background: color.bg, color: color.fg }}
                            title={`${row.name} · ${day.date}\n${checklistPart}${oneTimePart}`}
                          >
                            {day.pctChecked === null ? (day.oneTimeTotal > 0 ? `${day.oneTimeDone}/${day.oneTimeTotal}` : "·") : `${day.pctChecked}%`}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* row drawer */}
      <ModalShell
        open={drawerRow !== null}
        onClose={() => setDrawerRow(null)}
        title={drawerRow?.name ?? ""}
        subtitle={drawerRow ? `${shortDateLabel(startDate)} – ${shortDateLabel(endDate)}` : ""}
        maxWidth="max-w-2xl"
      >
        {drawerRow && (
          <div className="space-y-2">
            {drawerRow.days.slice().reverse().map((day) => {
              const color = cellColor(day.pctChecked, day.oneTimeTotal > 0);
              return (
                <div key={day.date} className="flex items-center gap-3 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                  <div className="flex h-10 w-14 shrink-0 flex-col items-center justify-center rounded" style={{ background: color.bg }}>
                    <span className="text-[11px] font-bold" style={{ color: color.fg }}>
                      {day.pctChecked === null ? (day.oneTimeTotal > 0 ? `${day.oneTimeDone}/${day.oneTimeTotal}` : "–") : `${day.pctChecked}%`}
                    </span>
                    <span className="text-[9px]" style={{ color: color.fg }}>{weekdayLabel(day.date)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>{shortDateLabel(day.date)}</p>
                    <p className="text-[11px]" style={{ color: "var(--fg-secondary)" }}>
                      {day.totalChecklists === 0 ? "No recurring tasks due" : `Recurring: ${day.doneChecklists}/${day.totalChecklists} check-offs`}
                      {day.oneTimeTotal > 0 && ` · One-time: ${day.oneTimeDone}/${day.oneTimeTotal}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ModalShell>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, placeholder, options, disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border px-2 py-1.5 text-[12px] outline-none transition-colors focus:border-[var(--primary)] disabled:opacity-50"
        style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--fg)" }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function csvCell(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
