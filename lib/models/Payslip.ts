import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IAllowance {
  label: string;
  amount: number;
}

export interface IDeduction {
  label: string;
  amount: number;
}

export interface IPayslip extends Document {
  user: Types.ObjectId;
  month: number;
  year: number;
  baseSalary: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  holidays: number;
  leaveDays: number;
  overtimeHours: number;
  allowances: IAllowance[];
  deductions: IDeduction[];
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  status: "draft" | "finalized" | "paid";
  generatedAt: Date;
  finalizedBy?: Types.ObjectId;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const payslipSchema = new Schema<IPayslip>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    baseSalary: { type: Number, required: true, min: 0 },
    workingDays: { type: Number, default: 0 },
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    lateDays: { type: Number, default: 0 },
    holidays: { type: Number, default: 0 },
    leaveDays: { type: Number, default: 0 },
    overtimeHours: { type: Number, default: 0 },
    allowances: [{ label: String, amount: Number }],
    deductions: [{ label: String, amount: Number }],
    grossPay: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    netPay: { type: Number, default: 0 },
    status: { type: String, enum: ["draft", "finalized", "paid"], default: "draft" },
    generatedAt: { type: Date, default: Date.now },
    finalizedBy: { type: Schema.Types.ObjectId, ref: "User" },
    paidAt: { type: Date },
  },
  { timestamps: true },
);

payslipSchema.index({ user: 1, month: 1, year: 1 }, { unique: true });

const Payslip = mongoose.models.Payslip || mongoose.model<IPayslip>("Payslip", payslipSchema);
export default Payslip;
