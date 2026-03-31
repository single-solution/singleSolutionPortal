import { connectDB } from "@/lib/db";
import ActivityLog from "@/lib/models/ActivityLog";
import { unauthorized, ok } from "@/lib/helpers";
import { getVerifiedSession, canViewActivityLogs } from "@/lib/permissions";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();

  if (!canViewActivityLogs(actor)) {
    return ok({ logs: [] });
  }

  await connectDB();

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 50);

  const logs = await ActivityLog.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return ok({ logs });
}
