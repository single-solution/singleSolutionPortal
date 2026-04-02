import mongoose, { Schema, model, models, Types } from "mongoose";

export interface IPing {
  _id: Types.ObjectId;
  from: Types.ObjectId;
  to: Types.ObjectId;
  message: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const pingSchema = new Schema<IPing>(
  {
    from: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    to: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    message: { type: String, default: "", maxlength: 280 },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

pingSchema.index({ to: 1, read: 1, createdAt: -1 });

const Ping =
  (models.Ping as mongoose.Model<IPing>) || model<IPing>("Ping", pingSchema);

export default Ping;
