"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { tabIndicatorTransition } from "@/lib/motion";
import { useGuide } from "@/lib/useGuide";
import { insightsDeskTour } from "@/lib/tourConfigs";
import { LeavesTab } from "./LeavesTab";
import { PayrollTab } from "./PayrollTab";

type Tab = "attendance" | "calendar" | "leaves" | "payroll";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "attendance", label: "Attendance", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { id: "calendar", label: "Calendar", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { id: "leaves", label: "Leaves", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "payroll", label: "Payroll", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
];

export default function InsightsDeskPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const { registerTour } = useGuide();
  useEffect(() => { registerTour("insights-desk", insightsDeskTour); }, [registerTour]);
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = searchParams.get("tab") as Tab | null;
    return t && TABS.some((tab) => tab.id === t) ? t : "attendance";
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", activeTab);
    window.history.replaceState({}, "", url.toString());
  }, [activeTab]);

  if (!session) return null;

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
              onClick={() => setActiveTab(tab.id)}
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

      <AnimatePresence mode="wait">
        <motion.div
          data-tour="insights-content"
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "attendance" && <AttendanceRedirect />}
          {activeTab === "calendar" && <ComingSoon label="Calendar" />}
          {activeTab === "leaves" && <LeavesTab />}
          {activeTab === "payroll" && <PayrollTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function AttendanceRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/attendance");
  }, [router]);
  return (
    <div className="flex items-center justify-center py-20">
      <div className="shimmer h-8 w-32 rounded-lg" />
    </div>
  );
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "var(--primary-light)" }}>
        <svg className="h-8 w-8" style={{ color: "var(--primary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-lg font-bold" style={{ color: "var(--fg)" }}>{label}</h2>
      <p className="text-sm" style={{ color: "var(--fg-tertiary)" }}>Coming soon — this feature is under development.</p>
    </div>
  );
}
