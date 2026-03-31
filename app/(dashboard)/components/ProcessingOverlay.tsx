"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Portal } from "./Portal";

interface ProcessingOverlayProps {
  visible: boolean;
  message?: string;
}

export default function ProcessingOverlay({ visible, message = "Processing..." }: ProcessingOverlayProps) {
  return (
    <Portal>
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
            className="flex flex-col items-center gap-4 rounded-2xl p-8"
            style={{ background: "var(--bg-solid)", boxShadow: "var(--glass-shadow-xl)" }}
          >
            <div className="flex gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: "var(--primary)" }}
                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                />
              ))}
            </div>
            <p className="text-callout font-medium" style={{ color: "var(--fg)" }}>{message}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </Portal>
  );
}
