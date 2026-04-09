import { connectDB } from "@/lib/db";
import Campaign from "@/lib/models/Campaign";
import User from "@/lib/models/User";
import Department from "@/lib/models/Department";
import { unauthorized, forbidden, badRequest, notFound, ok, isValidId } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  canManageCampaigns,
  canDeleteCampaign,
  getCampaignScopeFilter,
  getSubordinateUserIds,
  getHierarchyDepartmentIds,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();
  void Department;
  void User;

  const scopeFilter = await getCampaignScopeFilter(actor);
  const campaign = await Campaign.findOne({ _id: id, ...scopeFilter })
    .populate("tags.employees", "about.firstName about.lastName email")
    .populate("tags.departments", "title slug")
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

  if (!isSuperAdmin(actor)) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    const visibleUsers = new Set([actor.id, ...subordinateIds]);
    const visibleDepts = new Set(await getHierarchyDepartmentIds(actor.id));

    if (tagEmployees !== undefined && tagEmployees.length > 0) {
      const allValid = tagEmployees.every((e) => visibleUsers.has(e));
      if (!allValid) return badRequest("Can only tag employees within your hierarchy");
    }
    if (tagDepartments !== undefined && tagDepartments.length > 0) {
      const allValid = tagDepartments.every((d) => visibleDepts.has(d));
      if (!allValid) return badRequest("Can only tag departments within your hierarchy");
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

  campaign.updatedBy = actor.id as unknown as typeof campaign.updatedBy;
  await campaign.save();

  const populated = await Campaign.findById(id)
    .populate("tags.employees", "about.firstName about.lastName email")
    .populate("tags.departments", "title slug")
    .lean();

  const statusChange = body.status ? ` → ${body.status}` : "";
  const updatedEmps = (campaign.tags.employees as unknown as string[]).map((e) => e.toString());
  const updatedDepts = (campaign.tags.departments as unknown as string[]).map((d) => d.toString());
  logActivity({
    userEmail: actor.email,
    userName: "",
    action: `updated campaign${statusChange}`,
    entity: "campaign",
    entityId: id,
    details: campaign.name,
    targetUserIds: updatedEmps,
    targetDepartmentId: updatedDepts[0] || undefined,
    visibility: updatedEmps.length === 0 && updatedDepts.length === 0 ? "all" : "targeted",
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

  const delEmps = (campaign.tags.employees as unknown as string[]).map((e) => e.toString());
  const delDepts = (campaign.tags.departments as unknown as string[]).map((d) => d.toString());
  const campaignName = campaign.name;
  await campaign.deleteOne();

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "deleted campaign",
    entity: "campaign",
    entityId: id,
    details: campaignName,
    targetUserIds: delEmps,
    targetDepartmentId: delDepts[0] || undefined,
  });

  return ok({ message: "Campaign deleted" });
}
