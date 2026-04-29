import ActivityTask from "@/lib/models/ActivityTask";
import { unauthorized, forbidden, ok, badRequest, isValidId, parseBody } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin, hasPermission } from "@/lib/permissions";

export async function PUT(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!isSuperAdmin(actor) && !hasPermission(actor, "tasks_reorder")) return forbidden();

  const body = await parseBody(req);
  if (body instanceof Response) return body;
  const { orderedIds } = body as { orderedIds?: string[] };

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return badRequest("orderedIds must be a non-empty array of task IDs");
  }
  if (orderedIds.some((id) => !isValidId(id))) {
    return badRequest("orderedIds contains invalid IDs");
  }

  const ops = orderedIds.map((id, index) => ({
    updateOne: { filter: { _id: id }, update: { $set: { order: index } } },
  }));

  await ActivityTask.bulkWrite(ops);

  return ok({ message: "Reordered" });
}
