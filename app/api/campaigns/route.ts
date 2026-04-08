import { connectDB } from "@/lib/db";
import Campaign from "@/lib/models/Campaign";
import User from "@/lib/models/User";
import Department from "@/lib/models/Department";
import Team from "@/lib/models/Team";
import { unauthorized, forbidden, badRequest, ok } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  isManager,
  isTeamLead,
  canManageCampaigns,
  getCampaignScopeFilter,
  getDeptEmployeeIds,
  getDeptTeamIds,
  getTeamMemberIds,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();
  void Department;
  void Team;
  void User;

  const filter = await getCampaignScopeFilter(actor);

  const campaigns = await Campaign.find(filter)
    .populate("tags.employees", "about.firstName about.lastName email")
    .populate("tags.departments", "title slug")
    .populate("tags.teams", "name slug")
    .populate("createdBy", "about.firstName about.lastName")
    .sort({ updatedAt: -1 })
    .lean();

  return ok(campaigns);
}

export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!canManageCampaigns(actor)) return forbidden();

  await connectDB();
  const body = await req.json();

  if (!body.name?.trim()) {
    return badRequest("Campaign name is required");
  }

  const validStatuses = ["active", "paused", "completed", "cancelled"];
  if (body.status && !validStatuses.includes(body.status)) {
    return badRequest(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
  }

  const tagEmployees: string[] = body.tagEmployees ?? [];
  const tagDepartments: string[] = body.tagDepartments ?? [];
  const tagTeams: string[] = body.tagTeams ?? [];

  const actorTeamIds = actor.memberships.filter((m) => m.teamId).map((m) => m.teamId!);
  const primaryDeptId = actor.memberships[0]?.departmentId;

  if (!isSuperAdmin(actor)) {
    if (isManager(actor)) {
      if (primaryDeptId) {
        if (tagDepartments.length > 0) {
          const valid = tagDepartments.every((d) => d === primaryDeptId);
          if (!valid) return badRequest("Can only tag your own department");
        }
        if (tagTeams.length > 0) {
          const deptTeams = await getDeptTeamIds(primaryDeptId);
          const allValid = tagTeams.every((t) => deptTeams.includes(t));
          if (!allValid) return badRequest("Can only tag teams in your department");
        }
        if (tagEmployees.length > 0) {
          const deptEmps = await getDeptEmployeeIds(primaryDeptId);
          const allValid = tagEmployees.every((e) => deptEmps.includes(e));
          if (!allValid) return badRequest("Can only tag employees in your department");
        }
      }
    } else if (isTeamLead(actor)) {
      if (tagDepartments.length > 0) {
        return badRequest("Team leads cannot tag departments — tag employees instead");
      }
      if (tagTeams.length > 0) {
        const allValid = tagTeams.every((t) => actorTeamIds.includes(t));
        if (!allValid) return badRequest("Can only tag teams you lead");
      }
      if (tagEmployees.length > 0) {
        const memberIds = await getTeamMemberIds(actorTeamIds);
        const selfAndMembers = [...memberIds, actor.id];
        const allValid = tagEmployees.every((e) => selfAndMembers.includes(e));
        if (!allValid) return badRequest("Can only tag members of your teams");
      }
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
      teams: tagTeams,
    },
    notes: body.notes ?? "",
    isActive: true,
    createdBy: actor.id,
  });

  const populated = await Campaign.findById(campaign._id)
    .populate("tags.employees", "about.firstName about.lastName email")
    .populate("tags.departments", "title slug")
    .populate("tags.teams", "name slug")
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
    targetTeamIds: tagTeams,
    visibility: tagEmployees.length === 0 && tagDepartments.length === 0 && tagTeams.length === 0 ? "all" : "targeted",
  });

  return ok(populated);
}
