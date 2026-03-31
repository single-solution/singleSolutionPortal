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
  isAdmin,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();
  void Department;
  void Team;
  void User;

  let filter: Record<string, unknown> = {};

  if (isSuperAdmin(actor)) {
    // sees all campaigns
  } else if (isManager(actor)) {
    if (actor.crossDepartmentAccess) {
      // sees all
    } else {
      filter.$or = [
        { "tags.employees": actor.id },
        ...(actor.department ? [{ "tags.departments": actor.department }] : []),
        ...(actor.teams.length > 0 ? [{ "tags.teams": { $in: actor.teams } }] : []),
      ];
      if ((filter.$or as unknown[]).length === 0) delete filter.$or;
    }
  } else if (isTeamLead(actor)) {
    filter.$or = [
      { "tags.employees": actor.id },
      ...(actor.department ? [{ "tags.departments": actor.department }] : []),
      ...(actor.leadOfTeams.length > 0 ? [{ "tags.teams": { $in: actor.leadOfTeams } }] : []),
    ];
    if ((filter.$or as unknown[]).length === 0) delete filter.$or;
  } else {
    filter.$or = [
      { "tags.employees": actor.id },
      ...(actor.department ? [{ "tags.departments": actor.department }] : []),
      ...(actor.teams.length > 0 ? [{ "tags.teams": { $in: actor.teams } }] : []),
    ];
    if ((filter.$or as unknown[]).length === 0) {
      filter["tags.employees"] = actor.id;
    }
  }

  const campaigns = await Campaign.find(filter)
    .populate("tags.employees", "about.firstName about.lastName email userRole")
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
  if (!isAdmin(actor)) return forbidden();

  await connectDB();
  const body = await req.json();

  if (!body.name?.trim()) {
    return badRequest("Campaign name is required");
  }

  const validStatuses = ["active", "paused", "completed", "cancelled"];
  if (body.status && !validStatuses.includes(body.status)) {
    return badRequest(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
  }

  const campaign = await Campaign.create({
    name: body.name.trim(),
    description: body.description ?? "",
    status: body.status ?? "active",
    startDate: body.startDate || undefined,
    endDate: body.endDate || undefined,
    budget: body.budget ?? "",
    tags: {
      employees: body.tagEmployees ?? [],
      departments: body.tagDepartments ?? [],
      teams: body.tagTeams ?? [],
    },
    notes: body.notes ?? "",
    isActive: true,
    createdBy: actor.id,
  });

  const populated = await Campaign.findById(campaign._id)
    .populate("tags.employees", "about.firstName about.lastName email userRole")
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
  });

  return ok(populated);
}
