import { auth } from "@/lib/auth";
import DashboardHome from "./DashboardHome";

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user;
  return <DashboardHome user={user} />;
}
