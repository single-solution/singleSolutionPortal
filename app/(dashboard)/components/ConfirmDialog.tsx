"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Portal } from "./Portal";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "danger" | "warning" | "default";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
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
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="p-6 w-full max-w-sm shadow-2xl bg-[var(--bg-elevated)] border border-[var(--border)] rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-[var(--fg)] mb-1">{title}</h3>
            <p className="text-sm text-[var(--fg-secondary)] mb-6">{description}</p>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={onCancel} className="btn btn-secondary text-sm" disabled={loading}>
                Cancel
              </button>
              <motion.button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`btn text-sm text-white disabled:opacity-50 ${
                  variant === "danger"
                    ? "bg-[var(--rose)] hover:bg-[color-mix(in_srgb,var(--rose)_80%,black)]"
                    : variant === "warning"
                      ? "bg-[var(--amber)] hover:bg-[color-mix(in_srgb,var(--amber)_80%,black)]"
                      : "btn-primary"
                }`}
              >
                {loading ? "Working..." : confirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </Portal>
  );
}
