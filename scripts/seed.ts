import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI!;

const TEST_USERS = [
  {
    email: "admin@singlesolution.com",
    username: "admin",
    firstName: "Admin",
    lastName: "User",
    role: "superadmin",
  },
  {
    email: "manager@singlesolution.com",
    username: "manager",
    firstName: "Sarah",
    lastName: "Khan",
    role: "manager",
  },
  {
    email: "developer@singlesolution.com",
    username: "developer",
    firstName: "Ali",
    lastName: "Ahmed",
    role: "developer",
  },
  {
    email: "bd@singlesolution.com",
    username: "bd",
    firstName: "Fatima",
    lastName: "Malik",
    role: "businessDeveloper",
  },
];

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

  const password = await bcrypt.hash("Test@1234", 12);

  for (const u of TEST_USERS) {
    const existing = await User.findOne({ email: u.email });
    if (existing) {
      console.log(`  ✓ ${u.role} already exists: ${u.email}`);
      continue;
    }

    await User.create({
      email: u.email,
      username: u.username,
      password,
      about: { firstName: u.firstName, lastName: u.lastName },
      userRole: u.role,
      workShift: {
        type: "fullTime",
        shift: { start: "10:00", end: "19:00" },
        workingDays: ["mon", "tue", "wed", "thu", "fri"],
        breakTime: 60,
      },
      isActive: true,
      isVerified: true,
    });

    console.log(`  + Created ${u.role}: ${u.email}`);
  }

  console.log("\nAll test accounts use password: Test@1234");
  console.log("Done.");
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
