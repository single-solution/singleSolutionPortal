import { connectDB } from "@/lib/db";
import ActivityLog from "@/lib/models/ActivityLog";

interface LogInput {
  userEmail: string;
  userName: string;
  action: string;
  entity: "employee" | "department" | "task" | "attendance" | "settings" | "auth";
  entityId?: string;
  details?: string;
}

export async function logActivity(input: LogInput): Promise<void> {
  try {
    await connectDB();
    await ActivityLog.create(input);
  } catch {
    // Fire-and-forget — never block the main response
  }
}
