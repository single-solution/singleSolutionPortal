import mongoose, { Schema, type Document, type Types } from "mongoose";

export type CorrectionStatus = "pending" | "approved" | "rejected";
export type CorrectionType = "missed_checkin" | "missed_checkout" | "wrong_time" | "other";

export interface IAttendanceCorrection extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  date: Date;
  type: CorrectionType;
  status: CorrectionStatus;
  requestedStart?: Date;
  requestedEnd?: Date;
  reason: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNote?: string;
  appliedToDaily?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceCorrectionSchema = new Schema<IAttendanceCorrection>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, required: true },
    type: {
      type: String,
      enum: ["missed_checkin", "missed_checkout", "wrong_time", "other"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    requestedStart: Date,
    requestedEnd: Date,
    reason: { type: String, required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    reviewNote: { type: String, default: "" },
    appliedToDaily: { type: Schema.Types.ObjectId, ref: "DailyAttendance" },
  },
  { timestamps: true },
);

attendanceCorrectionSchema.index({ user: 1, date: 1 });
attendanceCorrectionSchema.index({ status: 1, createdAt: -1 });

const AttendanceCorrection =
  mongoose.models.AttendanceCorrection ||
  mongoose.model<IAttendanceCorrection>("AttendanceCorrection", attendanceCorrectionSchema);
export default AttendanceCorrection;
