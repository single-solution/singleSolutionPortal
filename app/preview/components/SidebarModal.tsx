"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { sidebarContent } from "@/lib/motion";

interface SidebarModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export default function SidebarModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: SidebarModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <motion.div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            ref={panelRef}
            className="relative z-10 flex h-full w-full max-w-md flex-col"
            style={{
              background: "var(--bg-solid)",
              boxShadow: "var(--glass-shadow-xl)",
            }}
            variants={sidebarContent}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div
              className="flex shrink-0 items-center justify-between border-b px-5 py-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <h2 className="text-headline" style={{ color: "var(--fg)" }}>
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-caption mt-0.5">{subtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                style={{ color: "var(--fg-secondary)" }}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {children}
            </div>

            {footer && (
              <div
                className="shrink-0 border-t px-5 py-4"
                style={{ borderColor: "var(--border)" }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
