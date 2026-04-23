import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import Campaign from "@/lib/models/Campaign";
import ActivityTask from "@/lib/models/ActivityTask";
import ChecklistLog from "@/lib/models/ChecklistLog";
import TaskStatusLog from "@/lib/models/TaskStatusLog";
import User from "@/lib/models/User";
import Membership from "@/lib/models/Membership";
import { unauthorized, forbidden, badRequest, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  hasPermission,
  getCampaignScopeFilter,
} from "@/lib/permissions";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(s: string | null): string | null {
  if (!s || !DATE_RE.test(s)) return null;
  return s;
}

function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const s = new Date(Date.UTC(sy, sm - 1, sd));
  const e = new Date(Date.UTC(ey, em - 1, ed));
  if (s > e) return out;
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const da = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${y}-${mo}-${da}`);
  }
  return out;
}

function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function dayOfMonth(dateStr: string): number {
  return Number(dateStr.split("-")[2]);
}

function isRecurringOn(recurrence: { frequency: string; days: number[] } | undefined, dateStr: string): boolean {
  if (!recurrence) return false;
  if (recurrence.frequency === "weekly") return recurrence.days.includes(weekdayOf(dateStr));
  if (recurrence.frequency === "monthly") return recurrence.days.includes(dayOfMonth(dateStr));
  return false;
}

type LeanTask = {
  _id: mongoose.Types.ObjectId;
  title: string;
  assignedTo: mongoose.Types.ObjectId[];
  campaign?: mongoose.Types.ObjectId | null;
  parentTask?: mongoose.Types.ObjectId | null;
  isActive: boolean;
  recurrence?: { frequency: string; days: number[] };
  createdAt: Date;
};

type LeanUser = {
  _id: mongoose.Types.ObjectId;
  about?: { firstName?: string; lastName?: string };
  email?: string;
};

export async function GET(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "campaigns_view")) return forbidden();

  const url = req.nextUrl;
  const startDate = parseDate(url.searchParams.get("startDate"));
  const endDate = parseDate(url.searchParams.get("endDate"));
  if (!startDate || !endDate) return badRequest("startDate and endDate (YYYY-MM-DD) are required");

  const dates = enumerateDates(startDate, endDate);
  if (dates.length === 0) return badRequest("Invalid date range");
  if (dates.length > 62) return badRequest("Date range cannot exceed 62 days");

  const campaignIdParam = url.searchParams.get("campaignId");
  const departmentIdParam = url.searchParams.get("departmentId");
  const employeeIdParam = url.searchParams.get("employeeId");
  const taskIdParam = url.searchParams.get("taskId");

  await connectDB();
  void User;

  const scopeFilter = await getCampaignScopeFilter(actor);
  const campaignFilter: Record<string, unknown> = { ...scopeFilter };
  if (campaignIdParam && mongoose.isValidObjectId(campaignIdParam)) {
    campaignFilter._id = new mongoose.Types.ObjectId(campaignIdParam);
  }

  const campaigns = await Campaign.find(campaignFilter)
    .select("_id name tags.employees tags.departments")
    .lean<Array<{ _id: mongoose.Types.ObjectId; name: string; tags: { employees: mongoose.Types.ObjectId[]; departments: mongoose.Types.ObjectId[] } }>>();

  if (campaigns.length === 0) {
    return ok({ dates, employees: [] });
  }

  const campaignIds = campaigns.map((c) => c._id);

  /* Build candidate employee id set from campaign tags */
  const campaignEmployeeIds = new Set<string>();
  for (const c of campaigns) {
    for (const eid of c.tags?.employees ?? []) campaignEmployeeIds.add(String(eid));
  }

  /* Filter by department via Membership if requested */
  let deptFilteredIds: Set<string> | null = null;
  if (departmentIdParam && mongoose.isValidObjectId(departmentIdParam)) {
    const memberships = await Membership.find({
      department: new mongoose.Types.ObjectId(departmentIdParam),
      isActive: true,
      user: { $in: Array.from(campaignEmployeeIds).map((id) => new mongoose.Types.ObjectId(id)) },
    }).select("user").lean<Array<{ user: mongoose.Types.ObjectId }>>();
    deptFilteredIds = new Set(memberships.map((m) => String(m.user)));
  }

  /* Narrow to a single employee if provided */
  if (employeeIdParam) {
    if (!mongoose.isValidObjectId(employeeIdParam)) return badRequest("Invalid employeeId");
    if (!campaignEmployeeIds.has(employeeIdParam)) {
      return ok({ dates, employees: [] });
    }
    if (deptFilteredIds && !deptFilteredIds.has(employeeIdParam)) {
      return ok({ dates, employees: [] });
    }
  }

  const employeeIdList: string[] = (() => {
    if (employeeIdParam) return [employeeIdParam];
    const base = deptFilteredIds ?? campaignEmployeeIds;
    return Array.from(base);
  })();

  if (employeeIdList.length === 0) {
    return ok({ dates, employees: [] });
  }

  /* Fetch tasks: root tasks of these campaigns (optionally narrowed to taskId) */
  const taskFilter: Record<string, unknown> = {
    campaign: { $in: campaignIds },
    parentTask: null,
    isActive: true,
  };
  if (taskIdParam) {
    if (!mongoose.isValidObjectId(taskIdParam)) return badRequest("Invalid taskId");
    taskFilter._id = new mongoose.Types.ObjectId(taskIdParam);
  }

  const tasks = await ActivityTask.find(taskFilter)
    .select("_id title assignedTo campaign parentTask isActive recurrence createdAt")
    .lean<LeanTask[]>();

  /* Fetch users (only those we'll display) */
  const users = await User.find({ _id: { $in: employeeIdList.map((id) => new mongoose.Types.ObjectId(id)) } })
    .select("_id about.firstName about.lastName email")
    .lean<LeanUser[]>();
  const userById = new Map(users.map((u) => [String(u._id), u]));

  /* Index tasks per employee */
  const recurringByEmp = new Map<string, LeanTask[]>();
  const oneTimeByEmp = new Map<string, LeanTask[]>();
  for (const t of tasks) {
    const assignedTo = (t.assignedTo ?? []).map(String);
    const bucket = t.recurrence ? recurringByEmp : oneTimeByEmp;
    for (const eid of assignedTo) {
      if (!employeeIdList.includes(eid)) continue;
      const arr = bucket.get(eid) ?? [];
      arr.push(t);
      bucket.set(eid, arr);
    }
  }

  /* Fetch ChecklistLog for recurring completions within the date range */
  const taskIds = tasks.map((t) => t._id);
  const checklistLogs = taskIds.length > 0
    ? await ChecklistLog.find({
        task: { $in: taskIds },
        employee: { $in: employeeIdList.map((id) => new mongoose.Types.ObjectId(id)) },
        date: { $gte: startDate, $lte: endDate },
      })
        .select("task employee date")
        .lean<Array<{ task: mongoose.Types.ObjectId; employee: mongoose.Types.ObjectId; date: string }>>()
    : [];

  const checklistSet = new Set<string>();
  for (const log of checklistLogs) {
    checklistSet.add(`${String(log.employee)}|${String(log.task)}|${log.date}`);
  }

  /* Fetch TaskStatusLog completions for one-time tasks within the date range */
  const oneTimeTaskIds = tasks.filter((t) => !t.recurrence).map((t) => t._id);
  const statusLogs = oneTimeTaskIds.length > 0
    ? await TaskStatusLog.find({
        task: { $in: oneTimeTaskIds },
        employee: { $in: employeeIdList.map((id) => new mongoose.Types.ObjectId(id)) },
        status: "completed",
        eventType: "statusChange",
        date: { $gte: startDate, $lte: endDate },
      })
        .select("task employee date")
        .lean<Array<{ task: mongoose.Types.ObjectId; employee: mongoose.Types.ObjectId; date: string }>>()
    : [];

  /* First completion per (employee,task) — if marked again it still counts once */
  const oneTimeDoneSet = new Set<string>();
  for (const log of statusLogs) {
    oneTimeDoneSet.add(`${String(log.employee)}|${String(log.task)}|${log.date}`);
  }

  /* Build output */
  const employees = employeeIdList
    .map((eid) => {
      const u = userById.get(eid);
      if (!u) return null;
      const name = `${u.about?.firstName ?? ""} ${u.about?.lastName ?? ""}`.trim() || u.email || "Unknown";
      const recurring = recurringByEmp.get(eid) ?? [];
      const oneTime = oneTimeByEmp.get(eid) ?? [];

      const days = dates.map((date) => {
        const dueRecurring = recurring.filter((t) => isRecurringOn(t.recurrence, date));
        const totalChecklists = dueRecurring.length;
        let doneChecklists = 0;
        for (const t of dueRecurring) {
          if (checklistSet.has(`${eid}|${String(t._id)}|${date}`)) doneChecklists++;
        }
        const dateEndTs = new Date(`${date}T23:59:59.999Z`).getTime();
        const activeOneTime = oneTime.filter((t) => new Date(t.createdAt).getTime() <= dateEndTs);
        const oneTimeTotal = activeOneTime.length;
        let oneTimeDone = 0;
        for (const t of activeOneTime) {
          if (oneTimeDoneSet.has(`${eid}|${String(t._id)}|${date}`)) oneTimeDone++;
        }
        const pctChecked = totalChecklists === 0 ? null : Math.round((doneChecklists / totalChecklists) * 100);
        return { date, pctChecked, totalChecklists, doneChecklists, oneTimeDone, oneTimeTotal };
      });

      return { _id: eid, name, email: u.email ?? "", days };
    })
    .filter(Boolean);

  employees.sort((a, b) => (a!.name || "").localeCompare(b!.name || ""));

  return ok({ dates, employees });
}
