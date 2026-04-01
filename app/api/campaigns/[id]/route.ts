import { connectDB } from "@/lib/db";
import Campaign from "@/lib/models/Campaign";
import User from "@/lib/models/User";
import Team from "@/lib/models/Team";
import Department from "@/lib/models/Department";
import { unauthorized, forbidden, badRequest, notFound, ok, isValidId } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  isManager,
  isTeamLead,
  canManageCampaigns,
  canDeleteCampaign,
  getCampaignScopeFilter,
  getDeptEmployeeIds,
  getDeptTeamIds,
  getTeamMemberIds,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();
  void Department;
  void Team;
  void User;

  const scopeFilter = await getCampaignScopeFilter(actor);
  const campaign = await Campaign.findOne({ _id: id, ...scopeFilter })
    .populate("tags.employees", "about.firstName about.lastName email userRole")
    .populate("tags.departments", "title slug")
    .populate("tags.teams", "name slug")
    .populate("createdBy", "about.firstName about.lastName")
    .lean();

  if (!campaign) return notFound("Campaign not found");

  return ok(campaign);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!canManageCampaigns(actor)) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const scopeFilter = await getCampaignScopeFilter(actor);
  const campaign = await Campaign.findOne({ _id: id, ...scopeFilter });
  if (!campaign) return notFound("Campaign not found or outside your scope");

  const body = await req.json();

  const validStatuses = ["active", "paused", "completed", "cancelled"];
  if (body.status !== undefined && !validStatuses.includes(body.status)) {
    return badRequest(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
  }

  const tagEmployees: string[] | undefined = body.tagEmployees;
  const tagDepartments: string[] | undefined = body.tagDepartments;
  const tagTeams: string[] | undefined = body.tagTeams;

  if (!isSuperAdmin(actor)) {
    if (isManager(actor)) {
      if (!actor.crossDepartmentAccess && actor.department) {
        if (tagDepartments !== undefined && tagDepartments.length > 0) {
          const valid = tagDepartments.every((d) => d === actor.department);
          if (!valid) return badRequest("Can only tag your own department");
        }
        if (tagTeams !== undefined && tagTeams.length > 0) {
          const deptTeams = await getDeptTeamIds(actor.department);
          const allValid = tagTeams.every((t) => deptTeams.includes(t));
          if (!allValid) return badRequest("Can only tag teams in your department");
        }
        if (tagEmployees !== undefined && tagEmployees.length > 0) {
          const deptEmps = await getDeptEmployeeIds(actor.department);
          const allValid = tagEmployees.every((e) => deptEmps.includes(e));
          if (!allValid) return badRequest("Can only tag employees in your department");
        }
      }
    } else if (isTeamLead(actor)) {
      if (tagDepartments !== undefined && tagDepartments.length > 0) {
        return badRequest("Team leads cannot tag departments — tag specific teams instead");
      }
      if (tagTeams !== undefined && tagTeams.length > 0) {
        const allValid = tagTeams.every((t) => actor.leadOfTeams.includes(t));
        if (!allValid) return badRequest("Can only tag teams you lead");
      }
      if (tagEmployees !== undefined && tagEmployees.length > 0) {
        const memberIds = await getTeamMemberIds(actor.leadOfTeams);
        const selfAndMembers = [...memberIds, actor.id];
        const allValid = tagEmployees.every((e) => selfAndMembers.includes(e));
        if (!allValid) return badRequest("Can only tag members of your teams");
      }
    }
  }

  if (body.name !== undefined) campaign.name = body.name.trim();
  if (body.description !== undefined) campaign.description = body.description;
  if (body.status !== undefined) campaign.status = body.status;
  if (body.startDate !== undefined) campaign.startDate = body.startDate || undefined;
  if (body.endDate !== undefined) campaign.endDate = body.endDate || undefined;
  if (body.budget !== undefined) campaign.budget = body.budget;
  if (body.notes !== undefined) campaign.notes = body.notes;
  if (typeof body.isActive === "boolean") campaign.isActive = body.isActive;

  if (tagEmployees !== undefined) campaign.tags.employees = tagEmployees as typeof campaign.tags.employees;
  if (tagDepartments !== undefined) campaign.tags.departments = tagDepartments as typeof campaign.tags.departments;
  if (tagTeams !== undefined) campaign.tags.teams = tagTeams as typeof campaign.tags.teams;

  campaign.updatedBy = actor.id as unknown as typeof campaign.updatedBy;
  await campaign.save();

  const populated = await Campaign.findById(id)
    .populate("tags.employees", "about.firstName about.lastName email userRole")
    .populate("tags.departments", "title slug")
    .populate("tags.teams", "name slug")
    .lean();

  const statusChange = body.status ? ` → ${body.status}` : "";
  const updatedEmps = (campaign.tags.employees as unknown as string[]).map((e) => e.toString());
  const updatedDepts = (campaign.tags.departments as unknown as string[]).map((d) => d.toString());
  const updatedTeamsArr = (campaign.tags.teams as unknown as string[]).map((t) => t.toString());
  logActivity({
    userEmail: actor.email,
    userName: "",
    userRole: actor.role,
    action: `updated campaign${statusChange}`,
    entity: "campaign",
    entityId: id,
    details: campaign.name,
    targetUserIds: updatedEmps,
    targetDepartmentId: updatedDepts[0] || undefined,
    targetTeamIds: updatedTeamsArr,
    visibility: updatedEmps.length === 0 && updatedDepts.length === 0 && updatedTeamsArr.length === 0 ? "all" : "targeted",
  });

  return ok(populated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!canDeleteCampaign(actor)) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const scopeFilter = await getCampaignScopeFilter(actor);
  const campaign = await Campaign.findOne({ _id: id, ...scopeFilter });
  if (!campaign) return notFound("Campaign not found or outside your scope");

  campaign.isActive = false;
  await campaign.save();

  const delEmps = (campaign.tags.employees as unknown as string[]).map((e) => e.toString());
  const delDepts = (campaign.tags.departments as unknown as string[]).map((d) => d.toString());
  const delTeamsArr = (campaign.tags.teams as unknown as string[]).map((t) => t.toString());
  logActivity({
    userEmail: actor.email,
    userName: "",
    userRole: actor.role,
    action: "deleted campaign",
    entity: "campaign",
    entityId: id,
    details: campaign.name,
    targetUserIds: delEmps,
    targetDepartmentId: delDepts[0] || undefined,
    targetTeamIds: delTeamsArr,
  });

  return ok({ message: "Campaign deactivated" });
}
