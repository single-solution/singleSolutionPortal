import { connectDB } from "@/lib/db";
import Membership from "@/lib/models/Membership";
import Designation, { PERMISSION_KEYS, type IPermissions } from "@/lib/models/Designation";
import User from "@/lib/models/User";
import Department from "@/lib/models/Department";
import Team from "@/lib/models/Team";
import { unauthorized, forbidden, badRequest, ok, isValidId } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin, hasPermission } from "@/lib/permissions";

/* eslint-disable @typescript-eslint/no-explicit-any */
function populateMembership(q: any) {
  return q
    .populate("user", "about.firstName about.lastName email username")
    .populate("department", "title")
    .populate("team", "name")
    .populate("designation", "name color defaultPermissions")
    .populate("reportsTo", "about.firstName about.lastName email username");
}

function departmentIdsWithEmployeesView(actor: Awaited<ReturnType<typeof getVerifiedSession>>): string[] {
  if (!actor) return [];
  return [
    ...new Set(
      actor.memberships.filter((m) => m.permissions.employees_view === true).map((m) => m.departmentId),
    ),
  ];
}

function clonePermissionsFromDesignation(defaultPermissions: IPermissions | Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of PERMISSION_KEYS) {
    out[k] = Boolean((defaultPermissions as Record<string, boolean>)[k]);
  }
  return out;
}

function mergePermissionOverrides(
  base: Record<string, boolean>,
  partial: unknown,
): Record<string, boolean> {
  const out = { ...base };
  if (!partial || typeof partial !== "object" || Array.isArray(partial)) return out;
  const obj = partial as Record<string, unknown>;
  for (const k of PERMISSION_KEYS) {
    if (k in obj && typeof obj[k] === "boolean") {
      out[k] = obj[k];
    }
  }
  return out;
}

export async function GET(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") ?? undefined;
  const departmentId = searchParams.get("departmentId") ?? undefined;
  const teamId = searchParams.get("teamId") ?? undefined;

  if (userId && !isValidId(userId)) return badRequest("Invalid userId");
  if (departmentId && !isValidId(departmentId)) return badRequest("Invalid departmentId");
  if (teamId && !isValidId(teamId)) return badRequest("Invalid teamId");

  await connectDB();

  const filter: Record<string, unknown> = { isActive: { $ne: false } };

  if (!isSuperAdmin(actor)) {
    const scope = departmentIdsWithEmployeesView(actor);
    if (scope.length === 0) return ok([]);

    if (departmentId) {
      if (!scope.includes(departmentId)) return forbidden();
      filter.department = departmentId;
    } else {
      filter.department = { $in: scope };
    }
  } else if (departmentId) {
    filter.department = departmentId;
  }

  if (userId) filter.user = userId;
  if (teamId) filter.team = teamId;

  const list = await populateMembership(Membership.find(filter))
    .sort({ createdAt: -1 })
    .lean();

  return ok(list);
}

export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const user = body.user;
  const department = body.department;
  const designationId = body.designation;

  if (!user || typeof user !== "string" || !isValidId(user)) {
    return badRequest("Valid user is required");
  }
  if (!department || typeof department !== "string" || !isValidId(department)) {
    return badRequest("Valid department is required");
  }
  if (!designationId || typeof designationId !== "string" || !isValidId(designationId)) {
    return badRequest("Valid designation is required");
  }

  if (!isSuperAdmin(actor) && !hasPermission(actor, "members_addToDepartment", department)) {
    return forbidden();
  }

  await connectDB();

  const [userDoc, deptDoc, desigDoc] = await Promise.all([
    User.findById(user).select("_id").lean(),
    Department.findById(department).select("_id").lean(),
    Designation.findById(designationId).select("defaultPermissions").lean(),
  ]);

  if (!userDoc) return badRequest("User not found");
  if (!deptDoc) return badRequest("Department not found");
  if (!desigDoc) return badRequest("Designation not found");

  let team: string | null | undefined;
  if (body.team !== undefined && body.team !== null && body.team !== "") {
    if (typeof body.team !== "string" || !isValidId(body.team)) {
      return badRequest("Invalid team");
    }
    const teamDoc = await Team.findById(body.team).select("department").lean();
    if (!teamDoc) return badRequest("Team not found");
    if (teamDoc.department.toString() !== department) {
      return badRequest("Team does not belong to the selected department");
    }
    team = body.team;
  } else {
    team = null;
  }

  let reportsTo: string | null | undefined;
  if (body.reportsTo !== undefined && body.reportsTo !== null && body.reportsTo !== "") {
    if (typeof body.reportsTo !== "string" || !isValidId(body.reportsTo)) {
      return badRequest("Invalid reportsTo");
    }
    const reportsUser = await User.findById(body.reportsTo).select("_id").lean();
    if (!reportsUser) return badRequest("reportsTo user not found");
    reportsTo = body.reportsTo;
  } else {
    reportsTo = null;
  }

  const basePerms = clonePermissionsFromDesignation(
    (desigDoc.defaultPermissions ?? {}) as IPermissions,
  );
  const permissions =
    body.permissions !== undefined && body.permissions !== null
      ? mergePermissionOverrides(basePerms, body.permissions)
      : basePerms;

  const isPrimary = typeof body.isPrimary === "boolean" ? body.isPrimary : false;
  const autoSource = body.autoSource === "hierarchy" ? "hierarchy" : null;

  try {
    const created = await Membership.create({
      user,
      department,
      designation: designationId,
      team: team ?? undefined,
      reportsTo: reportsTo ?? undefined,
      isPrimary,
      isActive: true,
      autoSource,
      permissions,
    });

    const populated = await populateMembership(Membership.findById(created._id)).lean();

    return ok(populated);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("E11000") || msg.includes("duplicate")) {
      return badRequest("A membership already exists for this user, department, and team");
    }
    throw e;
  }
}
