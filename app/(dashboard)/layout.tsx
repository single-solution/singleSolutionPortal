import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppLayout } from "./AppLayout";
import Providers from "./Providers";
import { GuideProvider } from "@/lib/useGuide";
import { PermissionsProvider } from "@/lib/usePermissions";
import { getPermissionsPayload } from "@/lib/permissions";

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

  const [liveUpdates, permissionsPayload] = await Promise.all([
    getLiveUpdates(),
    getPermissionsPayload(session.user.id!),
  ]);

  return (
    <Providers>
      <PermissionsProvider initialData={permissionsPayload}>
        <GuideProvider userName={session.user.firstName ?? "there"}>
          <AppLayout user={session.user} liveUpdates={liveUpdates}>{children}</AppLayout>
        </GuideProvider>
      </PermissionsProvider>
    </Providers>
  );
}
