import mongoose, { Schema, type Document, type Types } from "mongoose";

export type { IPermissions } from "@/lib/permissions.shared";
export { PERMISSION_KEYS, PERMISSION_CATEGORIES } from "@/lib/permissions.shared";
import { PERMISSION_KEYS, type IPermissions } from "@/lib/permissions.shared";

export interface IDesignation extends Document {
  _id: Types.ObjectId;
  name: string;
  description: string;
  color: string;
  isSystem: boolean;
  isActive: boolean;
  defaultPermissions: IPermissions;
  createdAt: Date;
  updatedAt: Date;
}

const permissionSchemaFields: Record<string, { type: typeof Boolean; default: boolean }> = {};
for (const k of PERMISSION_KEYS) {
  permissionSchemaFields[k] = { type: Boolean, default: false };
}

const designationSchema = new Schema<IDesignation>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    color: { type: String, default: "#6366f1" },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    defaultPermissions: permissionSchemaFields,
  },
  { timestamps: true },
);

designationSchema.index({ name: 1 }, { unique: true });

const Designation =
  mongoose.models.Designation ||
  mongoose.model<IDesignation>("Designation", designationSchema);
export default Designation;
