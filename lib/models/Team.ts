import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface ITeam extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  departments: Types.ObjectId[];
  /** @deprecated kept for backward compat — returns first department */
  department: Types.ObjectId;
  lead?: Types.ObjectId;
  description?: string;
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

const teamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true },
    departments: [{ type: Schema.Types.ObjectId, ref: "Department" }],
    department: { type: Schema.Types.ObjectId, ref: "Department" },
    lead: { type: Schema.Types.ObjectId, ref: "User" },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

teamSchema.index({ departments: 1 });
teamSchema.index({ department: 1 });
teamSchema.index({ lead: 1 });

teamSchema.pre("save", async function () {
  if (this.departments?.length && !this.department) {
    this.department = this.departments[0];
  }
  if (this.department && (!this.departments || this.departments.length === 0)) {
    this.departments = [this.department];
  }

  if (!this.isModified("name")) return;
  let base = slugify(this.name);
  let slug = base;
  let counter = 0;
  const Model = this.constructor as mongoose.Model<ITeam>;
  while (await Model.findOne({ slug, _id: { $ne: this._id } })) {
    counter++;
    slug = `${base}-${counter}`;
  }
  this.slug = slug;
});

const Team = mongoose.models.Team || mongoose.model<ITeam>("Team", teamSchema);
export default Team;
