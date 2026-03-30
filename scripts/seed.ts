import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI!;

async function seed() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected.");

  const userSchema = new mongoose.Schema({
    email: String,
    username: String,
    password: String,
    about: {
      firstName: String,
      lastName: String,
      phone: String,
      profileImage: String,
    },
    department: mongoose.Schema.Types.ObjectId,
    userRole: String,
    workShift: {
      type: { type: String },
      shift: { start: String, end: String },
      workingDays: [String],
      breakTime: Number,
    },
    businessDeveloper: { type: mongoose.Schema.Types.Mixed },
    passwordReset: { type: mongoose.Schema.Types.Mixed },
    resetToken: String,
    resetTokenExpiry: Date,
    isActive: Boolean,
    isVerified: Boolean,
    createdBy: mongoose.Schema.Types.ObjectId,
    updatedBy: mongoose.Schema.Types.ObjectId,
  }, { timestamps: true });

  const User = mongoose.models.User || mongoose.model("User", userSchema);

  const existing = await User.findOne({ email: "admin@singlesolution.com" });
  if (existing) {
    console.log("SuperAdmin already exists:", existing.email);
    await mongoose.disconnect();
    return;
  }

  const password = await bcrypt.hash("Admin@1234", 12);

  await User.create({
    email: "admin@singlesolution.com",
    username: "admin",
    password,
    about: {
      firstName: "Admin",
      lastName: "User",
    },
    userRole: "superadmin",
    workShift: {
      type: "fullTime",
      shift: { start: "10:00", end: "19:00" },
      workingDays: ["mon", "tue", "wed", "thu", "fri"],
      breakTime: 60,
    },
    isActive: true,
    isVerified: true,
  });

  console.log("SuperAdmin created: admin@singlesolution.com / Admin@1234");
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
