import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface ITaskStatusLog extends Document {
  _id: Types.ObjectId;
  task: Types.ObjectId;
  employee: Types.ObjectId;
  status: "pending" | "inProgress" | "completed";
  date: string; // "YYYY-MM-DD"
  changedAt: Date;
  changedBy?: Types.ObjectId;
  note?: string;
}

const taskStatusLogSchema = new Schema<ITaskStatusLog>(
  {
    task: { type: Schema.Types.ObjectId, ref: "ActivityTask", required: true },
    employee: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "inProgress", "completed"],
      required: true,
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

const TaskStatusLog =
  mongoose.models.TaskStatusLog ||
  mongoose.model<ITaskStatusLog>("TaskStatusLog", taskStatusLogSchema);
export default TaskStatusLog;
