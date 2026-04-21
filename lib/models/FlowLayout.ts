import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IEmpLink {
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  permissions?: Record<string, boolean>;
  designationId?: string;
  leafDesignationId?: string;
}

export interface IFlowLayout extends Document {
  _id: Types.ObjectId;
  canvasId: string;
  positions: Map<string, { x: number; y: number }>;
  links: IEmpLink[];
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
    links: {
      type: [Schema.Types.Mixed] as unknown as IEmpLink[],
      default: [],
    },
  },
  { timestamps: true },
);

const FlowLayout =
  mongoose.models.FlowLayout ||
  mongoose.model<IFlowLayout>("FlowLayout", flowLayoutSchema);
export default FlowLayout;
