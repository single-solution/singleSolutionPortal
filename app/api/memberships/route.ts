import { connectDB } from "@/lib/db";
import Membership from "@/lib/models/Membership";
import Designation, { PERMISSION_KEYS, type IPermissions } from "@/lib/models/Designation";
import User from "@/lib/models/User";
import Department from "@/lib/models/Department";
import { unauthorized, forbidden, badRequest, ok, isValidId } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin, hasPermission, getSubordinateUserIds, invalidateHierarchyCache } from "@/lib/permissions";

/* eslint-disable @typescript-eslint/no-explicit-any */
function populateMembership(q: any) {
  return q
    .populate("user", "about.firstName about.lastName email username")
    .populate("department", "title")
    .populate("designation", "name color defaultPermissions");
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

  if (userId && !isValidId(userId)) return badRequest("Invalid userId");
  if (departmentId && !isValidId(departmentId)) return badRequest("Invalid departmentId");

  await connectDB();

  const filter: Record<string, unknown> = { isActive: { $ne: false } };

  if (!isSuperAdmin(actor)) {
    const subordinateIds = await getSubordinateUserIds(actor.id);
    const visibleUserIds = [actor.id, ...subordinateIds];
    if (userId) {
      if (!visibleUserIds.includes(userId)) return ok([]);
      filter.user = userId;
    } else {
      filter.user = { $in: visibleUserIds };
    }
    if (departmentId) filter.department = departmentId;
  } else {
    if (userId) filter.user = userId;
    if (departmentId) filter.department = departmentId;
  }

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

  if (!isSuperAdmin(actor)) {
    if (user === actor.id) {
      return forbidden("Cannot add yourself to a department");
    }
    const subordinateIds = await getSubordinateUserIds(actor.id);
    if (!subordinateIds.includes(user)) {
      return forbidden("Target user is not within your hierarchy");
    }
  }

  const [userDoc, deptDoc, desigDoc] = await Promise.all([
    User.findById(user).select("_id isSuperAdmin").lean(),
    Department.findById(department).select("_id").lean(),
    Designation.findById(designationId).select("defaultPermissions").lean(),
  ]);

  if (!userDoc) return badRequest("User not found");
  if (!deptDoc) return badRequest("Department not found");
  if (!desigDoc) return badRequest("Designation not found");

  if ((userDoc as Record<string, unknown>).isSuperAdmin === true && !isSuperAdmin(actor)) {
    return forbidden("Cannot add a superadmin to a department");
  }

  const basePerms = clonePermissionsFromDesignation(
    (desigDoc.defaultPermissions ?? {}) as IPermissions,
  );
  const hasExplicitPerms = body.permissions !== undefined && body.permissions !== null;
  const permissions = hasExplicitPerms
    ? mergePermissionOverrides(basePerms, body.permissions)
    : basePerms;

  const direction = body.direction === "above" ? "above" : "below";
  const autoSource = body.autoSource === "hierarchy" ? "hierarchy" : null;

  try {
    const created = await Membership.create({
      user,
      department,
      designation: designationId,
      isActive: true,
      direction,
      autoSource,
      permissions,
      hasCustomPermissions: hasExplicitPerms,
    });

    const populated = await populateMembership(Membership.findById(created._id)).lean();

    invalidateHierarchyCache();
    return ok(populated);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("E11000") || msg.includes("duplicate")) {
      return badRequest("A membership already exists for this user and department");
    }
    throw e;
  }
}
