"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface WelcomeGuideProps {
  userName: string;
  onComplete: () => void;
}

const SLIDES = [
  {
    icon: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",
    title: "Welcome to Single Solution Sync",
    description: "Your all-in-one platform for employee management, attendance tracking, and team collaboration. Let's take a quick tour of what you can do here.",
    color: "var(--primary)",
  },
  {
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    title: "Your Dashboard",
    description: "The dashboard gives you a real-time overview of your team. See who's in the office, who's remote, track attendance stats, active campaigns, and pending tasks — all at a glance.",
    color: "#0D9488",
  },
  {
    icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    title: "Manage Your Team",
    description: "Add employees, organize departments, assign team leads, and track campaigns across your organization. Use the bottom navigation dock to jump between sections.",
    color: "#4F46E5",
  },
  {
    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    title: "Automatic Attendance",
    description: "Attendance tracking is fully automatic — employees just open the app and their work hours are logged. View detailed breakdowns, office vs remote time, and monthly reports on the Attendance page.",
    color: "#7C3AED",
  },
];

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? 80 : -80, opacity: 0 }),
};

export function WelcomeGuide({ userName, onComplete }: WelcomeGuideProps) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);
  const slide = SLIDES[current];

  function goTo(idx: number) {
    setDirection(idx > current ? 1 : -1);
    setCurrent(idx);
  }

  function next() {
    if (current < SLIDES.length - 1) {
      goTo(current + 1);
    } else {
      onComplete();
    }
  }

  function prev() {
    if (current > 0) goTo(current - 1);
  }

  return (
    <>
      <motion.div
        className="guide-welcome-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onComplete}
      >
        <motion.div
          className="relative w-full max-w-md overflow-hidden rounded-2xl border"
          style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", boxShadow: "var(--shadow-xl, 0 25px 50px -12px rgba(0,0,0,.25))" }}
          initial={{ scale: 0.92, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          onClick={(e) => e.stopPropagation()}
          exit={{ scale: 0.92, y: 20, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        >
          <div className="relative overflow-hidden px-7 pt-8 pb-6">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={current}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center text-center"
              >
                <div
                  className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
                  style={{ background: `color-mix(in srgb, ${slide.color} 10%, transparent)` }}
                >
                  <svg
                    className="h-8 w-8"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke={slide.color}
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={slide.icon} />
                  </svg>
                </div>

                <h2 className="text-lg font-bold mb-2" style={{ color: "var(--fg)" }}>
                  {current === 0 ? slide.title.replace("Single Solution Sync", `${userName}!`) : slide.title}
                </h2>
                {current === 0 && (
                  <p className="text-[11px] font-medium mb-1" style={{ color: slide.color }}>
                    Single Solution Sync
                  </p>
                )}
                <p className="text-[13px] leading-relaxed max-w-sm" style={{ color: "var(--fg-secondary)" }}>
                  {slide.description}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Dots */}
          <div className="flex items-center justify-center gap-1.5 pb-4">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === current ? 24 : 6,
                  background: i === current ? "var(--primary)" : "var(--border-strong)",
                }}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between border-t px-6 py-4" style={{ borderColor: "var(--border)" }}>
            <button
              type="button"
              onClick={onComplete}
              className="text-[12px] font-medium transition-colors"
              style={{ color: "var(--fg-tertiary)" }}
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              {current > 0 && (
                <button
                  type="button"
                  onClick={prev}
                  className="rounded-lg border px-4 py-2 text-[12px] font-medium transition-colors"
                  style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="rounded-lg px-4 py-2 text-[12px] font-semibold text-white transition-colors"
                style={{ background: "var(--primary)" }}
              >
                {current === SLIDES.length - 1 ? "Get Started" : "Next"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
