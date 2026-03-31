import mongoose, { Schema, type Document } from "mongoose";

export interface IActivityLog extends Document {
  userEmail: string;
  userName: string;
  userRole: string;
  action: string;
  entity: "employee" | "department" | "team" | "task" | "campaign" | "attendance" | "settings" | "auth";
  entityId?: string;
  details?: string;
  targetUserIds: string[];
  targetDepartmentId?: string;
  targetTeamIds: string[];
  visibility: "all" | "targeted" | "self";
  createdAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    userEmail: { type: String, required: true, index: true },
    userName: { type: String, default: "" },
    userRole: { type: String, default: "" },
    action: { type: String, required: true },
    entity: {
      type: String,
      required: true,
      enum: ["employee", "department", "team", "task", "campaign", "attendance", "settings", "auth"],
    },
    entityId: { type: String, default: null },
    details: { type: String, default: "" },
    targetUserIds: { type: [String], default: [] },
    targetDepartmentId: { type: String, default: null },
    targetTeamIds: { type: [String], default: [] },
    visibility: { type: String, enum: ["all", "targeted", "self"], default: "targeted" },
  },
  { timestamps: true },
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ entity: 1, createdAt: -1 });
activityLogSchema.index({ targetUserIds: 1, createdAt: -1 });
activityLogSchema.index({ targetDepartmentId: 1, createdAt: -1 });
activityLogSchema.index({ targetTeamIds: 1, createdAt: -1 });
activityLogSchema.index({ visibility: 1, createdAt: -1 });

const ActivityLog =
  mongoose.models.ActivityLog ||
  mongoose.model<IActivityLog>("ActivityLog", activityLogSchema);

export default ActivityLog;
