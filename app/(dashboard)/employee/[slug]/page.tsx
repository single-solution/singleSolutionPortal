import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import { notFound, redirect } from "next/navigation";
import { isValidId } from "@/lib/helpers";
import { getVerifiedSession } from "@/lib/permissions";

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

  const user = await User.findOne({ $or: orConditions }).select("_id").lean();
  if (!user) notFound();

  redirect(`/employees?view=${user._id.toString()}`);
}
