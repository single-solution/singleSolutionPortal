"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@/lib/useQuery";

interface LatePenaltyTier {
  minutes: number;
  penaltyPercent: number;
}

interface PayrollConfigDoc {
  _id?: string;
  latePenaltyTiers: LatePenaltyTier[];
  absencePenaltyPerDay: number;
  overtimeRateMultiplier: number;
  payDay: number;
  updatedAt?: string;
}

const defaultTiers: LatePenaltyTier[] = [
  { minutes: 15, penaltyPercent: 0 },
  { minutes: 30, penaltyPercent: 50 },
  { minutes: 60, penaltyPercent: 100 },
];

export function SettingsPayroll() {
  const { data: configData, refetch: refetchConfig } = useQuery<PayrollConfigDoc>("/api/payroll/config");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Partial<PayrollConfigDoc> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!configData || draft !== null) return;
    setDraft({
      latePenaltyTiers: configData.latePenaltyTiers?.length ? configData.latePenaltyTiers : defaultTiers,
      absencePenaltyPerDay: configData.absencePenaltyPerDay,
      overtimeRateMultiplier: configData.overtimeRateMultiplier,
      payDay: configData.payDay,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configData, draft]);

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/payroll/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latePenaltyTiers: draft.latePenaltyTiers ?? defaultTiers,
          absencePenaltyPerDay: Number(draft.absencePenaltyPerDay),
          overtimeRateMultiplier: Number(draft.overtimeRateMultiplier),
          payDay: Number(draft.payDay),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to save config");
      setDraft({
        latePenaltyTiers: j.latePenaltyTiers ?? defaultTiers,
        absencePenaltyPerDay: j.absencePenaltyPerDay,
        overtimeRateMultiplier: j.overtimeRateMultiplier,
        payDay: j.payDay,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await refetchConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "rounded-lg border px-3 py-2 text-sm w-full min-w-0";
  const inputStyle: React.CSSProperties = {
    borderColor: "var(--border-subtle)",
    color: "var(--fg)",
    background: "var(--bg)",
  };

  if (!draft) {
    return (
      <div className="card-xl p-6 sm:p-8">
        <h2 className="text-headline mb-1">Payroll Configuration</h2>
        <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>Late penalties, overtime, pay schedule</p>
        <div className="shimmer h-32 rounded-lg mt-4" />
      </div>
    );
  }

  return (
    <div className="card-xl p-6 sm:p-8">
      <div className="mb-4">
        <h2 className="text-headline">Payroll Configuration</h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--fg-tertiary)" }}>
          Late penalties, overtime, pay schedule. Working days are auto-calculated per month (weekdays minus holidays).
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(239, 68, 68, 0.12)", color: "var(--rose, #e11d48)" }}>
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(34, 197, 94, 0.12)", color: "var(--green)" }}>
          Payroll config saved!
        </div>
      )}

      <form onSubmit={(e) => void saveConfig(e)} className="space-y-5">
        {/* Late penalty tiers */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold" style={{ color: "var(--fg)" }}>Late Penalty Tiers</p>
            <button
              type="button"
              onClick={() => setDraft((d) => d ? { ...d, latePenaltyTiers: [...(d.latePenaltyTiers ?? []), { minutes: 0, penaltyPercent: 0 }] } : d)}
              className="rounded-md px-2 py-0.5 text-xs font-semibold"
              style={{ background: "var(--primary-light)", color: "var(--primary)" }}
            >
              + Add tier
            </button>
          </div>
          <p className="text-[11px] mb-3" style={{ color: "var(--fg-tertiary)" }}>
            Each tier defines a minutes threshold: if an employee is late by that many minutes or more, the penalty % of their daily salary is deducted. The highest matching threshold applies.
          </p>
          <div className="space-y-2">
            {(draft.latePenaltyTiers ?? defaultTiers).map((tier, idx) => (
              <div key={idx} className="flex items-center gap-3 rounded-xl p-3 text-xs" style={{ background: "var(--bg-grouped)" }}>
                <label className="flex flex-col gap-0.5 flex-1" style={{ color: "var(--fg-tertiary)" }}>
                  <span className="text-[10px] font-medium">Late by (minutes)</span>
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    style={inputStyle}
                    value={tier.minutes}
                    onChange={(e) => setDraft((d) => {
                      if (!d) return d;
                      const tiers = [...(d.latePenaltyTiers ?? [])];
                      tiers[idx] = { ...tiers[idx], minutes: parseInt(e.target.value, 10) || 0 };
                      return { ...d, latePenaltyTiers: tiers };
                    })}
                  />
                </label>
                <label className="flex flex-col gap-0.5 flex-1" style={{ color: "var(--fg-tertiary)" }}>
                  <span className="text-[10px] font-medium">Penalty %</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className={inputClass}
                    style={inputStyle}
                    value={tier.penaltyPercent}
                    onChange={(e) => setDraft((d) => {
                      if (!d) return d;
                      const tiers = [...(d.latePenaltyTiers ?? [])];
                      tiers[idx] = { ...tiers[idx], penaltyPercent: parseFloat(e.target.value) || 0 };
                      return { ...d, latePenaltyTiers: tiers };
                    })}
                  />
                </label>
                <button
                  type="button"
                  className="mt-3.5 rounded-md px-2 py-1 text-xs font-semibold"
                  style={{ background: "rgba(225, 29, 72, 0.12)", color: "var(--rose, #e11d48)" }}
                  onClick={() => setDraft((d) => {
                    if (!d) return d;
                    const tiers = (d.latePenaltyTiers ?? []).filter((_, i) => i !== idx);
                    return { ...d, latePenaltyTiers: tiers.length ? tiers : defaultTiers };
                  })}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Other settings */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
            Absence penalty (% of daily rate)
            <input
              type="number"
              required
              min={0}
              max={500}
              className={inputClass}
              style={inputStyle}
              value={draft.absencePenaltyPerDay ?? ""}
              onChange={(e) => setDraft((d) => d ? { ...d, absencePenaltyPerDay: parseFloat(e.target.value) || 0 } : d)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
            Overtime multiplier
            <input
              type="number"
              required
              min={0}
              step="0.01"
              className={inputClass}
              style={inputStyle}
              value={draft.overtimeRateMultiplier ?? ""}
              onChange={(e) => setDraft((d) => d ? { ...d, overtimeRateMultiplier: parseFloat(e.target.value) || 0 } : d)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
            Pay day (1–28)
            <input
              type="number"
              required
              min={1}
              max={28}
              className={inputClass}
              style={inputStyle}
              value={draft.payDay ?? ""}
              onChange={(e) => setDraft((d) => d ? { ...d, payDay: parseInt(e.target.value, 10) || 1 } : d)}
            />
          </label>
        </div>

        <div>
          <motion.button
            type="submit"
            disabled={saving}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            style={{ background: "var(--primary)", color: "var(--primary-fg, #fff)" }}
          >
            {saving ? "Saving\u2026" : "Save config"}
          </motion.button>
        </div>
      </form>
    </div>
  );
}
