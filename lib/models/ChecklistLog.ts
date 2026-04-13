import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IChecklistLog extends Document {
  _id: Types.ObjectId;
  task: Types.ObjectId;
  employee: Types.ObjectId;
  date: string; // "YYYY-MM-DD"
  note?: string;
  completedAt: Date;
}

const checklistLogSchema = new Schema<IChecklistLog>(
  {
    task: { type: Schema.Types.ObjectId, ref: "ActivityTask", required: true },
    employee: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true },
    note: { type: String, default: "" },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

checklistLogSchema.index(
  { task: 1, employee: 1, date: 1 },
  { unique: true },
);
checklistLogSchema.index({ employee: 1, date: 1 });
checklistLogSchema.index({ task: 1, date: 1 });

const ChecklistLog =
  mongoose.models.ChecklistLog ||
  mongoose.model<IChecklistLog>("ChecklistLog", checklistLogSchema);
export default ChecklistLog;
