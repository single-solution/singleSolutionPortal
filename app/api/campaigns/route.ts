import { connectDB } from "@/lib/db";
import Campaign from "@/lib/models/Campaign";
import ActivityTask from "@/lib/models/ActivityTask";
import ChecklistLog from "@/lib/models/ChecklistLog";
import User from "@/lib/models/User";
import Department from "@/lib/models/Department";
import { unauthorized, forbidden, badRequest, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  hasPermission,
  canManageCampaigns,
  getCampaignScopeFilter,
  getSubordinateUserIds,
  getHierarchyDepartmentIds,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isDueToday(rec: { frequency: string; days?: number[] } | undefined): boolean {
  if (!rec || !Array.isArray(rec.days)) return false;
  if (rec.frequency === "weekly") return rec.days.includes(new Date().getDay());
  if (rec.frequency === "monthly") return rec.days.includes(new Date().getDate());
  return false;
}

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();
  void Department;
  void User;

  const filter = hasPermission(actor, "campaigns_view")
    ? await getCampaignScopeFilter(actor)
    : { "tags.employees": actor.id };

  const campaigns = await Campaign.find(filter)
    .populate("tags.employees", "about.firstName about.lastName email")
    .populate("tags.departments", "title slug")
    .populate("createdBy", "about.firstName about.lastName")
    .sort({ updatedAt: -1 })
    .lean();

  const campaignIds = campaigns.map((c) => c._id);
  const today = todayKey();

  const isPrivileged = isSuperAdmin(actor) || hasPermission(actor, "tasks_view");

  const [allTasks, allSubtasks, myLogs, allTodayLogs] = await Promise.all([
    ActivityTask.find({ campaign: { $in: campaignIds }, isActive: true, parentTask: null }).lean(),
    ActivityTask.find({ campaign: { $in: campaignIds }, isActive: true, parentTask: { $ne: null } }).lean(),
    ChecklistLog.find({ employee: actor.id, date: today }).lean(),
    isPrivileged
      ? ChecklistLog.find({ date: today }).lean()
      : Promise.resolve([]),
  ]);

  const doneTaskIds = new Set(myLogs.map((l) => l.task.toString()));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checklistByEmpMap = new Map<string, string[]>();
  if (isPrivileged) {
    for (const log of allTodayLogs) {
      const tid = log.task.toString();
      if (!checklistByEmpMap.has(tid)) checklistByEmpMap.set(tid, []);
      checklistByEmpMap.get(tid)!.push(log.employee.toString());
    }
  }

  const subtasksByParent = new Map<string, typeof allSubtasks>();
  for (const st of allSubtasks) {
    const pid = st.parentTask!.toString();
    if (!subtasksByParent.has(pid)) subtasksByParent.set(pid, []);
    subtasksByParent.get(pid)!.push(st);
  }

  const byCampaign = new Map<string, typeof allTasks>();
  for (const t of allTasks) {
    const cid = t.campaign!.toString();
    if (!byCampaign.has(cid)) byCampaign.set(cid, []);
    byCampaign.get(cid)!.push(t);
  }

  const enriched = campaigns.map((c) => {
    const cid = c._id.toString();
    const tasks = byCampaign.get(cid) ?? [];

    const recurring = tasks.filter((t) => t.recurrence);
    const oneTime = tasks.filter((t) => !t.recurrence);
    const oneTimeDone = oneTime.filter((t) => t.status === "completed").length;

    const todayRecurring = recurring.filter((t) => isDueToday(t.recurrence as { frequency: string; days?: number[] }));
    const todayDone = todayRecurring.filter((t) => doneTaskIds.has(t._id.toString())).length;

    const todayChecklistByEmployee: Record<string, string[]> = {};
    if (isPrivileged) {
      const allRecurringIds = [...todayRecurring.map((t) => t._id.toString())];
      for (const t of todayRecurring) {
        const subs = (subtasksByParent.get(t._id.toString()) ?? [])
          .filter((s) => s.recurrence && isDueToday(s.recurrence as { frequency: string; days?: number[] }));
        for (const s of subs) allRecurringIds.push(s._id.toString());
      }
      for (const tid of allRecurringIds) {
        const emps = checklistByEmpMap.get(tid);
        if (emps) todayChecklistByEmployee[tid] = emps;
      }
    }

    return {
      ...c,
      taskStats: {
        total: oneTime.length,
        completed: oneTimeDone,
        recurring: recurring.length,
        todayDue: todayRecurring.length,
        todayDone,
      },
      todayChecklist: todayRecurring.map((t) => {
        const subs = (subtasksByParent.get(t._id.toString()) ?? [])
          .filter((s) => s.recurrence && isDueToday(s.recurrence as { frequency: string; days?: number[] }));
        return {
          _id: t._id.toString(),
          title: t.title,
          done: doneTaskIds.has(t._id.toString()),
          subtasks: subs.map((s) => ({
            _id: s._id.toString(),
            title: s.title,
            done: doneTaskIds.has(s._id.toString()),
          })),
        };
      }),
      ...(isPrivileged ? { todayChecklistByEmployee } : {}),
    };
  });

  return ok(enriched);
}

export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!canManageCampaigns(actor)) return forbidden();

  await connectDB();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return badRequest("Invalid JSON body"); }

  if (!body.name?.trim()) {
    return badRequest("Campaign name is required");
  }

  const validStatuses = ["active", "paused", "completed", "cancelled"];
  if (body.status && !validStatuses.includes(body.status)) {
    return badRequest(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
  }

  const tagEmployees: string[] = body.tagEmployees ?? [];
  const tagDepartments: string[] = body.tagDepartments ?? [];

  if ((tagEmployees.length > 0 || tagDepartments.length > 0) && !hasPermission(actor, "campaigns_tagEntities")) {
    return forbidden("You don't have permission to tag employees or departments to campaigns");
  }

  if (!isSuperAdmin(actor)) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    const visibleUsers = new Set([actor.id, ...subordinateIds]);
    const visibleDepts = new Set(await getHierarchyDepartmentIds(actor.id));

    if (tagEmployees.length > 0) {
      const allValid = tagEmployees.every((e) => visibleUsers.has(e));
      if (!allValid) return badRequest("Can only tag employees within your hierarchy");
    }
    if (tagDepartments.length > 0) {
      const allValid = tagDepartments.every((d) => visibleDepts.has(d));
      if (!allValid) return badRequest("Can only tag departments within your hierarchy");
    }
  }

  const campaign = await Campaign.create({
    name: body.name.trim(),
    description: body.description ?? "",
    status: body.status ?? "active",
    startDate: body.startDate || undefined,
    endDate: body.endDate || undefined,
    budget: body.budget ?? "",
    tags: {
      employees: tagEmployees,
      departments: tagDepartments,
    },
    notes: body.notes ?? "",
    isActive: true,
    createdBy: actor.id,
  });

  const populated = await Campaign.findById(campaign._id)
    .populate("tags.employees", "about.firstName about.lastName email")
    .populate("tags.departments", "title slug")
    .lean();

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "created campaign",
    entity: "campaign",
    entityId: campaign._id.toString(),
    details: body.name.trim(),
    targetUserIds: tagEmployees,
    targetDepartmentId: tagDepartments[0] || undefined,
    visibility: "targeted",
  });

  return ok(populated);
}
