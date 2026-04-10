import mongoose, { Schema, type Document } from "mongoose";

export interface ILatePenaltyTier {
  minutes: number;
  penaltyPercent: number;
}

export interface IPayrollConfig extends Document {
  latePenaltyTiers: ILatePenaltyTier[];
  absencePenaltyPerDay: number;
  overtimeRateMultiplier: number;
  payDay: number;
  createdAt: Date;
  updatedAt: Date;
}

const latePenaltyTierSchema = new Schema<ILatePenaltyTier>(
  {
    minutes: { type: Number, required: true, min: 0 },
    penaltyPercent: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const DEFAULT_LATE_PENALTY_TIERS: ILatePenaltyTier[] = [
  { minutes: 15, penaltyPercent: 0 },
  { minutes: 30, penaltyPercent: 50 },
  { minutes: 60, penaltyPercent: 100 },
];

const payrollConfigSchema = new Schema<IPayrollConfig>(
  {
    latePenaltyTiers: { type: [latePenaltyTierSchema], default: () => DEFAULT_LATE_PENALTY_TIERS },
    absencePenaltyPerDay: { type: Number, default: 100 },
    overtimeRateMultiplier: { type: Number, default: 1.5 },
    payDay: { type: Number, default: 1, min: 1, max: 28 },
  },
  { timestamps: true },
);

const PayrollConfig =
  mongoose.models.PayrollConfig ||
  mongoose.model<IPayrollConfig>("PayrollConfig", payrollConfigSchema);
export default PayrollConfig;
