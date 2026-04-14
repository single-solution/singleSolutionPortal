"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Portal } from "./Portal";

/* ─── RefreshBtn ─── */

export function RefreshBtn({ onRefresh }: { onRefresh: () => void }) {
  const [spinning, setSpinning] = useState(false);
  return (
    <motion.button
      type="button"
      onClick={() => { setSpinning(true); onRefresh(); setTimeout(() => setSpinning(false), 800); }}
      animate={{ rotate: spinning ? 360 : 0 }}
      transition={{ duration: 0.6 }}
      className="ml-2 p-1 rounded-full hover:bg-[var(--hover-bg)] transition-colors"
      style={{ color: "var(--fg-tertiary)" }}
      title="Refresh"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
    </motion.button>
  );
}

/* ─── SearchField ─── */

export function SearchField({ value, onChange, placeholder = "Search…" }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative flex-1">
      <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input flex-1"
        style={{ paddingLeft: "40px" }}
      />
    </div>
  );
}

/* ─── SegmentedControl ─── */

export function SegmentedControl<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
      {options.map((opt) => (
        <motion.button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
            value === opt.value
              ? "bg-[var(--primary)] text-white shadow-sm"
              : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
          }`}
        >
          {opt.label}
        </motion.button>
      ))}
    </div>
  );
}

/* ─── PageHeader ─── */

export function PageHeader({ title, subtitle, loading, shimmerWidth = "w-44" }: {
  title: string;
  subtitle?: string;
  loading?: boolean;
  shimmerWidth?: string;
}) {
  return (
    <div>
      <h1 className="text-title">{title}</h1>
      <p className="text-subhead">
        {loading ? (
          <span className={`inline-block h-3 ${shimmerWidth} max-w-[55vw] rounded align-middle shimmer`} aria-hidden />
        ) : subtitle ?? null}
      </p>
    </div>
  );
}

/* ─── EmptyState ─── */

export function EmptyState({ message, action }: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="card p-12 text-center"
    >
      <p style={{ color: "var(--fg-secondary)" }}>{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}

/* ─── ModalShell ─── */

export function ModalShell({ open, onClose, title, subtitle, maxWidth = "max-w-lg", children, footer }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4"
            style={{ WebkitBackdropFilter: "saturate(200%) blur(24px)" }}
            onClick={onClose}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className={`w-full ${maxWidth} shadow-xl bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl overflow-hidden`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
                <div>
                  <h3 className="text-lg font-bold text-[var(--fg)]">{title}</h3>
                  {subtitle && <p className="text-xs text-[var(--fg-secondary)] mt-0.5">{subtitle}</p>}
                </div>
                <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-secondary)" }}>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-6 max-h-[70vh] overflow-y-auto">
                <motion.div
                  className="space-y-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                >
                  {children}
                  {footer && <div className="flex gap-3 pt-2">{footer}</div>}
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
