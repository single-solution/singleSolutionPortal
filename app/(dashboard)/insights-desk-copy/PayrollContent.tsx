"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { useCachedState } from "@/lib/useQuery";
import toast from "react-hot-toast";

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

type DetailTab = "month" | "year";

/* ───── Helpers ───── */

function nameOf(u: DropdownEmp): string {
  const f = u.about?.firstName ?? "";
  const l = u.about?.lastName ?? "";
  return `${f} ${l}`.trim() || u.email || "—";
}
function fmtMins(m: number): string {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}
function fmtTime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

const MN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MN_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];


const SC: Record<string, { label: string; color: string }> = {
  present: { label: "Present", color: "var(--status-present)" },
  late: { label: "Late", color: "var(--status-late)" },
  absent: { label: "Absent", color: "var(--status-absent)" },
  leave: { label: "Leave", color: "var(--teal)" },
  holiday: { label: "Holiday", color: "var(--purple)" },
  weekend: { label: "Weekend", color: "var(--fg-quaternary)" },
  future: { label: "—", color: "var(--fg-quaternary)" },
  off: { label: "Off", color: "var(--fg-quaternary)" },
};

/* ───── Component ───── */

interface Props { selectedUserId?: string; year: number; month: number; initialTab?: string; onTabChange?: (tab: string) => void }

export function PayrollContent({ selectedUserId, year, month, initialTab, onTabChange }: Props) {
  const { data: session } = useSession();
  const { can: canPerm, isSuperAdmin } = usePermissions();
  const canViewTeam = canPerm("payroll_viewTeam") || canPerm("employees_viewPayroll");
  const canExport = canPerm("payroll_export");

  const now = new Date();
  const [employees, setEmployees] = useCachedState<DropdownEmp[]>("$payroll-inline/employees", []);
  const [userId, setUserId] = useState(selectedUserId || "");
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [estimate, setEstimate] = useCachedState<EstimateData | null>("$payroll-inline/estimate", null);
  const [loading, setLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const VALID_TABS: DetailTab[] = ["month", "year"];
  const [detailTab, setDetailTabRaw] = useState<DetailTab>(() => {
    if (initialTab && VALID_TABS.includes(initialTab as DetailTab)) return initialTab as DetailTab;
    return "month";
  });
  const setDetailTab = useCallback((t: DetailTab) => { setDetailTabRaw(t); onTabChange?.(t); }, [onTabChange]);

  const [yearData, setYearData] = useCachedState<(EstimateData | null)[]>("$payroll-inline/yearData", []);
  const [yearLoading, setYearLoading] = useState(false);
  const [payrollSheet, setPayrollSheet] = useCachedState<PayrollSheet | null>("$payroll-inline/sheet", null);
  const [sheetLoading, setSheetLoading] = useState(false);

  const detailRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const allMode = isSuperAdmin && !userId;

  useEffect(() => {
    setUserId(selectedUserId || "");
    setDeptFilter(null);
    setDetailTab("month");
  }, [selectedUserId]);

  useEffect(() => {
    if (!canViewTeam) return;
    const ac = new AbortController();
    fetch("/api/employees/dropdown", { signal: ac.signal })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setEmployees(Array.isArray(d) ? d : []))
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setEmployees([]); toast.error("Failed to load employees");
      });
    return () => ac.abort();
  }, [canViewTeam]);

  /* ── Fetch single month ── */
  const loadEstimate = useCallback(async (signal?: AbortSignal) => {
    if (isSuperAdmin && !userId) { setEstimate(null); return; }
    const uid = userId || session?.user?.id;
    if (!uid) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ detail: "true", month: String(month), year: String(year) });
      if (userId) q.set("userId", userId);
      const res = await fetch(`/api/payroll/estimate?${q}`, { signal });
      if (res.ok) { const d = await res.json(); setEstimate(d.exempt ? null : d); }
      else { setEstimate(null); toast.error("Failed to load payroll estimate"); }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setEstimate(null); toast.error("Failed to load payroll estimate");
    }
    setLoading(false);
  }, [userId, session?.user?.id, isSuperAdmin, month, year]);

  useEffect(() => {
    const ac = new AbortController();
    loadEstimate(ac.signal);
    return () => ac.abort();
  }, [loadEstimate]);

  /* ── Fetch year overview (all months up to current) ── */
  const loadYearOverview = useCallback(async (signal?: AbortSignal) => {
    if (isSuperAdmin && !userId) { setYearData([]); return; }
    const uid = userId || session?.user?.id;
    if (!uid) return;
    setYearLoading(true);
    const maxMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
    const promises: Promise<EstimateData | null>[] = [];
    for (let m = 1; m <= maxMonth; m++) {
      const q = new URLSearchParams({ month: String(m), year: String(year) });
      if (userId) q.set("userId", userId);
      promises.push(
        fetch(`/api/payroll/estimate?${q}`, { signal })
          .then((r) => r.ok ? r.json() : null)
          .then((d) => (d?.exempt ? null : d))
          .catch((e) => {
            if (e instanceof DOMException && e.name === "AbortError") throw e;
            return null;
          }),
      );
    }
    try {
      const results = await Promise.all(promises);
      setYearData(results);
      if (results.every((r) => r === null)) toast.error("Failed to load year overview");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    setYearLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, session?.user?.id, isSuperAdmin, year]);

  useEffect(() => {
    if (allMode || detailTab !== "year") return;
    const ac = new AbortController();
    loadYearOverview(ac.signal);
    return () => ac.abort();
  }, [allMode, detailTab, loadYearOverview]);

  const loadPayrollSheet = useCallback(async (signal?: AbortSignal) => {
    if (!canViewTeam) return;
    setSheetLoading(true);
    try {
      const q = new URLSearchParams({ month: String(month), year: String(year) });
      const res = await fetch(`/api/payroll/bank-sheet?${q}`, { signal });
      if (res.ok) setPayrollSheet(await res.json());
      else { setPayrollSheet(null); toast.error("Failed to load bank sheet"); }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setPayrollSheet(null); toast.error("Failed to load bank sheet");
    }
    setSheetLoading(false);
  }, [canViewTeam, month, year]);

  useEffect(() => {
    if (!allMode) return;
    const ac = new AbortController();
    loadPayrollSheet(ac.signal);
    return () => ac.abort();
  }, [allMode, loadPayrollSheet]);

  useEffect(() => { if (detailRef.current) detailRef.current.scrollTop = 0; }, [userId, month, deptFilter]);

  useEffect(() => {
    if (!showExportMenu) return;
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportMenu(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showExportMenu]);

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const deptGroups = useMemo(() => {
    const grouped = new Map<string, DeptGroup>();
    const ungrouped: DropdownEmp[] = [];
    for (const emp of employees) {
      if (emp.department) {
        const ex = grouped.get(emp.department.id);
        if (ex) ex.employees.push(emp); else grouped.set(emp.department.id, { id: emp.department.id, title: emp.department.title, employees: [emp] });
      } else ungrouped.push(emp);
    }
    const groups = [...grouped.values()].sort((a, b) => a.title.localeCompare(b.title));
    if (ungrouped.length > 0) groups.push({ id: "__none", title: "Unassigned", employees: ungrouped });
    for (const g of groups) g.employees.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return groups;
  }, [employees]);

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

  const yearInsightStats = useMemo(() => {
    if (!yearTotals) return null;
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
      lines.push("", "DAILY BREAKDOWN", "Day,Date,Weekday,Status,Hours,Late Minutes,Deduction,Clock-in,Clock-out");
      for (const r of estimate.dailyBreakdown) {
        const s = SC[r.status] ?? SC.off;
        lines.push(`${r.day},${r.date},${r.dayOfWeek},${s.label},${(r.workingMinutes / 60).toFixed(1)},${r.lateMinutes},${r.deduction},${r.firstStart ? fmtTime(r.firstStart) : ""},${r.lastEnd ? fmtTime(r.lastEnd) : ""}`);
      }
    }
    return lines;
  }

  function buildYearCSV(): string[] {
    const emp = selectedEmployee ? nameOf(selectedEmployee) : "Self";
    const lines = [`Annual Payroll Report — ${year}`, `Employee,${emp}`, "", "Month,Working Days,Present,Absent,Late,Leaves,Holidays,Gross Pay,Deductions,Net Pay"];
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
      "Sr,Employee,Department,Salary,Present,Absent,Late,Leaves,Overtime Hours,Attendance %,Gross Pay,Absence Deductions,Late Deductions,Total Deductions,Net Pay",
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
    if (allMode && payrollSheet) {
      downloadBlob(buildSheetCSV().join("\n"), `payroll-report-${year}-${String(month).padStart(2, "0")}.csv`, "text/csv");
    } else {
      const isYear = !allMode && detailTab === "year" && yearData.length > 0;
      const lines = isYear ? buildYearCSV() : buildMonthCSV();
      if (!lines.length) { setShowExportMenu(false); toast.error("No data to export"); return; }
      const fn = isYear ? `payroll-annual-${year}.csv` : `payroll-${year}-${String(month).padStart(2, "0")}.csv`;
      downloadBlob(lines.join("\n"), fn, "text/csv");
    }
    setShowExportMenu(false);
  }

  function handlePrint() {
    const emp = selectedEmployee ? nameOf(selectedEmployee) : "Self";
    const dept = selectedEmployee?.department?.title ?? "";
    let body = "";

    if (allMode && payrollSheet && reportSheetTotals) {
      const s = payrollSheet;
      const t = reportSheetTotals;
      const rows = filteredTeamSheet.map((e, i) =>
        `<tr><td>${i + 1}</td><td>${e.name}</td><td>${e.department ?? "—"}</td><td>${fmt(e.salary)}</td><td>${e.presentDays}/${e.workingDays}</td><td>${e.absentDays}</td><td>${e.lateDays}</td><td>${e.leaveDays}</td><td>${e.attendancePct}%</td><td>${fmt(e.grossPay)}</td><td style="color:#dc2626">${e.totalDeductions > 0 ? fmt(e.totalDeductions) : "—"}</td><td style="font-weight:700">${fmt(e.netPay)}</td></tr>`
      ).join("");
      body = `<h1>Payroll Report — ${MN[s.month - 1]} ${s.year}</h1>
<h2>Generated: ${new Date(s.generatedAt).toLocaleString()} · ${s.workingDays} working days · ${s.holidays} holidays</h2>
<div class="hero"><div class="label">Total Net Pay</div><div class="amount">${fmt(t.totalNetPay)}</div><div style="margin-top:4px;font-size:11px;color:#888">${t.totalEmployees} employees · ${fmt(t.totalGrossPay)} gross · ${fmt(t.totalDeductions)} deductions</div></div>
<table><thead><tr><th>#</th><th>Employee</th><th>Department</th><th>Salary</th><th>Present</th><th>Absent</th><th>Late</th><th>Leave</th><th>Attendance %</th><th>Gross</th><th>Deductions</th><th>Net Pay</th></tr></thead>
<tbody>${rows}<tr class="total"><td colspan="10">Total (${t.totalEmployees})</td><td>${fmt(t.totalGrossPay)}</td><td style="color:#dc2626">${t.totalDeductions > 0 ? fmt(t.totalDeductions) : "—"}</td><td style="font-weight:700">${fmt(t.totalNetPay)}</td></tr></tbody></table>
<div style="margin-top:24px;padding:16px;background:#f8f9fa;border-radius:8px;font-size:10px;color:#666">
<strong>Prepared by:</strong> ___________________________&nbsp;&nbsp;&nbsp;&nbsp;<strong>Date:</strong> _______________<br/><br/>
<strong>Finance Head:</strong> ___________________________&nbsp;&nbsp;&nbsp;&nbsp;<strong>Approved by:</strong> ___________________________
</div>`;
    } else if (!allMode && detailTab === "year" && yearData.length > 0) {
      const rows = yearData.map((e, i) => {
        if (!e) return `<tr style="color:#aaa"><td>${MN_SHORT[i]}</td><td colspan="8">—</td></tr>`;
        return `<tr><td>${MN_SHORT[i]}</td><td>${e.workingDays}</td><td>${e.presentDays}</td><td>${e.absentDays}</td><td>${e.lateDays}</td><td>${e.leaveDays}</td><td>${fmt(e.grossPay)}</td><td style="color:#dc2626">${fmt(e.totalDeductions)}</td><td style="font-weight:700">${fmt(e.netPay)}</td></tr>`;
      }).join("");
      const totRow = yearTotals ? `<tr class="total"><td>Total</td><td>${yearTotals.workingDays}</td><td>${yearTotals.presentDays}</td><td>${yearTotals.absentDays}</td><td>${yearTotals.lateDays}</td><td>${yearTotals.leaveDays}</td><td>${fmt(yearTotals.grossPay)}</td><td style="color:#dc2626">${fmt(yearTotals.totalDeductions)}</td><td style="font-weight:700">${fmt(yearTotals.netPay)}</td></tr>` : "";
      body = `<h1>Annual Payroll Report — ${year}</h1><h2>${emp}${dept ? ` · ${dept}` : ""}</h2>
<table><thead><tr><th>Month</th><th>Work Days</th><th>Present</th><th>Absent</th><th>Late</th><th>Leaves</th><th>Gross</th><th>Deductions</th><th>Net Pay</th></tr></thead><tbody>${rows}${totRow}</tbody></table>`;
    } else if (estimate) {
      const dailyRows = (estimate.dailyBreakdown ?? []).map((r) => {
        const s = SC[r.status] ?? SC.off;
        const cls = r.status === "absent" ? "color:var(--status-absent)" : r.status === "late" ? "color:var(--status-late)" : r.status === "present" ? "color:var(--status-present)" : "color:#888";
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
${dailyRows ? `<div class="section"><div class="st">Daily Breakdown</div><table><thead><tr><th>Day</th><th>Weekday</th><th>Status</th><th>Hours</th><th>Late</th><th>Deductions</th><th>Clock-in</th><th>Clock-out</th></tr></thead><tbody>${dailyRows}</tbody></table></div>` : ""}`;
    }

    const html = `<!DOCTYPE html><html><head><title>Payroll Report</title>
<style>:root{--status-present:#00C853;--status-late:#FFAB00;--status-absent:#FF1744;--status-office:#00B8D4;--status-remote:#2979FF;--status-ontime:#00B8D4}
body{font-family:system-ui,sans-serif;padding:32px;max-width:900px;margin:0 auto;color:#1a1a1a;font-size:12px}
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
    else { toast.error("Popup blocked — allow popups for this site"); }
    setShowExportMenu(false);
  }

  /* ───── RENDER ───── */

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ══ Header ══ */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
        <div>
          <h3 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>Payroll</h3>
          <p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>
            {allMode ? `All Employees · ${MN[month - 1]} ${year}` : loading ? "Loading…" : estimate ? `${fmt(estimate.netPay)} net · ${fmt(estimate.grossPay)} gross · ${fmt(estimate.totalDeductions)} deductions` : `${MN[month - 1]} ${year}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!allMode && (
            <div className="flex gap-1 rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
              {(["month", "year"] as DetailTab[]).map((t) => (
                <button key={t} type="button" onClick={() => setDetailTab(t)}
                  className={`rounded-lg px-3 py-1 text-[12px] font-semibold transition-all ${detailTab === t ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--fg-secondary)]"}`}
                >
                  {t === "month" ? `${MN_SHORT[month - 1]} ${year}` : `Year ${year}`}
                </button>
              ))}
            </div>
          )}
          {canExport && ((allMode && payrollSheet) || (!allMode && (estimate || (detailTab === "year" && yearData.length > 0)))) && (
            <div className="relative" ref={exportRef}>
              <motion.button type="button" onClick={() => setShowExportMenu((p) => !p)} whileTap={{ scale: 0.95 }} disabled={allMode ? sheetLoading : (loading || yearLoading)}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50"
                style={{ borderColor: "var(--border)", color: "var(--fg-secondary)", background: "var(--bg)" }}>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Export Payroll
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M19 9l-7 7-7-7" /></svg>
              </motion.button>
              <AnimatePresence>
                {showExportMenu && (
                  <motion.div initial={{ opacity: 0, y: -4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.95 }} transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full mt-1 z-10 w-52 rounded-xl border p-1 shadow-lg" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                    {[
                      { label: allMode ? "Payroll Report CSV" : (detailTab === "year" ? "Year Report CSV" : "Month Report CSV"), icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", action: handleExportCSV },
                      { label: "Print / PDF", icon: "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2z", action: handlePrint },
                    ].map((item) => (
                      <button key={item.label} type="button" onClick={item.action}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors hover:bg-[var(--hover-bg)]" style={{ color: "var(--fg)" }}>
                        <svg className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={item.icon} /></svg>
                        {item.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

                {/* ══ Detail panel ══ */}
                <div ref={detailRef} className="flex-1 overflow-y-auto p-3 space-y-3">
                  {(
                    <>
                      <AnimatePresence mode="wait">
                        {/* ═══════ SINGLE EMPLOYEE: MONTH VIEW (Summary + Daily combined) ═══════ */}
                        {!allMode && detailTab === "month" && loading && (
                          <motion.div key="month-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                            <div className="shimmer h-4 w-40 rounded" />
                            <div className="grid grid-cols-4 gap-2">{[1, 2, 3, 4].map((i) => <div key={i} className="shimmer h-16 rounded-xl" />)}</div>
                            <div className="shimmer h-4 w-36 rounded" />
                            <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="shimmer h-8 rounded-lg" />)}</div>
                            <div className="shimmer h-4 w-32 rounded" />
                            <div className="grid grid-cols-3 gap-2">{[1, 2, 3].map((i) => <div key={i} className="shimmer h-14 rounded-xl" />)}</div>
                          </motion.div>
                        )}
                        {!allMode && detailTab === "month" && !loading && !estimate && (
                          <motion.div key="month-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-12 text-center">
                            <svg className="mx-auto mb-2 h-8 w-8" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p className="text-[12px] font-medium" style={{ color: "var(--fg-tertiary)" }}>No payroll data available for {MN[month - 1]} {year}</p>
                          </motion.div>
                        )}
                        {!allMode && detailTab === "month" && !loading && estimate && (
                          <motion.div key="month" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }} className="space-y-4">
                            {/* ── Stat cards ── */}
                            {(() => {
                              const rows = estimate.dailyBreakdown ?? [];
                              const daysWithDeductions = rows.filter((r) => r.deduction > 0).length;
                              const daysZeroDedPresent = rows.filter((r) => r.deduction === 0 && r.status === "present").length;
                              const maxDed = rows.reduce((m, r) => Math.max(m, r.deduction), 0);
                              const totalLateMins = rows.reduce((s, r) => s + r.lateMinutes, 0);
                              const totalOfficeMins = rows.reduce((s, r) => s + (r.officeMinutes ?? 0), 0);
                              const totalRemoteMins = rows.reduce((s, r) => s + (r.remoteMinutes ?? 0), 0);
                              const cards: { label: string; value: string; color: string }[] = [
                                { label: "Days present", value: `${estimate.presentDays}/${estimate.workingDays}`, color: "var(--status-present)" },
                                { label: "Absent", value: `${estimate.absentDays}`, color: estimate.absentDays > 0 ? "var(--status-absent)" : "var(--fg)" },
                                { label: "Late", value: `${estimate.lateDays}`, color: estimate.lateDays > 0 ? "var(--status-late)" : "var(--fg)" },
                                { label: "Leave", value: `${estimate.leaveDays}`, color: "var(--teal)" },
                                { label: "Holidays", value: `${estimate.holidays}`, color: "var(--purple)" },
                                { label: "Deduction days", value: `${daysWithDeductions}`, color: daysWithDeductions > 0 ? "var(--rose)" : "var(--fg)" },
                              ];
                              if (daysZeroDedPresent > 0) cards.push({ label: "Clean days", value: `${daysZeroDedPresent}`, color: "var(--green)" });
                              if (maxDed > 0) cards.push({ label: "Max deduction", value: fmt(maxDed), color: "var(--rose)" });
                              if (totalLateMins > 0) cards.push({ label: "Total late", value: `${Math.floor(totalLateMins / 60)}h ${totalLateMins % 60}m`, color: "var(--status-late)" });
                              if (totalOfficeMins > 0 || totalRemoteMins > 0) cards.push({ label: "Office / Remote", value: `${Math.round(totalOfficeMins / 60)}h / ${Math.round(totalRemoteMins / 60)}h`, color: "var(--fg)" });
                              return (
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                  {cards.map((c) => (
                                    <div key={c.label} className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                      <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>{c.label}</p>
                                      <p className="text-[12px] font-bold" style={{ color: c.color }}>{c.value}</p>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                            {/* ── Daily Breakdown ── */}
                            <div>
                            <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                              Daily Breakdown · {MN[month - 1]} {year}
                            </p>
                            <div className="grid grid-cols-[2rem_1fr_3.5rem_3.5rem_3rem_3rem_3rem_3.5rem_3.5rem_3.5rem] gap-x-1 px-2 py-1 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>
                              <span>Day</span><span>Status</span><span className="text-right">In</span><span className="text-right">Out</span><span className="text-right">Office</span><span className="text-right">Remote</span><span className="text-right">Late</span><span className="text-right">Gross</span><span className="text-right">Deduct.</span><span className="text-right">Net</span>
                            </div>
                            <div className="space-y-0.5">
                              {(() => {
                                const dailyGross = estimate.workingDays > 0 ? estimate.grossPay / estimate.workingDays : 0;
                                return (estimate.dailyBreakdown ?? []).map((row, idx) => {
                                const s = SC[row.status] ?? SC.off;
                                const isWork = row.status === "present" || row.status === "late" || row.status === "absent";
                                const rowGross = isWork ? dailyGross : 0;
                                const rowNet = rowGross - row.deduction;
                                return (
                                  <motion.div key={row.day}
                                    className="grid grid-cols-[2rem_1fr_3.5rem_3.5rem_3rem_3rem_3rem_3.5rem_3.5rem_3.5rem] gap-x-1 items-center rounded-lg px-2 py-1.5"
                                    style={{ background: isWork ? "var(--bg-grouped)" : "transparent", opacity: row.status === "future" || row.status === "weekend" || row.status === "holiday" ? 0.45 : 1 }}
                                    initial={{ opacity: 0 }} animate={{ opacity: row.status === "future" || row.status === "weekend" || row.status === "holiday" ? 0.45 : 1 }}
                                    transition={{ duration: 0.15, delay: Math.min(idx * 0.01, 0.3) }}
                                  >
                                    <span className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>{row.day}</span>
                                    <div className="flex items-center gap-1 min-w-0"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} /><span className="text-[12px] font-semibold truncate" style={{ color: s.color }}>{s.label}</span></div>
                                    <span className="text-right text-[12px]" style={{ color: "var(--fg-tertiary)" }}>{fmtTime(row.firstStart)}</span>
                                    <span className="text-right text-[12px]" style={{ color: "var(--fg-tertiary)" }}>{fmtTime(row.lastEnd)}</span>
                                    <span className="text-right text-[12px] font-semibold" style={{ color: (row.officeMinutes ?? 0) > 0 ? "var(--status-office)" : "var(--fg-quaternary)" }}>{(row.officeMinutes ?? 0) > 0 ? fmtMins(row.officeMinutes) : "—"}</span>
                                    <span className="text-right text-[12px] font-semibold" style={{ color: (row.remoteMinutes ?? 0) > 0 ? "var(--status-remote)" : "var(--fg-quaternary)" }}>{(row.remoteMinutes ?? 0) > 0 ? fmtMins(row.remoteMinutes) : "—"}</span>
                                    <span className="text-right text-[12px] font-semibold" style={{ color: row.lateMinutes > 0 ? "var(--status-late)" : "var(--fg-quaternary)" }}>{row.lateMinutes > 0 ? `${row.lateMinutes}m` : "—"}</span>
                                    <span className="text-right text-[12px] font-medium" style={{ color: rowGross > 0 ? "var(--fg)" : "var(--fg-quaternary)" }}>{rowGross > 0 ? fmt(Math.round(rowGross)) : "—"}</span>
                                    <span className="text-right text-[12px] font-semibold" style={{ color: row.deduction > 0 ? "var(--rose)" : "var(--fg-quaternary)" }}>{row.deduction > 0 ? fmt(row.deduction) : "—"}</span>
                                    <span className="text-right text-[12px] font-bold" style={{ color: rowGross > 0 ? "var(--primary)" : "var(--fg-quaternary)" }}>{rowGross > 0 ? fmt(Math.round(rowNet)) : "—"}</span>
                                  </motion.div>
                                );
                              });
                              })()}
                            </div>
                            {estimate.dailyBreakdown && estimate.dailyBreakdown.length > 0 && (
                              <>
                                <div className="grid grid-cols-[2rem_1fr_3.5rem_3.5rem_3rem_3rem_3rem_3.5rem_3.5rem_3.5rem] gap-x-1 items-center rounded-lg border-t px-2 pt-2 pb-1" style={{ borderColor: "var(--border)" }}>
                                  <span /><span className="text-[12px] font-bold uppercase" style={{ color: "var(--fg-tertiary)" }}>Total</span>
                                  <span /><span />
                                  <span className="text-right text-[12px] font-bold" style={{ color: "var(--status-office)" }}>{fmtMins(estimate.dailyBreakdown.reduce((a, r) => a + (r.officeMinutes ?? 0), 0))}</span>
                                  <span className="text-right text-[12px] font-bold" style={{ color: "var(--status-remote)" }}>{fmtMins(estimate.dailyBreakdown.reduce((a, r) => a + (r.remoteMinutes ?? 0), 0))}</span>
                                  <span className="text-right text-[12px] font-bold" style={{ color: "var(--status-late)" }}>{fmtMins(estimate.dailyBreakdown.reduce((a, r) => a + r.lateMinutes, 0))}</span>
                                  <span className="text-right text-[12px] font-bold" style={{ color: "var(--fg)" }}>{fmt(estimate.grossPay)}</span>
                                  <span className="text-right text-[12px] font-bold" style={{ color: "var(--rose)" }}>{fmt(estimate.dailyBreakdown.reduce((a, r) => a + r.deduction, 0))}</span>
                                  <span className="text-right text-[12px] font-bold" style={{ color: "var(--primary)" }}>{fmt(estimate.netPay)}</span>
                                </div>
                              </>
                            )}
                            </div>
                          </motion.div>
                        )}

                        {/* ═══════ ALL-EMPLOYEES: COMBINED VIEW (Overview + Employees) ═══════ */}
                        {allMode && (
                          <motion.div key="all-combined" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }} className="space-y-4">
                            {sheetLoading ? (
                              <div className="space-y-3">
                                <div className="shimmer h-20 rounded-xl" />
                                <div className="grid grid-cols-3 gap-2">{[1,2,3,4,5,6].map((i) => <div key={i} className="shimmer h-14 rounded-xl" />)}</div>
                                <div className="space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="shimmer h-10 rounded-lg" />)}</div>
                              </div>
                            ) : !payrollSheet || !reportSheetTotals ? (
                              <div className="py-8 text-center"><p className="text-[12px] font-medium" style={{ color: "var(--fg-tertiary)" }}>Unable to load payroll data.</p></div>
                            ) : (
                              <>
                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                  {[
                                    { label: "Employees", value: reportSheetTotals.totalEmployees, color: "var(--fg)" },
                                    { label: "Work Days", value: payrollSheet.workingDays, color: "var(--fg)" },
                                    { label: "Holidays", value: payrollSheet.holidays, color: "var(--purple)" },
                                    { label: "Total Gross", value: fmt(reportSheetTotals.totalGrossPay), color: "var(--green)" },
                                    { label: "Total deductions", value: fmt(reportSheetTotals.totalDeductions), color: reportSheetTotals.totalDeductions > 0 ? "var(--rose)" : "var(--fg)" },
                                    { label: "Net Pay", value: fmt(reportSheetTotals.totalNetPay), color: "var(--primary)" },
                                  ].map((s) => (
                                    <div key={s.label} className="rounded-xl p-2 text-center" style={{ background: "var(--bg-grouped)" }}>
                                      <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>{s.label}</p>
                                      <p className="text-[12px] font-bold" style={{ color: s.color }}>{s.value}</p>
                                    </div>
                                  ))}
                                </div>
                                {deptFilter && (() => {
                                  const deptName = deptGroups.find((g) => g.id === deptFilter)?.title ?? "Department";
                                  return <p className="text-[12px] font-semibold rounded-lg px-2.5 py-1" style={{ background: "color-mix(in srgb, var(--primary) 8%, transparent)", color: "var(--primary)" }}>Filtered: {deptName}</p>;
                                })()}

                                {/* ── Employee Payroll Table (merged) ── */}
                                <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Employee Payroll Details{deptFilter ? ` · ${deptGroups.find((g) => g.id === deptFilter)?.title ?? "Department"}` : ""}</p>
                                    <span className="text-[12px] font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
                                      {new Date(payrollSheet.generatedAt).toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
                                    <div className="grid grid-cols-[1.5rem_1fr_2.5rem_2.5rem_2.5rem_2.5rem_2.5rem_4rem_4rem_4.5rem] gap-x-1 px-3 py-2 text-[12px] font-semibold uppercase tracking-wider" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
                                      <span>#</span><span>Employee</span><span className="text-right">Present</span><span className="text-right">Absent</span><span className="text-right">Late</span><span className="text-right">Leave</span><span className="text-right">Attend.</span><span className="text-right">Gross</span><span className="text-right">Deduct.</span><span className="text-right">Net Pay</span>
                                    </div>
                                    {filteredTeamSheet.map((e, i) => (
                                      <button key={e._id} type="button" onClick={() => { setUserId(e._id); setDeptFilter(null); setDetailTab("month"); }}
                                        className="grid w-full grid-cols-[1.5rem_1fr_2.5rem_2.5rem_2.5rem_2.5rem_2.5rem_4rem_4rem_4.5rem] gap-x-1 px-3 py-2 items-center text-left transition-colors hover:bg-[var(--hover-bg)]"
                                        style={{ borderBottom: "1px solid var(--border)" }}
                                      >
                                        <span className="text-[12px] font-medium" style={{ color: "var(--fg-tertiary)" }}>{i + 1}</span>
                                        <div className="min-w-0">
                                          <p className="text-[12px] font-semibold truncate" style={{ color: "var(--fg)" }}>{e.name}</p>
                                          {e.department && <p className="text-[12px] truncate" style={{ color: "var(--fg-tertiary)" }}>{e.department}</p>}
                                        </div>
                                        <span className="text-right text-[12px] font-semibold" style={{ color: "var(--status-present)" }}>{e.presentDays}</span>
                                        <span className="text-right text-[12px] font-semibold" style={{ color: e.absentDays > 0 ? "var(--status-absent)" : "var(--fg-tertiary)" }}>{e.absentDays}</span>
                                        <span className="text-right text-[12px] font-semibold" style={{ color: e.lateDays > 0 ? "var(--status-late)" : "var(--fg-tertiary)" }}>{e.lateDays}</span>
                                        <span className="text-right text-[12px] font-semibold" style={{ color: e.leaveDays > 0 ? "var(--teal)" : "var(--fg-tertiary)" }}>{e.leaveDays}</span>
                                        <span className="text-right text-[12px] font-semibold" style={{ color: e.attendancePct >= 90 ? "var(--status-present)" : e.attendancePct >= 70 ? "var(--status-ontime)" : "var(--status-absent)" }}>{e.attendancePct}%</span>
                                        <span className="text-right text-[12px] font-medium" style={{ color: "var(--fg)" }}>{fmt(e.grossPay)}</span>
                                        <span className="text-right text-[12px] font-medium" style={{ color: e.totalDeductions > 0 ? "var(--rose)" : "var(--fg-tertiary)" }}>{e.totalDeductions > 0 ? `−${fmt(e.totalDeductions)}` : "—"}</span>
                                        <span className="text-right text-[12px] font-bold" style={{ color: "var(--primary)" }}>{fmt(e.netPay)}</span>
                                      </button>
                                    ))}
                                    <div className="grid grid-cols-[1.5rem_1fr_2.5rem_2.5rem_2.5rem_2.5rem_2.5rem_4rem_4rem_4.5rem] gap-x-1 px-3 py-2.5 items-center" style={{ background: "var(--bg-grouped)" }}>
                                      <span /><span className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>Total ({filteredTeamSheet.length})</span>
                                      <span /><span /><span /><span /><span />
                                      <span className="text-right text-[12px] font-bold" style={{ color: "var(--fg)" }}>{fmt(reportSheetTotals.totalGrossPay)}</span>
                                      <span className="text-right text-[12px] font-bold" style={{ color: "var(--rose)" }}>{reportSheetTotals.totalDeductions > 0 ? `−${fmt(reportSheetTotals.totalDeductions)}` : "—"}</span>
                                      <span className="text-right text-[12px] font-bold" style={{ color: "var(--primary)" }}>{fmt(reportSheetTotals.totalNetPay)}</span>
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </motion.div>
                        )}

                        {/* ═══════ YEAR OVERVIEW TAB (single employee only) ═══════ */}
                        {!allMode && detailTab === "year" && (
                          <motion.div key="year" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }} className="space-y-4">
                            {yearLoading ? (
                              <div className="space-y-3">
                                <div className="shimmer h-16 rounded-xl" />
                                {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="shimmer h-10 rounded-lg" />)}
                              </div>
                            ) : (
                              <>
                                {/* Annual stats row */}
                                {yearTotals && (
                                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                    {[
                                      { label: "Work days", value: yearTotals.workingDays, color: "var(--fg)" },
                                      { label: "Days present", value: yearTotals.presentDays, color: "var(--status-present)" },
                                      { label: "Days absent", value: yearTotals.absentDays, color: yearTotals.absentDays > 0 ? "var(--status-absent)" : "var(--fg)" },
                                      { label: "Late days", value: yearTotals.lateDays, color: yearTotals.lateDays > 0 ? "var(--status-late)" : "var(--fg)" },
                                      { label: "Leave days", value: yearTotals.leaveDays, color: "var(--teal)" },
                                    ].map((s) => (
                                      <div key={s.label} className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                        <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>{s.label}</p>
                                        <p className="text-[12px] font-bold" style={{ color: s.color }}>{s.value}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {yearTotals && yearInsightStats && (
                                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                                      {yearInsightStats.bestMonth && yearInsightStats.bestNet != null && (
                                        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Best Month</p>
                                          <p className="text-[12px] font-bold" style={{ color: "var(--primary)" }}>{yearInsightStats.bestMonth}</p>
                                          <p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>{fmt(yearInsightStats.bestNet)} net</p>
                                        </div>
                                      )}
                                      {yearInsightStats.worstMonth && yearInsightStats.worstDed != null && (
                                        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Worst Month</p>
                                          <p className="text-[12px] font-bold" style={{ color: "var(--rose)" }}>{yearInsightStats.worstMonth}</p>
                                          <p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>{yearInsightStats.worstDed > 0 ? `−${fmt(yearInsightStats.worstDed)}` : "—"} deductions</p>
                                        </div>
                                      )}
                                      {yearInsightStats.bestGrossMonth != null && yearInsightStats.bestGross != null && (
                                        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Best Gross</p>
                                          <p className="text-[12px] font-bold" style={{ color: "var(--green)" }}>{MN_SHORT[yearInsightStats.bestGrossMonth]}</p>
                                          <p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>{fmt(yearInsightStats.bestGross)} gross</p>
                                        </div>
                                      )}
                                      {yearInsightStats.worstNetMonth != null && yearInsightStats.worstNet != null && (
                                        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Lowest Net</p>
                                          <p className="text-[12px] font-bold" style={{ color: "var(--rose)" }}>{MN_SHORT[yearInsightStats.worstNetMonth]}</p>
                                          <p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>{fmt(yearInsightStats.worstNet)} net</p>
                                        </div>
                                      )}
                                      {yearInsightStats.lowestDedMonth != null && yearInsightStats.lowestDed != null && (
                                        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Lowest deduction</p>
                                          <p className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>{MN_SHORT[yearInsightStats.lowestDedMonth]}</p>
                                          <p className="text-[12px]" style={{ color: "var(--fg-tertiary)" }}>{yearInsightStats.lowestDed > 0 ? `−${fmt(yearInsightStats.lowestDed)}` : "—"}</p>
                                        </div>
                                      )}
                                      {yearInsightStats.totalOvertimeHours > 0 && (
                                        <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--bg-grouped)" }}>
                                          <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Total overtime</p>
                                          <p className="text-[12px] font-bold" style={{ color: "var(--teal)" }}>{yearInsightStats.totalOvertimeHours.toFixed(1)}h</p>
                                        </div>
                                      )}
                                  </div>
                                )}

                                {/* Monthly rows */}
                                <div>
                                  <p className="text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--fg-tertiary)" }}>Monthly Breakdown</p>
                                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
                                    {/* Header */}
                                    <div className="grid grid-cols-[5rem_1fr_1fr_1fr_1fr_1fr_1fr] gap-x-1 px-3 py-2 text-[12px] font-semibold uppercase tracking-wider" style={{ background: "var(--bg-grouped)", color: "var(--fg-tertiary)" }}>
                                      <span>Month</span><span className="text-right">Present</span><span className="text-right">Absent</span><span className="text-right">Late</span><span className="text-right">Gross</span><span className="text-right">Deductions</span><span className="text-right">Net Pay</span>
                                    </div>
                                    {yearData.map((e, i) => {
                                      const isCur = year === now.getFullYear() && i + 1 === now.getMonth() + 1;
                                      const isSel = i + 1 === month;
                                      return (
                                        <button key={i} type="button"
                                          onClick={() => { setDetailTab("month"); }}
                                          className="grid w-full grid-cols-[5rem_1fr_1fr_1fr_1fr_1fr_1fr] gap-x-1 px-3 py-2 text-left transition-colors hover:bg-[var(--hover-bg)]"
                                          style={{
                                            background: isSel ? "color-mix(in srgb, var(--primary) 6%, transparent)" : "transparent",
                                            borderBottom: "1px solid var(--border)",
                                          }}
                                        >
                                          <span className="text-[12px] font-semibold flex items-center gap-1.5" style={{ color: isSel ? "var(--primary)" : "var(--fg)" }}>
                                            {MN_SHORT[i]}
                                            {isCur && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--green)" }} />}
                                          </span>
                                          {e ? (
                                            <>
                                              <span className="text-right text-[12px] font-medium" style={{ color: "var(--status-present)" }}>{e.presentDays}<span className="text-[12px] font-normal" style={{ color: "var(--fg-tertiary)" }}>/{e.workingDays}</span></span>
                                              <span className="text-right text-[12px] font-medium" style={{ color: e.absentDays > 0 ? "var(--status-absent)" : "var(--fg-tertiary)" }}>{e.absentDays}</span>
                                              <span className="text-right text-[12px] font-medium" style={{ color: e.lateDays > 0 ? "var(--status-late)" : "var(--fg-tertiary)" }}>{e.lateDays}</span>
                                              <span className="text-right text-[12px] font-medium" style={{ color: "var(--fg)" }}>{fmt(e.grossPay)}</span>
                                              <span className="text-right text-[12px] font-medium" style={{ color: e.totalDeductions > 0 ? "var(--rose)" : "var(--fg-tertiary)" }}>{e.totalDeductions > 0 ? `−${fmt(e.totalDeductions)}` : "—"}</span>
                                              <span className="text-right text-[12px] font-bold" style={{ color: "var(--primary)" }}>{fmt(e.netPay)}</span>
                                            </>
                                          ) : (
                                            <span className="col-span-6 text-right text-[12px]" style={{ color: "var(--fg-quaternary)" }}>—</span>
                                          )}
                                        </button>
                                      );
                                    })}
                                    {/* Totals */}
                                    {yearTotals && (
                                      <div className="grid grid-cols-[5rem_1fr_1fr_1fr_1fr_1fr_1fr] gap-x-1 px-3 py-2" style={{ background: "var(--bg-grouped)" }}>
                                        <span className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>Total</span>
                                        <span className="text-right text-[12px] font-bold" style={{ color: "var(--status-present)" }}>{yearTotals.presentDays}<span className="text-[12px] font-normal" style={{ color: "var(--fg-tertiary)" }}>/{yearTotals.workingDays}</span></span>
                                        <span className="text-right text-[12px] font-bold" style={{ color: yearTotals.absentDays > 0 ? "var(--status-absent)" : "var(--fg-tertiary)" }}>{yearTotals.absentDays}</span>
                                        <span className="text-right text-[12px] font-bold" style={{ color: yearTotals.lateDays > 0 ? "var(--status-late)" : "var(--fg-tertiary)" }}>{yearTotals.lateDays}</span>
                                        <span className="text-right text-[12px] font-bold" style={{ color: "var(--fg)" }}>{fmt(yearTotals.grossPay)}</span>
                                        <span className="text-right text-[12px] font-bold" style={{ color: "var(--rose)" }}>{yearTotals.totalDeductions > 0 ? `−${fmt(yearTotals.totalDeductions)}` : "—"}</span>
                                        <span className="text-right text-[12px] font-bold" style={{ color: "var(--primary)" }}>{fmt(yearTotals.netPay)}</span>
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
  );
}
