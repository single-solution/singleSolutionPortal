import { connectDB } from "@/lib/db";
import Membership from "@/lib/models/Membership";
import Designation, { PERMISSION_KEYS, type IPermissions } from "@/lib/models/Designation";
import { unauthorized, forbidden, badRequest, notFound, ok, isValidId } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin, hasPermission } from "@/lib/permissions";

/* eslint-disable @typescript-eslint/no-explicit-any */
function populateMembership(q: any) {
  return q
    .populate("user", "about.firstName about.lastName email username")
    .populate("department", "title")
    .populate("designation", "name color defaultPermissions");
}

function canViewMembership(
  actor: NonNullable<Awaited<ReturnType<typeof getVerifiedSession>>>,
  departmentId: string,
): boolean {
  if (isSuperAdmin(actor)) return true;
  return hasPermission(actor, "employees_view", departmentId);
}

function mergePermissionPatch(
  current: Record<string, boolean> | IPermissions,
  partial: unknown,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of PERMISSION_KEYS) {
    out[k] = Boolean((current as Record<string, boolean>)[k]);
  }
  if (!partial || typeof partial !== "object" || Array.isArray(partial)) return out;
  const obj = partial as Record<string, unknown>;
  for (const k of PERMISSION_KEYS) {
    if (k in obj && typeof obj[k] === "boolean") {
      out[k] = obj[k];
    }
  }
  return out;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const doc = await populateMembership(Membership.findById(id)).lean();
  if (!doc) return notFound("Membership not found");

  const deptId = (doc.department as { _id?: { toString(): string } })?._id?.toString()
    ?? String(doc.department);

  if (!canViewMembership(actor, deptId)) return forbidden();

  return ok(doc);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const membership = await Membership.findById(id);
  if (!membership) return notFound("Membership not found");

  const deptId = membership.department.toString();

  if (!isSuperAdmin(actor) && !hasPermission(actor, "members_customizePermissions", deptId)) {
    return forbidden();
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (body.designation !== undefined) {
    if (typeof body.designation !== "string" || !isValidId(body.designation)) {
      return badRequest("Invalid designation");
    }
    const desig = await Designation.findById(body.designation).select("_id defaultPermissions").lean();
    if (!desig) return badRequest("Designation not found");
    membership.designation = body.designation;
    if (body.permissions === undefined) {
      const defaults: Record<string, boolean> = {};
      for (const k of PERMISSION_KEYS) defaults[k] = Boolean((desig.defaultPermissions as Record<string, boolean> | undefined)?.[k]);
      membership.permissions = defaults as typeof membership.permissions;
    }
  }

  if (typeof body.isActive === "boolean") membership.isActive = body.isActive;

  if (body.permissions !== undefined) {
    const current = membership.permissions as unknown as Record<string, boolean>;
    membership.permissions = mergePermissionPatch(current, body.permissions) as typeof membership.permissions;
  }

  await membership.save();

  const populated = await populateMembership(Membership.findById(id)).lean();

  return ok(populated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const membership = await Membership.findById(id);
  if (!membership) return notFound("Membership not found");

  const deptId = membership.department.toString();

  if (!isSuperAdmin(actor) && !hasPermission(actor, "members_removeFromDepartment", deptId)) {
    return forbidden();
  }

  await membership.deleteOne();

  return ok({ deleted: true });
}
