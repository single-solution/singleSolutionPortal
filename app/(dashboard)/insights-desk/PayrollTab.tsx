"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@/lib/useQuery";

interface PopulatedUser {
  _id?: string;
  about?: { firstName?: string; lastName?: string };
  email?: string;
  username?: string;
}

interface LatePenaltyTier {
  minMinutes: number;
  maxMinutes: number;
  penaltyPercent: number;
}

interface PayrollConfigDoc {
  _id?: string;
  workingDaysPerMonth: number;
  lateThresholdMinutes: number;
  latePenaltyTiers: LatePenaltyTier[];
  absencePenaltyPerDay: number;
  overtimeRateMultiplier: number;
  currency: string;
  payDay: number;
  updatedAt?: string;
}

interface EmployeeDropdownRow {
  _id: string;
  about?: { firstName?: string; lastName?: string };
  email?: string;
  salary?: number;
}

interface HolidayRow {
  _id: string;
  name: string;
  date: string;
  year: number;
  isRecurring: boolean;
}

interface PayslipRow {
  _id: string;
  month: number;
  year: number;
  baseSalary: number;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  status: "draft" | "finalized" | "paid";
  user?: PopulatedUser | string;
}

function nameOf(u: PopulatedUser | string | undefined): string {
  if (!u || typeof u === "string") return "—";
  const f = u.about?.firstName ?? "";
  const l = u.about?.lastName ?? "";
  const n = `${f} ${l}`.trim();
  return n || u.email || u.username || "—";
}

function StatusPill({ status }: { status: PayslipRow["status"] }) {
  const map: Record<PayslipRow["status"], React.CSSProperties> = {
    draft: { background: "var(--bg-grouped)", color: "var(--fg-tertiary)" },
    finalized: { background: "var(--primary-light)", color: "var(--primary)" },
    paid: { background: "rgba(34, 197, 94, 0.15)", color: "var(--green)" },
  };
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize"
      style={map[status]}
    >
      {status}
    </span>
  );
}

export function PayrollTab() {
  const { data: session } = useSession();
  const yearNow = new Date().getFullYear();
  const monthNow = new Date().getMonth() + 1;

  const { can: canPerm } = usePermissions();
  const canViewTeamPayroll = canPerm("payroll_viewTeam");
  const canGenerateSlips = canPerm("payroll_generateSlips");
  const canFinalizeSlips = canPerm("payroll_finalizeSlips");
  const canManagePayrollConfig = canPerm("payroll_manageSalary");
  const canManageSlipStatus = canGenerateSlips || canFinalizeSlips;

  const [error, setError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(true);

  const [holidayYear, setHolidayYear] = useState(yearNow);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayRecurring, setHolidayRecurring] = useState(false);
  const [holidaySubmitting, setHolidaySubmitting] = useState(false);

  const [genMonth, setGenMonth] = useState(String(monthNow));
  const [genYear, setGenYear] = useState(String(yearNow));
  const [genLoading, setGenLoading] = useState(false);
  const [genStatus, setGenStatus] = useState<string | null>(null);
  const [salaryOverrides, setSalaryOverrides] = useState<Record<string, string>>({});
  const [showOverrides, setShowOverrides] = useState(false);

  const [filterMonth, setFilterMonth] = useState("");
  const [filterYear, setFilterYear] = useState(String(yearNow));
  const [filterStatus, setFilterStatus] = useState("");

  const [configSaving, setConfigSaving] = useState(false);
  const [configDraft, setConfigDraft] = useState<Partial<PayrollConfigDoc> | null>(null);

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-elevated)",
    borderRadius: "12px",
    padding: "1rem",
    border: "1px solid var(--border-subtle)",
  };

  const sessionOk = !!session?.user?.id;

  const { data: employeeDropdown } = useQuery<EmployeeDropdownRow[]>(
    sessionOk && canGenerateSlips ? "/api/employees/dropdown" : null,
    "payroll-emp-dropdown",
  );

  const { data: configData, refetch: refetchConfig } = useQuery<PayrollConfigDoc>(
    sessionOk ? "/api/payroll/config" : null,
  );

  const holidaysUrl =
    sessionOk && canViewTeamPayroll ? `/api/payroll/holidays?year=${holidayYear}` : null;
  const { data: holidays, refetch: refetchHolidays, loading: holidaysLoading } = useQuery<
    HolidayRow[]
  >(holidaysUrl);

  const payslipParams = new URLSearchParams();
  if (filterMonth) payslipParams.set("month", filterMonth);
  if (filterYear) payslipParams.set("year", filterYear);
  if (filterStatus) payslipParams.set("status", filterStatus);
  const payslipsUrl = sessionOk
    ? `/api/payroll/payslips${payslipParams.toString() ? `?${payslipParams}` : ""}`
    : null;
  const {
    data: payslips,
    refetch: refetchPayslips,
    loading: payslipsLoading,
  } = useQuery<PayslipRow[]>(payslipsUrl);

  const defaultTiers: LatePenaltyTier[] = [
    { minMinutes: 0, maxMinutes: 15, penaltyPercent: 0 },
    { minMinutes: 16, maxMinutes: 30, penaltyPercent: 50 },
    { minMinutes: 31, maxMinutes: 9999, penaltyPercent: 100 },
  ];

  useEffect(() => {
    if (!configData || configDraft !== null) return;
    setConfigDraft({
      workingDaysPerMonth: configData.workingDaysPerMonth,
      lateThresholdMinutes: configData.lateThresholdMinutes,
      latePenaltyTiers: configData.latePenaltyTiers?.length ? configData.latePenaltyTiers : defaultTiers,
      absencePenaltyPerDay: configData.absencePenaltyPerDay,
      overtimeRateMultiplier: configData.overtimeRateMultiplier,
      currency: configData.currency,
      payDay: configData.payDay,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configData, configDraft]);

  const currencyCode = configData?.currency ?? configDraft?.currency ?? "PKR";

  const formatMoney = useCallback(
    (n: number) =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(n),
    [currencyCode],
  );

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!configDraft) return;
    setConfigSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workingDaysPerMonth: Number(configDraft.workingDaysPerMonth),
          lateThresholdMinutes: Number(configDraft.lateThresholdMinutes),
          latePenaltyTiers: configDraft.latePenaltyTiers ?? defaultTiers,
          absencePenaltyPerDay: Number(configDraft.absencePenaltyPerDay),
          overtimeRateMultiplier: Number(configDraft.overtimeRateMultiplier),
          currency: String(configDraft.currency ?? "PKR"),
          payDay: Number(configDraft.payDay),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to save config");
      setConfigDraft({
        workingDaysPerMonth: j.workingDaysPerMonth,
        lateThresholdMinutes: j.lateThresholdMinutes,
        latePenaltyTiers: j.latePenaltyTiers ?? defaultTiers,
        absencePenaltyPerDay: j.absencePenaltyPerDay,
        overtimeRateMultiplier: j.overtimeRateMultiplier,
        currency: j.currency,
        payDay: j.payDay,
      });
      await refetchConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setConfigSaving(false);
    }
  }

  async function addHoliday(e: React.FormEvent) {
    e.preventDefault();
    if (!holidayName.trim() || !holidayDate) {
      setError("Holiday name and date are required.");
      return;
    }
    setHolidaySubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: holidayName.trim(),
          date: holidayDate,
          year: holidayYear,
          isRecurring: holidayRecurring,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to add holiday");
      setHolidayName("");
      setHolidayDate("");
      setHolidayRecurring(false);
      await refetchHolidays();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setHolidaySubmitting(false);
    }
  }

  async function deleteHoliday(id: string) {
    if (!confirm("Remove this holiday?")) return;
    setError(null);
    const res = await fetch(`/api/payroll/holidays?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(j.error || "Delete failed");
      return;
    }
    await refetchHolidays();
  }

  async function generatePayslips() {
    const month = Number(genMonth);
    const year = Number(genYear);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      setError("Pick a valid month.");
      return;
    }
    if (!Number.isInteger(year) || year < 1970) {
      setError("Pick a valid year.");
      return;
    }
    setGenLoading(true);
    setGenStatus(null);
    setError(null);
    try {
      const overridesPayload: Record<string, number> = {};
      for (const [uid, val] of Object.entries(salaryOverrides)) {
        const n = parseFloat(val);
        if (Number.isFinite(n) && n > 0) overridesPayload[uid] = n;
      }
      const res = await fetch("/api/payroll/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year, salaries: Object.keys(overridesPayload).length ? overridesPayload : undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Generation failed");
      const results = j.results as { ok: boolean; error?: string }[] | undefined;
      const okCount = results?.filter((r) => r.ok).length ?? 0;
      const failCount = results ? results.length - okCount : 0;
      setGenStatus(`Generated for ${okCount} employee(s). ${failCount ? `${failCount} skipped or failed.` : ""}`.trim());
      await refetchPayslips();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenLoading(false);
    }
  }

  async function updatePayslipStatus(id: string, status: "finalized" | "paid") {
    setError(null);
    const res = await fetch("/api/payroll/payslips", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(j.error || "Update failed");
      return;
    }
    await refetchPayslips();
  }

  const inputClass =
    "rounded-lg border px-3 py-2 text-sm w-full min-w-0";
  const inputStyle: React.CSSProperties = {
    borderColor: "var(--border-subtle)",
    color: "var(--fg)",
    background: "var(--bg)",
  };

  return (
    <div className="space-y-6">
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(239, 68, 68, 0.12)", color: "var(--rose, #e11d48)" }}
        >
          {error}
        </motion.div>
      )}

      {canManagePayrollConfig && (
        <div style={cardStyle}>
          <button
            type="button"
            onClick={() => setConfigOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <h2 className="text-sm font-bold" style={{ color: "var(--fg)" }}>
              Payroll config
            </h2>
            <motion.svg
              className="h-5 w-5 shrink-0"
              style={{ color: "var(--fg-tertiary)" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              animate={{ rotate: configOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </motion.svg>
          </button>
          <AnimatePresence initial={false} mode="wait">
            {configOpen && !configDraft && (
              <motion.div
                key="payroll-config-loading"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden mt-4"
              >
                <div className="shimmer h-32 rounded-lg" />
              </motion.div>
            )}
            {configOpen && configDraft && (
              <motion.div
                key="payroll-config-form"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <form
                  onSubmit={(e) => void saveConfig(e)}
                  className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                >
                  <label
                    className="flex flex-col gap-1 text-xs font-semibold"
                    style={{ color: "var(--fg-tertiary)" }}
                  >
                    Working days / month
                    <input
                      type="number"
                      required
                      min={1}
                      max={31}
                      className={inputClass}
                      style={inputStyle}
                      value={configDraft.workingDaysPerMonth ?? ""}
                      onChange={(e) =>
                        setConfigDraft((d) =>
                          d ? { ...d, workingDaysPerMonth: parseInt(e.target.value, 10) || 0 } : d,
                        )
                      }
                    />
                  </label>
                  <label
                    className="flex flex-col gap-1 text-xs font-semibold"
                    style={{ color: "var(--fg-tertiary)" }}
                  >
                    Late threshold (minutes)
                    <input
                      type="number"
                      required
                      min={0}
                      className={inputClass}
                      style={inputStyle}
                      value={configDraft.lateThresholdMinutes ?? ""}
                      onChange={(e) =>
                        setConfigDraft((d) =>
                          d ? { ...d, lateThresholdMinutes: parseInt(e.target.value, 10) || 0 } : d,
                        )
                      }
                    />
                  </label>
                  <div className="sm:col-span-2 lg:col-span-3 border-t pt-3 mt-1" style={{ borderColor: "var(--border-subtle)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>Late penalty tiers (% of daily salary)</p>
                      <button
                        type="button"
                        onClick={() =>
                          setConfigDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  latePenaltyTiers: [
                                    ...(d.latePenaltyTiers ?? []),
                                    { minMinutes: 0, maxMinutes: 9999, penaltyPercent: 0 },
                                  ],
                                }
                              : d,
                          )
                        }
                        className="rounded-md px-2 py-0.5 text-xs font-semibold"
                        style={{ background: "var(--primary-light)", color: "var(--primary)" }}
                      >
                        + Add tier
                      </button>
                    </div>
                    <div className="space-y-2">
                      {(configDraft.latePenaltyTiers ?? defaultTiers).map((tier, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <label className="flex flex-col gap-0.5" style={{ color: "var(--fg-tertiary)" }}>
                            <span className="text-[10px]">From (min)</span>
                            <input type="number" min={0} className={`${inputClass} !w-20`} style={inputStyle} value={tier.minMinutes} onChange={(e) => setConfigDraft((d) => {
                              if (!d) return d;
                              const tiers = [...(d.latePenaltyTiers ?? [])];
                              tiers[idx] = { ...tiers[idx], minMinutes: parseInt(e.target.value, 10) || 0 };
                              return { ...d, latePenaltyTiers: tiers };
                            })} />
                          </label>
                          <label className="flex flex-col gap-0.5" style={{ color: "var(--fg-tertiary)" }}>
                            <span className="text-[10px]">To (min)</span>
                            <input type="number" min={1} className={`${inputClass} !w-20`} style={inputStyle} value={tier.maxMinutes} onChange={(e) => setConfigDraft((d) => {
                              if (!d) return d;
                              const tiers = [...(d.latePenaltyTiers ?? [])];
                              tiers[idx] = { ...tiers[idx], maxMinutes: parseInt(e.target.value, 10) || 1 };
                              return { ...d, latePenaltyTiers: tiers };
                            })} />
                          </label>
                          <label className="flex flex-col gap-0.5" style={{ color: "var(--fg-tertiary)" }}>
                            <span className="text-[10px]">Penalty %</span>
                            <input type="number" min={0} step="any" className={`${inputClass} !w-20`} style={inputStyle} value={tier.penaltyPercent} onChange={(e) => setConfigDraft((d) => {
                              if (!d) return d;
                              const tiers = [...(d.latePenaltyTiers ?? [])];
                              tiers[idx] = { ...tiers[idx], penaltyPercent: parseFloat(e.target.value) || 0 };
                              return { ...d, latePenaltyTiers: tiers };
                            })} />
                          </label>
                          <button
                            type="button"
                            className="mt-3.5 rounded-md px-1.5 py-0.5 text-xs font-semibold"
                            style={{ background: "rgba(225, 29, 72, 0.12)", color: "var(--rose, #e11d48)" }}
                            onClick={() =>
                              setConfigDraft((d) => {
                                if (!d) return d;
                                const tiers = (d.latePenaltyTiers ?? []).filter((_, i) => i !== idx);
                                return { ...d, latePenaltyTiers: tiers.length ? tiers : defaultTiers };
                              })
                            }
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <label
                    className="flex flex-col gap-1 text-xs font-semibold"
                    style={{ color: "var(--fg-tertiary)" }}
                  >
                    Absence penalty (% of daily rate)
                    <input
                      type="number"
                      required
                      min={0}
                      max={500}
                      className={inputClass}
                      style={inputStyle}
                      value={configDraft.absencePenaltyPerDay ?? ""}
                      onChange={(e) =>
                        setConfigDraft((d) =>
                          d ? { ...d, absencePenaltyPerDay: parseFloat(e.target.value) || 0 } : d,
                        )
                      }
                    />
                  </label>
                  <label
                    className="flex flex-col gap-1 text-xs font-semibold"
                    style={{ color: "var(--fg-tertiary)" }}
                  >
                    Overtime multiplier
                    <input
                      type="number"
                      required
                      min={0}
                      step="0.01"
                      className={inputClass}
                      style={inputStyle}
                      value={configDraft.overtimeRateMultiplier ?? ""}
                      onChange={(e) =>
                        setConfigDraft((d) =>
                          d ? { ...d, overtimeRateMultiplier: parseFloat(e.target.value) || 0 } : d,
                        )
                      }
                    />
                  </label>
                  <label
                    className="flex flex-col gap-1 text-xs font-semibold"
                    style={{ color: "var(--fg-tertiary)" }}
                  >
                    Currency (ISO code)
                    <input
                      type="text"
                      required
                      className={inputClass}
                      style={inputStyle}
                      value={configDraft.currency ?? ""}
                      onChange={(e) =>
                        setConfigDraft((d) => (d ? { ...d, currency: e.target.value.toUpperCase() } : d))
                      }
                    />
                  </label>
                  <label
                    className="flex flex-col gap-1 text-xs font-semibold"
                    style={{ color: "var(--fg-tertiary)" }}
                  >
                    Pay day (1–28)
                    <input
                      type="number"
                      required
                      min={1}
                      max={28}
                      className={inputClass}
                      style={inputStyle}
                      value={configDraft.payDay ?? ""}
                      onChange={(e) =>
                        setConfigDraft((d) =>
                          d ? { ...d, payDay: parseInt(e.target.value, 10) || 1 } : d,
                        )
                      }
                    />
                  </label>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <button
                      type="submit"
                      disabled={configSaving}
                      className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                      style={{ background: "var(--primary)", color: "var(--primary-fg, #fff)" }}
                    >
                      {configSaving ? "Saving…" : "Save config"}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {canViewTeamPayroll && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          style={cardStyle}
        >
          <h2 className="text-sm font-bold mb-4" style={{ color: "var(--fg)" }}>
            Holidays
          </h2>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <label
              className="flex flex-col gap-1 text-xs font-semibold"
              style={{ color: "var(--fg-tertiary)" }}
            >
              Year
              <input
                type="number"
                className="rounded-lg border px-3 py-2 text-sm w-28"
                style={inputStyle}
                value={holidayYear}
                onChange={(e) => setHolidayYear(parseInt(e.target.value, 10) || yearNow)}
              />
            </label>
            <button
              type="button"
              onClick={() => void refetchHolidays()}
              className="rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: "var(--primary-light)", color: "var(--primary)" }}
            >
              Refresh
            </button>
          </div>

          <form
            onSubmit={(e) => void addHoliday(e)}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4"
          >
            <label
              className="flex flex-col gap-1 text-xs font-semibold md:col-span-2"
              style={{ color: "var(--fg-tertiary)" }}
            >
              Name
              <input
                type="text"
                className={inputClass}
                style={inputStyle}
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                placeholder="e.g. Eid"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
              Date
              <input
                type="date"
                className={inputClass}
                style={inputStyle}
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
              />
            </label>
            <label
              className="flex flex-col gap-1 text-xs font-semibold justify-end"
              style={{ color: "var(--fg-secondary)" }}
            >
              <span className="flex items-center gap-2 text-xs font-semibold pb-2">
                <input
                  type="checkbox"
                  checked={holidayRecurring}
                  onChange={(e) => setHolidayRecurring(e.target.checked)}
                  className="rounded border"
                  style={{ borderColor: "var(--border-subtle)" }}
                />
                Recurring yearly
              </span>
            </label>
            <div className="md:col-span-2 lg:col-span-4">
              <button
                type="submit"
                disabled={holidaySubmitting}
                className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: "var(--primary)", color: "var(--primary-fg, #fff)" }}
              >
                {holidaySubmitting ? "Adding…" : "Add holiday"}
              </button>
            </div>
          </form>

          {holidaysLoading ? (
            <div className="shimmer h-24 rounded-lg" />
          ) : !holidays?.length ? (
            <p className="text-sm" style={{ color: "var(--fg-tertiary)" }}>
              No holidays for this year.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ color: "var(--fg-tertiary)" }}>
                    <th className="pb-2 pr-3">Name</th>
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3">Recurring</th>
                    <th className="pb-2"> </th>
                  </tr>
                </thead>
                <tbody>
                  {holidays.map((h) => (
                    <tr
                      key={h._id}
                      style={{ color: "var(--fg)", borderTop: "1px solid var(--border-subtle)" }}
                    >
                      <td className="py-2 pr-3">{h.name}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {new Date(h.date).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-3">{h.isRecurring ? "Yes" : "No"}</td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          className="rounded-md px-2 py-1 text-xs font-semibold"
                          style={{ background: "rgba(225, 29, 72, 0.12)", color: "var(--rose, #e11d48)" }}
                          onClick={() => void deleteHoliday(h._id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {canGenerateSlips && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          style={cardStyle}
        >
          <h2 className="text-sm font-bold mb-4" style={{ color: "var(--fg)" }}>
            Payslip generation
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
              Month
              <select
                className="rounded-lg border px-3 py-2 text-sm min-w-[8rem]"
                style={inputStyle}
                value={genMonth}
                onChange={(e) => setGenMonth(e.target.value)}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {new Date(2000, i, 1).toLocaleString("default", { month: "long" })}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
              Year
              <input
                type="number"
                className="rounded-lg border px-3 py-2 text-sm w-28"
                style={inputStyle}
                value={genYear}
                onChange={(e) => setGenYear(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={genLoading}
              onClick={() => void generatePayslips()}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--primary)", color: "var(--primary-fg, #fff)" }}
            >
              {genLoading ? "Generating…" : "Generate payslips"}
            </button>
          </div>
          {canManagePayrollConfig && employeeDropdown && employeeDropdown.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowOverrides((o) => !o)}
                className="text-xs font-semibold"
                style={{ color: "var(--primary)" }}
              >
                {showOverrides ? "Hide" : "Show"} salary overrides for this month
              </button>
              <AnimatePresence>
                {showOverrides && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mt-2 space-y-1.5"
                  >
                    <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
                      Override base salary for specific employees this month. Leave blank to use their profile salary.
                    </p>
                    {employeeDropdown.map((emp) => {
                      const name = `${emp.about?.firstName ?? ""} ${emp.about?.lastName ?? ""}`.trim() || emp.email || emp._id;
                      return (
                        <div key={emp._id} className="flex items-center gap-2 text-xs">
                          <span className="w-40 truncate" style={{ color: "var(--fg-secondary)" }} title={name}>{name}</span>
                          <span className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>Profile: {emp.salary ?? 0}</span>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            placeholder="Override"
                            className={`${inputClass} !w-28`}
                            style={inputStyle}
                            value={salaryOverrides[emp._id] ?? ""}
                            onChange={(e) => setSalaryOverrides((prev) => ({ ...prev, [emp._id]: e.target.value }))}
                          />
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {genStatus && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm mt-3"
              style={{ color: "var(--fg-secondary)" }}
            >
              {genStatus}
            </motion.p>
          )}
        </motion.div>
      )}

      <div style={cardStyle}>
        <h2 className="text-sm font-bold mb-4" style={{ color: "var(--fg)" }}>
          Payslips
        </h2>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
            Month
            <select
              className="rounded-lg border px-3 py-2 text-sm min-w-[8rem]"
              style={inputStyle}
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
            >
              <option value="">All months</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {new Date(2000, i, 1).toLocaleString("default", { month: "long" })}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
            Year
            <input
              type="number"
              className="rounded-lg border px-3 py-2 text-sm w-28"
              style={inputStyle}
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
            Status
            <select
              className="rounded-lg border px-3 py-2 text-sm min-w-[8rem]"
              style={inputStyle}
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="finalized">Finalized</option>
              <option value="paid">Paid</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void refetchPayslips()}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: "var(--primary-light)", color: "var(--primary)" }}
          >
            Refresh
          </button>
        </div>

        {payslipsLoading ? (
          <div className="shimmer h-24 rounded-lg" />
        ) : !payslips?.length ? (
          <p className="text-sm" style={{ color: "var(--fg-tertiary)" }}>
            No payslips for these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: "var(--fg-tertiary)" }}>
                  <th className="pb-2 pr-3">Name</th>
                  <th className="pb-2 pr-3">Month</th>
                  <th className="pb-2 pr-3">Base</th>
                  <th className="pb-2 pr-3">Gross</th>
                  <th className="pb-2 pr-3">Deductions</th>
                  <th className="pb-2 pr-3">Net</th>
                  <th className="pb-2 pr-3">Status</th>
                  {canManageSlipStatus && <th className="pb-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {payslips.map((row) => (
                    <motion.tr
                      key={row._id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      style={{ color: "var(--fg)", borderTop: "1px solid var(--border-subtle)" }}
                    >
                      <td className="py-2 pr-3">{nameOf(row.user as PopulatedUser)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {new Date(2000, row.month - 1, 1).toLocaleString("default", { month: "long" })}{" "}
                        {row.year}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatMoney(row.baseSalary)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatMoney(row.grossPay)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatMoney(row.totalDeductions)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap font-semibold">
                        {formatMoney(row.netPay)}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusPill status={row.status} />
                      </td>
                      {canManageSlipStatus && (
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {row.status === "draft" && canFinalizeSlips && (
                              <button
                                type="button"
                                className="rounded-md px-2 py-1 text-xs font-semibold"
                                style={{ background: "var(--primary-light)", color: "var(--primary)" }}
                                onClick={() => void updatePayslipStatus(row._id, "finalized")}
                              >
                                Finalize
                              </button>
                            )}
                            {row.status !== "paid" && canFinalizeSlips && (
                              <button
                                type="button"
                                className="rounded-md px-2 py-1 text-xs font-semibold"
                                style={{ background: "rgba(34, 197, 94, 0.15)", color: "var(--green)" }}
                                onClick={() => void updatePayslipStatus(row._id, "paid")}
                              >
                                Mark paid
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
