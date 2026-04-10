"use client";

export function Pill({ color, label, variant = "filled", size = "md", icon }: {
  color: string; label: string; variant?: "filled" | "outline"; size?: "sm" | "md"; icon?: "laptop" | "phone" | "desktop";
}) {
  const isSm = size === "sm";
  const isOutline = variant === "outline";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${isSm ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"}`}
      style={{
        background: isOutline ? "transparent" : `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
        border: isOutline ? `1px solid color-mix(in srgb, ${color} 30%, transparent)` : "none",
      }}
    >
      {icon === "laptop" && <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
      {icon === "phone" && <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>}
      {icon === "desktop" && <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
      {!isOutline && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
      {label}
    </span>
  );
}

export function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <p className="text-sm font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

export function AnalyticChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-2.5" style={{ background: "var(--bg-grouped)" }}>
      <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <p className="mt-0.5 text-sm font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

export function StatusPill({ status, config }: { status: string; config?: Record<string, { bg: string; color: string; label?: string }> }) {
  const defaults: Record<string, { bg: string; color: string; label?: string }> = {
    draft: { bg: "var(--bg-grouped)", color: "var(--fg-tertiary)" },
    pending: { bg: "color-mix(in srgb, var(--amber) 15%, transparent)", color: "var(--amber)" },
    approved: { bg: "rgba(34, 197, 94, 0.15)", color: "var(--green)" },
    finalized: { bg: "color-mix(in srgb, var(--primary) 14%, transparent)", color: "var(--primary)" },
    paid: { bg: "rgba(34, 197, 94, 0.15)", color: "var(--green)" },
    rejected: { bg: "color-mix(in srgb, var(--rose) 15%, transparent)", color: "var(--rose)" },
    cancelled: { bg: "var(--bg-grouped)", color: "var(--fg-tertiary)" },
    active: { bg: "color-mix(in srgb, var(--teal) 12%, transparent)", color: "var(--teal)" },
    paused: { bg: "color-mix(in srgb, var(--amber) 12%, transparent)", color: "var(--amber)" },
    completed: { bg: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" },
    inProgress: { bg: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" },
  };
  const map = config ?? defaults;
  const s = map[status] ?? { bg: "var(--bg-grouped)", color: "var(--fg-tertiary)" };
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold capitalize"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label ?? status.replace(/([A-Z])/g, " $1").trim()}
    </span>
  );
}

export function HeaderStatPill({ label, value, color, dotColor }: { label: string; value: string | number; color?: string; dotColor?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
      style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: color ?? "var(--fg-secondary)" }}
    >
      {dotColor && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: dotColor }} />}
      <span className="tabular-nums font-bold" style={{ color: dotColor ?? color ?? "var(--fg)" }}>{value}</span>
      {label}
    </span>
  );
}
