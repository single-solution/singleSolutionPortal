import { connectDB } from "@/lib/db";
import Campaign from "@/lib/models/Campaign";
import { unauthorized, forbidden, badRequest, notFound, ok, isValidId } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  isAdmin,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const campaign = await Campaign.findById(id)
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
  if (!isAdmin(actor)) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const campaign = await Campaign.findById(id);
  if (!campaign) return notFound("Campaign not found");

  const body = await req.json();

  const validStatuses = ["active", "paused", "completed", "cancelled"];
  if (body.status !== undefined && !validStatuses.includes(body.status)) {
    return badRequest(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
  }

  if (body.name !== undefined) campaign.name = body.name.trim();
  if (body.description !== undefined) campaign.description = body.description;
  if (body.status !== undefined) campaign.status = body.status;
  if (body.startDate !== undefined) campaign.startDate = body.startDate || undefined;
  if (body.endDate !== undefined) campaign.endDate = body.endDate || undefined;
  if (body.budget !== undefined) campaign.budget = body.budget;
  if (body.notes !== undefined) campaign.notes = body.notes;
  if (typeof body.isActive === "boolean") campaign.isActive = body.isActive;

  if (body.tagEmployees !== undefined) campaign.tags.employees = body.tagEmployees;
  if (body.tagDepartments !== undefined) campaign.tags.departments = body.tagDepartments;
  if (body.tagTeams !== undefined) campaign.tags.teams = body.tagTeams;

  campaign.updatedBy = actor.id as unknown as typeof campaign.updatedBy;
  await campaign.save();

  const populated = await Campaign.findById(id)
    .populate("tags.employees", "about.firstName about.lastName email userRole")
    .populate("tags.departments", "title slug")
    .populate("tags.teams", "name slug")
    .lean();

  const statusChange = body.status ? ` → ${body.status}` : "";
  logActivity({
    userEmail: actor.email,
    userName: "",
    action: `updated campaign${statusChange}`,
    entity: "campaign",
    entityId: id,
    details: campaign.name,
  });

  return ok(populated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!isSuperAdmin(actor)) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const campaign = await Campaign.findById(id);
  if (!campaign) return notFound("Campaign not found");

  campaign.isActive = false;
  await campaign.save();

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "deleted campaign",
    entity: "campaign",
    entityId: id,
    details: campaign.name,
  });

  return ok({ message: "Campaign deactivated" });
}
