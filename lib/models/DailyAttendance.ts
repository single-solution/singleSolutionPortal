import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IDailyAttendance extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  date: Date;
  firstOfficeEntry?: Date;
  lastOfficeExit?: Date;
  totalWorkingMinutes: number;
  officeMinutes: number;
  remoteMinutes: number;
  isPresent: boolean;
  isOnTime: boolean;
  lateBy: number;
  breakMinutes: number;
  activitySessions: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const dailyAttendanceSchema = new Schema<IDailyAttendance>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true },
    firstOfficeEntry: Date,
    lastOfficeExit: Date,
    totalWorkingMinutes: { type: Number, default: 0 },
    officeMinutes: { type: Number, default: 0 },
    remoteMinutes: { type: Number, default: 0 },
    isPresent: { type: Boolean, default: false },
    isOnTime: { type: Boolean, default: false },
    lateBy: { type: Number, default: 0 },
    breakMinutes: { type: Number, default: 0 },
    activitySessions: [{ type: Schema.Types.ObjectId, ref: "ActivitySession" }],
  },
  { timestamps: true },
);

dailyAttendanceSchema.index({ user: 1, date: 1 }, { unique: true });

const DailyAttendance =
  mongoose.models.DailyAttendance ||
  mongoose.model<IDailyAttendance>("DailyAttendance", dailyAttendanceSchema);
export default DailyAttendance;
