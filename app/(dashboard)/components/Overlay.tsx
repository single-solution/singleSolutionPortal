"use client";

import { motion } from "framer-motion";

interface OverlayProps {
  onClick?: () => void;
  zIndex?: number;
  className?: string;
}

export function Overlay({ onClick, zIndex = 40, className = "" }: OverlayProps) {
  return (
    <motion.div
      className={`fixed inset-0 ${className}`}
      style={{ zIndex, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClick}
    />
  );
}
