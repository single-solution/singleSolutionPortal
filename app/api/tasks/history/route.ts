import { NextRequest } from "next/server";
import TaskStatusLog from "@/lib/models/TaskStatusLog";
import ActivityTask from "@/lib/models/ActivityTask";
import ChecklistLog from "@/lib/models/ChecklistLog";
import Campaign from "@/lib/models/Campaign";
import User from "@/lib/models/User";
import { unauthorized, forbidden, ok, badRequest, isValidId } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  hasPermission,
  getSubordinateUserIds,
} from "@/lib/permissions";

const VALID_TYPES = ["daily", "detail", "employee-timeline", "campaign-employees"];

/**
 * GET /api/tasks/history
 *
 * Query params:
 *   type        = "daily" | "detail" | "employee-timeline" | "campaign-employees"
 *   year, month = calendar scope (required for daily)
 *   date        = YYYY-MM-DD (required for detail)
 *   campaignId  = optional filter (required for campaign-employees)
 *   taskId      = optional filter
 *   userId      = optional employee filter
 *   days        = number of days for multi-day grid (campaign-employees, default 7)
 *   page, limit = pagination (employee-timeline)
 */
export async function GET(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");
  if (!type || !VALID_TYPES.includes(type)) {
    return badRequest(`type must be one of: ${VALID_TYPES.join(", ")}`);
  }

  const isPrivileged = isSuperAdmin(actor) || hasPermission(actor, "tasks_view") || hasPermission(actor, "tasks_viewTeamProgress");

  const campaignId = sp.get("campaignId") || undefined;
  const taskId = sp.get("taskId") || undefined;
  const userId = sp.get("userId") || undefined;

  if (userId && userId !== actor.id && !isPrivileged) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    if (!subordinateIds.includes(userId)) return forbidden();
  }

  if (type === "daily") {
    const year = Number(sp.get("year"));
    const month = Number(sp.get("month"));
    if (!year || !month || month < 1 || month > 12) return badRequest("year and month required");

    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const dateFrom = `${prefix}-01`;
    const dateTo = `${prefix}-${String(daysInMonth).padStart(2, "0")}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = { date: { $gte: dateFrom, $lte: dateTo } };
    if (campaignId) filter.campaign = campaignId;
    if (taskId) filter.task = taskId;
    if (userId) {
      filter.employee = userId;
    } else if (!isPrivileged) {
      filter.employee = actor.id;
    }

    const logs = await TaskStatusLog.find(filter)
      .populate("task", "title recurrence parentTask")
      .populate("employee", "about.firstName about.lastName email")
      .populate("campaign", "name")
      .sort({ date: 1, changedAt: 1 })
      .limit(5000)
      .lean();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byDate = new Map<string, any[]>();
    for (const log of logs) {
      const d = log.date;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push({
        _id: log._id,
        task: log.task,
        campaign: log.campaign,
        employee: log.employee,
        status: log.status,
        eventType: log.eventType,
        changedAt: log.changedAt,
        note: log.note,
      });
    }

    const result = Array.from(byDate.entries()).map(([date, events]) => {
      const completed = events.filter((e) => e.status === "completed" || e.eventType === "checklistComplete").length;
      const undone = events.filter((e) => e.status === "undone" || e.eventType === "checklistUndo").length;
      return { date, completedCount: completed, undoneCount: undone, totalEvents: events.length, events };
    });

    return ok(result);
  }

  if (type === "detail") {
    const date = sp.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return badRequest("date (YYYY-MM-DD) required");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = { date };
    if (campaignId) filter.campaign = campaignId;
    if (taskId) filter.task = taskId;
    if (userId) {
      filter.employee = userId;
    } else if (!isPrivileged) {
      filter.employee = actor.id;
    }

    const logs = await TaskStatusLog.find(filter)
      .populate("task", "title recurrence parentTask assignedTo")
      .populate("employee", "about.firstName about.lastName email")
      .populate("campaign", "name")
      .populate("changedBy", "about.firstName about.lastName email")
      .sort({ changedAt: -1 })
      .limit(500)
      .lean();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byCampaign = new Map<string, { campaign: any; events: any[] }>();
    for (const log of logs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cKey = (log.campaign as any)?._id?.toString() || "uncategorized";
      if (!byCampaign.has(cKey)) {
        byCampaign.set(cKey, {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          campaign: (log.campaign as any) || { _id: "uncategorized", name: "Uncategorized" },
          events: [],
        });
      }
      byCampaign.get(cKey)!.events.push({
        _id: log._id,
        task: log.task,
        employee: log.employee,
        changedBy: log.changedBy,
        status: log.status,
        eventType: log.eventType,
        changedAt: log.changedAt,
        note: log.note,
      });
    }

    return ok(Array.from(byCampaign.values()));
  }

  if (type === "employee-timeline") {
    const targetUserId = userId || actor.id;
    if (targetUserId !== actor.id && !isPrivileged) {
      const subordinateIds = await getSubordinateUserIds(actor.id);
      if (!subordinateIds.includes(targetUserId)) return forbidden();
    }

    const page = Math.max(1, Number(sp.get("page")) || 1);
    const limit = Math.min(200, Math.max(10, Number(sp.get("limit")) || 50));
    const from = sp.get("from") || undefined;
    const to = sp.get("to") || undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = { employee: targetUserId };
    if (campaignId) filter.campaign = campaignId;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to) filter.date.$lte = to;
    }

    const [logs, total] = await Promise.all([
      TaskStatusLog.find(filter)
        .populate("task", "title recurrence parentTask")
        .populate("campaign", "name")
        .populate("changedBy", "about.firstName about.lastName email")
        .sort({ changedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      TaskStatusLog.countDocuments(filter),
    ]);

    const employee = await User.findById(targetUserId)
      .select("about.firstName about.lastName email")
      .lean();

    return ok({ employee, logs, total, page, limit, totalPages: Math.ceil(total / limit) });
  }

  /* ─── campaign-employees: per-employee progress grid ─── */
  if (type === "campaign-employees") {
    if (!isPrivileged) return forbidden();

    const days = Math.min(Number(sp.get("days")) || 7, 30);
    const dateStrs: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dateStrs.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
    }
    const today = dateStrs[dateStrs.length - 1];

    // Accept optional `date` param to query a specific day instead of today
    const specificDate = sp.get("date") || null;
    const targetDate = specificDate && /^\d{4}-\d{2}-\d{2}$/.test(specificDate) ? specificDate : today;

    if (campaignId && isValidId(campaignId)) {
      const campaign = await Campaign.findById(campaignId)
        .populate("tags.employees", "about.firstName about.lastName email")
        .lean();
      if (!campaign) return ok({ employees: [] });

      const allTasks = await ActivityTask.find({ campaign: campaignId, isActive: true })
        .sort({ sortOrder: 1, createdAt: 1 })
        .lean();

      const taskIds = allTasks.map((t) => t._id);

      const [checklistLogs, statusLogs] = await Promise.all([
        ChecklistLog.find({ task: { $in: taskIds }, date: targetDate }).lean(),
        TaskStatusLog.find({
          task: { $in: taskIds },
          date: targetDate,
          eventType: { $in: ["checklistComplete", "statusChange"] },
          status: "completed",
        }).lean(),
      ]);

      // taskId -> Set<empId>
      const taskCompletionsSingle = new Map<string, Set<string>>();
      const addC = (tId: string, empId: string) => {
        if (!taskCompletionsSingle.has(tId)) taskCompletionsSingle.set(tId, new Set());
        taskCompletionsSingle.get(tId)!.add(empId);
      };
      for (const cl of checklistLogs) addC(cl.task.toString(), cl.employee.toString());
      for (const sl of statusLogs) addC(sl.task.toString(), sl.employee.toString());

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const taggedEmps = (campaign.tags?.employees || []) as any[];
      const parentTasks = allTasks.filter((t) => !t.parentTask);
      const childTasks = allTasks.filter((t) => !!t.parentTask);

      interface SNode {
        _id: string; title: string; recurrence: { frequency?: string; days?: number[] } | null;
        description: string | null; doneCount: number; totalCount: number;
        employees: { _id: string; name: string; done: boolean }[];
        subtasks: SNode[];
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buildNode = (t: any): SNode => {
        const tid = t._id.toString();
        const completedBy = taskCompletionsSingle.get(tid) || new Set<string>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const emps = taggedEmps.map((emp: any) => ({
          _id: emp._id.toString(),
          name: `${emp.about.firstName} ${emp.about.lastName}`.trim(),
          done: completedBy.has(emp._id.toString()),
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subs: SNode[] = childTasks
          .filter((c: { parentTask?: { toString(): string } | null }) => c.parentTask?.toString() === tid)
          .map((s: unknown) => buildNode(s));
        return {
          _id: tid, title: t.title,
          recurrence: t.recurrence ? { frequency: t.recurrence.frequency, days: t.recurrence.days } : null,
          description: t.description || null,
          doneCount: emps.filter((e: { done: boolean }) => e.done).length,
          totalCount: emps.length, employees: emps, subtasks: subs,
        };
      };

      const tasks = parentTasks.map(buildNode);

      // Per-employee view: each employee gets all task nodes with their personal done status
      interface EmpTNode {
        _id: string; title: string; recurrence: SNode["recurrence"];
        description: string | null; done: boolean; subtasks: EmpTNode[];
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const employees = taggedEmps.map((emp: any) => {
        const eid = emp._id.toString();
        const filterForEmp = (nodes: SNode[]): EmpTNode[] =>
          nodes.map((n) => ({
            _id: n._id, title: n.title, recurrence: n.recurrence, description: n.description,
            done: n.employees.find((e) => e._id === eid)?.done || false,
            subtasks: filterForEmp(n.subtasks),
          }));

        const empTasks = filterForEmp(tasks);
        const todayDone = empTasks.filter((t: EmpTNode) => t.done).length;
        return {
          _id: eid,
          name: `${emp.about.firstName} ${emp.about.lastName}`.trim(),
          email: emp.email,
          todayDone,
          todayTotal: parentTasks.length,
          tasks: empTasks,
        };
      });

      return ok({ date: targetDate, employees, campaignTasks: tasks });
    }

    // No campaignId: return per-campaign grouped data (same sort as workspace)
    const specificDateGrouped = sp.get("date") || null;
    const targetDateGrouped = specificDateGrouped && /^\d{4}-\d{2}-\d{2}$/.test(specificDateGrouped) ? specificDateGrouped : today;

    const allCampaigns = await Campaign.find({ isActive: true })
      .populate("tags.employees", "about.firstName about.lastName email")
      .sort({ updatedAt: -1 })
      .lean();

    // Collect all task IDs across campaigns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const campaignTasksMap = new Map<string, any[]>();
    const allTaskIds: string[] = [];

    for (const camp of allCampaigns) {
      const tasks = await ActivityTask.find({ campaign: camp._id, isActive: true })
        .sort({ sortOrder: 1, createdAt: 1 })
        .lean();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      campaignTasksMap.set(camp._id.toString(), tasks as any);
      for (const t of tasks) allTaskIds.push(t._id.toString());
    }

    const [allChecklistLogs, allStatusLogs] = await Promise.all([
      ChecklistLog.find({ task: { $in: allTaskIds }, date: targetDateGrouped }).lean(),
      TaskStatusLog.find({
        task: { $in: allTaskIds },
        date: targetDateGrouped,
        eventType: { $in: ["checklistComplete", "statusChange"] },
        status: "completed",
      }).lean(),
    ]);

    // taskId -> Set<empId>
    const taskCompletions = new Map<string, Set<string>>();
    const addCompletion = (tId: string, empId: string) => {
      if (!taskCompletions.has(tId)) taskCompletions.set(tId, new Set());
      taskCompletions.get(tId)!.add(empId);
    };
    for (const cl of allChecklistLogs) addCompletion(cl.task.toString(), cl.employee.toString());
    for (const sl of allStatusLogs) addCompletion(sl.task.toString(), sl.employee.toString());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taggedEmpsMap = new Map<string, any[]>();
    for (const camp of allCampaigns) {
      taggedEmpsMap.set(camp._id.toString(), (camp.tags?.employees || []) as Array<{ _id: { toString(): string }; about: { firstName: string; lastName: string }; email: string }>);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const campaignsResult = allCampaigns.map((camp: any) => {
      const cid = camp._id.toString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allTasks = (campaignTasksMap.get(cid) || []) as any[];
      const parentTasks = allTasks.filter((t: { parentTask?: unknown }) => !t.parentTask);
      const childTasks = allTasks.filter((t: { parentTask?: unknown }) => !!t.parentTask);
      const taggedEmps = taggedEmpsMap.get(cid) || [];

      interface TNode {
        _id: string; title: string; recurrence: { frequency?: string; days?: number[] } | null;
        description: string | null; doneCount: number; totalCount: number;
        employees: { _id: string; name: string; done: boolean }[];
        subtasks: TNode[];
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buildTaskNode = (t: any): TNode => {
        const tid = t._id.toString();
        const completedBy = taskCompletions.get(tid) || new Set<string>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const employees = taggedEmps.map((emp: any) => ({
          _id: emp._id.toString(),
          name: `${emp.about.firstName} ${emp.about.lastName}`.trim(),
          done: completedBy.has(emp._id.toString()),
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subtasks: TNode[] = childTasks
          .filter((c: { parentTask?: { toString(): string } | null }) => c.parentTask?.toString() === tid)
          .map((s: unknown) => buildTaskNode(s));
        return {
          _id: tid,
          title: t.title,
          recurrence: t.recurrence ? { frequency: t.recurrence.frequency, days: t.recurrence.days } : null,
          description: t.description || null,
          doneCount: employees.filter((e: { done: boolean }) => e.done).length,
          totalCount: employees.length,
          employees,
          subtasks,
        };
      };

      const tasks = parentTasks.map((t: { _id: { toString(): string }; title: string; recurrence?: { frequency?: string; days?: number[] } | null; description?: string }) => buildTaskNode(t));
      return {
        _id: cid,
        name: camp.name,
        totalTasks: parentTasks.length,
        employeeCount: taggedEmps.length,
        tasks,
      };
    });

    return ok({ grouped: true, dates: [targetDateGrouped], campaigns: campaignsResult });
  }

  return badRequest("Unknown type");
}
