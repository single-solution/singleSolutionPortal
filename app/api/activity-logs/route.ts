import { connectDB } from "@/lib/db";
import ActivityLog from "@/lib/models/ActivityLog";
import { getSession, unauthorized, ok } from "@/lib/helpers";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return unauthorized();

  const role = session.user.role;
  if (role !== "superadmin" && role !== "manager") {
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
