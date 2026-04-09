import mongoose, { Schema, type Document } from "mongoose";

export interface ILatePenaltyTier {
  minMinutes: number;
  maxMinutes: number;
  penaltyPercent: number;
}

export interface IPayrollConfig extends Document {
  workingDaysPerMonth: number;
  lateThresholdMinutes: number;
  latePenaltyTiers: ILatePenaltyTier[];
  absencePenaltyPerDay: number;
  overtimeRateMultiplier: number;
  currency: string;
  payDay: number;
  createdAt: Date;
  updatedAt: Date;
}

const latePenaltyTierSchema = new Schema<ILatePenaltyTier>(
  {
    minMinutes: { type: Number, required: true },
    maxMinutes: { type: Number, required: true },
    penaltyPercent: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const DEFAULT_LATE_PENALTY_TIERS: ILatePenaltyTier[] = [
  { minMinutes: 0, maxMinutes: 15, penaltyPercent: 0 },
  { minMinutes: 16, maxMinutes: 30, penaltyPercent: 50 },
  { minMinutes: 31, maxMinutes: 9999, penaltyPercent: 100 },
];

const payrollConfigSchema = new Schema<IPayrollConfig>(
  {
    workingDaysPerMonth: { type: Number, default: 22 },
    lateThresholdMinutes: { type: Number, default: 30 },
    latePenaltyTiers: { type: [latePenaltyTierSchema], default: () => DEFAULT_LATE_PENALTY_TIERS },
    absencePenaltyPerDay: { type: Number, default: 100 },
    overtimeRateMultiplier: { type: Number, default: 1.5 },
    currency: { type: String, default: "PKR" },
    payDay: { type: Number, default: 1, min: 1, max: 28 },
  },
  { timestamps: true },
);

const PayrollConfig =
  mongoose.models.PayrollConfig ||
  mongoose.model<IPayrollConfig>("PayrollConfig", payrollConfigSchema);
export default PayrollConfig;
