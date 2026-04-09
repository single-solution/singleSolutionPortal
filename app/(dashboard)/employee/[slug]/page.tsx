import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import EmployeeDetailHub from "./EmployeeDetailHub";
import { notFound } from "next/navigation";
import { isValidId } from "@/lib/helpers";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await connectDB();

  const slugLower = slug.toLowerCase();
  const orConditions: Record<string, unknown>[] = [{ username: slugLower }];
  if (/^[a-f\d]{24}$/i.test(slug) && isValidId(slug)) {
    orConditions.push({ _id: slug });
  }

  const user = await User.findOne({ $or: orConditions })
    .select("-password")
    .populate("department", "title")
    .lean();

  if (!user) notFound();

  return <EmployeeDetailHub routeSlug={slug} employee={JSON.parse(JSON.stringify(user))} />;
}
