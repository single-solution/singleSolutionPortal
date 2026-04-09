import mongoose, { Schema, type Document, type Types } from "mongoose";

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "inProgress" | "completed";

export interface IActivityTask extends Document {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  description?: string;
  assignedTo: Types.ObjectId;
  campaign?: Types.ObjectId;
  deadline?: Date;
  priority: TaskPriority;
  status: TaskStatus;
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

const activityTaskSchema = new Schema<IActivityTask>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true },
    description: { type: String, default: "" },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", required: true },
    campaign: { type: Schema.Types.ObjectId, ref: "Campaign" },
    deadline: Date,
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["pending", "inProgress", "completed"],
      default: "pending",
    },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

activityTaskSchema.index({ campaign: 1 });

activityTaskSchema.pre("save", async function () {
  if (!this.isModified("title")) return;
  let base = slugify(this.title);
  let slug = base;
  let counter = 0;
  const Model = this.constructor as mongoose.Model<IActivityTask>;
  while (await Model.findOne({ slug, _id: { $ne: this._id } })) {
    counter++;
    slug = `${base}-${counter}`;
  }
  this.slug = slug;
});

const ActivityTask =
  mongoose.models.ActivityTask ||
  mongoose.model<IActivityTask>("ActivityTask", activityTaskSchema);
export default ActivityTask;
