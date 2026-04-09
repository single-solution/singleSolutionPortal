"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, LayoutGroup } from "framer-motion";
import { tabIndicatorTransition } from "@/lib/motion";
import { useGuide } from "@/lib/useGuide";
import { workspaceTour } from "@/lib/tourConfigs";

type Tab = "campaigns" | "tasks" | "updates";

const TABS: { id: Tab; label: string; href: string }[] = [
  { id: "campaigns", label: "Campaigns", href: "/workspace/campaigns" },
  { id: "tasks", label: "Tasks", href: "/workspace/tasks" },
  { id: "updates", label: "Updates", href: "/workspace/updates" },
];

function resolveTab(pathname: string): Tab {
  for (const t of TABS) {
    if (pathname.startsWith(t.href)) return t.id;
  }
  return "campaigns";
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = resolveTab(pathname);
  const { registerTour } = useGuide();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => { registerTour("workspace", workspaceTour); }, [registerTour]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-headline text-lg font-bold" style={{ color: "var(--fg)" }}>Workspace</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--fg-secondary)" }}>
            Campaigns, tasks, and team activity in one place.
          </p>
        </div>
      </div>

      <LayoutGroup>
        <div data-tour="workspace-tabs" className="flex gap-1 rounded-xl p-1 mb-6" style={{ background: "var(--bg-grouped)" }}>
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => router.push(t.href)}
                className="relative flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                style={{ color: active ? "var(--primary)" : "var(--fg-tertiary)" }}
              >
                {mounted && active && (
                  <motion.span
                    layoutId="workspace-tab-pill"
                    className="absolute inset-0 rounded-lg"
                    style={{ background: "var(--primary-light)" }}
                    transition={tabIndicatorTransition}
                  />
                )}
                <span className="relative">{t.label}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      {children}
    </div>
  );
}
