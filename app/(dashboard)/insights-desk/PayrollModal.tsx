"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { Portal } from "../components/Portal";

/* ───── Interfaces ───── */

interface DropdownEmp {
  _id: string;
  about?: { firstName?: string; lastName?: string };
  email?: string;
  salary?: number;
  department?: { id: string; title: string } | null;
}

interface DailyRow {
  day: number;
  dayOfWeek: string;
  date: string;
  status: string;
  workingMinutes: number;
  officeMinutes: number;
  remoteMinutes: number;
  lateMinutes: number;
  deduction: number;
  firstStart: string | null;
  lastEnd: string | null;
}

interface EstimateData {
  month: number;
  year: number;
  baseSalary: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  holidays: number;
  leaveDays: number;
  overtimeHours: number;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  deductions: { label: string; amount: number }[];
  ytd: { earned: number; deductions: number; netPay: number; months: number };
  dailyBreakdown?: DailyRow[];
  exempt?: boolean;
}

interface DeptGroup { id: string; title: string; employees: DropdownEmp[] }

interface SheetEmpRow {
  _id: string;
  name: string;
  email?: string;
  department: string | null;
  salary: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  leaveDays: number;
  overtimeHours: number;
  attendancePct: number;
  grossPay: number;
  absenceDeduction: number;
  lateDeduction: number;
  totalDeductions: number;
  netPay: number;
}

interface PayrollSheet {
  month: number;
  year: number;
  generatedAt: string;
  totalEmployees: number;
  totalNetPay: number;
  totalGrossPay: number;
  totalDeductions: number;
  workingDays: number;
  holidays: number;
  employees: SheetEmpRow[];
}

type DetailTab = "summary" | "daily" | "year" | "report";

/* ───── Helpers ───── */

function nameOf(u: DropdownEmp): string {
  const f = u.about?.firstName ?? "";
  const l = u.about?.lastName ?? "";
  return `${f} ${l}`.trim() || u.email || "—";
}
function initials(u: DropdownEmp): string {
  return ((u.about?.firstName?.[0] ?? "") + (u.about?.lastName?.[0] ?? "")).toUpperCase() || "?";
}
function fmtMins(m: number): string {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}
function fmtTime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const MN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MN_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const AVATAR_COLORS = ["var(--primary)", "var(--teal)", "var(--purple)", "var(--amber)", "var(--rose)", "var(--green)", "var(--fg-secondary)"];
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const SC: Record<string, { label: string; color: string }> = {
  present: { label: "Present", color: "var(--green)" },
  late: { label: "Late", color: "var(--amber)" },
  absent: { label: "Absent", color: "var(--rose)" },
  leave: { label: "Leave", color: "var(--teal)" },
  holiday: { label: "Holiday", color: "var(--purple)" },
  weekend: { label: "Weekend", color: "var(--fg-quaternary)" },
  future: { label: "—", color: "var(--fg-quaternary)" },
  off: { label: "Off", color: "var(--fg-quaternary)" },
};

/* ───── Component ───── */

interface Props { open: boolean; onClose: () => void; selectedUserId?: string }

export function PayrollModal({ open, onClose, selectedUserId }: Props) {
  const { data: session } = useSession();
  const { can: canPerm, isSuperAdmin } = usePermissions();
  const canViewTeam = canPerm("payroll_viewTeam");
  const canManageSalary = canPerm("payroll_manageSalary");

  const now = new Date();
  const [employees, setEmployees] = useState<DropdownEmp[]>([]);
  const [userId, setUserId] = useState(selectedUserId || "");
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [estimate, setEstimate] = useState<EstimateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("summary");

  const [yearData, setYearData] = useState<(EstimateData | null)[]>([]);
  const [yearLoading, setYearLoading] = useState(false);
  const [payrollSheet, setPayrollSheet] = useState<PayrollSheet | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);

  const detailRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedUserId) {
      setUserId(selectedUserId);
      setDeptFilter(null);
    }
  }, [selectedUserId]);

  useEffect(() => {
    if (!open || !canViewTeam) return;
    fetch("/api/employees/dropdown")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setEmployees(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [open, canViewTeam]);

  /* ── Fetch single month ── */
  const loadEstimate = useCallback(async () => {
    if (isSuperAdmin && !userId) { setEstimate(null); return; }
    const uid = userId || session?.user?.id;
    if (!uid) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ detail: "true", month: String(selMonth), year: String(selYear) });
      if (userId) q.set("userId", userId);
      const res = await fetch(`/api/payroll/estimate?${q}`);
      if (res.ok) { const d = await res.json(); setEstimate(d.exempt ? null : d); }
      else setEstimate(null);
    } catch { setEstimate(null); }
    setLoading(false);
  }, [userId, session?.user?.id, isSuperAdmin, selMonth, selYear]);

  useEffect(() => { if (open) loadEstimate(); }, [open, loadEstimate]);

  /* ── Fetch year overview (all months up to current) ── */
  const loadYearOverview = useCallback(async () => {
    if (isSuperAdmin && !userId) { setYearData([]); return; }
    const uid = userId || session?.user?.id;
    if (!uid) return;
    setYearLoading(true);
    const maxMonth = selYear === now.getFullYear() ? now.getMonth() + 1 : 12;
    const promises: Promise<EstimateData | null>[] = [];
    for (let m = 1; m <= maxMonth; m++) {
      const q = new URLSearchParams({ month: String(m), year: String(selYear) });
      if (userId) q.set("userId", userId);
      promises.push(
        fetch(`/api/payroll/estimate?${q}`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => (d?.exempt ? null : d))
          .catch(() => null),
      );
    }
    const results = await Promise.all(promises);
    setYearData(results);
    setYearLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, session?.user?.id, isSuperAdmin, selYear]);

  useEffect(() => {
    if (open && detailTab === "year") loadYearOverview();
  }, [open, detailTab, loadYearOverview]);

  const loadPayrollSheet = useCallback(async () => {
    if (!canViewTeam) return;
    setSheetLoading(true);
    try {
      const q = new URLSearchParams({ month: String(selMonth), year: String(selYear) });
      const res = await fetch(`/api/payroll/bank-sheet?${q}`);
      if (res.ok) setPayrollSheet(await res.json());
      else setPayrollSheet(null);
    } catch { setPayrollSheet(null); }
    setSheetLoading(false);
  }, [canViewTeam, selMonth, selYear]);

  useEffect(() => {
    if (open && detailTab === "report") loadPayrollSheet();
  }, [open, detailTab, loadPayrollSheet]);

  useEffect(() => { if (detailRef.current) detailRef.current.scrollTop = 0; }, [userId, selMonth, deptFilter]);

  useEffect(() => {
    if (!showExportMenu) return;
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportMenu(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showExportMenu]);

  /* ── Month navigation ── */
  function prevMonth() {
    setSelMonth((m) => {
      if (m === 1) { setSelYear((y) => y - 1); return 12; }
      return m - 1;
    });
  }
  function nextMonth() {
    if (selYear === now.getFullYear() && selMonth >= now.getMonth() + 1) return;
    setSelMonth((m) => {
      if (m === 12) { setSelYear((y) => y + 1); return 1; }
      return m + 1;
    });
  }
  const canGoNext = !(selYear === now.getFullYear() && selMonth >= now.getMonth() + 1);
  const isCurrentMonth = selYear === now.getFullYear() && selMonth === now.getMonth() + 1;

  /* ── Sidebar data ── */
  const filteredEmployees = useMemo(() => {
    if (!sidebarSearch.trim()) return employees;
    const q = sidebarSearch.toLowerCase();
    return employees.filter((e) => nameOf(e).toLowerCase().includes(q) || (e.department?.title ?? "").toLowerCase().includes(q));
  }, [employees, sidebarSearch]);

  const deptGroups = useMemo(() => {
    const grouped = new Map<string, DeptGroup>();
    const ungrouped: DropdownEmp[] = [];
    for (const emp of filteredEmployees) {
      if (emp.department) {
        const ex = grouped.get(emp.department.id);
        if (ex) ex.employees.push(emp); else grouped.set(emp.department.id, { id: emp.department.id, title: emp.department.title, employees: [emp] });
      } else ungrouped.push(emp);
    }
    const groups = [...grouped.values()].sort((a, b) => a.title.localeCompare(b.title));
    if (ungrouped.length > 0) groups.push({ id: "__none", title: "Unassigned", employees: ungrouped });
    for (const g of groups) g.employees.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return groups;
  }, [filteredEmployees]);

  const selectedEmployee = useMemo(() => employees.find((e) => e._id === userId), [employees, userId]);

  const fmt = useCallback((n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }), []);

  /* ── Year overview totals ── */
  const yearTotals = useMemo(() => {
    const valid = yearData.filter(Boolean) as EstimateData[];
    if (!valid.length) return null;
    return {
      months: valid.length,
      workingDays: valid.reduce((s, e) => s + e.workingDays, 0),
      presentDays: valid.reduce((s, e) => s + e.presentDays, 0),
      absentDays: valid.reduce((s, e) => s + e.absentDays, 0),
      lateDays: valid.reduce((s, e) => s + e.lateDays, 0),
      leaveDays: valid.reduce((s, e) => s + e.leaveDays, 0),
      grossPay: valid.reduce((s, e) => s + e.grossPay, 0),
      totalDeductions: valid.reduce((s, e) => s + e.totalDeductions, 0),
      netPay: valid.reduce((s, e) => s + e.netPay, 0),
    };
  }, [yearData]);

  /* ── Derived ── */
  const attendancePct = estimate && estimate.workingDays > 0 ? Math.round((estimate.presentDays / estimate.workingDays) * 100) : 0;
  const deductionPct = estimate && estimate.grossPay > 0 ? Math.round((estimate.totalDeductions / estimate.grossPay) * 100) : 0;
  const showSidebar = canViewTeam && employees.length > 0;
  const selfExempt = isSuperAdmin && !userId && detailTab !== "report";

  const filteredTeamSheet = useMemo(() => {
    const emps = payrollSheet?.employees ?? [];
    if (!deptFilter) return emps;
    const ids = new Set(
      employees
        .filter((e) => (deptFilter === "__none" ? !e.department : e.department?.id === deptFilter))
        .map((e) => e._id),
    );
    return emps.filter((e) => ids.has(e._id));
  }, [payrollSheet, deptFilter, employees]);

  const reportSheetTotals = useMemo(() => {
    if (!payrollSheet) return null;
    const rows = filteredTeamSheet;
    const n = rows.length;
    return {
      totalEmployees: n,
      totalNetPay: n ? rows.reduce((a, e) => a + e.netPay, 0) : 0,
      totalGrossPay: n ? rows.reduce((a, e) => a + e.grossPay, 0) : 0,
      totalDeductions: n ? rows.reduce((a, e) => a + e.totalDeductions, 0) : 0,
      workingDays: payrollSheet.workingDays,
      holidays: payrollSheet.holidays,
    };
  }, [payrollSheet, filteredTeamSheet]);

  const summaryRateStats = useMemo(() => {
    if (!estimate) return null;
    const totalWorkMinutes = (estimate.dailyBreakdown ?? []).reduce((a, r) => a + r.workingMinutes, 0);
    let hoursForRate = totalWorkMinutes / 60;
    if (hoursForRate <= 0 && estimate.presentDays > 0) {
      const presentRows = (estimate.dailyBreakdown ?? []).filter((r) => r.status === "present" || r.status === "late");
      const minsOnPresent = presentRows.reduce((a, r) => a + r.workingMinutes, 0);
      const avgH = presentRows.length > 0 && minsOnPresent > 0 ? minsOnPresent / 60 / presentRows.length : 8;
      hoursForRate = estimate.presentDays * avgH;
    }
    const effectiveHourly = hoursForRate > 0 ? estimate.netPay / hoursForRate : null;
    const dailyRate = estimate.workingDays > 0 ? estimate.baseSalary / estimate.workingDays : null;
    const payPerPresentDay = estimate.presentDays > 0 ? estimate.netPay / estimate.presentDays : null;
    const overtimeRate = estimate.overtimeHours > 0 ? (estimate.grossPay - estimate.baseSalary) / estimate.overtimeHours : null;
    const netDailyRate = estimate.workingDays > 0 ? estimate.netPay / estimate.workingDays : null;
    return { effectiveHourly, dailyRate, payPerPresentDay, overtimeRate, netDailyRate };
  }, [estimate]);

  const yearInsightStats = useMemo(() => {
    if (!yearTotals) return null;
    const ytdAvgMonthlyNet = yearTotals.months > 0 ? yearTotals.netPay / yearTotals.months : null;
    const ytdAttendancePct = yearTotals.workingDays > 0 ? Math.round((yearTotals.presentDays / yearTotals.workingDays) * 100) : null;
    const ytdDeductionPct = yearTotals.grossPay > 0 ? Math.round((yearTotals.totalDeductions / yearTotals.grossPay) * 100) : null;
    let bestIdx = -1;
    let bestNet = -Infinity;
    let worstDedIdx = -1;
    let worstDed = -Infinity;
    let bestGrossIdx = -1;
    let bestGross = -Infinity;
    let worstNetIdx = -1;
    let worstNetVal = Infinity;
    let lowestDedIdx = -1;
    let lowestDedVal = Infinity;
    let totalOvertimeHours = 0;
    yearData.forEach((e, i) => {
      if (!e) return;
      totalOvertimeHours += e.overtimeHours ?? 0;
      if (e.netPay > bestNet) {
        bestNet = e.netPay;
        bestIdx = i;
      }
      if (e.totalDeductions > worstDed) {
        worstDed = e.totalDeductions;
        worstDedIdx = i;
      }
      if (e.grossPay > bestGross) {
        bestGross = e.grossPay;
        bestGrossIdx = i;
      }
      if (e.netPay < worstNetVal) {
        worstNetVal = e.netPay;
        worstNetIdx = i;
      }
      if (e.totalDeductions > 0 && e.totalDeductions < lowestDedVal) {
        lowestDedVal = e.totalDeductions;
        lowestDedIdx = i;
      }
    });
    const bestMonth = bestIdx >= 0 ? MN_SHORT[bestIdx] : null;
    const worstMonth = worstDedIdx >= 0 ? MN_SHORT[worstDedIdx] : null;
    return {
      ytdAvgMonthlyNet,
      ytdAttendancePct,
      ytdDeductionPct,
      bestMonth,
      bestNet: bestIdx >= 0 ? bestNet : null,
      worstMonth,
      worstDed: worstDedIdx >= 0 ? worstDed : null,
      bestGrossMonth: bestGrossIdx >= 0 ? bestGrossIdx : null,
      bestGross: bestGrossIdx >= 0 ? bestGross : null,
      worstNetMonth: worstNetIdx >= 0 ? worstNetIdx : null,
      worstNet: worstNetIdx >= 0 ? worstNetVal : null,
      lowestDedMonth: lowestDedIdx >= 0 ? lowestDedIdx : null,
      lowestDed: lowestDedIdx >= 0 ? lowestDedVal : null,
      totalOvertimeHours,
    };
  }, [yearTotals, yearData]);

  const teamSheetStats = useMemo(() => {
    const emps = filteredTeamSheet;
    if (!emps.length) return null;
    const n = emps.length;
    const teamAvgAttendancePct = Math.round(emps.reduce((a, e) => a + e.attendancePct, 0) / n);
    const teamTotalOvertimeHours = emps.reduce((a, e) => a + e.overtimeHours, 0);
    const teamAvgNetPay = n > 0 ? emps.reduce((a, e) => a + e.netPay, 0) / n : null;
    const zeroDeductionEmployees = emps.filter((e) => e.absenceDeduction === 0 && e.lateDeduction === 0).length;
    const overtimeEmployees = emps.filter((e) => e.overtimeHours > 0).length;
    const avgLateDays = +(emps.reduce((a, e) => a + e.lateDays, 0) / n).toFixed(1);
    const avgAbsenceDays = +(emps.reduce((a, e) => a + e.absentDays, 0) / n).toFixed(1);
    const salaries = emps.map((e) => e.salary).filter((s) => s > 0).sort((a, b) => a - b);
    const avgSalary = salaries.length > 0 ? Math.round(salaries.reduce((a, v) => a + v, 0) / salaries.length) : null;
    const medianSalary = salaries.length > 0 ? (salaries.length % 2 === 1 ? salaries[Math.floor(salaries.length / 2)] : Math.round((salaries[salaries.length / 2 - 1] + salaries[salaries.length / 2]) / 2)) : null;
    const highestPaid = salaries.length > 0 ? emps.reduce((best, e) => e.salary > best.salary ? e : best, emps[0]) : null;
    const lowestPaid = salaries.length > 0 ? emps.reduce((worst, e) => (e.salary > 0 && e.salary < worst.salary) ? e : worst, emps.find((e) => e.salary > 0) ?? emps[0]) : null;
    const highestDed = emps.reduce((best, e) => e.totalDeductions > best.totalDeductions ? e : best, emps[0]);
    const bestAtt = emps.reduce((best, e) => e.attendancePct > best.attendancePct ? e : best, emps[0]);
    const worstAtt = emps.reduce((worst, e) => e.attendancePct < worst.attendancePct ? e : worst, emps[0]);
    const mostLate = emps.reduce((best, e) => e.lateDays > best.lateDays ? e : best, emps[0]);
    const lowestNetEmp = emps.reduce((worst, e) => e.netPay < worst.netPay ? e : worst, emps[0]);
    const salaryRange = salaries.length > 0 ? salaries[salaries.length - 1] - salaries[0] : null;
    return {
      teamAvgAttendancePct,
      teamTotalOvertimeHours,
      teamAvgNetPay,
      zeroDeductionEmployees,
      overtimeEmployees,
      avgLateDays,
      avgAbsenceDays,
      avgSalary,
      medianSalary,
      highestPaid,
      lowestPaid,
      highestDed,
      bestAttendanceName: bestAtt.name,
      bestAttendancePct: bestAtt.attendancePct,
      worstAttendanceName: worstAtt.name,
      worstAttendancePct: worstAtt.attendancePct,
      mostLateName: mostLate.name,
      mostLateDays: mostLate.lateDays,
      lowestNetName: lowestNetEmp.name,
      lowestNet: lowestNetEmp.netPay,
      salaryRange,
    };
  }, [filteredTeamSheet]);

  /* ── Export — builds lines for selected month (Summary + Daily) ── */
  function buildMonthCSV(): string[] {
    if (!estimate) return [];
    const emp = selectedEmployee ? nameOf(selectedEmployee) : "Self";
    const lines = [
      `Payroll Report — ${MN[estimate.month - 1]} ${estimate.year}`, `Employee,${emp}`, "",
      "SUMMARY",
      `Base Salary,${estimate.baseSalary}`, `Working Days,${estimate.workingDays}`, `Present Days,${estimate.presentDays}`,
      `Absent Days,${estimate.absentDays}`, `Late Days,${estimate.lateDays}`, `Holidays,${estimate.holidays}`,
      `Leave Days,${estimate.leaveDays}`, `Overtime Hours,${estimate.overtimeHours}`, `Gross Pay,${estimate.grossPay}`,
      ...estimate.deductions.map((d) => `${d.label},${d.amount}`),
      `Total Deductions,${estimate.totalDeductions}`, `Net Pay,${estimate.netPay}`,
    ];
    if (estimate.ytd.months > 0) {
      lines.push("", "YEAR TO DATE", `Total Earned,${estimate.ytd.earned}`, `Total Deductions,${estimate.ytd.deductions}`, `Total Net Pay,${estimate.ytd.netPay}`);
    }
    if (estimate.dailyBreakdown?.length) {
      lines.push("", "DAILY BREAKDOWN", "Day,Date,DOW,Status,Hours,Late Min,Deduction,In,Out");
      for (const r of estimate.dailyBreakdown) {
        const s = SC[r.status] ?? SC.off;
        lines.push(`${r.day},${r.date},${r.dayOfWeek},${s.label},${(r.workingMinutes / 60).toFixed(1)},${r.lateMinutes},${r.deduction},${r.firstStart ? fmtTime(r.firstStart) : ""},${r.lastEnd ? fmtTime(r.lastEnd) : ""}`);
      }
    }
    return lines;
  }

  function buildYearCSV(): string[] {
    const emp = selectedEmployee ? nameOf(selectedEmployee) : "Self";
    const lines = [`Annual Payroll Report — ${selYear}`, `Employee,${emp}`, "", "Month,Working Days,Present,Absent,Late,Leaves,Holidays,Gross Pay,Deductions,Net Pay"];
    for (let i = 0; i < yearData.length; i++) {
      const e = yearData[i];
      if (!e) { lines.push(`${MN_SHORT[i]},—,—,—,—,—,—,—,—,—`); continue; }
      lines.push(`${MN_SHORT[i]},${e.workingDays},${e.presentDays},${e.absentDays},${e.lateDays},${e.leaveDays},${e.holidays},${e.grossPay},${e.totalDeductions},${e.netPay}`);
    }
    if (yearTotals) {
      lines.push(`TOTAL,${yearTotals.workingDays},${yearTotals.presentDays},${yearTotals.absentDays},${yearTotals.lateDays},${yearTotals.leaveDays},,${yearTotals.grossPay},${yearTotals.totalDeductions},${yearTotals.netPay}`);
    }
    return lines;
  }

  function buildSheetCSV(): string[] {
    if (!payrollSheet || !reportSheetTotals) return [];
    const s = payrollSheet;
    const rows = filteredTeamSheet;
    const t = reportSheetTotals;
    return [
      `Payroll Report — ${MN[s.month - 1]} ${s.year}`,
      `Generated,${new Date(s.generatedAt).toLocaleString()}`,
      `Working Days,${s.workingDays}`,
      `Holidays,${s.holidays}`,
      `Total Employees,${t.totalEmployees}`,
      `Total Gross Pay,${t.totalGrossPay}`,
      `Total Deductions,${t.totalDeductions}`,
      `Total Net Pay,${t.totalNetPay}`,
      "",
      "Sr,Employee,Department,Salary,Present,Absent,Late,Leaves,OT Hours,Attendance %,Gross Pay,Absence Ded.,Late Ded.,Total Ded.,Net Pay",
      ...rows.map((e, i) =>
        `${i + 1},"${e.name}","${e.department ?? ""}",${e.salary},${e.presentDays},${e.absentDays},${e.lateDays},${e.leaveDays},${e.overtimeHours},${e.attendancePct}%,${e.grossPay},${e.absenceDeduction},${e.lateDeduction},${e.totalDeductions},${e.netPay}`
      ),
      "",
      `,TOTAL,,${rows.reduce((a, e) => a + e.salary, 0)},,,,,,,,,,${t.totalDeductions},${t.totalNetPay}`,
    ];
  }

  function downloadBlob(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportCSV() {
    if (detailTab === "report" && payrollSheet) {
      downloadBlob(buildSheetCSV().join("\n"), `payroll-report-${selYear}-${String(selMonth).padStart(2, "0")}.csv`, "text/csv");
    } else {
      const isYear = detailTab === "year" && yearData.length > 0;
      const lines = isYear ? buildYearCSV() : buildMonthCSV();
      if (!lines.length) return;
      const fn = isYear ? `payroll-annual-${selYear}.csv` : `payroll-${selYear}-${String(selMonth).padStart(2, "0")}.csv`;
      downloadBlob(lines.join("\n"), fn, "text/csv");
    }
    setShowExportMenu(false);
  }

  function handleExportJSON() {
    if (detailTab === "report" && payrollSheet && reportSheetTotals) {
      const filteredPayload = {
        ...payrollSheet,
        employees: filteredTeamSheet,
        totalEmployees: reportSheetTotals.totalEmployees,
        totalNetPay: reportSheetTotals.totalNetPay,
        totalGrossPay: reportSheetTotals.totalGrossPay,
        totalDeductions: reportSheetTotals.totalDeductions,
      };
      downloadBlob(JSON.stringify(filteredPayload, null, 2), `payroll-report-${selYear}-${String(selMonth).padStart(2, "0")}.json`, "application/json");
    } else if (detailTab === "year" && yearData.length > 0) {
      const obj = { employee: selectedEmployee ? nameOf(selectedEmployee) : "Self", year: selYear, months: yearData, totals: yearTotals };
      downloadBlob(JSON.stringify(obj, null, 2), `payroll-annual-${selYear}.json`, "application/json");
    } else if (estimate) {
      const obj = { employee: selectedEmployee ? nameOf(selectedEmployee) : "Self", ...estimate };
      downloadBlob(JSON.stringify(obj, null, 2), `payroll-${selYear}-${String(selMonth).padStart(2, "0")}.json`, "application/json");
    }
    setShowExportMenu(false);
  }

  function handlePrint() {
    const emp = selectedEmployee ? nameOf(selectedEmployee) : "Self";
    const dept = selectedEmployee?.department?.title ?? "";
    let body = "";

    if (detailTab === "report" && payrollSheet && reportSheetTotals) {
      const s = payrollSheet;
      const t = reportSheetTotals;
      const rows = filteredTeamSheet.map((e, i) =>
        `<tr><td>${i + 1}</td><td>${e.name}</td><td>${e.department ?? "—"}</td><td>${fmt(e.salary)}</td><td>${e.presentDays}/${e.workingDays}</td><td>${e.absentDays}</td><td>${e.lateDays}</td><td>${e.leaveDays}</td><td>${e.attendancePct}%</td><td>${fmt(e.grossPay)}</td><td style="color:#dc2626">${e.totalDeductions > 0 ? fmt(e.totalDeductions) : "—"}</td><td style="font-weight:700">${fmt(e.netPay)}</td></tr>`
      ).join("");
      body = `<h1>Payroll Report — ${MN[s.month - 1]} ${s.year}</h1>
<h2>Generated: ${new Date(s.generatedAt).toLocaleString()} · ${s.workingDays} working days · ${s.holidays} holidays</h2>
<div class="hero"><div class="label">Total Net Pay</div><div class="amount">${fmt(t.totalNetPay)}</div><div style="margin-top:4px;font-size:11px;color:#888">${t.totalEmployees} employees · ${fmt(t.totalGrossPay)} gross · ${fmt(t.totalDeductions)} deductions</div></div>
<table><thead><tr><th>#</th><th>Employee</th><th>Dept</th><th>Salary</th><th>Present</th><th>Absent</th><th>Late</th><th>Leave</th><th>Att.%</th><th>Gross</th><th>Ded.</th><th>Net Pay</th></tr></thead>
<tbody>${rows}<tr class="total"><td colspan="9">Total (${t.totalEmployees})</td><td>${fmt(t.totalGrossPay)}</td><td style="color:#dc2626">${t.totalDeductions > 0 ? fmt(t.totalDeductions) : "—"}</td><td style="font-weight:700">${fmt(t.totalNetPay)}</td></tr></tbody></table>
<div style="margin-top:24px;padding:16px;background:#f8f9fa;border-radius:8px;font-size:10px;color:#666">
<strong>Prepared by:</strong> ___________________________&nbsp;&nbsp;&nbsp;&nbsp;<strong>Date:</strong> _______________<br/><br/>
<strong>Finance Head:</strong> ___________________________&nbsp;&nbsp;&nbsp;&nbsp;<strong>Approved by:</strong> ___________________________
</div>`;
    } else if (detailTab === "year" && yearData.length > 0) {
      const rows = yearData.map((e, i) => {
        if (!e) return `<tr style="color:#aaa"><td>${MN_SHORT[i]}</td><td colspan="8">—</td></tr>`;
        return `<tr><td>${MN_SHORT[i]}</td><td>${e.workingDays}</td><td>${e.presentDays}</td><td>${e.absentDays}</td><td>${e.lateDays}</td><td>${e.leaveDays}</td><td>${fmt(e.grossPay)}</td><td style="color:#dc2626">${fmt(e.totalDeductions)}</td><td style="font-weight:700">${fmt(e.netPay)}</td></tr>`;
      }).join("");
      const totRow = yearTotals ? `<tr class="total"><td>Total</td><td>${yearTotals.workingDays}</td><td>${yearTotals.presentDays}</td><td>${yearTotals.absentDays}</td><td>${yearTotals.lateDays}</td><td>${yearTotals.leaveDays}</td><td>${fmt(yearTotals.grossPay)}</td><td style="color:#dc2626">${fmt(yearTotals.totalDeductions)}</td><td style="font-weight:700">${fmt(yearTotals.netPay)}</td></tr>` : "";
      body = `<h1>Annual Payroll Report — ${selYear}</h1><h2>${emp}${dept ? ` · ${dept}` : ""}</h2>
${yearTotals ? `<div class="hero"><div class="label">Annual Net Pay</div><div class="amount">${fmt(yearTotals.netPay)}</div><div style="margin-top:4px;font-size:11px;color:#888">${yearTotals.months} months · ${fmt(yearTotals.grossPay)} gross · ${fmt(yearTotals.totalDeductions)} deductions</div></div>` : ""}
<table><thead><tr><th>Month</th><th>Work Days</th><th>Present</th><th>Absent</th><th>Late</th><th>Leaves</th><th>Gross</th><th>Deductions</th><th>Net Pay</th></tr></thead><tbody>${rows}${totRow}</tbody></table>`;
    } else if (estimate) {
      const dailyRows = (estimate.dailyBreakdown ?? []).map((r) => {
        const s = SC[r.status] ?? SC.off;
        const cls = r.status === "absent" ? "color:#dc2626" : r.status === "late" ? "color:#d97706" : r.status === "present" ? "color:#16a34a" : "color:#888";
        return `<tr><td>${r.day}</td><td>${r.dayOfWeek}</td><td style="${cls};font-weight:600">${s.label}</td><td>${r.workingMinutes > 0 ? (r.workingMinutes / 60).toFixed(1) + "h" : "—"}</td><td>${r.lateMinutes > 0 ? r.lateMinutes + "m" : "—"}</td><td style="color:#dc2626">${r.deduction > 0 ? r.deduction.toFixed(0) : "—"}</td><td>${r.firstStart ? fmtTime(r.firstStart) : "—"}</td><td>${r.lastEnd ? fmtTime(r.lastEnd) : "—"}</td></tr>`;
      }).join("");
      body = `<h1>Payroll Report — ${MN[estimate.month - 1]} ${estimate.year}</h1><h2>${emp}${dept ? ` · ${dept}` : ""}</h2>
<div class="hero"><div class="label">${isCurrentMonth ? "Estimated" : ""} Net Pay</div><div class="amount">${fmt(estimate.netPay)}</div></div>
<div class="grid"><div class="gi"><div class="v">${estimate.presentDays}</div><div class="l">Present</div></div><div class="gi"><div class="v">${estimate.absentDays}</div><div class="l">Absent</div></div><div class="gi"><div class="v">${estimate.lateDays}</div><div class="l">Late</div></div><div class="gi"><div class="v">${estimate.leaveDays}</div><div class="l">Leaves</div></div></div>
<div class="section"><div class="st">Earnings & Deductions</div><table class="smtbl">
<tr><td>Base Salary</td><td>${fmt(estimate.baseSalary)}</td></tr>
${estimate.overtimeHours > 0 ? `<tr><td>Overtime (${estimate.overtimeHours.toFixed(1)}h)</td><td>${fmt(estimate.grossPay - estimate.baseSalary)}</td></tr>` : ""}
<tr><td><strong>Gross Pay</strong></td><td><strong>${fmt(estimate.grossPay)}</strong></td></tr>
${estimate.deductions.map((d) => `<tr><td style="color:#dc2626">− ${d.label}</td><td style="color:#dc2626">${fmt(d.amount)}</td></tr>`).join("")}
${estimate.totalDeductions > 0 ? `<tr><td>Total Deductions</td><td style="color:#dc2626">−${fmt(estimate.totalDeductions)}</td></tr>` : ""}
<tr class="total"><td>Net Pay</td><td>${fmt(estimate.netPay)}</td></tr></table></div>
${dailyRows ? `<div class="section"><div class="st">Daily Breakdown</div><table><thead><tr><th>Day</th><th>DOW</th><th>Status</th><th>Hours</th><th>Late</th><th>Ded.</th><th>In</th><th>Out</th></tr></thead><tbody>${dailyRows}</tbody></table></div>` : ""}`;
    }

    const html = `<!DOCTYPE html><html><head><title>Payroll Report</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;max-width:900px;margin:0 auto;color:#1a1a1a;font-size:12px}
h1{font-size:18px;margin-bottom:4px}h2{font-size:13px;color:#666;margin:0 0 20px;font-weight:normal}
.section{margin-bottom:20px}.st{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:8px;font-weight:600}
table{width:100%;border-collapse:collapse}th,td{padding:5px 8px;text-align:left;border-bottom:1px solid #eee;font-size:11px}
th{background:#f8f9fa;font-weight:600;color:#666;font-size:10px;text-transform:uppercase;letter-spacing:0.5px}
td:nth-child(n+4){text-align:right}th:nth-child(n+4){text-align:right}
.hero{text-align:center;padding:16px;background:#f8f9fa;border-radius:12px;margin-bottom:20px}
.hero .amount{font-size:28px;font-weight:800;color:#2563eb}.hero .label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:16px}
.gi{text-align:center;padding:8px;background:#f8f9fa;border-radius:8px}.gi .v{font-size:14px;font-weight:700}.gi .l{font-size:9px;color:#888;text-transform:uppercase}
.smtbl td{border-bottom:1px solid #eee;padding:4px 0;font-size:12px}.smtbl td:last-child{text-align:right;font-weight:600}
.total td{border-top:2px solid #333;font-weight:700;font-size:13px}
@media print{body{padding:16px}}</style></head><body>${body}</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
    setShowExportMenu(false);
  }

  function handleCopy() {
    let lines: string[];
    if (detailTab === "report" && payrollSheet) lines = buildSheetCSV();
    else if (detailTab === "year" && yearData.length > 0) lines = buildYearCSV();
    else lines = buildMonthCSV();
    if (!lines.length) return;
    navigator.clipboard.writeText(lines.map((l) => l.replace(/,/g, ": ")).join("\n")).catch(() => {});
    setShowExportMenu(false);
  }

  /* ───── RENDER ───── */

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <motion.div
              className={`relative mx-4 flex flex-col rounded-2xl border shadow-xl overflow-hidden ${showSidebar ? "w-full max-w-7xl h-[80vh]" : "w-full max-w-4xl h-[80vh]"}`}
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* ══ Header ══ */}
              <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-4">
                  <div>
                    <h2 className="text-base font-bold" style={{ color: "var(--fg)" }}>Payroll</h2>
                    {!selfExempt && selectedEmployee && (
                      <p className="text-[11px]" style={{ color: "var(--fg-tertiary)" }}>{nameOf(selectedEmployee)}</p>
                    )}
                  </div>
                  {/* Month navigator */}
                  {!selfExempt && (
                    <div className="flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
                      <button type="button" onClick={prevMonth} className="rounded-lg p-1 transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg-secondary)" }}>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M15 19l-7-7 7-7" /></svg>
                      </button>
                      <span className="px-2 text-xs font-semibold min-w-[8rem] text-center" style={{ color: "var(--fg)" }}>
                        {MN[selMonth - 1]} {selYear}
                      </span>
                      <button type="button" onClick={nextMonth} disabled={!canGoNext} className="rounded-lg p-1 transition-colors hover:bg-[var(--hover-bg)] disabled:opacity-30" style={{ color: "var(--fg-secondary)" }}>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M9 5l7 7-7 7" /></svg>
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(estimate || (detailTab === "year" && yearData.length > 0) || (detailTab === "report" && payrollSheet)) && (
                    <div className="relative" ref={exportRef}>
                      <motion.button type="button" onClick={() => setShowExportMenu((p) => !p)} whileTap={{ scale: 0.95 }}
                        className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
                        style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg)" }}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Export
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M19 9l-7 7-7-7" /></svg>
                      </motion.button>
                      <AnimatePresence>
                        {showExportMenu && (
                          <motion.div initial={{ opacity: 0, y: -4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.95 }} transition={{ duration: 0.12 }}
                            className="absolute right-0 top-full mt-1 z-10 w-52 rounded-xl border p-1 shadow-lg" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                          >
                            {[
                              { label: detailTab === "report" ? "Payroll Report CSV" : detailTab === "year" ? "Year Report CSV" : "Month Report CSV", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", action: handleExportCSV },
                              { label: detailTab === "report" ? "Payroll Report JSON" : detailTab === "year" ? "Year Report JSON" : "Month Report JSON", icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4", action: handleExportJSON },
                              { label: "Print / PDF", icon: "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2z", action: handlePrint },
                              { label: "Copy to Clipboard", icon: "M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3", action: handleCopy },
                            ].map((item) => (
                              <button key={item.label} type="button" onClick={item.action}
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg)" }}
                              >
                                <svg className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={item.icon} /></svg>
                                {item.label}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                  <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-secondary)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              </div>

              <div className="flex flex-1 overflow-hidden">
                {/* ══ Sidebar ══ */}
                {showSidebar && (
                  <div className="flex flex-col border-r" style={{ width: 250, minWidth: 250, borderColor: "var(--border)", background: "var(--bg)" }}>
                    <div className="p-3 border-b" style={{ borderColor: "var(--border)" }}>
                      <div className="relative">
                        <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" /></svg>
                        <input type="text" value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} placeholder="Search employees…"
                          className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs outline-none transition-colors focus:border-[var(--primary)]"
                          style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--fg)" }}
                        />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto py-1" style={{ scrollbarWidth: "thin" }}>
                      {!sidebarSearch && (
                        <button
                          type="button"
                          onClick={() => { setUserId(""); setDeptFilter(null); if (canViewTeam) setDetailTab("report"); }}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${!userId && !deptFilter ? "bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]" : "hover:bg-[var(--hover-bg)]"}`}
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold" style={{ background: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary)" }}>All</span>
                          <span className="text-xs font-semibold" style={{ color: !userId && !deptFilter ? "var(--primary)" : "var(--fg-secondary)" }}>All Employees</span>
                        </button>
                      )}
                      {!isSuperAdmin && !sidebarSearch && (
                        <button type="button" onClick={() => { setUserId(""); setDeptFilter(null); }}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors"
                          style={{ background: !userId && !deptFilter ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent" }}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "var(--green)" }}>ME</span>
                          <div className="flex-1 min-w-0"><p className="text-xs font-semibold truncate" style={{ color: !userId && !deptFilter ? "var(--primary)" : "var(--fg)" }}>Yourself</p></div>
                          {!userId && !deptFilter && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--primary)" }} />}
                        </button>
                      )}
                      {!sidebarSearch && employees.length > 0 && <div className="mx-3 my-1 border-b" style={{ borderColor: "var(--border)" }} />}
                      {deptGroups.map((g) => (
                        <div key={g.id}>
                          <div className="px-2 py-0.5">
                            <button
                              type="button"
                              onClick={() => { setUserId(""); setDeptFilter(g.id); if (isSuperAdmin && canViewTeam) setDetailTab("report"); }}
                              className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors w-full text-left ${deptFilter === g.id && !userId ? "bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]" : "hover:bg-[var(--hover-bg)]"}`}
                              style={{ color: deptFilter === g.id && !userId ? "var(--primary)" : "var(--fg-tertiary)" }}
                            >
                              {g.title} ({g.employees.length})
                            </button>
                          </div>
                          {g.employees.map((emp) => {
                            const isSel = userId === emp._id;
                            return (
                              <button key={emp._id} type="button" onClick={() => { setUserId(emp._id); setDeptFilter(null); }}
                                className="flex w-full items-center gap-2.5 px-3 py-1.5 pl-8 text-left transition-colors"
                                style={{ background: isSel ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent" }}
                              >
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: avatarColor(emp._id) }}>{initials(emp)}</span>
                                <span className="flex-1 min-w-0 text-xs font-medium truncate" style={{ color: isSel ? "var(--primary)" : "var(--fg)" }}>{nameOf(emp)}</span>
                                {isSel && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--primary)" }} />}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                      {filteredEmployees.length === 0 && sidebarSearch && <p className="px-3 py-4 text-center text-[11px]" style={{ color: "var(--fg-tertiary)" }}>No matches</p>}
                    </div>
                    <div className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
                      <p className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>{employees.length} employee{employees.length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                )}

                {/* ══ Detail panel ══ */}
                <div ref={detailRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                  {selfExempt ? (
                    <div className="flex flex-col items-center justify-center py-16">
                      <div className="rounded-full p-4 mb-3" style={{ background: "var(--bg-grouped)" }}>
                        <svg className="h-8 w-8" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                      </div>
                      <p className="text-sm font-semibold" style={{ color: "var(--fg-secondary)" }}>Select an employee</p>
                      <p className="text-xs mt-1" style={{ color: "var(--fg-tertiary)" }}>Choose from the sidebar to view payroll data</p>
                    </div>
                  ) : (
                    <>
                      {/* Employee header — always visible */}
                      {userId && selectedEmployee && (
                        <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--bg-grouped)" }}>
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: avatarColor(selectedEmployee._id) }}>{initials(selectedEmployee)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate" style={{ color: "var(--fg)" }}>{nameOf(selectedEmployee)}</p>
                            {selectedEmployee.department && <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{selectedEmployee.department.title}</p>}
                          </div>
                          {canManageSalary && selectedEmployee.salary != null && (
                            <p className="text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>Salary: {fmt(selectedEmployee.salary)}</p>
                          )}
                        </div>
                      )}

                      {/* Net pay hero */}
                      {loading ? (
                        <div className="shimmer h-24 rounded-xl" />
                      ) : estimate ? (
                        <div className="rounded-xl p-5 text-center" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 8%, var(--bg-grouped)), color-mix(in srgb, var(--green) 6%, var(--bg-grouped)))" }}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--fg-tertiary)" }}>
                            {isCurrentMonth ? "Estimated " : ""}Net Pay · {MN[selMonth - 1]} {selYear}
                          </p>
                          <p className="text-3xl font-bold" style={{ color: "var(--primary)" }}>{fmt(estimate.netPay)}</p>
                          {estimate.totalDeductions > 0 && (
                            <p className="text-[10px] mt-1" style={{ color: "var(--fg-tertiary)" }}>
                              {fmt(estimate.grossPay)} gross − {fmt(estimate.totalDeductions)} deductions ({deductionPct}%)
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="py-8 text-center">
                          <p className="text-xs font-medium" style={{ color: "var(--fg-tertiary)" }}>No payroll data for {MN[selMonth - 1]} {selYear}.</p>
                        </div>
                      )}

                      {/* ── Tabs — always visible ── */}
                      <div className="flex gap-1 rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
                        {(canViewTeam ? ["summary", "daily", "year", "report"] as DetailTab[] : ["summary", "daily", "year"] as DetailTab[]).map((t) => (
                          <button key={t} type="button" onClick={() => setDetailTab(t)}
                            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${detailTab === t ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)]"}`}
                          >
                            {t === "summary" ? "Summary" : t === "daily" ? "Daily" : t === "year" ? `Year ${selYear}` : "Payroll Report"}
                          </button>
                        ))}
                      </div>

                      <AnimatePresence mode="wait">
                        {/* ═══════ SUMMARY TAB ═══════ */}
                        {detailTab === "summary" && loading && (
                          <motion.div key="summary-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                            <div className="shimmer h-4 w-40 rounded" />
                            <div className="grid grid-cols-4 gap-2">{[1, 2, 3, 4].map((i) => <div key={i} className="shimmer h-16 rounded-xl" />)}</div>
                            <div className="shimmer h-4 w-36 rounded" />
                            <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="shimmer h-8 rounded-lg" />)}</div>
                            <div className="shimmer h-4 w-32 rounded" />
                            <div className="grid grid-cols-3 gap-2">{[1, 2, 3].map((i) => <div key={i} className="shimmer h-14 rounded-xl" />)}</div>
                          </motion.div>
                        )}
                        {detailTab === "summary" && !loading && estimate && (
                          <motion.div key="summary" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }} className="space-y-4">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>Attendance & Work</p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {[
                                  { label: "Present", value: `${estimate.presentDays}`, sub: `of ${estimate.workingDays} days`, color: "var(--green)" },
                                  { label: "Absent", value: `${estimate.absentDays}`, sub: `${attendancePct}% rate`, color: estimate.absentDays > 0 ? "var(--rose)" : "var(--fg)" },
                                  { label: "Late", value: `${estimate.lateDays}`, sub: "days", color: estimate.lateDays > 0 ? "var(--amber)" : "var(--fg)" },
                                  { label: "Leaves", value: `${estimate.leaveDays}`, sub: `+ ${estimate.holidays} holidays`, color: "var(--teal)" },
                                ].map((s) => (
                                  <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                                    <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>{s.label}</p>
                                    <p className="text-sm font-bold" style={{ color: s.color }}>{s.value}</p>
                                    <p className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>{s.sub}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>Earnings & Deductions</p>
                              <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--bg-grouped)" }}>
                                <div className="flex justify-between text-xs"><span style={{ color: "var(--fg-tertiary)" }}>Base Salary</span><span className="font-semibold" style={{ color: "var(--fg)" }}>{fmt(estimate.baseSalary)}</span></div>
                                {estimate.overtimeHours > 0 && <div className="flex justify-between text-xs"><span style={{ color: "var(--teal)" }}>+ Overtime ({estimate.overtimeHours.toFixed(1)}h)</span><span className="font-semibold" style={{ color: "var(--teal)" }}>{fmt(estimate.grossPay - estimate.baseSalary)}</span></div>}
                                <div className="flex justify-between text-xs border-t pt-2" style={{ borderColor: "var(--border)" }}><span className="font-semibold" style={{ color: "var(--fg)" }}>Gross Pay</span><span className="font-semibold" style={{ color: "var(--fg)" }}>{fmt(estimate.grossPay)}</span></div>
                                {estimate.deductions.map((d, i) => <div key={i} className="flex justify-between text-xs"><span style={{ color: "var(--rose)" }}>− {d.label}</span><span className="font-semibold" style={{ color: "var(--rose)" }}>{fmt(d.amount)}</span></div>)}
                                {estimate.totalDeductions > 0 && <div className="flex justify-between text-xs"><span style={{ color: "var(--fg-tertiary)" }}>Total Deductions</span><span className="font-semibold" style={{ color: "var(--rose)" }}>−{fmt(estimate.totalDeductions)}</span></div>}
                                <div className="flex justify-between text-sm font-bold border-t pt-2" style={{ borderColor: "var(--border)" }}><span style={{ color: "var(--fg)" }}>Net Pay</span><span style={{ color: "var(--primary)" }}>{fmt(estimate.netPay)}</span></div>
                              </div>
                            </div>
                            {estimate.grossPay > 0 && (
                              <div>
                                <div className="flex justify-between text-[10px] font-semibold mb-1.5" style={{ color: "var(--fg-tertiary)" }}><span>Pay Breakdown</span><span>{100 - deductionPct}% take-home</span></div>
                                <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                                  <motion.div className="h-full" style={{ background: "var(--primary)" }} initial={{ width: 0 }} animate={{ width: `${100 - deductionPct}%` }} transition={{ duration: 0.6 }} />
                                  {deductionPct > 0 && <motion.div className="h-full" style={{ background: "var(--rose)" }} initial={{ width: 0 }} animate={{ width: `${deductionPct}%` }} transition={{ duration: 0.6, delay: 0.15 }} />}
                                </div>
                                <div className="mt-1.5 flex gap-3 text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>
                                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--primary)" }} />Net {100 - deductionPct}%</span>
                                  {deductionPct > 0 && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--rose)" }} />Deductions {deductionPct}%</span>}
                                </div>
                              </div>
                            )}
                            {summaryRateStats && (summaryRateStats.effectiveHourly != null || summaryRateStats.dailyRate != null || summaryRateStats.payPerPresentDay != null || estimate.overtimeHours > 0) && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>Rate Insights</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {summaryRateStats.effectiveHourly != null && (
                                    <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                                      <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Effective Hourly Rate</p>
                                      <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>
                                        {summaryRateStats.effectiveHourly.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                      </p>
                                      <p className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>per hour (net)</p>
                                    </div>
                                  )}
                                  {summaryRateStats.dailyRate != null && (
                                    <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                                      <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Daily Rate</p>
                                      <p className="text-sm font-bold" style={{ color: "var(--fg)" }}>
                                        {summaryRateStats.dailyRate.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                      </p>
                                      <p className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>base ÷ work days</p>
                                    </div>
                                  )}
                                  {summaryRateStats.payPerPresentDay != null && (
                                    <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                                      <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Pay Per Present Day</p>
                                      <p className="text-sm font-bold" style={{ color: "var(--teal)" }}>
                                        {summaryRateStats.payPerPresentDay.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                      </p>
                                      <p className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>net ÷ present days</p>
                                    </div>
                                  )}
                                  {estimate.overtimeHours > 0 && (
                                    <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                                      <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Overtime Pay</p>
                                      <p className="text-sm font-bold" style={{ color: "var(--teal)" }}>{fmt(estimate.grossPay - estimate.baseSalary)}</p>
                                      <p className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>{estimate.overtimeHours.toFixed(1)}h overtime</p>
                                    </div>
                                  )}
                                  {summaryRateStats.overtimeRate != null && (
                                    <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                                      <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>OT Hourly Rate</p>
                                      <p className="text-sm font-bold" style={{ color: "var(--amber)" }}>
                                        {summaryRateStats.overtimeRate.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                      </p>
                                      <p className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>per OT hour</p>
                                    </div>
                                  )}
                                  {summaryRateStats.netDailyRate != null && (
                                    <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                                      <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Net Daily Rate</p>
                                      <p className="text-sm font-bold" style={{ color: "var(--fg)" }}>
                                        {summaryRateStats.netDailyRate.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                      </p>
                                      <p className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>net ÷ work days</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )}

                        {/* ═══════ DAILY REPORT TAB ═══════ */}
                        {detailTab === "daily" && loading && (
                          <motion.div key="daily-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                            <div className="shimmer h-4 w-44 rounded" />
                            <div className="shimmer h-8 rounded-lg" />
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <div key={i} className="shimmer h-7 rounded-lg" />)}
                            <div className="grid grid-cols-3 gap-2">{[1, 2, 3].map((i) => <div key={i} className="shimmer h-14 rounded-xl" />)}</div>
                          </motion.div>
                        )}
                        {detailTab === "daily" && !loading && estimate && (
                          <motion.div key="daily" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }} className="space-y-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                              Daily Breakdown · {MN[selMonth - 1]} {selYear}
                            </p>
                            <div className="grid grid-cols-[2rem_2.5rem_1fr_4rem_3.5rem_3.5rem_3.5rem_3.5rem] gap-x-2 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                              <span>Day</span><span>DOW</span><span>Status</span><span className="text-right">Hours</span><span className="text-right">Late</span><span className="text-right">Ded.</span><span className="text-right">In</span><span className="text-right">Out</span>
                            </div>
                            <div className="space-y-0.5">
                              {(estimate.dailyBreakdown ?? []).map((row, idx) => {
                                const s = SC[row.status] ?? SC.off;
                                const isWork = row.status === "present" || row.status === "late" || row.status === "absent";
                                return (
                                  <motion.div key={row.day}
                                    className="grid grid-cols-[2rem_2.5rem_1fr_4rem_3.5rem_3.5rem_3.5rem_3.5rem] gap-x-2 items-center rounded-lg px-2 py-1.5"
                                    style={{ background: isWork ? "var(--bg-grouped)" : "transparent", opacity: row.status === "future" ? 0.35 : 1 }}
                                    initial={{ opacity: 0 }} animate={{ opacity: row.status === "future" ? 0.35 : 1 }}
                                    transition={{ duration: 0.15, delay: Math.min(idx * 0.01, 0.3) }}
                                  >
                                    <span className="text-xs font-bold" style={{ color: "var(--fg)" }}>{row.day}</span>
                                    <span className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>{row.dayOfWeek}</span>
                                    <div className="flex items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} /><span className="text-[11px] font-semibold" style={{ color: s.color }}>{s.label}</span></div>
                                    <span className="text-right text-[11px] font-semibold" style={{ color: row.workingMinutes > 0 ? "var(--fg)" : "var(--fg-quaternary)" }}>{row.workingMinutes > 0 ? fmtMins(row.workingMinutes) : "—"}</span>
                                    <span className="text-right text-[11px] font-semibold" style={{ color: row.lateMinutes > 0 ? "var(--amber)" : "var(--fg-quaternary)" }}>{row.lateMinutes > 0 ? `${row.lateMinutes}m` : "—"}</span>
                                    <span className="text-right text-[11px] font-semibold" style={{ color: row.deduction > 0 ? "var(--rose)" : "var(--fg-quaternary)" }}>{row.deduction > 0 ? fmt(row.deduction) : "—"}</span>
                                    <span className="text-right text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{fmtTime(row.firstStart)}</span>
                                    <span className="text-right text-[10px]" style={{ color: "var(--fg-tertiary)" }}>{fmtTime(row.lastEnd)}</span>
                                  </motion.div>
                                );
                              })}
                            </div>
                            {estimate.dailyBreakdown && estimate.dailyBreakdown.length > 0 && (
                              <>
                                <div className="grid grid-cols-[2rem_2.5rem_1fr_4rem_3.5rem_3.5rem_3.5rem_3.5rem] gap-x-2 items-center rounded-lg border-t px-2 pt-2 pb-1" style={{ borderColor: "var(--border)" }}>
                                  <span /><span /><span className="text-[10px] font-bold uppercase" style={{ color: "var(--fg-tertiary)" }}>Total</span>
                                  <span className="text-right text-xs font-bold" style={{ color: "var(--fg)" }}>{fmtMins(estimate.dailyBreakdown.reduce((a, r) => a + r.workingMinutes, 0))}</span>
                                  <span />
                                  <span className="text-right text-xs font-bold" style={{ color: "var(--rose)" }}>{fmt(estimate.dailyBreakdown.reduce((a, r) => a + r.deduction, 0))}</span>
                                  <span /><span />
                                </div>
                                <div className="mt-3 space-y-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Deduction Summary</p>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {(() => {
                                      const rows = estimate.dailyBreakdown;
                                      const daysWithDeductions = rows.filter((r) => r.deduction > 0).length;
                                      const daysZeroDedPresent = rows.filter((r) => r.deduction === 0 && r.status === "present").length;
                                      const maxDed = rows.reduce((m, r) => Math.max(m, r.deduction), 0);
                                      const dedValues = rows.filter((r) => r.deduction > 0).map((r) => r.deduction).sort((a, b) => a - b);
                                      const medianDed = dedValues.length > 0 ? (dedValues.length % 2 === 1 ? dedValues[Math.floor(dedValues.length / 2)] : (dedValues[dedValues.length / 2 - 1] + dedValues[dedValues.length / 2]) / 2) : 0;
                                      const totalOfficeMins = rows.reduce((s, r) => s + (r.officeMinutes ?? 0), 0);
                                      const totalRemoteMins = rows.reduce((s, r) => s + (r.remoteMinutes ?? 0), 0);
                                      const statusMap: Record<string, number> = {};
                                      for (const r of rows) statusMap[r.status] = (statusMap[r.status] ?? 0) + 1;
                                      const clockIns = rows.filter((r) => r.firstStart).map((r) => r.firstStart!);
                                      const clockOuts = rows.filter((r) => r.lastEnd).map((r) => r.lastEnd!);
                                      const earliestIn = clockIns.length > 0 ? clockIns.sort()[0] : null;
                                      const latestOut = clockOuts.length > 0 ? clockOuts.sort().reverse()[0] : null;
                                      const totalLateMins = rows.reduce((s, r) => s + r.lateMinutes, 0);
                                      return (
                                        <>
                                          <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Days with Deductions</p>
                                            <p className="text-sm font-bold" style={{ color: "var(--rose)" }}>{daysWithDeductions}</p>
                                          </div>
                                          <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Days Zero Ded.</p>
                                            <p className="text-sm font-bold" style={{ color: "var(--green)" }}>{daysZeroDedPresent}</p>
                                            <p className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>present only</p>
                                          </div>
                                          <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Max Single-Day Ded.</p>
                                            <p className="text-sm font-bold" style={{ color: maxDed > 0 ? "var(--rose)" : "var(--fg-quaternary)" }}>{maxDed > 0 ? fmt(maxDed) : "—"}</p>
                                          </div>
                                          {medianDed > 0 && (
                                            <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                                              <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Median Deduction</p>
                                              <p className="text-sm font-bold" style={{ color: "var(--amber)" }}>{fmt(Math.round(medianDed))}</p>
                                            </div>
                                          )}
                                          {totalLateMins > 0 && (
                                            <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                                              <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Total Late</p>
                                              <p className="text-sm font-bold" style={{ color: "var(--amber)" }}>{Math.floor(totalLateMins / 60)}h {totalLateMins % 60}m</p>
                                            </div>
                                          )}
                                          {(totalOfficeMins > 0 || totalRemoteMins > 0) && (
                                            <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-grouped)" }}>
                                              <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Office / Remote</p>
                                              <p className="text-sm font-bold" style={{ color: "var(--teal)" }}>{Math.round(totalOfficeMins / 60)}h / {Math.round(totalRemoteMins / 60)}h</p>
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </>
                            )}
                          </motion.div>
                        )}

                        {/* ═══════ PAYROLL REPORT TAB ═══════ */}
                        {detailTab === "report" && (
                          <motion.div key="report" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }} className="space-y-4">
                            {sheetLoading ? (
                              <div className="space-y-3">
                                <div className="shimmer h-20 rounded-xl" />
                                <div className="grid grid-cols-4 gap-2">{[1, 2, 3, 4].map((i) => <div key={i} className="shimmer h-14 rounded-xl" />)}</div>
                                {[1, 2, 3, 4, 5].map((i) => <div key={i} className="shimmer h-10 rounded-lg" />)}
                              </div>
                            ) : !payrollSheet || !reportSheetTotals ? (
                              <div className="py-8 text-center"><p className="text-xs font-medium" style={{ color: "var(--fg-tertiary)" }}>Unable to load payroll report.</p></div>
                            ) : (
                              <>
                                {/* Hero */}
                                <div className="rounded-xl p-5 text-center" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 6%, var(--bg-grouped)), color-mix(in srgb, var(--green) 8%, var(--bg-grouped)))" }}>
                                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--fg-tertiary)" }}>
                                    Total Net Pay · {MN[payrollSheet.month - 1]} {payrollSheet.year}
                                  </p>
                                  <p className="text-3xl font-bold" style={{ color: "var(--primary)" }}>{fmt(reportSheetTotals.totalNetPay)}</p>
                                  <p className="text-[10px] mt-1" style={{ color: "var(--fg-tertiary)" }}>
                                    {reportSheetTotals.totalEmployees} employees · {fmt(reportSheetTotals.totalGrossPay)} gross · {fmt(reportSheetTotals.totalDeductions)} deductions
                                  </p>
                                </div>

                                {/* Summary stats */}
                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                  {[
                                    { label: "Employees", value: reportSheetTotals.totalEmployees, color: "var(--fg)" },
                                    { label: "Work Days", value: payrollSheet.workingDays, color: "var(--fg)" },
                                    { label: "Holidays", value: payrollSheet.holidays, color: "var(--purple)" },
                                    { label: "Total Gross", value: fmt(reportSheetTotals.totalGrossPay), color: "var(--green)" },
                                    { label: "Total Ded.", value: fmt(reportSheetTotals.totalDeductions), color: reportSheetTotals.totalDeductions > 0 ? "var(--rose)" : "var(--fg)" },
                                    { label: "Net Pay", value: fmt(reportSheetTotals.totalNetPay), color: "var(--primary)" },
                                  ].map((s) => (
                                    <div key={s.label} className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                      <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>{s.label}</p>
                                      <p className="text-xs font-bold" style={{ color: s.color }}>{s.value}</p>
                                    </div>
                                  ))}
                                </div>

                                {teamSheetStats && (
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>Team Insights</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                                      <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Team Avg Attendance %</p>
                                        <p className="text-xs font-bold" style={{ color: "var(--green)" }}>{teamSheetStats.teamAvgAttendancePct}%</p>
                                      </div>
                                      <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Team Total OT Hours</p>
                                        <p className="text-xs font-bold" style={{ color: teamSheetStats.teamTotalOvertimeHours > 0 ? "var(--teal)" : "var(--fg)" }}>{teamSheetStats.teamTotalOvertimeHours.toFixed(1)}</p>
                                      </div>
                                      {teamSheetStats.teamAvgNetPay != null && (
                                        <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Team Avg Net Pay</p>
                                          <p className="text-xs font-bold" style={{ color: "var(--primary)" }}>{fmt(Math.round(teamSheetStats.teamAvgNetPay))}</p>
                                        </div>
                                      )}
                                      <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Zero Deduction Emps.</p>
                                        <p className="text-xs font-bold" style={{ color: "var(--green)" }}>{teamSheetStats.zeroDeductionEmployees}</p>
                                        <p className="text-[7px]" style={{ color: "var(--fg-tertiary)" }}>no absence / late ded.</p>
                                      </div>
                                      <div className="rounded-xl p-2 text-center col-span-2 sm:col-span-1" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Employees with Overtime</p>
                                        <p className="text-xs font-bold" style={{ color: teamSheetStats.overtimeEmployees > 0 ? "var(--teal)" : "var(--fg-tertiary)" }}>{teamSheetStats.overtimeEmployees}</p>
                                      </div>
                                      <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Avg Late Days</p>
                                        <p className="text-xs font-bold" style={{ color: teamSheetStats.avgLateDays > 0 ? "var(--amber)" : "var(--fg)" }}>{teamSheetStats.avgLateDays}</p>
                                      </div>
                                      <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Avg Absence Days</p>
                                        <p className="text-xs font-bold" style={{ color: teamSheetStats.avgAbsenceDays > 0 ? "var(--rose)" : "var(--fg)" }}>{teamSheetStats.avgAbsenceDays}</p>
                                      </div>
                                      {teamSheetStats.avgSalary != null && (
                                        <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Avg Salary</p>
                                          <p className="text-xs font-bold" style={{ color: "var(--fg)" }}>{fmt(teamSheetStats.avgSalary)}</p>
                                        </div>
                                      )}
                                      {teamSheetStats.medianSalary != null && (
                                        <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Median Salary</p>
                                          <p className="text-xs font-bold" style={{ color: "var(--fg)" }}>{fmt(teamSheetStats.medianSalary)}</p>
                                        </div>
                                      )}
                                      {teamSheetStats.highestPaid && (
                                        <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Highest Paid</p>
                                          <p className="text-xs font-bold truncate" style={{ color: "var(--primary)" }}>{teamSheetStats.highestPaid.name}</p>
                                          <p className="text-[7px]" style={{ color: "var(--fg-tertiary)" }}>{fmt(teamSheetStats.highestPaid.salary)}</p>
                                        </div>
                                      )}
                                      {teamSheetStats.lowestPaid && (
                                        <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Lowest Paid</p>
                                          <p className="text-xs font-bold truncate" style={{ color: "var(--fg-tertiary)" }}>{teamSheetStats.lowestPaid.name}</p>
                                          <p className="text-[7px]" style={{ color: "var(--fg-tertiary)" }}>{fmt(teamSheetStats.lowestPaid.salary)}</p>
                                        </div>
                                      )}
                                      {teamSheetStats.highestDed && teamSheetStats.highestDed.totalDeductions > 0 && (
                                        <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Highest Deductions</p>
                                          <p className="text-xs font-bold truncate" style={{ color: "var(--rose)" }}>{teamSheetStats.highestDed.name}</p>
                                          <p className="text-[7px]" style={{ color: "var(--fg-tertiary)" }}>{fmt(teamSheetStats.highestDed.totalDeductions)}</p>
                                        </div>
                                      )}
                                      <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Best Attendance</p>
                                        <p className="text-xs font-bold truncate" style={{ color: "var(--green)" }}>{teamSheetStats.bestAttendanceName}</p>
                                        <p className="text-[7px]" style={{ color: "var(--fg-tertiary)" }}>{teamSheetStats.bestAttendancePct}%</p>
                                      </div>
                                      <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Worst Attendance</p>
                                        <p className="text-xs font-bold truncate" style={{ color: "var(--rose)" }}>{teamSheetStats.worstAttendanceName}</p>
                                        <p className="text-[7px]" style={{ color: "var(--fg-tertiary)" }}>{teamSheetStats.worstAttendancePct}%</p>
                                      </div>
                                      <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Most Late Days</p>
                                        <p className="text-xs font-bold truncate" style={{ color: teamSheetStats.mostLateDays > 0 ? "var(--amber)" : "var(--fg)" }}>{teamSheetStats.mostLateName}</p>
                                        <p className="text-[7px]" style={{ color: "var(--fg-tertiary)" }}>{teamSheetStats.mostLateDays}</p>
                                      </div>
                                      <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Lowest Net Pay</p>
                                        <p className="text-xs font-bold truncate" style={{ color: "var(--primary)" }}>{teamSheetStats.lowestNetName}</p>
                                        <p className="text-[7px]" style={{ color: "var(--fg-tertiary)" }}>{fmt(teamSheetStats.lowestNet)}</p>
                                      </div>
                                      {teamSheetStats.salaryRange != null && (
                                        <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Salary Range</p>
                                          <p className="text-xs font-bold" style={{ color: "var(--fg)" }}>{fmt(teamSheetStats.salaryRange)}</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Employee payroll table */}
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Employee Payroll Details</p>
                                    <span className="text-[9px] font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
                                      {new Date(payrollSheet.generatedAt).toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
                                    <div className="grid grid-cols-[1.5rem_1fr_2.5rem_2.5rem_2.5rem_2.5rem_2.5rem_4rem_4rem_4.5rem] gap-x-1 px-3 py-2 text-[7px] font-semibold uppercase tracking-wider" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
                                      <span>#</span><span>Employee</span><span className="text-right">Pres.</span><span className="text-right">Abs.</span><span className="text-right">Late</span><span className="text-right">Leave</span><span className="text-right">Att%</span><span className="text-right">Gross</span><span className="text-right">Ded.</span><span className="text-right">Net Pay</span>
                                    </div>
                                    {filteredTeamSheet.map((e, i) => (
                                      <div key={e._id}
                                        className="grid grid-cols-[1.5rem_1fr_2.5rem_2.5rem_2.5rem_2.5rem_2.5rem_4rem_4rem_4.5rem] gap-x-1 px-3 py-2 items-center transition-colors hover:bg-[var(--hover-bg)]"
                                        style={{ borderBottom: "1px solid var(--border)" }}
                                      >
                                        <span className="text-[10px] font-medium" style={{ color: "var(--fg-tertiary)" }}>{i + 1}</span>
                                        <div className="min-w-0">
                                          <p className="text-[11px] font-semibold truncate" style={{ color: "var(--fg)" }}>{e.name}</p>
                                          {e.department && <p className="text-[8px] truncate" style={{ color: "var(--fg-tertiary)" }}>{e.department}</p>}
                                        </div>
                                        <span className="text-right text-[10px] font-semibold" style={{ color: "var(--green)" }}>{e.presentDays}</span>
                                        <span className="text-right text-[10px] font-semibold" style={{ color: e.absentDays > 0 ? "var(--rose)" : "var(--fg-tertiary)" }}>{e.absentDays}</span>
                                        <span className="text-right text-[10px] font-semibold" style={{ color: e.lateDays > 0 ? "var(--amber)" : "var(--fg-tertiary)" }}>{e.lateDays}</span>
                                        <span className="text-right text-[10px] font-semibold" style={{ color: e.leaveDays > 0 ? "var(--teal)" : "var(--fg-tertiary)" }}>{e.leaveDays}</span>
                                        <span className="text-right text-[10px] font-semibold" style={{ color: e.attendancePct >= 90 ? "var(--green)" : e.attendancePct >= 70 ? "var(--amber)" : "var(--rose)" }}>{e.attendancePct}%</span>
                                        <span className="text-right text-[10px] font-medium" style={{ color: "var(--fg)" }}>{fmt(e.grossPay)}</span>
                                        <span className="text-right text-[10px] font-medium" style={{ color: e.totalDeductions > 0 ? "var(--rose)" : "var(--fg-tertiary)" }}>{e.totalDeductions > 0 ? `−${fmt(e.totalDeductions)}` : "—"}</span>
                                        <span className="text-right text-[11px] font-bold" style={{ color: "var(--primary)" }}>{fmt(e.netPay)}</span>
                                      </div>
                                    ))}
                                    {/* Total row */}
                                    <div className="grid grid-cols-[1.5rem_1fr_2.5rem_2.5rem_2.5rem_2.5rem_2.5rem_4rem_4rem_4.5rem] gap-x-1 px-3 py-2.5 items-center" style={{ background: "var(--bg-grouped)" }}>
                                      <span /><span className="text-xs font-bold" style={{ color: "var(--fg)" }}>Total ({reportSheetTotals.totalEmployees})</span>
                                      <span /><span /><span /><span /><span />
                                      <span className="text-right text-[11px] font-bold" style={{ color: "var(--fg)" }}>{fmt(reportSheetTotals.totalGrossPay)}</span>
                                      <span className="text-right text-[11px] font-bold" style={{ color: "var(--rose)" }}>{reportSheetTotals.totalDeductions > 0 ? `−${fmt(reportSheetTotals.totalDeductions)}` : "—"}</span>
                                      <span className="text-right text-xs font-bold" style={{ color: "var(--primary)" }}>{fmt(reportSheetTotals.totalNetPay)}</span>
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </motion.div>
                        )}

                        {/* ═══════ YEAR OVERVIEW TAB ═══════ */}
                        {detailTab === "year" && (
                          <motion.div key="year" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }} className="space-y-4">
                            {yearLoading ? (
                              <div className="space-y-3">
                                <div className="shimmer h-16 rounded-xl" />
                                {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="shimmer h-10 rounded-lg" />)}
                              </div>
                            ) : (
                              <>
                                {/* Annual hero */}
                                {yearTotals && (
                                  <div className="rounded-xl p-4 text-center" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 6%, var(--bg-grouped)), color-mix(in srgb, var(--teal) 5%, var(--bg-grouped)))" }}>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--fg-tertiary)" }}>Annual Net Pay · {selYear}</p>
                                    <p className="text-2xl font-bold" style={{ color: "var(--primary)" }}>{fmt(yearTotals.netPay)}</p>
                                    <p className="text-[10px] mt-1" style={{ color: "var(--fg-tertiary)" }}>
                                      {yearTotals.months} month{yearTotals.months !== 1 ? "s" : ""} · {fmt(yearTotals.grossPay)} gross · {fmt(yearTotals.totalDeductions)} deductions
                                    </p>
                                  </div>
                                )}

                                {/* Annual stats row */}
                                {yearTotals && (
                                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                    {[
                                      { label: "Work Days", value: yearTotals.workingDays, color: "var(--fg)" },
                                      { label: "Present", value: yearTotals.presentDays, color: "var(--green)" },
                                      { label: "Absent", value: yearTotals.absentDays, color: yearTotals.absentDays > 0 ? "var(--rose)" : "var(--fg)" },
                                      { label: "Late", value: yearTotals.lateDays, color: yearTotals.lateDays > 0 ? "var(--amber)" : "var(--fg)" },
                                      { label: "Leaves", value: yearTotals.leaveDays, color: "var(--teal)" },
                                    ].map((s) => (
                                      <div key={s.label} className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>{s.label}</p>
                                        <p className="text-sm font-bold" style={{ color: s.color }}>{s.value}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {yearTotals && yearInsightStats && (
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>YTD Insights</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                                      {yearInsightStats.ytdAvgMonthlyNet != null && (
                                        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>YTD Avg Monthly Net Pay</p>
                                          <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>{fmt(Math.round(yearInsightStats.ytdAvgMonthlyNet))}</p>
                                          <p className="text-[8px]" style={{ color: "var(--fg-tertiary)" }}>over {yearTotals.months} mo.</p>
                                        </div>
                                      )}
                                      {yearInsightStats.ytdAttendancePct != null && (
                                        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>YTD Attendance %</p>
                                          <p className="text-sm font-bold" style={{ color: "var(--green)" }}>{yearInsightStats.ytdAttendancePct}%</p>
                                        </div>
                                      )}
                                      {yearInsightStats.ytdDeductionPct != null && (
                                        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>YTD Deduction %</p>
                                          <p className="text-sm font-bold" style={{ color: yearInsightStats.ytdDeductionPct > 0 ? "var(--rose)" : "var(--fg)" }}>{yearInsightStats.ytdDeductionPct}%</p>
                                        </div>
                                      )}
                                      {yearInsightStats.bestMonth && yearInsightStats.bestNet != null && (
                                        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Best Month</p>
                                          <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>{yearInsightStats.bestMonth}</p>
                                          <p className="text-[8px]" style={{ color: "var(--fg-tertiary)" }}>{fmt(yearInsightStats.bestNet)} net</p>
                                        </div>
                                      )}
                                      {yearInsightStats.worstMonth && yearInsightStats.worstDed != null && (
                                        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Worst Month</p>
                                          <p className="text-sm font-bold" style={{ color: "var(--rose)" }}>{yearInsightStats.worstMonth}</p>
                                          <p className="text-[8px]" style={{ color: "var(--fg-tertiary)" }}>{yearInsightStats.worstDed > 0 ? `−${fmt(yearInsightStats.worstDed)}` : "—"} deductions</p>
                                        </div>
                                      )}
                                      {yearInsightStats.bestGrossMonth != null && yearInsightStats.bestGross != null && (
                                        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Best Gross</p>
                                          <p className="text-sm font-bold" style={{ color: "var(--green)" }}>{MN_SHORT[yearInsightStats.bestGrossMonth]}</p>
                                          <p className="text-[8px]" style={{ color: "var(--fg-tertiary)" }}>{fmt(yearInsightStats.bestGross)} gross</p>
                                        </div>
                                      )}
                                      {yearInsightStats.worstNetMonth != null && yearInsightStats.worstNet != null && (
                                        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Lowest Net</p>
                                          <p className="text-sm font-bold" style={{ color: "var(--rose)" }}>{MN_SHORT[yearInsightStats.worstNetMonth]}</p>
                                          <p className="text-[8px]" style={{ color: "var(--fg-tertiary)" }}>{fmt(yearInsightStats.worstNet)} net</p>
                                        </div>
                                      )}
                                      {yearInsightStats.lowestDedMonth != null && yearInsightStats.lowestDed != null && (
                                        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Lowest Ded.</p>
                                          <p className="text-sm font-bold" style={{ color: "var(--fg)" }}>{MN_SHORT[yearInsightStats.lowestDedMonth]}</p>
                                          <p className="text-[8px]" style={{ color: "var(--fg-tertiary)" }}>{yearInsightStats.lowestDed > 0 ? `−${fmt(yearInsightStats.lowestDed)}` : "—"}</p>
                                        </div>
                                      )}
                                      {yearInsightStats.totalOvertimeHours > 0 && (
                                        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Total OT</p>
                                          <p className="text-sm font-bold" style={{ color: "var(--teal)" }}>{yearInsightStats.totalOvertimeHours.toFixed(1)}h</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Monthly rows */}
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>Monthly Breakdown</p>
                                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
                                    {/* Header */}
                                    <div className="grid grid-cols-[5rem_1fr_1fr_1fr_1fr_1fr_1fr] gap-x-1 px-3 py-2 text-[9px] font-semibold uppercase tracking-wider" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
                                      <span>Month</span><span className="text-right">Present</span><span className="text-right">Absent</span><span className="text-right">Late</span><span className="text-right">Gross</span><span className="text-right">Deductions</span><span className="text-right">Net Pay</span>
                                    </div>
                                    {yearData.map((e, i) => {
                                      const isCur = selYear === now.getFullYear() && i + 1 === now.getMonth() + 1;
                                      const isSel = i + 1 === selMonth;
                                      return (
                                        <button key={i} type="button"
                                          onClick={() => { setSelMonth(i + 1); setDetailTab("summary"); }}
                                          className="grid w-full grid-cols-[5rem_1fr_1fr_1fr_1fr_1fr_1fr] gap-x-1 px-3 py-2 text-left transition-colors hover:bg-[var(--hover-bg)]"
                                          style={{
                                            background: isSel ? "color-mix(in srgb, var(--primary) 6%, transparent)" : "transparent",
                                            borderBottom: "1px solid var(--border)",
                                          }}
                                        >
                                          <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: isSel ? "var(--primary)" : "var(--fg)" }}>
                                            {MN_SHORT[i]}
                                            {isCur && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--green)" }} />}
                                          </span>
                                          {e ? (
                                            <>
                                              <span className="text-right text-[11px] font-medium" style={{ color: "var(--green)" }}>{e.presentDays}<span className="text-[9px] font-normal" style={{ color: "var(--fg-tertiary)" }}>/{e.workingDays}</span></span>
                                              <span className="text-right text-[11px] font-medium" style={{ color: e.absentDays > 0 ? "var(--rose)" : "var(--fg-tertiary)" }}>{e.absentDays}</span>
                                              <span className="text-right text-[11px] font-medium" style={{ color: e.lateDays > 0 ? "var(--amber)" : "var(--fg-tertiary)" }}>{e.lateDays}</span>
                                              <span className="text-right text-[11px] font-medium" style={{ color: "var(--fg)" }}>{fmt(e.grossPay)}</span>
                                              <span className="text-right text-[11px] font-medium" style={{ color: e.totalDeductions > 0 ? "var(--rose)" : "var(--fg-tertiary)" }}>{e.totalDeductions > 0 ? `−${fmt(e.totalDeductions)}` : "—"}</span>
                                              <span className="text-right text-xs font-bold" style={{ color: "var(--primary)" }}>{fmt(e.netPay)}</span>
                                            </>
                                          ) : (
                                            <span className="col-span-6 text-right text-[11px]" style={{ color: "var(--fg-quaternary)" }}>—</span>
                                          )}
                                        </button>
                                      );
                                    })}
                                    {/* Totals */}
                                    {yearTotals && (
                                      <div className="grid grid-cols-[5rem_1fr_1fr_1fr_1fr_1fr_1fr] gap-x-1 px-3 py-2" style={{ background: "var(--bg-grouped)" }}>
                                        <span className="text-xs font-bold" style={{ color: "var(--fg)" }}>Total</span>
                                        <span className="text-right text-xs font-bold" style={{ color: "var(--green)" }}>{yearTotals.presentDays}<span className="text-[9px] font-normal" style={{ color: "var(--fg-tertiary)" }}>/{yearTotals.workingDays}</span></span>
                                        <span className="text-right text-xs font-bold" style={{ color: yearTotals.absentDays > 0 ? "var(--rose)" : "var(--fg-tertiary)" }}>{yearTotals.absentDays}</span>
                                        <span className="text-right text-xs font-bold" style={{ color: yearTotals.lateDays > 0 ? "var(--amber)" : "var(--fg-tertiary)" }}>{yearTotals.lateDays}</span>
                                        <span className="text-right text-xs font-bold" style={{ color: "var(--fg)" }}>{fmt(yearTotals.grossPay)}</span>
                                        <span className="text-right text-xs font-bold" style={{ color: "var(--rose)" }}>{yearTotals.totalDeductions > 0 ? `−${fmt(yearTotals.totalDeductions)}` : "—"}</span>
                                        <span className="text-right text-sm font-bold" style={{ color: "var(--primary)" }}>{fmt(yearTotals.netPay)}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
