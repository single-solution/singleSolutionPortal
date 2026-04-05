"use client";

import { motion } from "framer-motion";
import { useQuery } from "@/lib/useQuery";
import { useSession } from "next-auth/react";

interface Dept {
  _id: string;
  title: string;
}

interface ScopeStripProps {
  value: string;
  onChange: (deptId: string) => void;
  className?: string;
}

export function ScopeStrip({ value, onChange, className }: ScopeStripProps) {
  const { data: session } = useSession();
  const role = session?.user?.role;

  const shouldShow = role === "superadmin" || role === "manager";
  const { data: deptsRaw } = useQuery<Dept[]>(shouldShow ? "/api/departments" : null, "scopeDepts");

  if (!shouldShow || !deptsRaw || deptsRaw.length === 0) return null;

  const options: { id: string; label: string }[] = [
    { id: "all", label: "All departments" },
    ...deptsRaw.map((d) => ({ id: d._id, label: d.title })),
  ];

  return (
    <div className={`flex items-center gap-0.5 rounded-lg border p-0.5 overflow-x-auto scrollbar-hide ${className ?? ""}`} style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
      {options.map((opt) => (
        <motion.button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
            value === opt.id
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
