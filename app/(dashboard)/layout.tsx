import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import SystemSettings from "@/lib/models/SystemSettings";
import { DashboardShell } from "./DashboardShell";
import Providers from "./Providers";
import { GuideProvider } from "@/lib/useGuide";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  await connectDB();
  const settings = await SystemSettings.findOne({ key: "global" }).select("liveUpdates").lean();
  const liveUpdates = !!(settings as { liveUpdates?: boolean } | null)?.liveUpdates;

  return (
    <Providers>
      <GuideProvider userName={session.user.firstName ?? "there"}>
        <DashboardShell user={session.user} liveUpdates={liveUpdates}>{children}</DashboardShell>
      </GuideProvider>
    </Providers>
  );
}
