"use client";

import { useState, useMemo, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainer, slideUpItem } from "@/lib/motion";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render: (row: T, index: number) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchKey?: (row: T) => string;
  rowKey?: (row: T) => string;
  headerAction?: ReactNode;
  filterSlot?: ReactNode;
  pageSize?: number;
  loading?: boolean;
}

export default function DataTable<T>({
  columns,
  data,
  searchPlaceholder = "Search...",
  searchKey,
  rowKey,
  headerAction,
  filterSlot,
  pageSize = 10,
  loading,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    if (!search.trim() || !searchKey) return data;
    const q = search.toLowerCase();
    return data.filter((row) => searchKey(row).toLowerCase().includes(q));
  }, [data, search, searchKey]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const col = columns.find((c) => c.key === sortKey);
      if (!col) return 0;
      const av = String(col.render(a, 0) ?? "");
      const bv = String(col.render(b, 0) ?? "");
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  return (
    <div className="card-static overflow-hidden">
      <div className="flex flex-col gap-3 border-b p-4 sm:p-5" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-xs flex-1">
            <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder={searchPlaceholder} className="input text-sm" style={{ paddingLeft: "40px" }} />
          </div>
          {headerAction}
        </div>
        {filterSlot && (
          <div className="flex flex-wrap items-center gap-3">{filterSlot}</div>
        )}
      </div>

      {loading ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                {columns.map((col) => (
                  <th key={col.key} className="whitespace-nowrap px-4 py-3 sm:px-5">
                    <div
                      className={`shimmer h-3 rounded ${col.key === columns[0]?.key ? "w-28" : col.sortable ? "w-24" : "w-20"}`}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
                <tr key={row} className="border-b" style={{ borderColor: "var(--border)" }}>
                  {columns.map((col, ci) => (
                    <td key={col.key} className="whitespace-nowrap px-4 py-3 sm:px-5">
                      <div
                        className={`shimmer h-4 rounded ${ci === 0 ? "w-40 max-w-full" : ci === columns.length - 1 ? "w-16" : "w-24"}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`whitespace-nowrap px-4 py-3 text-xs font-medium sm:px-5 ${col.sortable ? "cursor-pointer select-none" : ""}`}
                    style={{ color: "var(--fg-secondary)" }}
                    onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.sortable && sortKey === col.key && (
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortDir === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} /></svg>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <motion.tbody variants={staggerContainer} initial="hidden" animate="visible">
              <AnimatePresence mode="popLayout">
              {paged.length === 0 ? (
                <motion.tr key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <td colSpan={columns.length} className="p-8 text-center text-callout" style={{ color: "var(--fg-tertiary)" }}>No data found</td>
                </motion.tr>
              ) : paged.map((row, i) => (
                <motion.tr
                  key={rowKey ? rowKey(row) : i}
                  layout
                  variants={slideUpItem}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.2) }}
                  whileHover={{ x: 3 }}
                  className="border-b transition-colors"
                  style={{ borderColor: "var(--border)" }}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="whitespace-nowrap px-4 py-3 sm:px-5">
                      {col.render(row, page * pageSize + i)}
                    </td>
                  ))}
                </motion.tr>
              ))}
              </AnimatePresence>
            </motion.tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-3 sm:px-5" style={{ borderColor: "var(--border)" }}>
          <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>{sorted.length} total</p>
          <div className="flex gap-1">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-30" style={{ color: "var(--fg-secondary)" }}>Prev</button>
            <span className="flex items-center px-2 text-xs font-medium" style={{ color: "var(--fg)" }}>{page + 1} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-30" style={{ color: "var(--fg-secondary)" }}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
