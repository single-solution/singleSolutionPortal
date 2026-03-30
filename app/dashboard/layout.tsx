import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardShell } from "./DashboardShell";
import Providers from "./Providers";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <Providers>
      <DashboardShell user={session.user}>{children}</DashboardShell>
    </Providers>
  );
}
