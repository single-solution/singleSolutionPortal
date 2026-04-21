"use client";

import { motion } from "framer-motion";

const SIZES = {
  sm: { track: "h-4 w-7", thumb: "h-2.5 w-2.5", translate: "0.75rem", spinner: 8 },
  md: { track: "h-5 w-9", thumb: "h-3.5 w-3.5", translate: "1rem", spinner: 12 },
  lg: { track: "h-6 w-11", thumb: "h-4.5 w-4.5", translate: "1.25rem", spinner: 14 },
} as const;

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: "sm" | "md" | "lg";
  color?: string;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  title?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  size = "sm",
  color = "var(--primary)",
  disabled = false,
  loading = false,
  label,
  title,
}: ToggleSwitchProps) {
  const s = SIZES[size];
  const isDisabled = disabled || loading;

  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={isDisabled}
      title={title}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex ${s.track} shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50`}
      style={{ backgroundColor: checked ? color : "color-mix(in srgb, var(--fg) 20%, var(--bg))" }}
    >
      <motion.span
        className={`pointer-events-none inline-flex items-center justify-center ${s.thumb} rounded-full bg-white shadow`}
        animate={{ x: checked ? s.translate : "0rem" }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        {loading && (
          <svg width={s.spinner} height={s.spinner} viewBox="0 0 24 24" fill="none" className="animate-spin">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.25" />
            <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.75" />
          </svg>
        )}
      </motion.span>
    </button>
  );

  if (!label) return toggle;

  return (
    <label className="flex items-center gap-2 cursor-pointer">
      {toggle}
      <span className="text-[11px] font-medium" style={{ color: "var(--fg-secondary)" }}>{label}</span>
    </label>
  );
}
