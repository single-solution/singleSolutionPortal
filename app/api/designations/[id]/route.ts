import { connectDB } from "@/lib/db";
import Designation, { PERMISSION_KEYS } from "@/lib/models/Designation";
import Membership from "@/lib/models/Membership";
import { unauthorized, forbidden, badRequest, notFound, ok, isValidId } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin, hasPermission } from "@/lib/permissions";
import mongoose from "mongoose";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "designations_view")) return forbidden();

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
  if (!hasPermission(actor, "designations_manage")) return forbidden();

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

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") return badRequest("isActive must be a boolean");
    designation.isActive = body.isActive;
  }

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
  }

  try {
    await designation.save();
  } catch (e) {
    if (e instanceof mongoose.mongo.MongoServerError && e.code === 11000) {
      return badRequest("A designation with this name already exists");
    }
    throw e;
  }

  const doc = await Designation.findById(id)
    .select("_id name description color isSystem isActive defaultPermissions createdAt updatedAt")
    .lean();

  return ok(doc);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "designations_manage")) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid ID");

  await connectDB();

  const designation = await Designation.findById(id);
  if (!designation) return notFound("Designation not found");
  if (designation.isSystem) return badRequest("Cannot delete system designations");

  await Membership.updateMany({ designation: id }, { $unset: { designation: "" } });
  await designation.deleteOne();

  return ok({ deleted: true });
}
