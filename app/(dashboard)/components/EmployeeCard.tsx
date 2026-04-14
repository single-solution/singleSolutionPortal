"use client";

import { memo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { cardVariants, cardHover } from "@/lib/motion";

export interface EmployeeCardEmp {
  _id: string;
  username?: string;
  firstName: string;
  lastName: string;
  email?: string;
  designation?: string;
  department?: string;
  isLive?: boolean;
  status?: string;
  locationFlagged?: boolean;
  flagReason?: string | null;
  flagCoords?: { lat: number; lng: number } | null;
  firstEntry?: string;
  firstOfficeEntry?: string;
  lastOfficeExit?: string;
  lastExit?: string;
  todayMinutes?: number;
  officeMinutes?: number;
  remoteMinutes?: number;
  lateBy?: number;
  isLateToOffice?: boolean;
  lateToOfficeBy?: number;
  breakMinutes?: number;
  sessionCount?: number;
  shiftStart?: string;
  shiftEnd?: string;
  shiftBreakTime?: number;
  profileImage?: string;
  weeklySchedule?: Record<string, { isWorking: boolean; start: string; end: string; breakMinutes: number }>;
  isVerified?: boolean;
  pendingTasks?: number;
  inProgressTasks?: number;
  campaigns?: string[];
  /** Shown in list meta when set. */
  phone?: string;
  /** Pre-formatted shift line for list mode. */
  shiftSummary?: string;
}

export interface EmployeeCardProps {
  emp: EmployeeCardEmp;
  idx?: number;
  attendanceLoading?: boolean;
  onPing?: (id: string, name: string) => void;
  showActions?: boolean;
  onEdit?: (id: string) => void;
  onManage?: (id: string) => void;
  onDelete?: (id: string) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  /** Show designation, department, shift, and other meta (employee list only). */
  showEmployeeMeta?: boolean;
  /** Extra row below card body (e.g. status toggle, joined date). */
  footerSlot?: React.ReactNode;
  /** When true, omit outer card chrome (parent supplies `.card`). */
  embedded?: boolean;
  className?: string;
  /** Show attendance data (clock in/out, hours, office in/out). Defaults to true. */
  showAttendance?: boolean;
  /** Show detailed activity strip (sessions, breaks, late, idle, progress bar). Defaults to true. */
  showAttendanceDetail?: boolean;
  /** Show location flag alerts. Defaults to true. */
  showLocationFlags?: boolean;
  /** Show task count chips. Defaults to true. */
  showTasks?: boolean;
  /** Show campaign count chips. Defaults to true. */
  showCampaigns?: boolean;
  /** When set, clicking the card calls this instead of navigating to the detail page. */
  onCardClick?: (id: string) => void;
}

const AVATAR_GRADIENTS = [
  "from-blue-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-purple-500 to-pink-400",
  "from-amber-500 to-orange-400",
  "from-rose-500 to-red-400",
  "from-indigo-500 to-violet-400",
  "from-lime-500 to-green-400",
  "from-fuchsia-500 to-pink-300",
];

function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

export function formatMinutesShort(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatTimeStr(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
}

type PulseVariant = "office" | "remote" | "lastSeen" | "absent";

function pulseVariant(emp: EmployeeCardEmp): PulseVariant {
  if (emp.isLive && emp.status === "remote") return "remote";
  if (emp.isLive && (emp.status === "office" || emp.status === "overtime")) return "office";
  if (emp.isLive) return "office";
  if (emp.firstEntry) return "lastSeen";
  return "absent";
}

function StatusPulsePill({ emp, attendanceLoading }: { emp: EmployeeCardEmp; attendanceLoading?: boolean }) {
  if (attendanceLoading) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tabular-nums" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
        <span className="h-1.5 w-8 shimmer rounded-full inline-block" />
      </span>
    );
  }

  const v = pulseVariant(emp);
  const showPulse = emp.isLive && !attendanceLoading;

  const styles: Record<PulseVariant, { bg: string; color: string; border: string; label: string; sub?: string }> = {
    office: {
      bg: "color-mix(in srgb, var(--green) 18%, transparent)",
      color: "var(--green)",
      border: "color-mix(in srgb, var(--green) 35%, transparent)",
      label: "In Office",
    },
    remote: {
      bg: "color-mix(in srgb, var(--teal) 16%, transparent)",
      color: "var(--teal)",
      border: "color-mix(in srgb, var(--teal) 30%, transparent)",
      label: "Remote",
    },
    lastSeen: {
      bg: "var(--bg-elevated)",
      color: "var(--fg-secondary)",
      border: "var(--border)",
      label: "Last seen",
      sub: emp.lastExit ? formatTimeStr(emp.lastExit) : "—",
    },
    absent: {
      bg: "rgba(245,158,11,0.18)",
      color: "#d97706",
      border: "rgba(245,158,11,0.35)",
      label: "Absent",
    },
  };

  const s = styles[v];

  return (
    <span
      className="inline-flex max-w-[min(100%,12rem)] items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums backdrop-blur-sm"
      style={{
        background: s.bg,
        color: s.color,
        borderColor: emp.locationFlagged ? "var(--rose)" : s.border,
        boxShadow: emp.locationFlagged
          ? "0 0 0 1px color-mix(in srgb, var(--rose) 35%, transparent)"
          : "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      {showPulse && (
        <span className="relative inline-flex h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.color }}>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: s.color }} />
        </span>
      )}
      <span className="truncate">{s.label}</span>
      {s.sub !== undefined && <span className="truncate font-medium opacity-90">{s.sub}</span>}
    </span>
  );
}

function ActivityChips({ emp }: { emp: EmployeeCardEmp }) {
  const remoteMins = emp.remoteMinutes ?? 0;
  const breakMins = emp.breakMinutes ?? 0;

  let idleMins = 0;
  if (!emp.isLive && emp.firstEntry && emp.lastExit) {
    const span = (new Date(emp.lastExit).getTime() - new Date(emp.firstEntry).getTime()) / 60000;
    idleMins = Math.max(0, Math.round(span - (emp.todayMinutes ?? 0)));
  }

  return (
    <div className="flex flex-wrap items-center gap-1 text-[9px]">
      {remoteMins > 0 && (
        <span className="rounded-lg px-1.5 py-0.5 font-medium" style={{ background: "color-mix(in srgb, var(--teal) 7%, transparent)", color: "var(--teal)" }}>
          {formatMinutesShort(remoteMins)} remote
        </span>
      )}
      {breakMins > 0 && (
        <span className="rounded-lg px-1.5 py-0.5 font-medium" style={{ background: "color-mix(in srgb, var(--purple) 7%, transparent)", color: "var(--purple)" }}>
          {formatMinutesShort(breakMins)} break
        </span>
      )}
      {idleMins > 5 && (
        <span className="rounded-lg px-1.5 py-0.5 font-medium" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
          {formatMinutesShort(idleMins)} idle
        </span>
      )}
    </div>
  );
}

function LatePill({ emp, attendanceLoading }: { emp: EmployeeCardEmp; attendanceLoading?: boolean }) {
  if (attendanceLoading) return null;
  const lateBy = emp.lateBy ?? 0;
  const lateToOffice = emp.isLateToOffice && (emp.lateToOfficeBy ?? 0) > 0;
  if (lateBy <= 0 && !lateToOffice) return null;
  const label = lateToOffice
    ? `+${formatMinutesShort(emp.lateToOfficeBy!)} late`
    : `+${formatMinutesShort(lateBy)} late`;
  const color = lateToOffice ? "var(--rose)" : "var(--amber)";
  const border = lateToOffice ? "rgba(244,63,94,0.35)" : "rgba(245,158,11,0.35)";
  return (
    <span
      className="inline-flex max-w-[min(100%,10rem)] items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums backdrop-blur-sm"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderColor: border, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

export const EmployeeCard = memo(function EmployeeCard({
  emp,
  idx = 0,
  attendanceLoading,
  onPing,
  showActions,
  onEdit,
  onManage,
  onDelete,
  selectable,
  selected,
  onSelect,
  showEmployeeMeta,
  footerSlot,
  embedded,
  className,
  showAttendance = true,
  showAttendanceDetail = true,
  showLocationFlags = true,
  showTasks = true,
  showCampaigns = true,
  onCardClick,
}: EmployeeCardProps) {
  const todayM = emp.todayMinutes ?? 0;

  const firstArrival =
    attendanceLoading ? "—" : emp.firstEntry ? (emp.firstEntry.includes("T") ? formatTimeStr(emp.firstEntry) : emp.firstEntry) : "—";

  const subtitle =
    emp.designation || emp.department
      ? [emp.designation, emp.department].filter(Boolean).join(" · ")
      : emp.email ?? "";

  const dimmed = !attendanceLoading && !emp.isLive;

  const inner = (
    <>
      {onCardClick ? (
        <button
          type="button"
          onClick={() => onCardClick(emp._id)}
          className={`absolute inset-0 z-0 ${embedded ? "" : "rounded-[var(--radius)]"}`}
          aria-label={`View ${emp.firstName} ${emp.lastName}`}
        />
      ) : (
        <Link
          href={`/employee/${emp.username ?? emp._id}`}
          className={`absolute inset-0 z-0 ${embedded ? "" : "rounded-[var(--radius)]"}`}
          aria-label={`View ${emp.firstName} ${emp.lastName}`}
        />
      )}

      {/* Absolute pills (top-right, higher z-index) */}
      {(showAttendance || showAttendanceDetail) && (
        <div className="pointer-events-none absolute right-0 z-20 flex items-center gap-1 hidden sm:flex" style={{ top: -13 }}>
          {showAttendanceDetail && <LatePill emp={emp} attendanceLoading={attendanceLoading} />}
          {showAttendance && <StatusPulsePill emp={emp} attendanceLoading={attendanceLoading} />}
        </div>
      )}

      <div className={`relative z-10 flex flex-1 flex-col gap-1.5 sm:gap-2 ${embedded ? "p-1.5 sm:p-2" : "p-2 sm:p-2.5"} pointer-events-none`}>
        {selectable && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={() => onSelect?.(emp._id)}
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto absolute left-2.5 top-2.5 z-20 h-4 w-4 rounded accent-[var(--primary)] opacity-0 transition-opacity checked:opacity-100 group-hover:opacity-100"
            aria-label={`Select ${emp.firstName} ${emp.lastName}`}
          />
        )}

        <div className="pr-1 pt-0.5">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1 flex-wrap">
              <p className="text-callout font-semibold" style={{ color: "var(--fg)" }}>
                {emp.firstName} {emp.lastName}
              </p>
              {showAttendance && <span className="sm:hidden"><StatusPulsePill emp={emp} attendanceLoading={attendanceLoading} /></span>}
              {onPing && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.92 }}
                  className="pointer-events-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors"
                  style={{ color: "var(--primary)" }}
                  title={`Ping ${emp.firstName}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onPing(emp._id, `${emp.firstName} ${emp.lastName}`);
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5.636 18.364a9 9 0 010-12.728" /><path d="M18.364 5.636a9 9 0 010 12.728" /><circle cx="12" cy="12" r="1" />
                  </svg>
                </motion.button>
              )}
              {emp.isVerified === false && (
                <span
                  className="pointer-events-none shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                  style={{ background: "color-mix(in srgb, var(--amber) 15%, transparent)", color: "var(--amber)" }}
                >
                  Pending
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-caption" style={{ color: "var(--fg-secondary)" }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {showEmployeeMeta && (
          <div className="space-y-1 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span style={{ color: "var(--fg-tertiary)" }}>Designation</span>
              <span className="truncate font-medium text-right" style={{ color: "var(--fg)" }}>
                {emp.designation?.trim() ? emp.designation : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span style={{ color: "var(--fg-tertiary)" }}>Department</span>
              <span className="truncate font-medium text-right" style={{ color: "var(--fg)" }}>
                {emp.department ?? "—"}
              </span>
            </div>
            {emp.shiftSummary && (
              <div className="flex items-start justify-between gap-2">
                <span className="shrink-0" style={{ color: "var(--fg-tertiary)" }}>
                  Shift
                </span>
                <span className="text-right text-[11px] font-medium" style={{ color: "var(--fg-secondary)" }}>
                  {emp.shiftSummary}
                </span>
              </div>
            )}
            {emp.phone && (
              <div className="flex items-center justify-between gap-2">
                <span style={{ color: "var(--fg-tertiary)" }}>Phone</span>
                <span className="truncate font-medium text-right" style={{ color: "var(--fg)" }}>
                  {emp.phone}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Clock In · Hours · Clock Out */}
        {showAttendance && (
          <div className="mt-auto grid grid-cols-3 gap-1 border-t pt-2 text-[11px]" style={{ borderColor: "var(--border)" }}>
            <div>
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Clock In</p>
              <p className="font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{firstArrival}</p>
            </div>
            <div className="text-center">
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Hours</p>
              <p className="font-semibold tabular-nums" style={{ color: "var(--fg)" }}>
                {attendanceLoading ? "—" : formatMinutesShort(todayM)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Clock Out</p>
              <p className="font-semibold tabular-nums" style={{ color: "var(--fg)" }}>
                {attendanceLoading ? "—" : emp.isLive ? "—" : emp.lastExit ? formatTimeStr(emp.lastExit) : "—"}
              </p>
            </div>
          </div>
        )}

        {/* Office In · Office · Office Out */}
        {showAttendance && !attendanceLoading && (
          <div className="grid grid-cols-3 gap-1 text-[11px]" style={{ color: "var(--fg-secondary)" }}>
            <div>
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Office In</p>
              <p className="font-semibold tabular-nums">{emp.firstOfficeEntry ? formatTimeStr(emp.firstOfficeEntry) : "—"}</p>
            </div>
            <div className="text-center">
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Office</p>
              <p className="font-semibold tabular-nums">{formatMinutesShort(emp.officeMinutes ?? 0)}</p>
            </div>
            <div className="text-right">
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Office Out</p>
              <p className="font-semibold tabular-nums">
                {emp.isLive && emp.status === "office" ? "—" : emp.lastOfficeExit ? formatTimeStr(emp.lastOfficeExit) : "—"}
              </p>
            </div>
          </div>
        )}

        {/* Activity chips (no progress bar, no session count) */}
        {showAttendanceDetail && !attendanceLoading && (
          <>
            <ActivityChips emp={emp} />

            {showLocationFlags && emp.locationFlagged && (
              <div className="rounded-lg border p-2 text-[9px] space-y-1" style={{ borderColor: "color-mix(in srgb, var(--rose) 30%, transparent)", background: "color-mix(in srgb, var(--rose) 4%, transparent)" }}>
                <div className="flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  <span className="font-bold" style={{ color: "var(--rose)" }}>Location Flagged</span>
                </div>
                {emp.flagReason && (
                  <p className="leading-snug" style={{ color: "var(--rose)" }}>{emp.flagReason}</p>
                )}
                {emp.flagCoords && (
                  <a
                    href={`https://www.google.com/maps?q=${emp.flagCoords.lat},${emp.flagCoords.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pointer-events-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors"
                    style={{ background: "color-mix(in srgb, var(--rose) 8%, transparent)", color: "var(--rose)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {emp.flagCoords.lat.toFixed(5)}, {emp.flagCoords.lng.toFixed(5)}
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                    </svg>
                  </a>
                )}
              </div>
            )}
          </>
        )}

        {/* Tasks & Campaigns */}
        {!attendanceLoading && (showTasks || showCampaigns) && (
          <div className="flex flex-wrap gap-1 border-t pt-2 text-[9px]" style={{ borderColor: "var(--border)" }}>
            {showTasks && (
              <>
                <span
                  className="rounded-full border px-1.5 py-0.5 font-semibold"
                  style={{
                    background: (emp.pendingTasks ?? 0) > 0 ? "color-mix(in srgb, var(--amber) 8%, transparent)" : "var(--bg-grouped)",
                    color: (emp.pendingTasks ?? 0) > 0 ? "var(--amber)" : "var(--fg-tertiary)",
                    borderColor: (emp.pendingTasks ?? 0) > 0 ? "color-mix(in srgb, var(--amber) 19%, transparent)" : "var(--border)",
                  }}
                >
                  {emp.pendingTasks ?? 0} pending
                </span>
                <span
                  className="rounded-full border px-1.5 py-0.5 font-semibold"
                  style={{
                    background: (emp.inProgressTasks ?? 0) > 0 ? "var(--primary-light)" : "var(--bg-grouped)",
                    color: (emp.inProgressTasks ?? 0) > 0 ? "var(--primary)" : "var(--fg-tertiary)",
                    borderColor: (emp.inProgressTasks ?? 0) > 0 ? "color-mix(in srgb, var(--primary) 20%, transparent)" : "var(--border)",
                  }}
                >
                  {emp.inProgressTasks ?? 0} active
                </span>
              </>
            )}
            {showCampaigns && (
              <span
                className="rounded-full border px-1.5 py-0.5 font-semibold"
                style={{
                  background: (emp.campaigns?.length ?? 0) > 0 ? "color-mix(in srgb, var(--teal) 10%, transparent)" : "var(--bg-grouped)",
                  color: (emp.campaigns?.length ?? 0) > 0 ? "var(--teal)" : "var(--fg-tertiary)",
                  borderColor: (emp.campaigns?.length ?? 0) > 0 ? "color-mix(in srgb, var(--teal) 20%, transparent)" : "var(--border)",
                }}
              >
                {emp.campaigns?.length ?? 0} campaign{(emp.campaigns?.length ?? 0) !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        {(showActions || footerSlot) && (
          <div className="flex items-center justify-between gap-2 border-t pt-2" style={{ borderColor: "var(--border)" }}>
            <div className="pointer-events-auto min-w-0 flex-1">{footerSlot}</div>
            {showActions && (onEdit || onManage || onDelete) && (
              <div className="pointer-events-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {onManage && (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    className="flex h-7 items-center justify-center gap-1 rounded-lg px-1.5 text-[10px] font-semibold transition-colors"
                    style={{ color: "var(--teal)" }}
                    title="Manage assignment"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onManage(emp._id);
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    Manage
                  </motion.button>
                )}
                {onEdit && (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
                    style={{ color: "var(--primary)" }}
                    title="Edit"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onEdit(emp._id);
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </motion.button>
                )}
                {onDelete && (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
                    style={{ color: "var(--rose)" }}
                    title="Deactivate"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDelete(emp._id);
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </motion.button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  const shellClass = embedded
    ? `group relative flex min-h-0 flex-1 flex-col overflow-visible ${className ?? ""}`
    : `card-static group relative flex h-full flex-col overflow-visible ${className ?? ""}`;

  const shell = <div className={shellClass}>{inner}</div>;

  if (embedded) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" style={{ opacity: dimmed ? 0.72 : 1 }}>
        {shell}
      </div>
    );
  }

  return (
    <motion.div
      layout
      custom={idx}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={cardHover}
      exit={{ opacity: 0, scale: 0.97 }}
      className="h-full"
      style={{ opacity: dimmed ? 0.72 : 1 }}
    >
      {shell}
    </motion.div>
  );
});
