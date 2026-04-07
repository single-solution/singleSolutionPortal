import mongoose, { Schema, type Document } from "mongoose";

export interface IPayrollConfig extends Document {
  workingDaysPerMonth: number;
  lateThresholdMinutes: number;
  latePenaltyPerIncident: number;
  absencePenaltyPerDay: number;
  overtimeRateMultiplier: number;
  currency: string;
  payDay: number;
  createdAt: Date;
  updatedAt: Date;
}

const payrollConfigSchema = new Schema<IPayrollConfig>(
  {
    workingDaysPerMonth: { type: Number, default: 22 },
    lateThresholdMinutes: { type: Number, default: 30 },
    latePenaltyPerIncident: { type: Number, default: 0 },
    absencePenaltyPerDay: { type: Number, default: 100 }, // 100% of daily salary
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
