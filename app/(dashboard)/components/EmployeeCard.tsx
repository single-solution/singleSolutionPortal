"use client";

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
  reportsTo?: string;
  isLive?: boolean;
  status?: string;
  locationFlagged?: boolean;
  flagReason?: string | null;
  flagCoords?: { lat: number; lng: number } | null;
  firstEntry?: string;
  lastOfficeExit?: string;
  lastExit?: string;
  todayMinutes?: number;
  officeMinutes?: number;
  remoteMinutes?: number;
  lateBy?: number;
  breakMinutes?: number;
  shiftStart?: string;
  shiftEnd?: string;
  shiftBreakTime?: number;
  profileImage?: string;
  userRole?: string;
  teams?: { _id: string; name: string }[];
  workShift?: { type: string; shift: { start: string; end: string }; workingDays?: string[] };
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
  onDelete?: (id: string) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  /** Role / department / teams block (employee list only). */
  showRoleDepartmentTeams?: boolean;
  /** Extra row below card body (e.g. status toggle, joined date). */
  footerSlot?: React.ReactNode;
  /** When true, omit outer card chrome (parent supplies `.card`). */
  embedded?: boolean;
  className?: string;
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

function getShiftMinutes(start: string, end: string, breakTime: number) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(eh * 60 + em - (sh * 60 + sm) - breakTime, 1);
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

  const styles: Record<PulseVariant, { bg: string; color: string; label: string; sub?: string }> = {
    office: {
      bg: "rgba(16,185,129,0.15)",
      color: "#10b981",
      label: "In Office",
    },
    remote: {
      bg: "rgba(0,122,255,0.12)",
      color: "#007aff",
      label: "Remote",
    },
    lastSeen: {
      bg: "var(--bg-grouped)",
      color: "var(--fg-secondary)",
      label: "Last seen",
      sub: emp.lastExit ? formatTimeStr(emp.lastExit) : "—",
    },
    absent: {
      bg: "rgba(245,158,11,0.15)",
      color: "#d97706",
      label: "Absent",
    },
  };

  const s = styles[v];

  return (
    <span
      className="inline-flex max-w-[min(100%,9rem)] items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold tabular-nums"
      style={{
        background: s.bg,
        color: s.color,
        borderColor: emp.locationFlagged ? "#ef4444" : `${s.color}35`,
        boxShadow: emp.locationFlagged ? "0 0 0 1px rgba(239,68,68,0.35)" : undefined,
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

function ShiftProgressBar({ todayMinutes, shiftStart, shiftEnd, shiftBreakTime }: { todayMinutes: number; shiftStart: string; shiftEnd: string; shiftBreakTime: number }) {
  const shiftMins = getShiftMinutes(shiftStart, shiftEnd, shiftBreakTime);
  const ratio = todayMinutes / shiftMins;
  const pctRaw = Math.round(ratio * 100);
  const cappedWidthPct = Math.min(ratio * 100, 120);
  const hasOt = todayMinutes > shiftMins;
  const primaryWidthPctOfInner = hasOt ? (100 / cappedWidthPct) * 100 : 100;

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
        <motion.div
          className="flex h-full min-w-0"
          initial={{ width: 0 }}
          animate={{ width: `${cappedWidthPct}%` }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          {hasOt ? (
            <>
              <div className="h-full shrink-0 rounded-l-full" style={{ width: `${primaryWidthPctOfInner}%`, background: "var(--primary)" }} />
              <div className="h-full min-w-0 flex-1 rounded-r-full" style={{ background: "#8b5cf6" }} />
            </>
          ) : (
            <div className="h-full w-full rounded-full" style={{ background: "var(--primary)" }} />
          )}
        </motion.div>
      </div>
      <span className="text-caption shrink-0 tabular-nums font-semibold" style={{ color: "var(--fg-secondary)" }}>
        {pctRaw}%
      </span>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: "System Administrator",
  manager: "Team Manager",
  teamLead: "Team Lead",
  businessDeveloper: "Business Developer",
  developer: "Software Developer",
};

export function EmployeeCard({
  emp,
  idx = 0,
  attendanceLoading,
  onPing,
  showActions,
  onEdit,
  onDelete,
  selectable,
  selected,
  onSelect,
  showRoleDepartmentTeams,
  footerSlot,
  embedded,
  className,
}: EmployeeCardProps) {
  const avatarGradIdx = idx % AVATAR_GRADIENTS.length;
  const todayM = emp.todayMinutes ?? 0;
  const shiftStart = emp.shiftStart ?? "10:00";
  const shiftEnd = emp.shiftEnd ?? "19:00";
  const shiftBreak = emp.shiftBreakTime ?? 60;

  const firstArrival =
    attendanceLoading ? "—" : emp.firstEntry ? (emp.firstEntry.includes("T") ? formatTimeStr(emp.firstEntry) : emp.firstEntry) : "—";

  const subtitle =
    emp.designation || emp.department
      ? [emp.designation, emp.department].filter(Boolean).join(" · ")
      : emp.email ?? "";

  const dimmed = !attendanceLoading && !emp.isLive;

  const inner = (
    <>
      <Link
        href={`/employees/${emp.username ?? emp._id}`}
        className={`absolute inset-0 z-0 ${embedded ? "" : "rounded-[var(--radius)]"}`}
        aria-label={`View ${emp.firstName} ${emp.lastName}`}
      />

      <div className={`relative z-10 flex flex-1 flex-col gap-2.5 ${embedded ? "p-2.5" : "p-3"} pointer-events-none`}>
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

        <div className="absolute right-2 top-2 z-10 max-w-[55%] text-right">
          <StatusPulsePill emp={emp} attendanceLoading={attendanceLoading} />
        </div>

        <div className="flex items-start gap-3 pr-1 pt-0.5">
          {emp.profileImage ? (
            <img src={emp.profileImage} alt="" className="pointer-events-none h-11 w-11 shrink-0 rounded-full object-cover shadow-sm" />
          ) : (
            <div
              className={`pointer-events-none flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white ${AVATAR_GRADIENTS[avatarGradIdx]}`}
            >
              {initials(emp.firstName, emp.lastName)}
            </div>
          )}
          <div className="min-w-0 flex-1 pr-16">
            <div className="flex min-w-0 items-center gap-1">
              <p className="text-callout truncate font-semibold" style={{ color: "var(--fg)" }}>
                {emp.firstName} {emp.lastName}
              </p>
              {onPing && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.92 }}
                  className="pointer-events-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors"
                  style={{ color: "var(--primary)" }}
                  title={`Ping ${emp.firstName}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onPing(emp._id, `${emp.firstName} ${emp.lastName}`);
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13" />
                    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
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
              <p className="text-caption truncate" style={{ color: "var(--fg-secondary)" }}>
                {subtitle}
              </p>
            )}
            {emp.reportsTo && (
              <p className="text-caption mt-0.5 truncate" style={{ color: "var(--fg-tertiary)" }}>
                Reports to <span className="font-medium" style={{ color: "var(--fg-secondary)" }}>{emp.reportsTo}</span>
              </p>
            )}
          </div>
        </div>

        {showRoleDepartmentTeams && (
          <div className="space-y-1 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span style={{ color: "var(--fg-tertiary)" }}>Role</span>
              <span className="truncate font-medium text-right" style={{ color: "var(--fg)" }}>
                {emp.userRole ? ROLE_LABELS[emp.userRole] ?? emp.userRole : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span style={{ color: "var(--fg-tertiary)" }}>Department</span>
              <span className="truncate font-medium text-right" style={{ color: "var(--fg)" }}>
                {emp.department ?? "—"}
              </span>
            </div>
            {emp.teams && emp.teams.length > 0 && (
              <div className="flex items-start justify-between gap-2">
                <span className="shrink-0" style={{ color: "var(--fg-tertiary)" }}>
                  Teams
                </span>
                <div className="flex flex-wrap justify-end gap-1">
                  {emp.teams.map((t) => (
                    <span
                      key={t._id}
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                      style={{ background: "color-mix(in srgb, var(--teal) 12%, transparent)", color: "var(--teal)" }}
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
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

        {/* Check-in · Total Time · Check-out */}
        <div className="mt-auto grid grid-cols-3 gap-1 border-t pt-2 text-[11px]" style={{ borderColor: "var(--border)" }}>
          <div>
            <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Check-in</p>
            <p className="font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{firstArrival}</p>
          </div>
          <div className="text-center">
            <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Total</p>
            <p className="font-semibold tabular-nums" style={{ color: "var(--fg)" }}>
              {attendanceLoading ? "—" : formatMinutesShort(todayM)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Check-out</p>
            <p className="font-semibold tabular-nums" style={{ color: "var(--fg)" }}>
              {attendanceLoading ? "—" : emp.isLive ? "—" : emp.lastExit ? formatTimeStr(emp.lastExit) : "—"}
            </p>
          </div>
        </div>

        {/* Office In · Office Time · Office Out */}
        {!attendanceLoading && (emp.officeMinutes ?? 0) > 0 && (
          <div className="grid grid-cols-3 gap-1 text-[11px]" style={{ color: "var(--fg-secondary)" }}>
            <div>
              <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Office In</p>
              <p className="font-semibold tabular-nums">{firstArrival}</p>
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

        {/* Office · Remote · Break pills */}
        {!attendanceLoading && (
          <>
            <div className="flex flex-wrap gap-1 text-[9px]">
              <span className="rounded-md px-1.5 py-0.5 font-medium" style={{ background: "#10b98112", color: "#10b981" }}>
                Office {formatMinutesShort(emp.officeMinutes ?? 0)}
              </span>
              <span className="rounded-md px-1.5 py-0.5 font-medium" style={{ background: "#007aff12", color: "#007aff" }}>
                Remote {formatMinutesShort(emp.remoteMinutes ?? 0)}
              </span>
              <span className="rounded-md px-1.5 py-0.5 font-medium" style={{ background: "#8b5cf612", color: "#8b5cf6" }}>
                Break {formatMinutesShort(emp.breakMinutes ?? 0)}
              </span>
              {(emp.lateBy ?? 0) > 0 && (
                <span className="rounded-md px-1.5 py-0.5 font-medium" style={{ background: "#f59e0b12", color: "#f59e0b" }}>
                  Late +{formatMinutesShort(emp.lateBy ?? 0)}
                </span>
              )}
            </div>

            {emp.locationFlagged && (
              <div className="rounded-lg border p-2 text-[9px] space-y-1" style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.04)" }}>
                <div className="flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  <span className="font-bold" style={{ color: "#ef4444" }}>Location Flagged</span>
                </div>
                {emp.flagReason && (
                  <p className="leading-snug" style={{ color: "#ef4444" }}>{emp.flagReason}</p>
                )}
                {emp.flagCoords && (
                  <a
                    href={`https://www.google.com/maps?q=${emp.flagCoords.lat},${emp.flagCoords.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pointer-events-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors"
                    style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}
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

            <ShiftProgressBar todayMinutes={todayM} shiftStart={shiftStart} shiftEnd={shiftEnd} shiftBreakTime={shiftBreak} />
          </>
        )}

        {/* Tasks & Campaigns — always visible */}
        {!attendanceLoading && (
          <div className="flex flex-wrap gap-1 border-t pt-2 text-[9px]" style={{ borderColor: "var(--border)" }}>
            <span
              className="rounded-full border px-1.5 py-0.5 font-semibold"
              style={{
                background: (emp.pendingTasks ?? 0) > 0 ? "#f59e0b15" : "var(--bg-grouped)",
                color: (emp.pendingTasks ?? 0) > 0 ? "#f59e0b" : "var(--fg-tertiary)",
                borderColor: (emp.pendingTasks ?? 0) > 0 ? "#f59e0b30" : "var(--border)",
              }}
            >
              {emp.pendingTasks ?? 0} pending
            </span>
            <span
              className="rounded-full border px-1.5 py-0.5 font-semibold"
              style={{
                background: (emp.inProgressTasks ?? 0) > 0 ? "var(--primary-light)" : "var(--bg-grouped)",
                color: (emp.inProgressTasks ?? 0) > 0 ? "var(--primary)" : "var(--fg-tertiary)",
                borderColor: (emp.inProgressTasks ?? 0) > 0 ? "rgba(0,122,255,0.2)" : "var(--border)",
              }}
            >
              {emp.inProgressTasks ?? 0} active
            </span>
            <span
              className="rounded-full border px-1.5 py-0.5 font-semibold"
              style={{
                background: (emp.campaigns?.length ?? 0) > 0 ? "rgba(48,209,88,0.1)" : "var(--bg-grouped)",
                color: (emp.campaigns?.length ?? 0) > 0 ? "var(--teal)" : "var(--fg-tertiary)",
                borderColor: (emp.campaigns?.length ?? 0) > 0 ? "rgba(48,209,88,0.2)" : "var(--border)",
              }}
            >
              {emp.campaigns?.length ?? 0} campaign{(emp.campaigns?.length ?? 0) !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {(showActions || footerSlot) && (
          <div className="flex items-center justify-between gap-2 border-t pt-2" style={{ borderColor: "var(--border)" }}>
            <div className="pointer-events-auto min-w-0 flex-1">{footerSlot}</div>
            {showActions && (onEdit || onDelete) && (
              <div className="pointer-events-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
    ? `group relative flex min-h-0 flex-1 flex-col overflow-hidden ${className ?? ""}`
    : `card-static group relative flex h-full flex-col overflow-hidden rounded-[var(--radius)] ${className ?? ""}`;

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
}
