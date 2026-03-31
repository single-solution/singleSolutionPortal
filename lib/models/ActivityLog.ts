import mongoose, { Schema, type Document } from "mongoose";

export interface IActivityLog extends Document {
  userEmail: string;
  userName: string;
  action: string;
  entity: "employee" | "department" | "task" | "attendance" | "settings" | "auth";
  entityId?: string;
  details?: string;
  createdAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    userEmail: { type: String, required: true, index: true },
    userName: { type: String, default: "" },
    action: { type: String, required: true },
    entity: {
      type: String,
      required: true,
      enum: ["employee", "department", "task", "attendance", "settings", "auth"],
    },
    entityId: { type: String, default: null },
    details: { type: String, default: "" },
  },
  { timestamps: true },
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ entity: 1, createdAt: -1 });

const ActivityLog =
  mongoose.models.ActivityLog ||
  mongoose.model<IActivityLog>("ActivityLog", activityLogSchema);

export default ActivityLog;
