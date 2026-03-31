import { connectDB } from "@/lib/db";
import ActivityLog from "@/lib/models/ActivityLog";

interface LogInput {
  userEmail: string;
  userName: string;
  userRole?: string;
  action: string;
  entity: "employee" | "department" | "team" | "task" | "campaign" | "attendance" | "settings" | "auth";
  entityId?: string;
  details?: string;
  targetUserIds?: string[];
  targetDepartmentId?: string;
  targetTeamIds?: string[];
  visibility?: "all" | "targeted" | "self";
}

export async function logActivity(input: LogInput): Promise<void> {
  try {
    await connectDB();
    await ActivityLog.create({
      ...input,
      targetUserIds: input.targetUserIds ?? [],
      targetTeamIds: input.targetTeamIds ?? [],
      visibility: input.visibility ?? "targeted",
    });
  } catch {
    // Fire-and-forget — never block the main response
  }
}
