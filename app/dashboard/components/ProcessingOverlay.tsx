"use client";

import { motion, AnimatePresence } from "framer-motion";

interface ProcessingOverlayProps {
  visible: boolean;
  message?: string;
}

export default function ProcessingOverlay({ visible, message = "Processing..." }: ProcessingOverlayProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="flex flex-col items-center gap-3 rounded-2xl p-8"
            style={{ background: "var(--bg-solid)", boxShadow: "var(--glass-shadow-xl)" }}
          >
            <svg className="h-8 w-8 animate-spin" style={{ color: "var(--primary)" }} viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-callout font-medium" style={{ color: "var(--fg)" }}>{message}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
