"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { pageTransition, pageTransitionConfig, tabIndicatorTransition, dockEntrance } from "@/lib/motion";
import { employees } from "@/lib/mockData";
import PreviewHeader from "./components/PreviewHeader";

type TabId = "superadmin" | "manager" | "bd" | "developer" | "login";

const SuperAdminPreview = dynamic(() => import("./components/SuperAdminPreview"), { ssr: false });
const ManagerPreview = dynamic(() => import("./components/ManagerPreview"), { ssr: false });
const BDPreview = dynamic(() => import("./components/BDPreview"), { ssr: false });
const DeveloperPreview = dynamic(() => import("./components/DeveloperPreview"), { ssr: false });
const LoginPreview = dynamic(() => import("./components/LoginPreview"), { ssr: false });

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "superadmin", label: "SuperAdmin", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
  { id: "manager", label: "Manager", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
  { id: "bd", label: "BD", icon: "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  { id: "developer", label: "Developer", icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" },
  { id: "login", label: "Login", icon: "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" },
];

const ROLE_LABELS: Record<string, string> = {
  superadmin: "SuperAdmin",
  manager: "Manager",
  bd: "Business Developer",
  developer: "Developer",
};

const ROLE_EMPLOYEE_IDS: Record<string, string> = {
  superadmin: "e1",
  manager: "e2",
  bd: "e4",
  developer: "e5",
};

const COMPONENTS: Record<Exclude<TabId, "login">, React.ComponentType> = {
  superadmin: SuperAdminPreview,
  manager: ManagerPreview,
  bd: BDPreview,
  developer: DeveloperPreview,
};

function getRoleUser(tabId: TabId) {
  const empId = ROLE_EMPLOYEE_IDS[tabId] ?? "e1";
  const emp = employees.find((e) => e._id === empId) ?? employees[0];
  return {
    firstName: emp.firstName,
    lastName: emp.lastName,
    email: emp.email,
    designation: emp.designation,
  };
}

export default function PreviewPage() {
  const [active, setActive] = useState<TabId>("superadmin");
  const isLogin = active === "login";

  return (
    <div className="min-h-screen gradient-mesh">
      {!isLogin && (
        <PreviewHeader
          currentRole={ROLE_LABELS[active] ?? "SuperAdmin"}
          roleUser={getRoleUser(active)}
        />
      )}

      <div className={isLogin ? "" : "pb-24 sm:pb-6"}>
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            variants={pageTransition}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={pageTransitionConfig}
          >
            {isLogin ? <LoginPreview /> : (() => { const C = COMPONENTS[active]; return <C />; })()}
          </motion.div>
        </AnimatePresence>
      </div>

      <motion.div
        initial={dockEntrance.initial}
        animate={dockEntrance.animate}
        transition={dockEntrance.transition}
        className="fixed bottom-0 left-0 right-0 z-50 sm:bottom-5 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-3 mb-2 sm:mx-0">
          <LayoutGroup>
            <nav
              className="flex items-stretch justify-around sm:justify-center sm:gap-1 rounded-2xl sm:rounded-full"
              style={{
                background: "var(--dock-bg, rgba(242,242,247,0.82))",
                backdropFilter: "saturate(180%) blur(24px)",
                WebkitBackdropFilter: "saturate(180%) blur(24px)",
                border: "0.5px solid rgba(255,255,255,0.50)",
                boxShadow: "0 2px 20px rgba(0,0,0,0.10), 0 0 1px rgba(0,0,0,0.08), inset 0 0.5px 0 rgba(255,255,255,0.80)",
                padding: "8px 12px",
              }}
            >
              {TABS.map((tab) => {
                const isActive = active === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActive(tab.id)}
                    className="relative flex flex-col sm:flex-row items-center justify-center flex-1 sm:flex-initial py-2 sm:py-0 sm:h-11 sm:px-4 sm:rounded-full"
                    style={{ gap: 4 }}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="preview-nav-active"
                        className="absolute inset-x-1.5 inset-y-1 sm:inset-0 rounded-xl sm:rounded-full"
                        style={{
                          background: "var(--primary-light)",
                          border: "0.5px solid var(--glass-border)",
                          boxShadow: "inset 0 0.5px 0 var(--glass-border-inner)",
                        }}
                        transition={tabIndicatorTransition}
                      />
                    )}
                    <svg
                      className="relative"
                      style={{
                        width: 20, height: 20,
                        color: isActive ? "var(--primary)" : "var(--fg-tertiary)",
                      }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={isActive ? 2 : 1.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                    </svg>
                    <span
                      className="relative font-semibold"
                      style={{
                        fontSize: 10,
                        lineHeight: 1,
                        color: isActive ? "var(--primary)" : "var(--fg-tertiary)",
                      }}
                    >
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </nav>
          </LayoutGroup>
        </div>
      </motion.div>
    </div>
  );
}
