import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IFlowLayout extends Document {
  _id: Types.ObjectId;
  /** e.g. "org" — one layout per named canvas */
  canvasId: string;
  positions: Map<string, { x: number; y: number }>;
  updatedAt: Date;
}

const flowLayoutSchema = new Schema<IFlowLayout>(
  {
    canvasId: { type: String, required: true, unique: true },
    positions: {
      type: Map,
      of: { x: Number, y: Number },
      default: {},
    },
  },
  { timestamps: true },
);

const FlowLayout =
  mongoose.models.FlowLayout ||
  mongoose.model<IFlowLayout>("FlowLayout", flowLayoutSchema);
export default FlowLayout;
