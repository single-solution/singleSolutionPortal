import mongoose, { Schema, type Document, type Types } from "mongoose";

export type SessionStatus = "active" | "disconnected" | "timeout";

export interface IOfficeSegment {
  entryTime: Date;
  exitTime?: Date;
  durationMinutes: number;
}

export interface IActivitySession extends Document {
  _id: Types.ObjectId;
  session: string;
  user: Types.ObjectId;
  ipAddress?: string;
  platform?: string;
  userAgent?: string;
  deviceId?: string;
  location: {
    inOffice: boolean;
    latitude?: number;
    longitude?: number;
  };
  sessionTime: {
    start: Date;
    end?: Date;
  };
  lastActivity: Date;
  status: SessionStatus;
  sessionDate: Date;
  durationMinutes: number;
  officeSegments: IOfficeSegment[];
  isFirstOfficeEntry: boolean;
  isLastOfficeExit: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const officeSegmentSchema = new Schema<IOfficeSegment>(
  {
    entryTime: { type: Date, required: true },
    exitTime: Date,
    durationMinutes: { type: Number, default: 0 },
  },
  { _id: false },
);

const activitySessionSchema = new Schema<IActivitySession>(
  {
    session: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ipAddress: String,
    platform: String,
    userAgent: String,
    deviceId: String,
    location: {
      inOffice: { type: Boolean, default: false },
      latitude: Number,
      longitude: Number,
    },
    sessionTime: {
      start: { type: Date, required: true },
      end: Date,
    },
    lastActivity: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["active", "disconnected", "timeout"],
      default: "active",
    },
    sessionDate: { type: Date, required: true },
    durationMinutes: { type: Number, default: 0 },
    officeSegments: [officeSegmentSchema],
    isFirstOfficeEntry: { type: Boolean, default: false },
    isLastOfficeExit: { type: Boolean, default: false },
  },
  { timestamps: true },
);

activitySessionSchema.index({ user: 1, sessionDate: 1 });
activitySessionSchema.index({ session: 1 });

const ActivitySession =
  mongoose.models.ActivitySession ||
  mongoose.model<IActivitySession>("ActivitySession", activitySessionSchema);
export default ActivitySession;
