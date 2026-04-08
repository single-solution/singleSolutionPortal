import { connectDB } from "@/lib/db";
import Designation, { PERMISSION_KEYS, type IPermissions } from "@/lib/models/Designation";
import { unauthorized, forbidden, badRequest, ok } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin, hasPermission } from "@/lib/permissions";
import mongoose from "mongoose";

function buildPermissionsFromInput(input: unknown): IPermissions | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  const src = input as Record<string, unknown>;
  const base: Record<string, boolean> = {};
  for (const k of PERMISSION_KEYS) base[k] = false;
  for (const k of PERMISSION_KEYS) {
    if (k in src && typeof src[k] === "boolean") base[k] = src[k];
  }
  return base as unknown as IPermissions;
}

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "designations_view")) return forbidden();

  await connectDB();

  const filter = isSuperAdmin(actor) ? {} : { isActive: true };

  const designations = await Designation.find(filter)
    .select("_id name description color isSystem isActive defaultPermissions createdAt updatedAt")
    .sort({ name: 1 })
    .lean();

  return ok(designations);
}

export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "designations_manage")) return forbidden();

  await connectDB();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("name is required");

  if (body.defaultPermissions !== undefined) {
    const built = buildPermissionsFromInput(body.defaultPermissions);
    if (built === undefined) return badRequest("defaultPermissions must be an object of permission booleans");
  }

  const description =
    typeof body.description === "string" ? body.description : body.description === undefined ? "" : null;
  if (description === null) return badRequest("description must be a string");

  let color: string | undefined;
  if (body.color !== undefined) {
    if (typeof body.color !== "string" || !body.color.trim()) return badRequest("color must be a non-empty string");
    color = body.color.trim();
  }

  const defaultPermissions = buildPermissionsFromInput(body.defaultPermissions);

  try {
    const created = await Designation.create({
      name,
      description,
      ...(color !== undefined ? { color } : {}),
      ...(defaultPermissions !== undefined ? { defaultPermissions } : {}),
    });

    const doc = await Designation.findById(created._id)
      .select("_id name description color isSystem isActive defaultPermissions createdAt updatedAt")
      .lean();

    return ok(doc);
  } catch (e) {
    if (e instanceof mongoose.mongo.MongoServerError && e.code === 11000) {
      return badRequest("A designation with this name already exists");
    }
    throw e;
  }
}
