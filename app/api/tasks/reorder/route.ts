import { connectDB } from "@/lib/db";
import ActivityTask from "@/lib/models/ActivityTask";
import { unauthorized, forbidden, ok, badRequest } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin, hasPermission } from "@/lib/permissions";

export async function PUT(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!isSuperAdmin(actor) && !hasPermission(actor, "tasks_reorder")) return forbidden();

  let body: { orderedIds: string[] };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!Array.isArray(body.orderedIds) || body.orderedIds.length === 0) {
    return badRequest("orderedIds must be a non-empty array of task IDs");
  }

  await connectDB();

  const ops = body.orderedIds.map((id, index) => ({
    updateOne: { filter: { _id: id }, update: { $set: { order: index } } },
  }));

  await ActivityTask.bulkWrite(ops);

  return ok({ message: "Reordered" });
}
