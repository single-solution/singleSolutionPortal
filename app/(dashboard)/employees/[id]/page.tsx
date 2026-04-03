import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { getVerifiedSession } from "@/lib/permissions";
import { isValidId } from "@/lib/helpers";
import type { UserRole } from "@/lib/models/User";

async function serverFetch(path: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ");
  const res = await fetch(`${proto}://${host}${path}`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });
  return res;
}

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function getShiftMinutes(start: string, end: string, breakTime: number) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(eh * 60 + em - (sh * 60 + sm) - breakTime, 1);
}

const ROLE_DESIGNATION: Record<string, string> = {
  superadmin: "System Administrator",
  manager: "Team Manager",
  teamLead: "Team Lead",
  businessDeveloper: "Business Developer",
  developer: "Software Developer",
};

interface ActivitySessionLike {
  _id?: string;
  sessionTime?: { start?: string };
  location?: { inOffice?: boolean };
  status?: string;
  durationMinutes?: number;
}

interface DetailLike {
  totalWorkingMinutes?: number;
  officeMinutes?: number;
  remoteMinutes?: number;
  isOnTime?: boolean;
  lateBy?: number;
  firstOfficeEntry?: string | null;
  activitySessions?: ActivitySessionLike[];
}

interface DailyLike {
  date: string;
  totalWorkingMinutes?: number;
  officeMinutes?: number;
  remoteMinutes?: number;
  isPresent?: boolean;
  isOnTime?: boolean;
  lateBy?: number;
}

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidId(id)) notFound();

  const actor = await getVerifiedSession();
  if (!actor) redirect("/login");
  if (actor.id === id) redirect("/");

  const empRes = await serverFetch(`/api/employees/${id}`);
  if (!empRes.ok) notFound();

  const emp = (await empRes.json()) as Record<string, unknown>;
  const about = emp.about as { firstName?: string; lastName?: string; profileImage?: string } | undefined;
  const firstName = about?.firstName ?? "Employee";
  const lastName = about?.lastName ?? "";
  const email = (emp.email as string) ?? "";
  const userRole = emp.userRole as UserRole | string;
  const dept = emp.department as { title?: string } | undefined;
  const teams = (emp.teams as { _id?: string; name?: string }[] | undefined) ?? [];
  const workShift = emp.workShift as
    | { type?: string; shift?: { start?: string; end?: string }; breakTime?: number }
    | undefined;
  const shiftStart = workShift?.shift?.start ?? "10:00";
  const shiftEnd = workShift?.shift?.end ?? "19:00";
  const shiftBreak = workShift?.breakTime ?? 60;
  const profileImage = about?.profileImage;

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  const [y, m] = todayStr.split("-").map(Number);

  const detailRes = await serverFetch(`/api/attendance?type=detail&userId=${encodeURIComponent(id)}&date=${encodeURIComponent(todayStr)}`);
  const detailRaw = await detailRes.json();
  const detail: DetailLike | null = Array.isArray(detailRaw) ? null : (detailRaw as DetailLike | null);

  const dailyRes = await serverFetch(
    `/api/attendance?type=daily&year=${y}&month=${m}&userId=${encodeURIComponent(id)}`,
  );
  const dailyRaw = await dailyRes.json();
  const dailyList: DailyLike[] = Array.isArray(dailyRaw) ? dailyRaw : [];

  const weekly = [...dailyList]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 7)
    .reverse();

  const todayMinutes = detail?.totalWorkingMinutes ?? 0;
  const shiftMins = getShiftMinutes(shiftStart, shiftEnd, shiftBreak);
  const ratio = todayMinutes / shiftMins;
  const pctRaw = Math.round(ratio * 100);
  const cappedWidthPct = Math.min(ratio * 100, 120);
  const hasOt = todayMinutes > shiftMins;
  const primaryWidthPctOfInner = hasOt ? (100 / cappedWidthPct) * 100 : 100;

  let firstEntryLabel = "—";
  if (detail?.firstOfficeEntry) {
    firstEntryLabel = new Date(detail.firstOfficeEntry).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  const officeM = detail?.officeMinutes ?? 0;
  const remoteM = detail?.remoteMinutes ?? 0;
  const officePct = officeM + remoteM > 0 ? Math.round((officeM / (officeM + remoteM)) * 100) : 0;
  const remotePct = 100 - officePct;

  const sessions = Array.isArray(detail?.activitySessions) ? detail!.activitySessions! : [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/employees" className="text-caption font-semibold" style={{ color: "var(--primary)" }}>
          Employees
        </Link>
        <span style={{ color: "var(--fg-tertiary)" }}>/</span>
        <span className="text-caption" style={{ color: "var(--fg-secondary)" }}>
          {firstName} {lastName}
        </span>
      </div>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          <div className="flex flex-col items-center gap-3 sm:items-start">
            {profileImage ? (
              <img src={profileImage} alt="" className="h-20 w-20 rounded-full object-cover shadow-lg sm:h-24 sm:w-24" />
            ) : (
              <div
                className="flex h-20 w-20 items-center justify-center rounded-full text-xl font-semibold text-white shadow-lg sm:h-24 sm:w-24 sm:text-2xl"
                style={{ background: "linear-gradient(135deg, var(--primary), var(--cyan))" }}
              >
                {`${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "?"}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <h1 className="text-headline" style={{ color: "var(--fg)" }}>
                {firstName} {lastName}
              </h1>
              <p className="text-subhead">{dept?.title ?? ROLE_DESIGNATION[userRole as string] ?? userRole}</p>
              <p className="text-caption mt-0.5">{email}</p>
              {teams.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {teams.map((t) => (
                    <span
                      key={String(t._id)}
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ background: "color-mix(in srgb, var(--teal) 12%, transparent)", color: "var(--teal)" }}
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="card-static rounded-xl p-3">
                <p className="text-caption">First entry</p>
                <p className="text-callout font-semibold tabular-nums" style={{ color: "var(--fg)" }}>
                  {firstEntryLabel}
                </p>
              </div>
              <div className="card-static rounded-xl p-3">
                <p className="text-caption">Hours logged</p>
                <p className="text-callout font-semibold tabular-nums" style={{ color: "var(--fg)" }}>
                  {todayMinutes >= 60 ? `${(todayMinutes / 60).toFixed(1)}h` : `${todayMinutes}m`}
                </p>
              </div>
              <div className="card-static col-span-2 rounded-xl p-3 sm:col-span-1">
                <p className="text-caption">Office / Remote</p>
                <p className="text-callout font-semibold tabular-nums" style={{ color: "var(--fg)" }}>
                  {formatMinutes(officeM)} / {formatMinutes(remoteM)}
                </p>
                <p className="mt-0.5 text-[10px]" style={{ color: "var(--fg-secondary)" }}>
                  {officePct}% office · {remotePct}% remote
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-caption" style={{ color: "var(--fg-secondary)" }}>
                  Shift progress
                </span>
                <span className="text-caption tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                  {todayMinutes} / {shiftMins} min ({Math.min(100, Math.round((todayMinutes / shiftMins) * 100))}%)
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                <div
                  className="flex h-full min-w-0"
                  style={{ width: `${cappedWidthPct}%`, maxWidth: "100%" }}
                >
                  {hasOt ? (
                    <>
                      <div
                        className="h-full shrink-0 rounded-l-full"
                        style={{ width: `${primaryWidthPctOfInner}%`, background: "var(--primary)" }}
                      />
                      <div className="h-full min-w-0 flex-1 rounded-r-full" style={{ background: "#8b5cf6" }} />
                    </>
                  ) : (
                    <div className="h-full w-full rounded-full" style={{ background: "var(--primary)" }} />
                  )}
                </div>
              </div>
              <p className="text-caption tabular-nums text-right" style={{ color: "var(--fg-tertiary)" }}>
                {pctRaw}% of shift
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="card-static flex flex-col p-5 sm:p-6">
        <h2 className="text-section-header mb-4">Today&apos;s activity</h2>
        {!detail ? (
          <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>
            No attendance record for today yet.
          </p>
        ) : sessions.length === 0 ? (
          <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>
            No session timeline for today.
          </p>
        ) : (
          <ul className="relative flex flex-col gap-0 pl-4">
            <span className="absolute bottom-1 left-[7px] top-1 w-px" style={{ background: "var(--border-strong)" }} aria-hidden />
            {sessions.map((s, i) => {
              const start = s.sessionTime?.start ? new Date(s.sessionTime.start) : null;
              const timeLabel =
                start && !Number.isNaN(start.getTime())
                  ? start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true })
                  : "—";
              const where = s.location?.inOffice ? "Office" : "Remote";
              const dot = s.status === "active" ? "#10b981" : "var(--fg-tertiary)";
              return (
                <li key={s._id ?? i} className="relative flex gap-3 pb-5 last:pb-0">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot, boxShadow: "0 0 0 2px var(--bg)" }} />
                  <div className="min-w-0 flex-1">
                    <span className="text-caption tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                      {timeLabel}
                    </span>
                    <p className="text-callout mt-0.5" style={{ color: "var(--fg)" }}>
                      {where}
                      {typeof s.durationMinutes === "number" ? ` · ${formatMinutes(s.durationMinutes)}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-section-header">Weekly overview</h2>
        <div className="scrollbar-hide -mx-1 flex gap-3 overflow-x-auto pb-2 pt-1">
          {weekly.length === 0 ? (
            <p className="text-caption px-1" style={{ color: "var(--fg-tertiary)" }}>
              No daily records this month yet.
            </p>
          ) : (
            weekly.map((day) => {
              const d = new Date(day.date + "T12:00:00");
              const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
              const isToday = day.date === todayStr;
              const dot = !day.isPresent ? "#f43f5e" : !day.isOnTime ? "#f59e0b" : "#10b981";
              const mins = day.totalWorkingMinutes ?? 0;
              return (
                <div
                  key={day.date}
                  className={`card-static flex min-w-[112px] shrink-0 flex-col gap-2 rounded-2xl p-4 ${isToday ? "border-2" : ""}`}
                  style={
                    isToday
                      ? { borderColor: "var(--primary)", boxShadow: "var(--shadow-sm), 0 0 24px rgba(0,122,255,0.18)" }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-caption font-semibold" style={{ color: "var(--fg-secondary)" }}>
                      {dayName}
                    </span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
                  </div>
                  <span className="text-caption" style={{ color: "var(--fg-tertiary)" }}>
                    {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="text-headline tabular-nums" style={{ color: "var(--fg)" }}>
                    {formatMinutes(mins)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
