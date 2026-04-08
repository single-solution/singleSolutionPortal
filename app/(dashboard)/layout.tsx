import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardShell } from "./DashboardShell";
import Providers from "./Providers";
import { GuideProvider } from "@/lib/useGuide";

async function getLiveUpdates(): Promise<boolean> {
  try {
    const { connectDB } = await import("@/lib/db");
    await connectDB();
    const { default: SystemSettings } = await import("@/lib/models/SystemSettings");
    const row = await SystemSettings.findOne({ key: "global" }).select("liveUpdates").lean();
    return !!(row as { liveUpdates?: boolean } | null)?.liveUpdates;
  } catch {
    return false;
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const liveUpdates = await getLiveUpdates();

  return (
    <Providers>
      <GuideProvider userName={session.user.firstName ?? "there"}>
        <DashboardShell user={session.user} liveUpdates={liveUpdates}>{children}</DashboardShell>
      </GuideProvider>
    </Providers>
  );
}
