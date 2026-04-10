import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { unauthorized, ok, badRequest } from "@/lib/helpers";
import { getVerifiedSession } from "@/lib/permissions";

const VALID_TOURS = ["welcome", "dashboard", "organization", "workspace", "insights-desk", "employees", "departments", "campaigns", "tasks", "attendance", "settings"] as const;

export async function GET() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  await connectDB();
  const user = await User.findById(actor.id).select("guideTours").lean();
  if (!user) return unauthorized();

  const defaults = Object.fromEntries(VALID_TOURS.map((t) => [t, false]));
  return ok({ guideTours: { ...defaults, ...(user.guideTours ?? {}) } });
}

export async function PATCH(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return badRequest("Invalid JSON body"); }
  const { tour, completed } = body as { tour?: string; completed?: boolean };

  if (!tour || !VALID_TOURS.includes(tour as typeof VALID_TOURS[number])) {
    return badRequest("Invalid tour name");
  }

  await connectDB();
  await User.findByIdAndUpdate(actor.id, {
    $set: { [`guideTours.${tour}`]: completed !== false },
  });

  return ok({ success: true });
}
