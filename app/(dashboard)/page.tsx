import { auth } from "@/lib/auth";
import OverviewPage from "./OverviewPage";

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user;
  return <OverviewPage user={user} />;
}
