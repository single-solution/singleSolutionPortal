import mongoose, { Schema, type Document, type Types } from "mongoose";

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "inProgress" | "completed";
export type RecurrenceFrequency = "weekly" | "monthly";

export interface IRecurrence {
  frequency: RecurrenceFrequency;
  days: number[]; // weekly: 0=Sun..6=Sat  |  monthly: 1..31
}

export interface IUserStatus {
  user: Types.ObjectId;
  status: TaskStatus;
  updatedAt: Date;
}

export interface IActivityTask extends Document {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  description?: string;
  assignedTo: Types.ObjectId[];
  campaign?: Types.ObjectId;
  parentTask?: Types.ObjectId;
  order: number;
  recurrence?: IRecurrence;
  deadline?: Date;
  priority: TaskPriority;
  status: TaskStatus;
  userStatuses: IUserStatus[];
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

const recurrenceSchema = new Schema(
  {
    frequency: {
      type: String,
      enum: ["weekly", "monthly"],
      required: true,
    },
    days: { type: [Number], required: true },
  },
  { _id: false },
);

const userStatusSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "inProgress", "completed"],
      default: "pending",
    },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const activityTaskSchema = new Schema<IActivityTask>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true },
    description: { type: String, default: "" },
    assignedTo: [{ type: Schema.Types.ObjectId, ref: "User" }],
    campaign: { type: Schema.Types.ObjectId, ref: "Campaign" },
    parentTask: { type: Schema.Types.ObjectId, ref: "ActivityTask", default: null },
    order: { type: Number, default: 0 },
    recurrence: { type: recurrenceSchema, default: undefined },
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
    userStatuses: { type: [userStatusSchema], default: [] },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

activityTaskSchema.index({ campaign: 1 });
activityTaskSchema.index({ parentTask: 1 });
activityTaskSchema.index({ "recurrence.frequency": 1 });
activityTaskSchema.index({ "userStatuses.user": 1 });

activityTaskSchema.pre("save", async function () {
  if (this.isModified("title")) {
    let base = slugify(this.title);
    let slug = base;
    let counter = 0;
    const Model = this.constructor as mongoose.Model<IActivityTask>;
    while (await Model.findOne({ slug, _id: { $ne: this._id } })) {
      counter++;
      slug = `${base}-${counter}`;
    }
    this.slug = slug;
  }

  if (this.userStatuses && this.userStatuses.length > 0 && !this.recurrence) {
    const statuses = this.userStatuses.map((us) => us.status);
    if (statuses.every((s) => s === "completed")) {
      this.status = "completed";
    } else if (statuses.some((s) => s === "inProgress" || s === "completed")) {
      this.status = "inProgress";
    } else {
      this.status = "pending";
    }
  }
});

const ActivityTask =
  mongoose.models.ActivityTask ||
  mongoose.model<IActivityTask>("ActivityTask", activityTaskSchema);
export default ActivityTask;
