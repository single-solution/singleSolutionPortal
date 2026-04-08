import { connectDB } from "@/lib/db";
import FlowLayout from "@/lib/models/FlowLayout";
import { unauthorized, forbidden, ok, badRequest } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin } from "@/lib/permissions";

export async function GET(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const { searchParams } = new URL(req.url);
  const canvasId = searchParams.get("canvasId") ?? "org";

  await connectDB();
  const doc = await FlowLayout.findOne({ canvasId }).lean();

  return ok({ positions: doc?.positions ?? {}, links: doc?.links ?? [] });
}

export async function PUT(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!isSuperAdmin(actor)) return forbidden();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const canvasId = (body.canvasId as string) ?? "org";
  const update: Record<string, unknown> = {};

  if (body.positions && typeof body.positions === "object") {
    update.positions = body.positions;
  }
  if (Array.isArray(body.links)) {
    update.links = body.links;
  }

  if (Object.keys(update).length === 0) {
    return badRequest("positions or links required");
  }

  await connectDB();
  await FlowLayout.findOneAndUpdate(
    { canvasId },
    { $set: update },
    { upsert: true, new: true },
  );

  return ok({ saved: true });
}
