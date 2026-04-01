import mongoose, { Schema, type Document, type Types } from "mongoose";

export type UserRole = "superadmin" | "manager" | "teamLead" | "businessDeveloper" | "developer";
export type ShiftType = "fullTime" | "partTime" | "contract";
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type ProposalStatus = "pending" | "submitted" | "shortlisted" | "interview" | "hired" | "rejected" | "withdrawn";

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  username: string;
  password: string;
  about: {
    firstName: string;
    lastName: string;
    phone?: string;
    profileImage?: string;
  };
  department?: Types.ObjectId;
  teams: Types.ObjectId[];
  reportsTo?: Types.ObjectId;
  userRole: UserRole;
  workShift: {
    type: ShiftType;
    shift: { start: string; end: string };
    workingDays: Weekday[];
    breakTime: number;
  };
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
  crossDepartmentAccess: boolean;
  teamStatsVisible: boolean;
  isActive: boolean;
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
    about: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, default: "", trim: true },
      phone: { type: String, default: "" },
      profileImage: { type: String, default: "" },
    },
    department: { type: Schema.Types.ObjectId, ref: "Department" },
    teams: [{ type: Schema.Types.ObjectId, ref: "Team" }],
    reportsTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    userRole: {
      type: String,
      enum: ["superadmin", "manager", "teamLead", "businessDeveloper", "developer"],
      required: true,
    },
    workShift: {
      type: {
        type: String,
        enum: ["fullTime", "partTime", "contract"],
        default: "fullTime",
      },
      shift: {
        start: { type: String, default: "10:00" },
        end: { type: String, default: "19:00" },
      },
      workingDays: {
        type: [{ type: String, enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }],
        default: ["mon", "tue", "wed", "thu", "fri"],
      },
      breakTime: { type: Number, default: 60 },
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
    crossDepartmentAccess: { type: Boolean, default: false },
    teamStatsVisible: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
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
userSchema.index({ userRole: 1 });
userSchema.index({ department: 1 });

userSchema.virtual("fullName").get(function () {
  const first = this.about?.firstName ?? "";
  const last = this.about?.lastName ?? "";
  return `${first} ${last}`.trim() || this.username;
});

userSchema.virtual("totalShiftHours").get(function () {
  const start = this.workShift?.shift?.start ?? "10:00";
  const end = this.workShift?.shift?.end ?? "19:00";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
});

userSchema.virtual("workingHours").get(function () {
  const breakMinutes = this.workShift?.breakTime ?? 60;
  return this.totalShiftHours - breakMinutes / 60;
});

const User = mongoose.models.User || mongoose.model<IUser>("User", userSchema);
export default User;
