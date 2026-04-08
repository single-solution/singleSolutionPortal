import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import Designation from "@/lib/models/Designation";
import Membership from "@/lib/models/Membership";
import { makeDefaultPermissions } from "@/lib/models/Designation";
import { ok, unauthorized, forbidden } from "@/lib/helpers";
import { getVerifiedSession, isSuperAdmin } from "@/lib/permissions";

const ROLE_TO_PRESET: Record<string, "employee" | "teamLead" | "manager" | "admin"> = {
  superadmin: "admin",
  admin: "admin",
  manager: "manager",
  teamLead: "teamLead",
  businessDeveloper: "employee",
  developer: "employee",
};

const SYSTEM_DESIGNATIONS: { name: string; color: string; preset: "employee" | "teamLead" | "manager" | "admin" }[] = [
  { name: "Employee", color: "#6b7280", preset: "employee" },
  { name: "Team Lead", color: "#3b82f6", preset: "teamLead" },
  { name: "Manager", color: "#8b5cf6", preset: "manager" },
  { name: "Admin", color: "#ef4444", preset: "admin" },
];

export async function POST() {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!isSuperAdmin(actor)) return forbidden();

  await connectDB();

  const results: string[] = [];

  // Step 1: Create system designations if they don't exist
  const designationMap = new Map<string, string>();
  for (const sd of SYSTEM_DESIGNATIONS) {
    let existing = await Designation.findOne({ name: sd.name }).lean();
    if (!existing) {
      existing = await Designation.create({
        name: sd.name,
        description: `Default ${sd.name.toLowerCase()} designation`,
        color: sd.color,
        isSystem: true,
        isActive: true,
        defaultPermissions: makeDefaultPermissions(sd.preset),
      });
      results.push(`Created designation: ${sd.name}`);
    } else {
      results.push(`Designation already exists: ${sd.name}`);
    }
    designationMap.set(sd.preset, existing._id.toString());
  }

  // Step 2: Set isSuperAdmin flag on superadmin users
  const superadminResult = await User.updateMany(
    { userRole: "superadmin" },
    { $set: { isSuperAdmin: true } },
  );
  results.push(`Marked ${superadminResult.modifiedCount} users as isSuperAdmin`);

  // Step 3: Create Membership records from existing user data
  const users = await User.find({ isSuperAdmin: { $ne: true } })
    .select("userRole department teams reportsTo")
    .lean();

  let created = 0;
  let skipped = 0;

  for (const user of users) {
    const preset = ROLE_TO_PRESET[user.userRole] ?? "employee";
    const designationId = designationMap.get(preset);
    if (!designationId) {
      results.push(`No designation found for role: ${user.userRole} (user ${user._id})`);
      continue;
    }

    if (!user.department) {
      results.push(`User ${user._id} (${user.userRole}) has no department — skipped`);
      skipped++;
      continue;
    }

    const existing = await Membership.findOne({
      user: user._id,
      department: user.department,
      team: null,
    }).lean();

    if (existing) {
      skipped++;
      continue;
    }

    await Membership.create({
      user: user._id,
      department: user.department,
      team: null,
      designation: designationId,
      reportsTo: user.reportsTo ?? null,
      isPrimary: true,
      isActive: true,
      permissions: makeDefaultPermissions(preset),
    });
    created++;

    // If user has team assignments, create team-level memberships too
    const teams = Array.isArray(user.teams) ? user.teams : [];
    for (const teamId of teams) {
      const teamExisting = await Membership.findOne({
        user: user._id,
        department: user.department,
        team: teamId,
      }).lean();
      if (!teamExisting) {
        await Membership.create({
          user: user._id,
          department: user.department,
          team: teamId,
          designation: designationId,
          reportsTo: user.reportsTo ?? null,
          isPrimary: false,
          isActive: true,
          permissions: makeDefaultPermissions(preset),
        });
        created++;
      }
    }
  }

  results.push(`Created ${created} memberships, skipped ${skipped} existing`);

  return ok({ success: true, results });
}
