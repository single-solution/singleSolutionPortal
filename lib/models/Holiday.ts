import mongoose, { Schema, type Document } from "mongoose";

export interface IHoliday extends Document {
  name: string;
  date: Date;
  year: number;
  isRecurring: boolean;
  createdAt: Date;
}

const holidaySchema = new Schema<IHoliday>(
  {
    name: { type: String, required: true },
    date: { type: Date, required: true },
    year: { type: Number, required: true, index: true },
    isRecurring: { type: Boolean, default: false },
  },
  { timestamps: true },
);

holidaySchema.index({ date: 1 }, { unique: true });

const Holiday = mongoose.models.Holiday || mongoose.model<IHoliday>("Holiday", holidaySchema);
export default Holiday;
