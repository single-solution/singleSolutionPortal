"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, LayoutGroup } from "framer-motion";
import { tabIndicatorTransition } from "@/lib/motion";
import { useGuide } from "@/lib/useGuide";
import { insightsDeskTour } from "@/lib/tourConfigs";

type Tab = "attendance" | "calendar" | "leaves" | "payroll";

const TABS: { id: Tab; label: string; href: string; icon: string }[] = [
  { id: "attendance", label: "Attendance", href: "/insights-desk/attendance", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { id: "calendar", label: "Calendar", href: "/insights-desk/calendar", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { id: "leaves", label: "Leaves", href: "/insights-desk/leaves", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "payroll", label: "Payroll", href: "/insights-desk/payroll", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
];

function resolveTab(pathname: string): Tab {
  for (const t of TABS) {
    if (pathname.startsWith(t.href)) return t.id;
  }
  return "attendance";
}

export default function InsightsDeskLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = resolveTab(pathname);
  const { registerTour } = useGuide();

  useEffect(() => { registerTour("insights-desk", insightsDeskTour); }, [registerTour]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-headline text-lg font-bold" style={{ color: "var(--fg)" }}>Insights Desk</h1>
      </div>

      <LayoutGroup>
        <div data-tour="insights-tabs" className="flex gap-1 rounded-xl p-1 mb-6" style={{ background: "var(--bg-grouped)" }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => router.push(tab.href)}
              className="relative flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
              style={{ color: activeTab === tab.id ? "var(--primary)" : "var(--fg-tertiary)" }}
            >
              {activeTab === tab.id && (
                <motion.span
                  layoutId="insights-tab-pill"
                  className="absolute inset-0 rounded-lg"
                  style={{ background: "var(--primary-light)" }}
                  transition={tabIndicatorTransition}
                />
              )}
              <svg className="relative h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
              </svg>
              <span className="relative">{tab.label}</span>
            </button>
          ))}
        </div>
      </LayoutGroup>

      {children}
    </div>
  );
}
