import mongoose, { Schema, model, models, Types } from "mongoose";

export interface ILocationFlagEvent {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  session: Types.ObjectId;
  latitude: number;
  longitude: number;
  accuracy?: number;
  reasons: string[];
  severity: "warning" | "violation";
  /** Manager / lead who was notified (if any). */
  notifiedTo?: Types.ObjectId;
  acknowledged: boolean;
  acknowledgedBy?: Types.ObjectId;
  acknowledgedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const locationFlagEventSchema = new Schema<ILocationFlagEvent>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    session: { type: Schema.Types.ObjectId, ref: "ActivitySession", required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracy: { type: Number },
    reasons: [{ type: String }],
    severity: { type: String, enum: ["warning", "violation"], default: "warning" },
    notifiedTo: { type: Schema.Types.ObjectId, ref: "User" },
    acknowledged: { type: Boolean, default: false },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User" },
    acknowledgedAt: { type: Date },
  },
  { timestamps: true },
);

locationFlagEventSchema.index({ user: 1, createdAt: -1 });
locationFlagEventSchema.index({ acknowledged: 1, createdAt: -1 });

const LocationFlagEvent =
  (models.LocationFlagEvent as mongoose.Model<ILocationFlagEvent>) ||
  model<ILocationFlagEvent>("LocationFlagEvent", locationFlagEventSchema);

export default LocationFlagEvent;
