import mongoose, { Schema, type Document, type Types } from "mongoose";

export type TaskEventType =
  | "statusChange"
  | "checklistComplete"
  | "checklistUndo"
  | "taskDisabled"
  | "taskEnabled";

export interface ITaskStatusLog extends Document {
  _id: Types.ObjectId;
  task: Types.ObjectId;
  campaign?: Types.ObjectId;
  employee: Types.ObjectId;
  status: "pending" | "inProgress" | "completed" | "undone" | "disabled" | "enabled";
  eventType: TaskEventType;
  date: string; // "YYYY-MM-DD"
  changedAt: Date;
  changedBy?: Types.ObjectId;
  note?: string;
}

const taskStatusLogSchema = new Schema<ITaskStatusLog>(
  {
    task: { type: Schema.Types.ObjectId, ref: "ActivityTask", required: true },
    campaign: { type: Schema.Types.ObjectId, ref: "Campaign", default: null },
    employee: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "inProgress", "completed", "undone", "disabled", "enabled"],
      required: true,
    },
    eventType: {
      type: String,
      enum: ["statusChange", "checklistComplete", "checklistUndo", "taskDisabled", "taskEnabled"],
      default: "statusChange",
    },
    date: { type: String, required: true },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: Schema.Types.ObjectId, ref: "User" },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

taskStatusLogSchema.index({ task: 1, employee: 1, date: -1 });
taskStatusLogSchema.index({ employee: 1, date: -1 });
taskStatusLogSchema.index({ task: 1, date: -1 });
taskStatusLogSchema.index({ campaign: 1, date: -1 });

const TaskStatusLog =
  mongoose.models.TaskStatusLog ||
  mongoose.model<ITaskStatusLog>("TaskStatusLog", taskStatusLogSchema);
export default TaskStatusLog;
