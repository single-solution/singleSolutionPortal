import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import EmployeeDetailHub from "./EmployeeDetailHub";
import { notFound, redirect } from "next/navigation";
import { isValidId } from "@/lib/helpers";
import {
  getVerifiedSession,
  hasPermission,
  isSuperAdmin,
  getSubordinateUserIds,
} from "@/lib/permissions";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) redirect("/login");

  const { slug } = await params;
  await connectDB();

  const slugLower = slug.toLowerCase();
  const orConditions: Record<string, unknown>[] = [{ username: slugLower }];
  if (/^[a-f\d]{24}$/i.test(slug) && isValidId(slug)) {
    orConditions.push({ _id: slug });
  }

  const user = await User.findOne({ $or: orConditions })
    .select("-password")
    .lean();

  if (!user) notFound();

  const userId = user._id.toString();
  const isSelf = userId === actor.id;

  if (!isSelf) {
    if (!hasPermission(actor, "employees_view")) redirect("/");
    if (!isSuperAdmin(actor)) {
      const subordinateIds = await getSubordinateUserIds(actor.id);
      if (!subordinateIds.includes(userId)) redirect("/");
    }
  }

  return <EmployeeDetailHub routeSlug={slug} employee={JSON.parse(JSON.stringify(user))} />;
}
