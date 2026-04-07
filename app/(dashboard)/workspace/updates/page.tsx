"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { cardVariants, staggerContainerFast } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";

interface LogEntry {
  _id: string;
  userEmail: string;
  userName: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  createdAt: string;
}

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function logAvatarLabel(log: LogEntry) {
  const n = (log.userName || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
    return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
  }
  const email = log.userEmail || "?";
  return email.slice(0, 2).toUpperCase();
}

export default function UpdatesPage() {
  const { data: logsPayload, loading: logsLoading, refetch: refetchLogs } = useQuery<{ logs: LogEntry[] }>("/api/activity-logs?limit=50", "workspace-activity");
  const logs = logsPayload?.logs ?? [];

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") void refetchLogs();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [refetchLogs]);

  return (
    <div className="flex flex-col gap-4">
      <div className="card-xl flex items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-headline text-base">Activity</h2>
          <p className="text-footnote" style={{ color: "var(--fg-tertiary)" }}>Refreshes when the page becomes visible.</p>
        </div>
        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => void refetchLogs()} className="btn btn-sm shrink-0" style={{ borderColor: "var(--border-strong)" }}>
          Refresh
        </motion.button>
      </div>

      <motion.div className="card-xl relative overflow-hidden p-0" variants={staggerContainerFast} initial="hidden" animate="visible">
        {logsLoading && !logsPayload ? (
          <div className="divide-y p-4" style={{ borderColor: "var(--border)" }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex gap-3 py-3">
                <div className="shimmer h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2"><div className="shimmer h-3 w-2/3 rounded" /><div className="shimmer h-2.5 w-1/3 rounded" /></div>
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-sm" style={{ color: "var(--fg-tertiary)" }}>No activity yet.</div>
        ) : (
          <div className="relative pl-4 pr-4 pt-2 pb-4">
            <div className="absolute bottom-4 left-[27px] top-4 w-px sm:left-[31px]" style={{ background: "var(--border-strong)" }} aria-hidden />
            <ul className="relative space-y-0">
              {logs.map((log, i) => (
                <motion.li key={log._id} variants={cardVariants} custom={i} className="relative flex gap-3 py-3 pl-10 sm:pl-12">
                  <div className="absolute left-0 top-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold sm:left-1 sm:h-10 sm:w-10 sm:text-[11px]"
                    style={{ background: "color-mix(in srgb, var(--primary) 14%, transparent)", color: "var(--primary)", border: "2px solid var(--bg-elevated)" }}>
                    {logAvatarLabel(log)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug" style={{ color: "var(--fg)" }}>
                      <span className="font-semibold">{log.userName?.trim() || log.userEmail}</span>{" "}
                      <span style={{ color: "var(--fg-secondary)" }}>{log.action}</span>
                      {log.details && log.entity !== "security" && (
                        <span className="block text-[12px] font-normal mt-0.5 line-clamp-2" style={{ color: "var(--fg-tertiary)" }}>{log.details}</span>
                      )}
                    </p>
                    <p className="mt-1 text-[11px] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{timeAgo(log.createdAt)} · {new Date(log.createdAt).toLocaleString()}</p>
                  </div>
                </motion.li>
              ))}
            </ul>
          </div>
        )}
      </motion.div>
    </div>
  );
}
