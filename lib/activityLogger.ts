import { connectDB } from "@/lib/db";
import ActivityLog from "@/lib/models/ActivityLog";
import User from "@/lib/models/User";
import { emitSocket } from "@/lib/socket";

interface LogInput {
  userEmail: string;
  userName: string;
  action: string;
  entity: "employee" | "department" | "task" | "campaign" | "attendance" | "settings" | "auth" | "security";
  entityId?: string;
  details?: string;
  targetUserIds?: string[];
  targetDepartmentId?: string;
  visibility?: "all" | "targeted" | "self";
}

export async function logActivity(input: LogInput): Promise<void> {
  try {
    await connectDB();

    let resolvedName = (input.userName || "").trim();
    if (!resolvedName && input.userEmail) {
      const u = await User.findOne({ email: input.userEmail })
        .select("about.firstName about.lastName username isSuperAdmin")
        .lean();
      if (u) {
        if (u.isSuperAdmin) {
          resolvedName = "Admin";
        } else {
          const first = (u.about?.firstName ?? "").trim();
          const last = (u.about?.lastName ?? "").trim();
          resolvedName = `${first} ${last}`.trim() || u.username || "";
        }
      }
    }

    await ActivityLog.create({
      ...input,
      userName: resolvedName,
      targetUserIds: input.targetUserIds ?? [],
      visibility: input.visibility ?? "targeted",
    });

    if (input.targetUserIds?.length) {
      for (const uid of input.targetUserIds) {
        emitSocket("activity", { entity: input.entity, action: input.action }, { userId: uid });
      }
    } else {
      emitSocket("activity", { entity: input.entity, action: input.action });
    }
  } catch {
    // Fire-and-forget — never block the main response
  }
}
