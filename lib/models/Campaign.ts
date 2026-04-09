import mongoose, { Schema, type Document, type Types } from "mongoose";

export type CampaignStatus = "active" | "paused" | "completed" | "cancelled";

export interface ICampaign extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  status: CampaignStatus;
  startDate?: Date;
  endDate?: Date;
  budget?: string;
  tags: {
    employees: Types.ObjectId[];
    departments: Types.ObjectId[];
  };
  notes?: string;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

const campaignSchema = new Schema<ICampaign>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["active", "paused", "completed", "cancelled"],
      default: "active",
    },
    startDate: { type: Date },
    endDate: { type: Date },
    budget: { type: String, default: "" },
    tags: {
      employees: [{ type: Schema.Types.ObjectId, ref: "User" }],
      departments: [{ type: Schema.Types.ObjectId, ref: "Department" }],
    },
    notes: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

campaignSchema.index({ status: 1 });
campaignSchema.index({ "tags.employees": 1 });
campaignSchema.index({ "tags.departments": 1 });

campaignSchema.pre("save", async function () {
  if (!this.isModified("name")) return;
  let base = slugify(this.name);
  let slug = base;
  let counter = 0;
  const Model = this.constructor as mongoose.Model<ICampaign>;
  while (await Model.findOne({ slug, _id: { $ne: this._id } })) {
    counter++;
    slug = `${base}-${counter}`;
  }
  this.slug = slug;
});

const Campaign =
  mongoose.models.Campaign || mongoose.model<ICampaign>("Campaign", campaignSchema);
export default Campaign;
