import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IMonthlyAttendanceStats extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  year: number;
  month: number;
  averageOfficeInTime?: string;
  averageOfficeOutTime?: string;
  averageDailyHours: number;
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  approvedLeaveDays: number;
  onTimeArrivals: number;
  lateArrivals: number;
  onTimePercentage: number;
  totalWorkingHours: number;
  totalOfficeHours: number;
  totalRemoteHours: number;
  attendancePercentage: number;
  createdAt: Date;
  updatedAt: Date;
}

const monthlyAttendanceStatsSchema = new Schema<IMonthlyAttendanceStats>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true },
    averageOfficeInTime: String,
    averageOfficeOutTime: String,
    averageDailyHours: { type: Number, default: 0 },
    totalWorkingDays: { type: Number, default: 0 },
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    approvedLeaveDays: { type: Number, default: 0 },
    onTimeArrivals: { type: Number, default: 0 },
    lateArrivals: { type: Number, default: 0 },
    onTimePercentage: { type: Number, default: 0 },
    totalWorkingHours: { type: Number, default: 0 },
    totalOfficeHours: { type: Number, default: 0 },
    totalRemoteHours: { type: Number, default: 0 },
    attendancePercentage: { type: Number, default: 0 },
  },
  { timestamps: true },
);

monthlyAttendanceStatsSchema.index({ user: 1, year: 1, month: 1 }, { unique: true });

const MonthlyAttendanceStats =
  mongoose.models.MonthlyAttendanceStats ||
  mongoose.model<IMonthlyAttendanceStats>("MonthlyAttendanceStats", monthlyAttendanceStatsSchema);
export default MonthlyAttendanceStats;
