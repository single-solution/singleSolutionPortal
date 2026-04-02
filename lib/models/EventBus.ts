import mongoose, { Schema, model, models } from "mongoose";

export type Channel =
  | "presence"
  | "employees"
  | "tasks"
  | "departments"
  | "teams"
  | "campaigns"
  | "activity"
  | "settings"
  | "ping";

export interface IEventBus {
  _id: string;
  presence: Date;
  employees: Date;
  tasks: Date;
  departments: Date;
  teams: Date;
  campaigns: Date;
  activity: Date;
  settings: Date;
  ping: Date;
}

const eventBusSchema = new Schema<IEventBus>(
  {
    _id: { type: String, default: "global" },
    presence: { type: Date, default: () => new Date() },
    employees: { type: Date, default: () => new Date() },
    tasks: { type: Date, default: () => new Date() },
    departments: { type: Date, default: () => new Date() },
    teams: { type: Date, default: () => new Date() },
    campaigns: { type: Date, default: () => new Date() },
    activity: { type: Date, default: () => new Date() },
    settings: { type: Date, default: () => new Date() },
    ping: { type: Date, default: () => new Date() },
  },
  { timestamps: false, versionKey: false },
);

const EventBus =
  (models.EventBus as mongoose.Model<IEventBus>) ||
  model<IEventBus>("EventBus", eventBusSchema);

export default EventBus;
