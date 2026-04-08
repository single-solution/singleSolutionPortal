import mongoose, { Schema, type Document, type Types } from "mongoose";
import { PERMISSION_KEYS, type IPermissions } from "./Designation";

export interface IMembership extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  department: Types.ObjectId;
  team?: Types.ObjectId;
  designation: Types.ObjectId;
  reportsTo?: Types.ObjectId;
  isPrimary: boolean;
  isActive: boolean;
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
    team: { type: Schema.Types.ObjectId, ref: "Team", default: null },
    designation: { type: Schema.Types.ObjectId, ref: "Designation", required: true },
    reportsTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    isPrimary: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    permissions: permissionSchemaFields,
  },
  { timestamps: true },
);

membershipSchema.index({ user: 1, isActive: 1 });
membershipSchema.index({ department: 1, isActive: 1 });
membershipSchema.index({ user: 1, department: 1, team: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

const Membership =
  mongoose.models.Membership ||
  mongoose.model<IMembership>("Membership", membershipSchema);
export default Membership;
