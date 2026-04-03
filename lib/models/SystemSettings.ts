import mongoose, { Schema, type Document } from "mongoose";

export interface ISystemSettings extends Document {
  key: string;
  office: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  };
  shiftDefaults: {
    start: string;
    end: string;
    breakMinutes: number;
    graceMinutes: number;
  };
  company: {
    name: string;
    timezone: string;
  };
  liveUpdates: boolean;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const systemSettingsSchema = new Schema<ISystemSettings>(
  {
    key: { type: String, default: "global", unique: true },
    office: {
      latitude: { type: Number, default: 31.4697 },
      longitude: { type: Number, default: 74.2728 },
      radiusMeters: { type: Number, default: 50 },
    },
    shiftDefaults: {
      start: { type: String, default: "10:00" },
      end: { type: String, default: "19:00" },
      breakMinutes: { type: Number, default: 60 },
      graceMinutes: { type: Number, default: 30 },
    },
    company: {
      name: { type: String, default: "Single Solution" },
      timezone: { type: String, default: "asia-karachi" },
    },
    liveUpdates: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

const SystemSettings =
  mongoose.models.SystemSettings || mongoose.model<ISystemSettings>("SystemSettings", systemSettingsSchema);
export default SystemSettings;
