import { connectDB } from "@/lib/db";
import ActivityLog from "@/lib/models/ActivityLog";
import { notifyChange } from "@/lib/eventBus";
import type { Channel } from "@/lib/models/EventBus";

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

const ENTITY_TO_CHANNEL: Record<string, Channel> = {
  employee: "employees",
  department: "departments",
  team: "teams",
  task: "tasks",
  campaign: "campaigns",
  attendance: "presence",
  settings: "settings",
};

export async function logActivity(input: LogInput): Promise<void> {
  try {
    await connectDB();
    await ActivityLog.create({
      ...input,
      targetUserIds: input.targetUserIds ?? [],
      targetTeamIds: input.targetTeamIds ?? [],
      visibility: input.visibility ?? "targeted",
    });

    const channels: Channel[] = ["activity"];
    const mapped = ENTITY_TO_CHANNEL[input.entity];
    if (mapped) channels.push(mapped);
    notifyChange(channels);
  } catch {
    // Fire-and-forget — never block the main response
  }
}
