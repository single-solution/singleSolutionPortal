import { NextRequest } from "next/server";
import Campaign from "@/lib/models/Campaign";
import ActivityTask from "@/lib/models/ActivityTask";
import ChecklistLog from "@/lib/models/ChecklistLog";
import "@/lib/models/User";
import { unauthorized, forbidden, badRequest, notFound, ok, isValidId } from "@/lib/helpers";
import {
  getVerifiedSession,
  hasPermission,
  getCampaignScopeFilter,
} from "@/lib/permissions";

/**
 * GET /api/campaigns/[id]/checklist/overview?days=7
 * Returns completion grid for all tagged employees' recurring tasks over a date range.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "campaigns_view")) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  const scopeFilter = await getCampaignScopeFilter(actor);
  const campaign = await Campaign.findOne({ _id: id, ...scopeFilter })
    .populate("tags.employees", "about.firstName about.lastName email")
    .lean();
  if (!campaign) return notFound("Campaign not found");

  const recurringTasks = await ActivityTask.find({
    campaign: id,
    isActive: true,
    recurrence: { $exists: true, $ne: null },
    parentTask: null,
  }).lean();

  if (recurringTasks.length === 0) {
    return ok({ dates: [], tasks: [], employees: [] });
  }

  const days = Math.min(Number(req.nextUrl.searchParams.get("days")) || 7, 30);
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }

  const taskIds = recurringTasks.map((t) => t._id);
  const logs = await ChecklistLog.find({
    task: { $in: taskIds },
    date: { $in: dates },
  }).lean();

  // Map: employeeId -> date -> Set<taskId>
  const grid = new Map<string, Map<string, Set<string>>>();
  for (const log of logs) {
    const eid = log.employee.toString();
    if (!grid.has(eid)) grid.set(eid, new Map());
    const dateMap = grid.get(eid)!;
    if (!dateMap.has(log.date)) dateMap.set(log.date, new Set());
    dateMap.get(log.date)!.add(log.task.toString());
  }

  const tasks = recurringTasks.map((t) => ({
    _id: t._id.toString(),
    title: t.title,
    frequency: (t.recurrence as { frequency: string })?.frequency,
  }));
  const totalTasks = tasks.length;

  const employees = (campaign.tags.employees as unknown as Array<{
    _id: { toString(): string };
    about: { firstName: string; lastName: string };
    email: string;
  }>).map((emp) => {
    const eid = emp._id.toString();
    const dateMap = grid.get(eid);
    const byDate = dates.map((date) => {
      const doneSet = dateMap?.get(date);
      const doneCount = doneSet ? doneSet.size : 0;
      return { date, done: doneCount, total: totalTasks };
    });
    return {
      _id: eid,
      name: `${emp.about.firstName} ${emp.about.lastName}`.trim(),
      email: emp.email,
      byDate,
    };
  });

  return ok({ dates, tasks, employees });
}
