"use client";

import { useMemo, useState, useCallback, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { staggerContainerFast, cardVariants, cardHover } from "@/lib/motion";
import { useQuery } from "@/lib/useQuery";
import { EmployeeCard } from "../components/EmployeeCard";
import { useGuide } from "@/lib/useGuide";
import { organizationTour } from "@/lib/tourConfigs";
import { DesignationsPanel } from "./DesignationsPanel";

type ViewMode = "tree" | "flat" | "cards";
type SortKey = "name" | "email" | "role";
type GroupBy = "none" | "department" | "team";

type Selection =
  | { kind: "none" }
  | { kind: "department"; id: string }
  | { kind: "team"; id: string; departmentId: string }
  | { kind: "unassigned" };

interface Employee {
  _id: string;
  email: string;
  username: string;
  about: { firstName: string; lastName: string; phone?: string; profileImage?: string };
  userRole: string;
  department?: { _id: string; title: string };
  teams?: { _id: string; name: string }[];
  isActive: boolean;
  isVerified?: boolean;
  workShift?: {
    type: string;
    shift: { start: string; end: string };
    workingDays: string[];
    breakTime: number;
  };
  createdAt: string;
}

interface Department {
  _id: string;
  title: string;
  slug: string;
  employeeCount: number;
  teamCount: number;
  isActive: boolean;
}

interface TeamRow {
  _id: string;
  name: string;
  slug: string;
  memberCount: number;
  department: { _id: string; title: string; slug: string };
  isActive?: boolean;
}

interface PresenceRow {
  _id: string;
  status: string;
  isLive?: boolean;
  firstEntry?: string | null;
  lastOfficeExit?: string | null;
  lastExit?: string | null;
  todayMinutes?: number;
  officeMinutes?: number;
  remoteMinutes?: number;
  lateBy?: number;
  shiftStart?: string;
  shiftEnd?: string;
  shiftBreakTime?: number;
  locationFlagged?: boolean;
}

const DESIGNATION_LABELS: Record<string, string> = {
  superadmin: "System Administrator",
  manager: "Team Manager",
  teamLead: "Team Lead",
  businessDeveloper: "Business Developer",
  developer: "Software Developer",
};

const SHIFT_TYPE_LABELS: Record<string, string> = {
  fullTime: "Full-time",
  partTime: "Part-time",
  contract: "Contract",
  intern: "Intern",
};

const DAY_MAP: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];
const FULL_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function formatWorkingDays(days: string[]) {
  const sorted = FULL_WEEK.filter((d) => days.includes(d));
  if (sorted.length === 7) return "Every day";
  if (sorted.length === 5 && WEEKDAYS.every((d) => sorted.includes(d))) return "Mon – Fri";
  if (sorted.length === 6 && FULL_WEEK.slice(0, 6).every((d) => sorted.includes(d))) return "Mon – Sat";
  return sorted.map((d) => DAY_MAP[d] ?? d).join(", ");
}

function shiftSummaryLine(emp: Employee) {
  if (!emp.workShift) return undefined;
  const type = SHIFT_TYPE_LABELS[emp.workShift.type] ?? emp.workShift.type;
  const days = emp.workShift.workingDays?.length ? formatWorkingDays(emp.workShift.workingDays) : "";
  return `${type} ${emp.workShift.shift.start}–${emp.workShift.shift.end}${days ? ` · ${days}` : ""}`;
}

function idStr(x: unknown): string {
  if (x === null || x === undefined) return "";
  if (typeof x === "string") return x;
  if (typeof x === "object" && x !== null && "_id" in x) return idStr((x as { _id: unknown })._id);
  return String(x);
}

function empFullName(emp: Employee): string {
  return `${emp.about.firstName} ${emp.about.lastName}`.trim();
}

function NavPill({
  active,
  onClick,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
      style={{
        borderColor: active ? "var(--primary)" : "var(--border)",
        background: active ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--bg-elevated)",
        color: active ? "var(--primary)" : "var(--fg-secondary)",
      }}
    >
      {children}
      {badge !== undefined && (
        <span
          className="tabular-nums rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export default function OrganizationPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { registerTour } = useGuide();
  useEffect(() => { registerTour("organization", organizationTour); }, [registerTour]);
  const role = session?.user?.role;
  const isSuperAdminFlag = session?.user?.isSuperAdmin === true;
  const isSuperAdmin = role === "superadmin" || isSuperAdminFlag;
  const isManager = role === "manager";
  const canManage = isSuperAdmin || isManager;

  const { data: departments, loading: deptsLoading } = useQuery<Department[]>("/api/departments", "org-departments");
  const { data: teams, loading: teamsLoading } = useQuery<TeamRow[]>("/api/teams", "org-teams");
  const { data: employees, loading: employeesLoading } = useQuery<Employee[]>("/api/employees", "org-employees");
  const { data: presenceData } = useQuery<PresenceRow[]>("/api/attendance/presence", "org-presence");

  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  const deptList = useMemo(() => departments ?? [], [departments]);
  const teamList = useMemo(() => teams ?? [], [teams]);
  const empList = useMemo(() => employees ?? [], [employees]);

  const presenceById = useMemo(() => {
    const map = new Map<string, PresenceRow>();
    if (presenceData) for (const p of presenceData) map.set(p._id, p);
    return map;
  }, [presenceData]);

  const teamsByDept = useMemo(() => {
    const m = new Map<string, TeamRow[]>();
    for (const t of teamList) {
      const did = idStr(t.department?._id ?? t.department);
      if (!did) continue;
      if (!m.has(did)) m.set(did, []);
      m.get(did)!.push(t);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [teamList]);

  const unassignedEmployees = useMemo(
    () => empList.filter((e) => !e.department?._id),
    [empList],
  );

  const unassignedCount = unassignedEmployees.length;

  const toggleDept = useCallback((deptId: string) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  }, []);

  const baseFilteredEmployees = useMemo(() => {
    let list = empList;
    if (selection.kind === "department") {
      list = list.filter((e) => idStr(e.department?._id) === selection.id);
    } else if (selection.kind === "team") {
      list = list.filter((e) => (e.teams ?? []).some((t) => idStr(t._id) === selection.id));
    } else if (selection.kind === "unassigned") {
      list = unassignedEmployees;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        `${e.about.firstName} ${e.about.lastName} ${e.email} ${e.username}`.toLowerCase().includes(q),
      );
    }
    return list;
  }, [empList, selection, search, unassignedEmployees]);

  const sortedEmployees = useMemo(() => {
    const arr = [...baseFilteredEmployees];
    switch (sortKey) {
      case "name":
        arr.sort((a, b) => empFullName(a).localeCompare(empFullName(b)));
        break;
      case "email":
        arr.sort((a, b) => a.email.localeCompare(b.email));
        break;
      case "role":
        arr.sort((a, b) => a.userRole.localeCompare(b.userRole) || empFullName(a).localeCompare(empFullName(b)));
        break;
    }
    return arr;
  }, [baseFilteredEmployees, sortKey]);

  const groupedEmployees = useMemo(() => {
    if (groupBy === "none" || selection.kind !== "none") return null;
    const groups: { key: string; label: string; members: Employee[] }[] = [];
    if (groupBy === "department") {
      for (const dept of deptList) {
        const members = sortedEmployees.filter((e) => idStr(e.department?._id) === dept._id);
        if (members.length > 0) groups.push({ key: dept._id, label: dept.title, members });
      }
      const noD = sortedEmployees.filter((e) => !e.department?._id);
      if (noD.length > 0) groups.push({ key: "unassigned", label: "Unassigned", members: noD });
    } else if (groupBy === "team") {
      for (const team of teamList) {
        const members = sortedEmployees.filter((e) => (e.teams ?? []).some((t) => idStr(t._id) === team._id));
        if (members.length > 0) groups.push({ key: team._id, label: team.name, members });
      }
      const noT = sortedEmployees.filter((e) => !(e.teams ?? []).length);
      if (noT.length > 0) groups.push({ key: "no-team", label: "No Team", members: noT });
    }
    return groups;
  }, [groupBy, selection.kind, deptList, teamList, sortedEmployees]);

  const selectedDepartment = useMemo(() => {
    if (selection.kind !== "department") return null;
    return deptList.find((d) => d._id === selection.id) ?? null;
  }, [selection, deptList]);

  const selectedTeam = useMemo(() => {
    if (selection.kind !== "team") return null;
    return teamList.find((t) => t._id === selection.id) ?? null;
  }, [selection, teamList]);

  const deptTeams = useMemo(() => {
    if (!selectedDepartment) return [];
    return teamsByDept.get(selectedDepartment._id) ?? [];
  }, [selectedDepartment, teamsByDept]);

  const employeesGroupedByTeam = useMemo(() => {
    if (selection.kind !== "department" || !selectedDepartment) return null;
    const tidSet = new Set(deptTeams.map((t) => t._id));
    const groups: { team: TeamRow | null; members: Employee[] }[] = [];
    for (const team of deptTeams) {
      const members = sortedEmployees.filter((e) => (e.teams ?? []).some((t) => idStr(t._id) === team._id));
      groups.push({ team, members });
    }
    const noTeam = sortedEmployees.filter(
      (e) => !(e.teams ?? []).some((t) => tidSet.has(idStr(t._id))),
    );
    groups.push({ team: null, members: noTeam });
    return groups;
  }, [selection.kind, selectedDepartment, deptTeams, sortedEmployees]);

  const visibleDepts = useMemo(() => {
    if (selection.kind !== "none" || !search.trim()) return deptList;
    const q = search.toLowerCase();
    return deptList.filter((d) => {
      if (d.title.toLowerCase().includes(q)) return true;
      const ts = teamsByDept.get(d._id) ?? [];
      return ts.some((t) => t.name.toLowerCase().includes(q));
    });
  }, [deptList, teamsByDept, search, selection.kind]);

  const renderEmployeeCard = (emp: Employee, i: number) => {
    const p = presenceById.get(emp._id);
    return (
      <motion.div
        key={emp._id}
        variants={cardVariants}
        custom={i}
        layout
        whileHover={cardHover}
        className="h-full"
        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      >
        <div
          className={`card group relative flex h-full flex-col overflow-visible transition-opacity duration-300 ${!emp.isActive ? "opacity-50 grayscale" : ""}`}
        >
          <EmployeeCard
            embedded
            idx={i}
            showRoleDepartmentTeams
            showActions={canManage}
            onEdit={canManage ? () => router.push(`/employee/${emp.username}/edit`) : undefined}
            emp={{
              _id: emp._id,
              username: emp.username,
              firstName: emp.about.firstName,
              lastName: emp.about.lastName,
              email: emp.email,
              designation: DESIGNATION_LABELS[emp.userRole] ?? emp.userRole,
              department: emp.department?.title,
              profileImage: emp.about.profileImage,
              userRole: emp.userRole,
              teams: emp.teams,
              isVerified: emp.isVerified,
              isLive: p?.isLive,
              status: p?.status,
              locationFlagged: p?.locationFlagged,
              firstEntry: p?.firstEntry ?? undefined,
              lastOfficeExit: p?.lastOfficeExit ?? undefined,
              lastExit: p?.lastExit ?? undefined,
              todayMinutes: p?.todayMinutes,
              officeMinutes: p?.officeMinutes,
              remoteMinutes: p?.remoteMinutes,
              lateBy: p?.lateBy,
              shiftStart: p?.shiftStart ?? emp.workShift?.shift.start,
              shiftEnd: p?.shiftEnd ?? emp.workShift?.shift.end,
              shiftBreakTime: p?.shiftBreakTime ?? emp.workShift?.breakTime,
              phone: emp.about.phone,
              shiftSummary: shiftSummaryLine(emp),
            }}
          />
        </div>
      </motion.div>
    );
  };

  const renderFlatRow = (emp: Employee) => (
    <Link
      key={emp._id}
      href={`/employee/${emp.username}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-grouped)]"
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ background: "var(--primary)" }}
      >
        {(emp.about.firstName?.[0] ?? "") + (emp.about.lastName?.[0] ?? "")}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" style={{ color: "var(--fg)" }}>
          {emp.about.firstName} {emp.about.lastName}
        </p>
        <p className="truncate text-xs" style={{ color: "var(--fg-secondary)" }}>
          {DESIGNATION_LABELS[emp.userRole] ?? emp.userRole} · {emp.email}
        </p>
      </div>
    </Link>
  );

  const renderEmployeeGrid = (emps: Employee[], emptyMsg: string) => {
    if (employeesLoading) {
      return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card-xl shimmer h-40 rounded-xl" />
          ))}
        </div>
      );
    }
    if (emps.length === 0) {
      return (
        <p className="p-6 text-sm" style={{ color: "var(--fg-secondary)" }}>{emptyMsg}</p>
      );
    }
    if (viewMode === "cards") {
      return (
        <motion.div
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          variants={staggerContainerFast}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence>{emps.map((emp, i) => renderEmployeeCard(emp, i))}</AnimatePresence>
        </motion.div>
      );
    }
    if (viewMode === "flat") {
      return (
        <div className="card-xl divide-y overflow-hidden" style={{ borderColor: "var(--border)" }}>
          {emps.map((emp) => renderFlatRow(emp))}
        </div>
      );
    }
    return (
      <div className="card-xl p-4">
        <ul className="space-y-2 border-l-2 pl-3" style={{ borderColor: "var(--border)" }}>
          {emps.map((emp) => (
            <li key={emp._id}>
              <Link href={`/employee/${emp.username}`} className="text-sm font-medium transition-colors hover:underline" style={{ color: "var(--primary)" }}>
                {emp.about.firstName} {emp.about.lastName}
              </Link>
              <span className="ml-2 text-xs" style={{ color: "var(--fg-secondary)" }}>{emp.email}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const loading = deptsLoading || teamsLoading || employeesLoading;

  const sidebarNodes = (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setSelection({ kind: "none" })}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold transition-colors"
        style={{
          background: selection.kind === "none" ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
          color: selection.kind === "none" ? "var(--primary)" : "var(--fg)",
        }}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </span>
        All Employees
      </button>

      {visibleDepts.map((dept) => {
        const expanded = expandedDepts.has(dept._id) || !!search.trim();
        const subTeams = teamsByDept.get(dept._id) ?? [];

        return (
          <div key={dept._id} className="ml-0">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => toggleDept(dept._id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors"
                style={{ color: "var(--fg-tertiary)" }}
                aria-expanded={expanded}
              >
                <motion.svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  animate={{ rotate: expanded ? 90 : 0 }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </motion.svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelection({ kind: "department", id: dept._id });
                  if (!expandedDepts.has(dept._id)) toggleDept(dept._id);
                }}
                className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-sm font-medium transition-colors"
                style={{
                  background: selection.kind === "department" && selection.id === dept._id ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
                  color: selection.kind === "department" && selection.id === dept._id ? "var(--primary)" : "var(--fg)",
                }}
              >
                <span className="block truncate">{dept.title}</span>
                <span className="text-[10px] font-normal tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                  {dept.employeeCount} people · {dept.teamCount} teams
                </span>
              </button>
            </div>

            <AnimatePresence initial={false}>
              {expanded && subTeams.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="ml-7 overflow-hidden border-l pl-2"
                  style={{ borderColor: "var(--border)" }}
                >
                  {subTeams.map((team) => (
                    <button
                      key={team._id}
                      type="button"
                      onClick={() => setSelection({ kind: "team", id: team._id, departmentId: idStr(team.department) })}
                      className="mb-0.5 flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors"
                      style={{
                        background: selection.kind === "team" && selection.id === team._id ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "transparent",
                        color: selection.kind === "team" && selection.id === team._id ? "var(--primary)" : "var(--fg-secondary)",
                      }}
                    >
                      <span className="truncate font-medium">{team.name}</span>
                      <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
                        {team.memberCount}
                      </span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          onClick={() => setSelection({ kind: "unassigned" })}
          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium transition-colors"
          style={{
            background: selection.kind === "unassigned" ? "color-mix(in srgb, var(--amber) 14%, transparent)" : "var(--bg-grouped)",
            color: selection.kind === "unassigned" ? "var(--amber)" : "var(--fg-secondary)",
          }}
        >
          Unassigned
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums" style={{ background: "var(--bg-elevated)", color: "var(--fg-tertiary)" }}>
            {unassignedCount}
          </span>
        </button>
      </div>

      {isSuperAdmin && (
        <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <DesignationsPanel />
        </div>
      )}
    </div>
  );

  const mobileDeptSource = selection.kind === "none" && search.trim() ? visibleDepts : deptList;

  const mobilePills = (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <NavPill active={selection.kind === "none"} onClick={() => setSelection({ kind: "none" })} badge={empList.length}>
        All
      </NavPill>
      <NavPill
        active={selection.kind === "unassigned"}
        onClick={() => setSelection({ kind: "unassigned" })}
        badge={unassignedCount}
      >
        Unassigned
      </NavPill>
      {mobileDeptSource.map((dept) => (
        <NavPill
          key={dept._id}
          active={selection.kind === "department" && selection.id === dept._id}
          onClick={() => setSelection({ kind: "department", id: dept._id })}
        >
          {dept.title}
        </NavPill>
      ))}
      {teamList.map((team) => (
        <NavPill
          key={`m-team-${team._id}`}
          active={selection.kind === "team" && selection.id === team._id}
          onClick={() => setSelection({ kind: "team", id: team._id, departmentId: idStr(team.department) })}
        >
          {team.name}
        </NavPill>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-title-2 font-bold tracking-tight" style={{ color: "var(--fg)" }}>
            Organization
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--fg-secondary)" }}>
            Departments, teams, and people in one place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sessionStatus !== "loading" && canManage && (
            <motion.button
              type="button"
              onClick={() => router.push("/employee/new")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn btn-primary btn-sm"
            >
              Add Employee
            </motion.button>
          )}
        </div>
      </div>

      {/* Top bar */}
      <div className="card-xl mb-4 flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people, departments, teams…"
              className="input w-full"
              style={{ paddingLeft: "40px" }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-tertiary)" }}>View</span>
            {(["cards", "flat", "tree"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-all ${viewMode === mode ? "shadow-sm" : ""}`}
                style={viewMode === mode ? { background: "var(--primary)", color: "white" } : { background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {selection.kind === "none" && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-tertiary)" }}>Sort</span>
              {(["name", "email", "role"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSortKey(s)}
                  className="rounded-lg px-2 py-1 text-[11px] font-medium capitalize transition-all"
                  style={sortKey === s ? { background: "color-mix(in srgb, var(--primary) 14%, transparent)", color: "var(--primary)" } : { color: "var(--fg-secondary)" }}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-tertiary)" }}>Group</span>
              {([["none", "All"], ["department", "Dept"], ["team", "Team"]] as const).map(([g, label]) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroupBy(g as GroupBy)}
                  className="rounded-lg px-2 py-1 text-[11px] font-medium transition-all"
                  style={groupBy === g ? { background: "color-mix(in srgb, var(--teal) 14%, transparent)", color: "var(--teal)" } : { color: "var(--fg-secondary)" }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Mobile: horizontal pills */}
        <div className="lg:hidden">{mobilePills}</div>

        {/* Left sidebar */}
        <aside
          className="card-xl hidden max-h-[calc(100vh-220px)] w-full shrink-0 overflow-y-auto p-3 lg:block lg:w-[300px]"
          style={{ borderColor: "var(--border)", scrollbarWidth: "thin" }}
        >
          {deptsLoading && deptList.length === 0 ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="shimmer h-10 rounded-lg" />
              ))}
            </div>
          ) : (
            sidebarNodes
          )}
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            {selection.kind === "none" && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                {/* Stats row */}
                <motion.div
                  className="grid gap-3 sm:grid-cols-3"
                  variants={staggerContainerFast}
                  initial="hidden"
                  animate="visible"
                >
                  {[
                    { label: "Employees", value: loading ? "—" : empList.length, sub: "total people" },
                    { label: "Departments", value: loading ? "—" : deptList.length, sub: "active org units" },
                    { label: "Teams", value: loading ? "—" : teamList.length, sub: "across departments" },
                  ].map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      variants={cardVariants}
                      custom={i}
                      className="card-xl rounded-xl p-4"
                    >
                      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--fg-tertiary)" }}>{stat.label}</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: "var(--fg)" }}>{stat.value}</p>
                      <p className="mt-0.5 text-[11px]" style={{ color: "var(--fg-secondary)" }}>{stat.sub}</p>
                    </motion.div>
                  ))}
                </motion.div>

                {/* Grouped or flat employee list */}
                {groupedEmployees ? (
                  <div className="space-y-4">
                    {groupedEmployees.map((g) => (
                      <div key={g.key}>
                        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--fg)" }}>
                          {g.label}
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
                            {g.members.length}
                          </span>
                        </h3>
                        {renderEmployeeGrid(g.members, "No people in this group.")}
                      </div>
                    ))}
                  </div>
                ) : (
                  renderEmployeeGrid(sortedEmployees, "No people found.")
                )}
              </motion.div>
            )}

            {selection.kind === "department" && selectedDepartment && (
              <motion.div
                key={`dept-${selectedDepartment._id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <div className="card-xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold" style={{ color: "var(--fg)" }}>{selectedDepartment.title}</h2>
                      <p className="mt-1 text-sm tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                        {selectedDepartment.employeeCount} employees · {selectedDepartment.teamCount} teams
                      </p>
                    </div>
                  </div>

                  {deptTeams.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {deptTeams.map((t) => (
                        <button
                          key={t._id}
                          type="button"
                          onClick={() => setSelection({ kind: "team", id: t._id, departmentId: selectedDepartment._id })}
                          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                          style={{ borderColor: "var(--border)", background: "var(--bg-grouped)", color: "var(--fg)" }}
                        >
                          {t.name}
                          <span className="tabular-nums opacity-70">{t.memberCount}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {viewMode === "tree" && employeesGroupedByTeam ? (
                  <div className="space-y-6">
                    {employeesGroupedByTeam.map(({ team, members }) => (
                      <div key={team?._id ?? "no-team"} className="card-xl overflow-hidden p-4">
                        <h3 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                          {team ? team.name : "No team"}
                          <span className="ml-2 text-xs font-normal tabular-nums" style={{ color: "var(--fg-tertiary)" }}>({members.length})</span>
                        </h3>
                        <div className="mt-3 space-y-1 border-l-2 pl-3" style={{ borderColor: "var(--border)" }}>
                          {members.length === 0 ? (
                            <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>None</p>
                          ) : (
                            members.map((emp) => (
                              <Link key={emp._id} href={`/employee/${emp.username}`} className="block truncate text-sm py-0.5 transition-colors hover:underline" style={{ color: "var(--primary)" }}>
                                {emp.about.firstName} {emp.about.lastName}
                                <span className="ml-2 text-xs" style={{ color: "var(--fg-secondary)" }}>{emp.email}</span>
                              </Link>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  renderEmployeeGrid(sortedEmployees, "No people match this filter.")
                )}
              </motion.div>
            )}

            {selection.kind === "team" && selectedTeam && (
              <motion.div
                key={`team-${selectedTeam._id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <div className="card-xl p-5">
                  <h2 className="text-xl font-bold" style={{ color: "var(--fg)" }}>{selectedTeam.name}</h2>
                  <p className="mt-1 text-sm tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                    {selectedTeam.department?.title} · {selectedTeam.memberCount} members
                  </p>
                </div>
                {renderEmployeeGrid(sortedEmployees, "No members in this team.")}
              </motion.div>
            )}

            {selection.kind === "unassigned" && (
              <motion.div
                key="unassigned"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <div className="card-xl p-5">
                  <h2 className="text-xl font-bold" style={{ color: "var(--fg)" }}>Unassigned</h2>
                  <p className="mt-1 text-sm" style={{ color: "var(--fg-secondary)" }}>
                    People without a department ({unassignedCount}).
                  </p>
                </div>
                {renderEmployeeGrid(sortedEmployees, "No unassigned people.")}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
