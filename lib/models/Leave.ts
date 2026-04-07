import mongoose, { Schema, type Document, type Types } from "mongoose";

export type LeaveType =
  | "annual"
  | "sick"
  | "casual"
  | "unpaid"
  | "maternity"
  | "paternity"
  | "bereavement"
  | "other";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface ILeave extends Document {
  user: Types.ObjectId;
  type: LeaveType;
  status: LeaveStatus;
  startDate: Date;
  endDate: Date;
  days: number;
  reason: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNote?: string;
  isPastCorrection: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const leaveSchema = new Schema<ILeave>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["annual", "sick", "casual", "unpaid", "maternity", "paternity", "bereavement", "other"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true, min: 0.5 },
    reason: { type: String, default: "" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    reviewNote: { type: String, default: "" },
    isPastCorrection: { type: Boolean, default: false },
  },
  { timestamps: true },
);

leaveSchema.index({ user: 1, startDate: 1 });
leaveSchema.index({ status: 1, startDate: 1 });

export default mongoose.models.Leave || mongoose.model<ILeave>("Leave", leaveSchema);
