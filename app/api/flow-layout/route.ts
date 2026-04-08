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

  return ok(doc?.positions ?? {});
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
  const positions = body.positions;
  if (!positions || typeof positions !== "object") {
    return badRequest("positions object is required");
  }

  await connectDB();
  await FlowLayout.findOneAndUpdate(
    { canvasId },
    { positions },
    { upsert: true, new: true },
  );

  return ok({ saved: true });
}
