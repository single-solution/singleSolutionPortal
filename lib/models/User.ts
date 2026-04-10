import mongoose, { Schema, type Document, type Types } from "mongoose";
import {
  makeDefaultWeeklySchedule,
  resolveWeeklySchedule,
  type ShiftType,
  type Weekday,
  type WeeklySchedule,
} from "@/lib/schedule";

export {
  ALL_WEEKDAYS,
  WEEKDAY_LABELS,
  makeDefaultWeeklySchedule,
  resolveWeeklySchedule,
  resolveGraceMinutes,
  getTodaySchedule,
} from "@/lib/schedule";
export type {
  ShiftType,
  Weekday,
  DaySchedule,
  WeeklySchedule,
} from "@/lib/schedule";

export type ProposalStatus = "pending" | "submitted" | "shortlisted" | "interview" | "hired" | "rejected" | "withdrawn";

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  username: string;
  password: string;
  isSuperAdmin: boolean;
  about: {
    firstName: string;
    lastName: string;
    phone?: string;
    profileImage?: string;
  };
  weeklySchedule: WeeklySchedule;
  graceMinutes: number;
  shiftType: ShiftType;
  businessDeveloper?: {
    jobID?: string;
    dateFound?: Date;
    link?: string;
    platform?: string;
    clientCompanyName?: string;
    clientCountry?: string;
    jobTitle?: string;
    jobDescription?: string;
    expectedSalaryBudget?: string;
    techStackRequired?: string;
    proposalStatus?: ProposalStatus;
    proposalSentDate?: Date;
    interviewDate?: Date;
    clientFeedback?: string;
    followUpNeeded?: boolean;
    finalStatus?: string;
    notes?: string;
  };
  passwordReset?: {
    code?: number;
    expiresAt?: Date;
    count: number;
    lastResetDate?: Date;
  };
  resetToken?: string;
  resetTokenExpiry?: Date;
  lastEmailChange?: Date;
  lastSeenLogId?: string;
  preferences?: {
    showCoordinates?: boolean;
  };
  guideTours: {
    welcome: boolean;
    dashboard: boolean;
    organization: boolean;
    workspace: boolean;
    "insights-desk": boolean;
    employees: boolean;
    departments: boolean;
    campaigns: boolean;
    tasks: boolean;
    attendance: boolean;
    settings: boolean;
  };
  isActive: boolean;
  salary?: number;
  salaryHistory: {
    previousSalary: number;
    newSalary: number;
    incrementPercent: number;
    effectiveDate: Date;
    changedAt: Date;
  }[];
  isVerified: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  fullName: string;
  totalShiftHours: number;
  workingHours: number;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    username: { type: String, required: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    isSuperAdmin: { type: Boolean, default: false },
    about: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, default: "", trim: true },
      phone: { type: String, default: "" },
      profileImage: { type: String, default: "" },
    },
    weeklySchedule: {
      type: Schema.Types.Mixed,
      default: makeDefaultWeeklySchedule,
    },
    graceMinutes: { type: Number, default: 30 },
    shiftType: {
      type: String,
      enum: ["fullTime", "partTime", "contract"],
      default: "fullTime",
    },
    businessDeveloper: {
      jobID: String,
      dateFound: Date,
      link: String,
      platform: String,
      clientCompanyName: String,
      clientCountry: String,
      jobTitle: String,
      jobDescription: String,
      expectedSalaryBudget: String,
      techStackRequired: String,
      proposalStatus: { type: String, enum: ["pending", "submitted", "shortlisted", "interview", "hired", "rejected", "withdrawn"], default: "pending" },
      proposalSentDate: Date,
      interviewDate: Date,
      clientFeedback: String,
      followUpNeeded: { type: Boolean, default: false },
      finalStatus: String,
      notes: String,
    },
    passwordReset: {
      code: Number,
      expiresAt: Date,
      count: { type: Number, default: 0 },
      lastResetDate: Date,
    },
    resetToken: String,
    resetTokenExpiry: Date,
    lastEmailChange: { type: Date, default: null },
    lastSeenLogId: { type: String, default: null },
    preferences: {
      showCoordinates: { type: Boolean, default: false },
    },
    guideTours: {
      welcome: { type: Boolean, default: false },
      dashboard: { type: Boolean, default: false },
      organization: { type: Boolean, default: false },
      workspace: { type: Boolean, default: false },
      "insights-desk": { type: Boolean, default: false },
      employees: { type: Boolean, default: false },
      departments: { type: Boolean, default: false },
      campaigns: { type: Boolean, default: false },
      tasks: { type: Boolean, default: false },
      attendance: { type: Boolean, default: false },
      settings: { type: Boolean, default: false },
    },
    isActive: { type: Boolean, default: true },
    salary: { type: Number, min: 0 },
    salaryHistory: [{
      previousSalary: { type: Number, required: true },
      newSalary: { type: Number, required: true },
      incrementPercent: { type: Number, required: true },
      effectiveDate: { type: Date, required: true },
      changedAt: { type: Date, default: Date.now },
    }],
    isVerified: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ isSuperAdmin: 1 });

userSchema.virtual("fullName").get(function () {
  const first = this.about?.firstName ?? "";
  const last = this.about?.lastName ?? "";
  return `${first} ${last}`.trim() || this.username;
});

userSchema.virtual("totalShiftHours").get(function () {
  const doc = this.toObject ? this.toObject() : this;
  const schedule = resolveWeeklySchedule(doc as unknown as Record<string, unknown>);
  const dayIndex = new Date().getDay();
  const dayMap: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const today = schedule[dayMap[dayIndex]];
  if (!today.isWorking) return 0;
  const [sh, sm] = today.start.split(":").map(Number);
  const [eh, em] = today.end.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
});

userSchema.virtual("workingHours").get(function () {
  const doc = this.toObject ? this.toObject() : this;
  const schedule = resolveWeeklySchedule(doc as unknown as Record<string, unknown>);
  const dayIndex = new Date().getDay();
  const dayMap: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const today = schedule[dayMap[dayIndex]];
  if (!today.isWorking) return 0;
  return this.totalShiftHours - today.breakMinutes / 60;
});

const User = mongoose.models.User || mongoose.model<IUser>("User", userSchema);
export default User;
