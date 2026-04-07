import mongoose, { Schema, Types, Document } from "mongoose";

export interface ILeaveBalance extends Document {
  user: Types.ObjectId;
  year: number;
  annual: number;
  sick: number;
  casual: number;
  used: { annual: number; sick: number; casual: number };
  createdAt: Date;
  updatedAt: Date;
}

const leaveBalanceSchema = new Schema<ILeaveBalance>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    year: { type: Number, required: true },
    annual: { type: Number, default: 15 },
    sick: { type: Number, default: 10 },
    casual: { type: Number, default: 5 },
    used: {
      annual: { type: Number, default: 0 },
      sick: { type: Number, default: 0 },
      casual: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

leaveBalanceSchema.index({ user: 1, year: 1 }, { unique: true });

export default mongoose.models.LeaveBalance || mongoose.model<ILeaveBalance>("LeaveBalance", leaveBalanceSchema);
