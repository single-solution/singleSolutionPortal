"use client";

export function Pill({ color, label, variant = "filled", size = "md", icon }: {
  color: string; label: string; variant?: "filled" | "outline"; size?: "sm" | "md"; icon?: "laptop" | "phone" | "desktop";
}) {
  const isSm = size === "sm";
  const isOutline = variant === "outline";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold pill-hover ${isSm ? "px-2.5 py-0.5 text-[12px]" : "px-3 py-1 text-[12px]"}`}
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

export function StatChip({ label, value, color, subtitle }: { label: string; value: string; color: string; subtitle?: string }) {
  return (
    <div className="rounded-xl p-1.5 text-center" style={{ background: "var(--bg-grouped)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>{label}</p>
      <p className="text-[11px] font-bold tabular-nums" style={{ color }}>{value}</p>
      {subtitle ? <p className="mt-0.5 truncate px-0.5 text-[11px] font-medium leading-tight" style={{ color: "var(--fg-secondary)" }}>{subtitle}</p> : null}
    </div>
  );
}

export function HeaderStatPill({ label, value, color, dotColor }: { label: string; value: string | number; color?: string; dotColor?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-semibold pill-hover"
      style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: color ?? "var(--fg-secondary)" }}
    >
      {dotColor && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: dotColor }} />}
      <span className="tabular-nums font-bold" style={{ color: dotColor ?? color ?? "var(--fg)" }}>{value}</span>
      {label}
    </span>
  );
}
