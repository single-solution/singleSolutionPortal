"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@/lib/useQuery";

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

const defaultTiers: LatePenaltyTier[] = [
  { minMinutes: 0, maxMinutes: 15, penaltyPercent: 0 },
  { minMinutes: 16, maxMinutes: 30, penaltyPercent: 50 },
  { minMinutes: 31, maxMinutes: 9999, penaltyPercent: 100 },
];

export function SettingsPayroll() {
  const { data: configData, refetch: refetchConfig } = useQuery<PayrollConfigDoc>("/api/payroll/config");
  const [configOpen, setConfigOpen] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configDraft, setConfigDraft] = useState<Partial<PayrollConfigDoc> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!configDraft) return;
    setConfigSaving(true);
    setError(null);
    setSuccess(false);
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
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await refetchConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setConfigSaving(false);
    }
  }

  const inputClass = "rounded-lg border px-3 py-2 text-sm w-full min-w-0";
  const inputStyle: React.CSSProperties = {
    borderColor: "var(--border-subtle)",
    color: "var(--fg)",
    background: "var(--bg)",
  };

  return (
    <div className="card-xl p-6 sm:p-8">
      <button
        type="button"
        onClick={() => setConfigOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div>
          <h2 className="text-headline">Payroll Configuration</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--fg-tertiary)" }}>Working days, late penalties, overtime, currency</p>
        </div>
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
            {error && (
              <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(239, 68, 68, 0.12)", color: "var(--rose, #e11d48)" }}>
                {error}
              </div>
            )}
            {success && (
              <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(34, 197, 94, 0.12)", color: "var(--green)" }}>
                Payroll config saved!
              </div>
            )}
            <form
              onSubmit={(e) => void saveConfig(e)}
              className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            >
              <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                Working days / month
                <input type="number" required min={1} max={31} className={inputClass} style={inputStyle}
                  value={configDraft.workingDaysPerMonth ?? ""} onChange={(e) => setConfigDraft((d) => d ? { ...d, workingDaysPerMonth: parseInt(e.target.value, 10) || 0 } : d)} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                Late threshold (minutes)
                <input type="number" required min={0} className={inputClass} style={inputStyle}
                  value={configDraft.lateThresholdMinutes ?? ""} onChange={(e) => setConfigDraft((d) => d ? { ...d, lateThresholdMinutes: parseInt(e.target.value, 10) || 0 } : d)} />
              </label>

              <div className="sm:col-span-2 lg:col-span-3 border-t pt-3 mt-1" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>Late penalty tiers (% of daily salary)</p>
                  <button type="button" onClick={() => setConfigDraft((d) => d ? { ...d, latePenaltyTiers: [...(d.latePenaltyTiers ?? []), { minMinutes: 0, maxMinutes: 9999, penaltyPercent: 0 }] } : d)}
                    className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>
                    + Add tier
                  </button>
                </div>
                <div className="space-y-2">
                  {(configDraft.latePenaltyTiers ?? defaultTiers).map((tier, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded-lg p-2 text-xs" style={{ background: "var(--bg-grouped)" }}>
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
                      <button type="button" className="mt-3.5 rounded-md px-1.5 py-0.5 text-xs font-semibold"
                        style={{ background: "rgba(225, 29, 72, 0.12)", color: "var(--rose, #e11d48)" }}
                        onClick={() => setConfigDraft((d) => {
                          if (!d) return d;
                          const tiers = (d.latePenaltyTiers ?? []).filter((_, i) => i !== idx);
                          return { ...d, latePenaltyTiers: tiers.length ? tiers : defaultTiers };
                        })}>
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                Absence penalty (% of daily rate)
                <input type="number" required min={0} max={500} className={inputClass} style={inputStyle}
                  value={configDraft.absencePenaltyPerDay ?? ""} onChange={(e) => setConfigDraft((d) => d ? { ...d, absencePenaltyPerDay: parseFloat(e.target.value) || 0 } : d)} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                Overtime multiplier
                <input type="number" required min={0} step="0.01" className={inputClass} style={inputStyle}
                  value={configDraft.overtimeRateMultiplier ?? ""} onChange={(e) => setConfigDraft((d) => d ? { ...d, overtimeRateMultiplier: parseFloat(e.target.value) || 0 } : d)} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                Currency (ISO code)
                <input type="text" required className={inputClass} style={inputStyle}
                  value={configDraft.currency ?? ""} onChange={(e) => setConfigDraft((d) => d ? { ...d, currency: e.target.value.toUpperCase() } : d)} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
                Pay day (1–28)
                <input type="number" required min={1} max={28} className={inputClass} style={inputStyle}
                  value={configDraft.payDay ?? ""} onChange={(e) => setConfigDraft((d) => d ? { ...d, payDay: parseInt(e.target.value, 10) || 1 } : d)} />
              </label>

              <div className="sm:col-span-2 lg:col-span-3">
                <button type="submit" disabled={configSaving}
                  className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ background: "var(--primary)", color: "var(--primary-fg, #fff)" }}>
                  {configSaving ? "Saving…" : "Save config"}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
