import { connectDB } from "@/lib/db";
import Designation, { PERMISSION_KEYS } from "@/lib/models/Designation";
import Membership from "@/lib/models/Membership";
import FlowLayout from "@/lib/models/FlowLayout";
import { unauthorized, forbidden, badRequest, notFound, ok, isValidId } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin, hasPermission, invalidateHierarchyCache } from "@/lib/permissions";
import mongoose from "mongoose";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "designations_view") && !hasPermission(actor, "organization_view")) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const filter: Record<string, unknown> = { _id: id };
  if (!isSuperAdmin(actor)) filter.isActive = true;

  const designation = await Designation.findOne(filter)
    .select("_id name description color isSystem isActive defaultPermissions createdAt updatedAt")
    .lean();

  if (!designation) return notFound("Designation not found");

  return ok(designation);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const canEditDesig = hasPermission(actor, "designations_edit");
  const canToggleDesig = hasPermission(actor, "designations_toggleStatus");
  const canSetPerms = hasPermission(actor, "designations_setPermissions");
  if (!canEditDesig && !canToggleDesig && !canSetPerms) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const designation = await Designation.findById(id);
  if (!designation) return notFound("Designation not found");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (canEditDesig) {
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) return badRequest("name must be a non-empty string");
      designation.name = body.name.trim();
    }

    if (body.description !== undefined) {
      if (typeof body.description !== "string") return badRequest("description must be a string");
      designation.description = body.description;
    }

    if (body.color !== undefined) {
      if (typeof body.color !== "string" || !body.color.trim()) return badRequest("color must be a non-empty string");
      designation.color = body.color.trim();
    }
  }

  let toggledActive: boolean | undefined;

  if (canToggleDesig || canEditDesig) {
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") return badRequest("isActive must be a boolean");
      toggledActive = body.isActive;
      designation.isActive = body.isActive;
    }
  }

  let permsChanged = false;

  if (canSetPerms || canEditDesig) {
    if (body.defaultPermissions !== undefined) {
      if (typeof body.defaultPermissions !== "object" || body.defaultPermissions === null || Array.isArray(body.defaultPermissions)) {
        return badRequest("defaultPermissions must be an object of permission booleans");
      }
      const src = body.defaultPermissions as Record<string, unknown>;
      for (const k of PERMISSION_KEYS) {
        if (k in src) {
          if (typeof src[k] !== "boolean") return badRequest(`defaultPermissions.${String(k)} must be a boolean`);
          designation.set(`defaultPermissions.${k}`, src[k]);
        }
      }
      permsChanged = true;
    }
  }

  try {
    await designation.save();
  } catch (e) {
    if (e instanceof mongoose.mongo.MongoServerError && e.code === 11000) {
      return badRequest("A designation with this name already exists");
    }
    throw e;
  }

  let cascadeCount = 0;
  if (toggledActive === false) {
    const result = await Membership.updateMany(
      { designation: id },
      { $set: { isActive: false }, $addToSet: { deactivatedBy: "designation" } },
    );
    cascadeCount = result.modifiedCount;
  } else if (toggledActive === true) {
    await Membership.updateMany(
      { designation: id, deactivatedBy: "designation" },
      { $pull: { deactivatedBy: "designation" } },
    );
    const result = await Membership.updateMany(
      { designation: id, isActive: false, deactivatedBy: { $size: 0 } },
      { $set: { isActive: true } },
    );
    cascadeCount = result.modifiedCount;
  }

  let syncedCount = 0;

  if (permsChanged) {
    const newDefaults: Record<string, boolean> = {};
    for (const k of PERMISSION_KEYS) {
      newDefaults[`permissions.${String(k)}`] = Boolean(
        (designation.defaultPermissions as unknown as Record<string, boolean>)?.[String(k)],
      );
    }
    const result = await Membership.updateMany(
      { designation: id, hasCustomPermissions: { $ne: true } },
      { $set: newDefaults },
    );
    syncedCount = result.modifiedCount;
  }

  const doc = await Designation.findById(id)
    .select("_id name description color isSystem isActive defaultPermissions createdAt updatedAt")
    .lean();

  if (toggledActive !== undefined || permsChanged) invalidateHierarchyCache();
  return ok({ ...doc, syncedCount, cascadeCount });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "designations_delete")) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const designation = await Designation.findById(id);
  if (!designation) return notFound("Designation not found");
  if (designation.isSystem) return badRequest("Cannot delete system designations");

  const activeCount = await Membership.countDocuments({ designation: id, isActive: true });
  if (activeCount > 0) {
    return badRequest(`Cannot delete: ${activeCount} active membership${activeCount !== 1 ? "s" : ""} use this designation. Deactivate or reassign them first.`);
  }

  await Membership.deleteMany({ designation: id });

  await FlowLayout.updateMany(
    { canvasId: "org" },
    { $set: { "links.$[el].designationId": null } },
    { arrayFilters: [{ "el.designationId": id }] },
  );

  await designation.deleteOne();

  invalidateHierarchyCache();
  return ok({ deleted: true });
}
