import User from "@/lib/models/User";
import { unauthorized, ok, badRequest, parseBody } from "@/lib/helpers";
import { getVerifiedSession } from "@/lib/permissions";

const VALID_TOURS = ["welcome", "dashboard", "organization", "workspace", "insights-desk", "employees", "departments", "campaigns", "tasks", "attendance", "settings"] as const;

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const user = await User.findById(actor.id).select("guideTours").lean();
  if (!user) return unauthorized();

  const defaults = Object.fromEntries(VALID_TOURS.map((t) => [t, false]));
  return ok({ guideTours: { ...defaults, ...(user.guideTours ?? {}) } });
}

export async function PATCH(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  const body = await parseBody(req);
  if (body instanceof Response) return body;
  const { tour, completed } = body as { tour?: string; completed?: boolean };

  if (!tour || !VALID_TOURS.includes(tour as typeof VALID_TOURS[number])) {
    return badRequest("Invalid tour name");
  }

  await User.findByIdAndUpdate(actor.id, {
    $set: { [`guideTours.${tour}`]: completed !== false },
  });

  return ok({ success: true });
}
