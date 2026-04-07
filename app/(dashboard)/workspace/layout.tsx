"use client";

import { useEffect } from "react";
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

  useEffect(() => { registerTour("workspace", workspaceTour); }, [registerTour]);

  return (
    <div className="flex flex-col gap-0 pb-24">
      <div className="mb-4">
        <h1 className="text-title">Workspace</h1>
        <p className="text-subhead" style={{ color: "var(--fg-secondary)" }}>
          Campaigns, tasks, and team activity in one place.
        </p>
      </div>

      <div className="card-xl mb-4 p-1.5 sm:p-2">
        <LayoutGroup id="workspace-section-tabs">
          <div className="relative flex w-full flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center" style={{ borderColor: "var(--border-strong)" }}>
            {TABS.map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => router.push(t.href)}
                  className="relative flex-1 rounded-lg px-3 py-2.5 text-center text-sm font-semibold transition-colors sm:flex-initial sm:px-5 sm:py-2"
                  style={{ color: active ? "var(--primary)" : "var(--fg-secondary)" }}
                >
                  {active && (
                    <motion.span
                      layoutId="workspace-tab-pill"
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: "var(--primary-light)",
                        border: "0.5px solid color-mix(in srgb, var(--primary) 25%, transparent)",
                        boxShadow: "inset 0 0.5px 0 var(--glass-border-inner, rgba(255,255,255,0.06))",
                      }}
                      transition={tabIndicatorTransition}
                    />
                  )}
                  <span className="relative z-[1]">{t.label}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>
      </div>

      {children}
    </div>
  );
}
