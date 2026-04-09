import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IDailyAttendance extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  date: Date;
  firstOfficeEntry?: Date;
  lastOfficeExit?: Date;
  lastSessionEnd?: Date;
  totalWorkingMinutes: number;
  officeMinutes: number;
  remoteMinutes: number;
  isPresent: boolean;
  isOnTime: boolean;
  lateBy: number;
  isLateToOffice: boolean;
  lateToOfficeBy: number;
  isHoliday: boolean;
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
    lastSessionEnd: Date,
    totalWorkingMinutes: { type: Number, default: 0 },
    officeMinutes: { type: Number, default: 0 },
    remoteMinutes: { type: Number, default: 0 },
    isPresent: { type: Boolean, default: false },
    isOnTime: { type: Boolean, default: false },
    lateBy: { type: Number, default: 0 },
    isLateToOffice: { type: Boolean, default: false },
    lateToOfficeBy: { type: Number, default: 0 },
    isHoliday: { type: Boolean, default: false },
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
