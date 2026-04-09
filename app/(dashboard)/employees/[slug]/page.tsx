import { redirect, notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { getVerifiedSession } from "@/lib/permissions";
import { isValidId } from "@/lib/helpers";
import { connectDB } from "@/lib/db";
import User, { getTodaySchedule } from "@/lib/models/User";
import EmployeeDetailClient from "./EmployeeDetailClient";

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

function primaryDesignationFromEmp(emp: Record<string, unknown>): string {
  if (emp.isSuperAdmin === true) return "System Administrator";
  const list = emp.memberships as Array<{ designation?: { name: string } | null }> | undefined;
  if (list?.length) {
    for (const m of list) {
      const des = m.designation;
      if (des && typeof des === "object" && des !== null && "name" in des) {
        const name = String((des as { name: string }).name);
        if (name) return name;
      }
    }
  }
  return "Employee";
}

async function resolveUserId(slug: string): Promise<string | null> {
  if (isValidId(slug)) return slug;
  await connectDB();
  const user = await User.findOne({ username: slug.toLowerCase() }).select("_id").lean();
  return user ? user._id.toString() : null;
}

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

export default async function EmployeeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const id = await resolveUserId(slug);
  if (!id) notFound();

  const actor = await getVerifiedSession();
  if (!actor) redirect("/login");
  if (actor.id === id) redirect("/");

  const empRes = await serverFetch(`/api/employees/${id}`);
  if (!empRes.ok) notFound();

  const emp = (await empRes.json()) as Record<string, unknown>;
  const about = emp.about as { firstName?: string; lastName?: string; profileImage?: string; phone?: string } | undefined;
  const firstName = about?.firstName ?? "Employee";
  const lastName = about?.lastName ?? "";
  const email = (emp.email as string) ?? "";
  const username = (emp.username as string) ?? "";
  const dept = emp.department as { title?: string } | undefined;
  const todayDay = getTodaySchedule(emp as Record<string, unknown>, "Asia/Karachi");
  const shiftStart = todayDay.start;
  const shiftEnd = todayDay.end;
  const shiftBreak = todayDay.breakMinutes;
  const shiftType =
    (typeof emp.shiftType === "string" ? emp.shiftType : undefined) ?? "fullTime";
  const profileImage = about?.profileImage;
  const phone = about?.phone;
  const createdAt = emp.createdAt as string | undefined;

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  const [y, m] = todayStr.split("-").map(Number);

  const [detailRes, dailyRes, tasksRes] = await Promise.all([
    serverFetch(`/api/attendance?type=detail&userId=${encodeURIComponent(id)}&date=${encodeURIComponent(todayStr)}`),
    serverFetch(`/api/attendance?type=daily&year=${y}&month=${m}&userId=${encodeURIComponent(id)}`),
    serverFetch(`/api/tasks`),
  ]);

  const detailRaw = await detailRes.json();
  const detail: DetailLike | null = Array.isArray(detailRaw) ? null : (detailRaw as DetailLike | null);

  const dailyRaw = await dailyRes.json();
  const dailyList: DailyLike[] = Array.isArray(dailyRaw) ? dailyRaw : [];

  const weekly = [...dailyList]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 7)
    .reverse();

  const tasksJson = tasksRes.ok ? await tasksRes.json() : [];
  interface TaskLike { _id: string; title: string; priority: string; status: string; deadline?: string; assignedTo?: { _id?: string }; createdBy?: { about?: { firstName?: string; lastName?: string } }; createdAt?: string }
  const empTasks: TaskLike[] = (Array.isArray(tasksJson) ? tasksJson : []).filter((t: TaskLike) => {
    const assigneeId = typeof t.assignedTo === "object" ? t.assignedTo?._id : t.assignedTo;
    return assigneeId === id;
  });

  const sessions = Array.isArray(detail?.activitySessions) ? detail!.activitySessions! : [];

  const monthPresent = dailyList.filter((d) => d.isPresent).length;
  const monthOnTime = dailyList.filter((d) => d.isPresent && d.isOnTime).length;
  const monthTotalMins = dailyList.reduce((s, d) => s + (d.totalWorkingMinutes ?? 0), 0);
  const monthOfficeMins = dailyList.reduce((s, d) => s + (d.officeMinutes ?? 0), 0);
  const monthRemoteMins = dailyList.reduce((s, d) => s + (d.remoteMinutes ?? 0), 0);
  const monthWorkingDays = dailyList.length;

  return (
    <EmployeeDetailClient
      employee={{
        id,
        firstName,
        lastName,
        email,
        username,
        designation: primaryDesignationFromEmp(emp),
        department: dept?.title ?? null,
        profileImage: profileImage ?? null,
        phone: phone ?? null,
        createdAt: createdAt ?? null,
        shiftStart,
        shiftEnd,
        shiftBreak,
        shiftType,
      }}
      today={{
        todayMinutes: detail?.totalWorkingMinutes ?? 0,
        officeMinutes: detail?.officeMinutes ?? 0,
        remoteMinutes: detail?.remoteMinutes ?? 0,
        isOnTime: detail?.isOnTime ?? true,
        lateBy: detail?.lateBy ?? 0,
        firstEntry: detail?.firstOfficeEntry ?? null,
        sessions: sessions.map((s) => ({
          _id: s._id ?? "",
          time: s.sessionTime?.start ?? "",
          inOffice: s.location?.inOffice ?? true,
          status: s.status ?? "",
          durationMinutes: s.durationMinutes ?? 0,
        })),
        hasRecord: !!detail,
      }}
      weekly={weekly.map((d) => ({
        date: d.date,
        totalMinutes: d.totalWorkingMinutes ?? 0,
        isPresent: d.isPresent ?? false,
        isOnTime: d.isOnTime ?? true,
      }))}
      monthly={{
        presentDays: monthPresent,
        totalDays: monthWorkingDays,
        onTimePct: monthPresent > 0 ? Math.round((monthOnTime / monthPresent) * 100) : 0,
        totalHours: Math.round(monthTotalMins / 60 * 10) / 10,
        avgDailyHours: monthPresent > 0 ? Math.round((monthTotalMins / monthPresent / 60) * 10) / 10 : 0,
        officeHours: Math.round(monthOfficeMins / 60 * 10) / 10,
        remoteHours: Math.round(monthRemoteMins / 60 * 10) / 10,
      }}
      tasks={empTasks.map((t) => ({
        _id: t._id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        deadline: t.deadline ?? null,
        createdAt: t.createdAt ?? null,
      }))}
      todayStr={todayStr}
    />
  );
}
