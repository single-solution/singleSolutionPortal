"use client";

import { useState, useMemo, type ReactNode } from "react";
import { motion } from "framer-motion";
import { staggerContainer, slideUpItem, listItemHover } from "@/lib/motion";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render: (row: T, index: number) => ReactNode;
}

interface DataTablePreviewProps<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchKey?: (row: T) => string;
  headerAction?: ReactNode;
  filterSlot?: ReactNode;
  pageSize?: number;
}

function StatusToggle({ active }: { active: boolean }) {
  return (
    <div
      className="relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors"
      style={{ background: active ? "var(--primary)" : "var(--fg-tertiary)" }}
    >
      <motion.div
        className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-md"
        style={{ left: active ? "calc(100% - 1.25rem - 0.25rem)" : "0.25rem" }}
        layout
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
      />
    </div>
  );
}

export { StatusToggle };

export default function DataTablePreview<T>({
  columns,
  data,
  searchPlaceholder = "Search...",
  searchKey,
  headerAction,
  filterSlot,
  pageSize = 10,
}: DataTablePreviewProps<T>) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!search.trim() || !searchKey) return data;
    const q = search.toLowerCase();
    return data.filter((row) => searchKey(row).toLowerCase().includes(q));
  }, [data, search, searchKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  return (
    <div className="card-static overflow-hidden">
      <div
        className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="relative max-w-xs flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            type="text"
            className="input pl-9 text-sm"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        {headerAction}
      </div>
      {filterSlot && (
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--border)" }}>
          {filterSlot}
        </div>
      )}

      <div className="scrollbar-hide overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-left">
          <thead>
            <tr className="text-caption" style={{ color: "var(--fg-tertiary)" }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 font-medium sm:px-5 ${col.sortable ? "cursor-pointer select-none" : ""}`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <svg
                        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{
                          opacity: sortCol === col.key ? 1 : 0.3,
                          transform: sortCol === col.key && sortDir === "desc" ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.2s, opacity 0.2s",
                        }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 15l4-4 4 4" />
                      </svg>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <motion.tbody variants={staggerContainer} initial="hidden" animate="visible">
            {paged.map((row, idx) => (
              <motion.tr
                key={idx}
                variants={slideUpItem}
                whileHover={listItemHover}
                className="border-t"
                style={{ borderColor: "var(--border)" }}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 sm:px-5">
                    {col.render(row, page * pageSize + idx)}
                  </td>
                ))}
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>

      <div
        className="flex items-center justify-between border-t px-4 py-3 sm:px-5"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="text-caption">
          {filtered.length === 0
            ? "No results"
            : `${page * pageSize + 1}-${Math.min((page + 1) * pageSize, filtered.length)} of ${filtered.length}`}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="btn btn-sm btn-secondary disabled:opacity-30"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="btn btn-sm btn-secondary disabled:opacity-30"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
