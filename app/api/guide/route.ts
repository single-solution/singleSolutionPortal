import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { getSession, unauthorized, ok, badRequest } from "@/lib/helpers";

const VALID_TOURS = ["welcome", "dashboard", "organization", "workspace", "insights-desk", "employees", "departments", "campaigns", "tasks", "attendance", "settings"] as const;

export async function GET() {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  await connectDB();
  const user = await User.findById(session.user.id).select("guideTours").lean();
  if (!user) return unauthorized();

  const defaults = Object.fromEntries(VALID_TOURS.map((t) => [t, false]));
  return ok({ guideTours: { ...defaults, ...(user.guideTours ?? {}) } });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  const body = await req.json();
  const { tour, completed } = body as { tour?: string; completed?: boolean };

  if (!tour || !VALID_TOURS.includes(tour as typeof VALID_TOURS[number])) {
    return badRequest("Invalid tour name");
  }

  await connectDB();
  await User.findByIdAndUpdate(session.user.id, {
    $set: { [`guideTours.${tour}`]: completed !== false },
  });

  return ok({ success: true });
}
