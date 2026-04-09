import { connectDB } from "@/lib/db";
import Team from "@/lib/models/Team";
import User from "@/lib/models/User";
import { unauthorized, forbidden, badRequest, notFound, ok, isValidId } from "@/lib/helpers";
import {
  getVerifiedSession,
  isSuperAdmin,
  isAdmin,
  canEditTeam,
} from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!actor.isSuperAdmin) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const team = await Team.findById(id)
    .populate("department", "title slug")
    .populate("departments", "title slug")
    .populate("lead", "about.firstName about.lastName email")
    .lean();

  if (!team) return notFound("Team not found");

  const members = await User.find({
    teams: id,
    isActive: true,
    isSuperAdmin: { $ne: true },
  })
    .select("about email department")
    .populate("department", "title")
    .lean();

  return ok({ ...team, members });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const team = await Team.findById(id);
  if (!team) return notFound("Team not found");

  if (!canEditTeam(actor, team.department?.toString() ?? "", id)) return forbidden();

  const body = await req.json();
  const update: Record<string, unknown> = { updatedBy: actor.id };

  if (body.name !== undefined) update.name = body.name.trim();
  if (body.description !== undefined) update.description = body.description;
  if (typeof body.isActive === "boolean") update.isActive = body.isActive;

  if (isAdmin(actor)) {
    if (body.departments !== undefined) {
      update.departments = body.departments;
      update.department = body.departments[0] ?? null;
    } else if (body.department !== undefined) {
      update.department = body.department;
      const currentDepts = (team.departments ?? []).map((d: unknown) => String(d));
      if (!currentDepts.includes(body.department)) {
        update.departments = [...currentDepts, body.department];
      }
    }
    if (body.lead !== undefined) {
      if (body.lead) {
        const leadUser = await User.findById(body.lead).select("isSuperAdmin").lean();
        if (!leadUser) return badRequest("Lead user not found");
        if (leadUser.isSuperAdmin === true) return badRequest("Superadmin cannot be a team lead");
      }
      update.lead = body.lead || null;
    }
  }

  if (update.name) {
    team.name = update.name as string;
    delete update.name;
  }
  Object.assign(team, update);
  await team.save();

  const populated = await Team.findById(id)
    .populate("department", "title slug")
    .populate("departments", "title slug")
    .populate("lead", "about.firstName about.lastName email")
    .lean();

  const leadId = team.lead ? (typeof team.lead === "object" && "_id" in team.lead ? (team.lead as { _id: { toString(): string } })._id.toString() : team.lead.toString()) : null;
  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "updated team",
    entity: "team",
    entityId: id,
    details: team.name,
    targetTeamIds: [id],
    targetDepartmentId: team.department?.toString() ?? "",
    targetUserIds: leadId ? [leadId] : [],
    visibility: "targeted",
  });

  return ok(populated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!actor.isSuperAdmin) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const team = await Team.findById(id);
  if (!team) return notFound("Team not found");

  await User.updateMany({ teams: id }, { $pull: { teams: id } });

  const teamName = team.name;
  const teamDeptId = team.department?.toString() ?? "";
  await team.deleteOne();

  logActivity({
    userEmail: actor.email,
    userName: "",
    action: "deleted team",
    entity: "team",
    entityId: id,
    details: teamName,
    targetTeamIds: [id],
    targetDepartmentId: teamDeptId,
    visibility: "targeted",
  });

  return ok({ message: "Team deleted" });
}
