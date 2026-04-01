import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IDepartment extends Document {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  description?: string;
  manager?: Types.ObjectId;
  parentDepartment?: Types.ObjectId;
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

const departmentSchema = new Schema<IDepartment>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true },
    description: { type: String, default: "" },
    manager: { type: Schema.Types.ObjectId, ref: "User" },
    parentDepartment: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

departmentSchema.pre("save", async function () {
  if (!this.isModified("title")) return;
  let base = slugify(this.title);
  let slug = base;
  let counter = 0;
  const Model = this.constructor as mongoose.Model<IDepartment>;
  while (await Model.findOne({ slug, _id: { $ne: this._id } })) {
    counter++;
    slug = `${base}-${counter}`;
  }
  this.slug = slug;
});

const Department =
  mongoose.models.Department || mongoose.model<IDepartment>("Department", departmentSchema);
export default Department;
