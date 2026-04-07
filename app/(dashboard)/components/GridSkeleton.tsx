"use client";

import { motion } from "framer-motion";
import { CardSkeleton } from "./CardSkeleton";

interface GridSkeletonProps {
  count?: number;
  className?: string;
  columnsClassName?: string;
}

export function GridSkeleton({
  count = 6,
  className = "",
  columnsClassName = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
}: GridSkeletonProps) {
  return (
    <div className={`grid gap-4 ${columnsClassName} ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.06, duration: 0.35 }}
        >
          <CardSkeleton />
        </motion.div>
      ))}
    </div>
  );
}
