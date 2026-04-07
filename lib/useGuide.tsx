"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { WelcomeGuide } from "@/app/(dashboard)/components/WelcomeGuide";
import { SpotlightTour, type TourStep } from "@/app/(dashboard)/components/SpotlightTour";

type TourName = "welcome" | "dashboard" | "organization" | "workspace" | "insights-desk" | "settings" | "employees" | "departments" | "campaigns" | "tasks" | "attendance";

interface GuideContextValue {
  startTour: (name: TourName) => void;
  startWelcome: () => void;
  registerTour: (name: TourName, steps: TourStep[]) => void;
  tourCompleted: (name: TourName) => boolean;
  loaded: boolean;
}

const GuideContext = createContext<GuideContextValue>({
  startTour: () => {},
  startWelcome: () => {},
  registerTour: () => {},
  tourCompleted: () => false,
  loaded: false,
});

export function useGuide() {
  return useContext(GuideContext);
}

const PATH_TO_TOUR: Record<string, TourName> = {
  "/": "dashboard",
  "/organization": "organization",
  "/workspace": "workspace",
  "/insights-desk": "insights-desk",
  "/attendance": "attendance",
  "/settings": "settings",
};

interface Props {
  userName: string;
  children: ReactNode;
}

export function GuideProvider({ userName, children }: Props) {
  const pathname = usePathname();
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [activeTour, setActiveTour] = useState<TourName | null>(null);
  const tours = useRef<Map<TourName, TourStep[]>>(new Map());
  const autoTriggered = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/guide")
      .then((r) => r.json())
      .then((data) => {
        const gt = data.guideTours ?? {};
        setCompleted(gt);
        setLoaded(true);
        if (!gt.welcome) {
          setShowWelcome(true);
        }
      })
      .catch(() => setLoaded(true));
  }, []);

  const markComplete = useCallback(async (tour: TourName) => {
    setCompleted((prev) => ({ ...prev, [tour]: true }));
    try {
      await fetch("/api/guide", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tour, completed: true }),
      });
    } catch { /* silent */ }
  }, []);

  const registerTour = useCallback((name: TourName, steps: TourStep[]) => {
    tours.current.set(name, steps);
  }, []);

  const tourCompleted = useCallback((name: TourName) => !!completed[name], [completed]);

  const startTour = useCallback((name: TourName) => {
    if (tours.current.has(name)) {
      setActiveTour(name);
    }
  }, []);

  const startWelcome = useCallback(() => {
    setShowWelcome(true);
  }, []);

  useEffect(() => {
    if (!loaded || showWelcome || activeTour) return;

    const tourName = PATH_TO_TOUR[pathname];
    if (!tourName || completed[tourName] || autoTriggered.current.has(tourName)) return;

    autoTriggered.current.add(tourName);
    const delay = setTimeout(() => {
      if (tours.current.has(tourName)) {
        setActiveTour(tourName);
      }
    }, 1200);

    return () => clearTimeout(delay);
  }, [pathname, loaded, showWelcome, activeTour, completed]);

  const handleWelcomeComplete = useCallback(() => {
    setShowWelcome(false);
    markComplete("welcome");
  }, [markComplete]);

  const handleTourComplete = useCallback(() => {
    if (activeTour) {
      markComplete(activeTour);
    }
    setActiveTour(null);
  }, [activeTour, markComplete]);

  const handleTourSkip = useCallback(() => {
    if (activeTour) {
      markComplete(activeTour);
    }
    setActiveTour(null);
  }, [activeTour, markComplete]);

  const tourSteps = activeTour ? tours.current.get(activeTour) : undefined;

  return (
    <GuideContext.Provider value={{ startTour, startWelcome, registerTour, tourCompleted, loaded }}>
      {children}

      <AnimatePresence>
        {showWelcome && (
          <WelcomeGuide userName={userName} onComplete={handleWelcomeComplete} />
        )}
      </AnimatePresence>

      {activeTour && tourSteps && (
        <SpotlightTour
          key={activeTour}
          tourKey={activeTour}
          steps={tourSteps}
          onComplete={handleTourComplete}
          onSkip={handleTourSkip}
        />
      )}
    </GuideContext.Provider>
  );
}
