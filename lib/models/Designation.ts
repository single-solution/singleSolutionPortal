import mongoose, { Schema, type Document, type Types } from "mongoose";

export type { IPermissions } from "@/lib/permissions.shared";
export { PERMISSION_KEYS, VIEW_ONLY_PERMISSIONS, PERMISSION_CATEGORIES } from "@/lib/permissions.shared";
import { PERMISSION_KEYS, type IPermissions } from "@/lib/permissions.shared";

function allOff(): Record<string, boolean> {
  const obj: Record<string, boolean> = {};
  for (const k of PERMISSION_KEYS) obj[k] = false;
  return obj;
}

export function makeDefaultPermissions(preset: "employee" | "teamLead" | "manager" | "admin"): IPermissions {
  const p = allOff() as unknown as IPermissions;
  if (preset === "employee") {
    p.updates_view = true;
    p.calendar_view = true;
    p.ping_send = true;
    return p;
  }

  if (preset === "teamLead" || preset === "manager" || preset === "admin") {
    p.employees_view = true;
    p.employees_viewDetail = true;
    p.teams_view = true;
    p.tasks_view = true;
    p.tasks_create = true;
    p.tasks_edit = true;
    p.tasks_reassign = true;
    p.campaigns_view = true;
    p.updates_view = true;
    p.attendance_viewTeam = true;
    p.attendance_viewDetail = true;
    p.leaves_viewTeam = true;
    p.organization_view = true;
    p.calendar_view = true;
    p.ping_send = true;
    p.activityLogs_view = true;
  }

  if (preset === "manager" || preset === "admin") {
    p.employees_create = true;
    p.employees_edit = true;
    p.employees_toggleStatus = true;
    p.employees_resendInvite = true;
    p.members_addToTeam = true;
    p.members_removeFromTeam = true;
    p.members_assignDesignation = true;
    p.departments_view = true;
    p.teams_create = true;
    p.teams_edit = true;
    p.tasks_delete = true;
    p.campaigns_create = true;
    p.campaigns_edit = true;
    p.campaigns_tagEntities = true;
    p.updates_create = true;
    p.updates_edit = true;
    p.attendance_edit = true;
    p.attendance_export = true;
    p.leaves_approve = true;
    p.leaves_manageBulk = true;
    p.payroll_viewTeam = true;
    p.holidays_view = true;
    p.organization_manageLinks = true;
    p.calendar_manage = true;
  }

  if (preset === "admin") {
    for (const k of PERMISSION_KEYS) (p as unknown as Record<string, boolean>)[k] = true;
  }

  return p;
}

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
