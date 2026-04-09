import mongoose, { Schema, type Document, type Types } from "mongoose";
import { PERMISSION_KEYS, type IPermissions } from "./Designation";

export interface IMembership extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  department: Types.ObjectId;
  designation: Types.ObjectId;
  isActive: boolean;
  /** Visual direction: "above" = employee node renders above the department; "below" = below */
  direction: "above" | "below";
  /** "hierarchy" = auto-created from emp→emp link; null = manually created */
  autoSource?: "hierarchy" | null;
  permissions: IPermissions;
  createdAt: Date;
  updatedAt: Date;
}

const permissionSchemaFields: Record<string, { type: typeof Boolean; default: boolean }> = {};
for (const k of PERMISSION_KEYS) {
  permissionSchemaFields[k] = { type: Boolean, default: false };
}

const membershipSchema = new Schema<IMembership>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    department: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    designation: { type: Schema.Types.ObjectId, ref: "Designation", required: true },
    isActive: { type: Boolean, default: true },
    direction: { type: String, enum: ["above", "below"], default: "below" },
    autoSource: { type: String, enum: ["hierarchy", null], default: null },
    permissions: permissionSchemaFields,
  },
  { timestamps: true },
);

membershipSchema.index({ user: 1, isActive: 1 });
membershipSchema.index({ department: 1, isActive: 1 });
membershipSchema.index({ user: 1, department: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

const Membership =
  mongoose.models.Membership ||
  mongoose.model<IMembership>("Membership", membershipSchema);
export default Membership;
