"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface TourStep {
  target: string;
  title: string;
  description: string;
  placement?: "top" | "bottom" | "left" | "right";
}

interface SpotlightTourProps {
  steps: TourStep[];
  tourKey: string;
  onComplete: () => void;
  onSkip: () => void;
}

const PADDING = 8;
const TOOLTIP_GAP = 14;

function getRect(el: Element) {
  const r = el.getBoundingClientRect();
  return {
    top: r.top - PADDING,
    left: r.left - PADDING,
    width: r.width + PADDING * 2,
    height: r.height + PADDING * 2,
  };
}

function bestPlacement(rect: ReturnType<typeof getRect>, pref?: TourStep["placement"]) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceBelow = vh - (rect.top + rect.height);
  const spaceAbove = rect.top;
  const spaceRight = vw - (rect.left + rect.width);
  const spaceLeft = rect.left;

  if (pref) {
    const ok =
      (pref === "bottom" && spaceBelow > 160) ||
      (pref === "top" && spaceAbove > 160) ||
      (pref === "right" && spaceRight > 300) ||
      (pref === "left" && spaceLeft > 300);
    if (ok) return pref;
  }

  if (spaceBelow > 160) return "bottom" as const;
  if (spaceAbove > 160) return "top" as const;
  if (spaceRight > 300) return "right" as const;
  return "left" as const;
}

export function SpotlightTour({ steps, tourKey, onComplete, onSkip }: SpotlightTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [rect, setRect] = useState<ReturnType<typeof getRect> | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; placement: string }>({ top: 0, left: 0, placement: "bottom" });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const step = steps[currentStep];

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      if (currentStep < steps.length - 1) {
        setCurrentStep((s) => s + 1);
      } else {
        onComplete();
      }
      return;
    }

    el.scrollIntoView({ behavior: "smooth", block: "center" });

    requestAnimationFrame(() => {
      const r = getRect(el);
      setRect(r);

      const placement = bestPlacement(r, step.placement);
      const tw = Math.min(340, window.innerWidth - 32);
      const th = 160;

      let top = 0;
      let left = 0;

      switch (placement) {
        case "bottom":
          top = r.top + r.height + TOOLTIP_GAP;
          left = r.left + r.width / 2 - tw / 2;
          break;
        case "top":
          top = r.top - TOOLTIP_GAP - th;
          left = r.left + r.width / 2 - tw / 2;
          break;
        case "right":
          top = r.top + r.height / 2 - th / 2;
          left = r.left + r.width + TOOLTIP_GAP;
          break;
        case "left":
          top = r.top + r.height / 2 - th / 2;
          left = r.left - TOOLTIP_GAP - tw;
          break;
      }

      left = Math.max(12, Math.min(left, window.innerWidth - tw - 12));
      top = Math.max(12, Math.min(top, window.innerHeight - th - 12));

      setTooltipPos({ top, left, placement });
    });
  }, [step, currentStep, steps.length, onComplete]);

  useEffect(() => {
    const t = setTimeout(measure, 300);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [measure]);

  const next = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      onComplete();
    }
  }, [currentStep, steps.length, onComplete]);

  const prev = useCallback(() => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }, [currentStep]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onSkip();
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onSkip]);

  if (!step || !rect) return null;

  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <>
      <div className="guide-overlay" onClick={onSkip} />

      <div
        className="guide-spotlight-hole guide-pulse-ring"
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={`${tourKey}-${currentStep}`}
          ref={tooltipRef}
          className="guide-tooltip"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
          initial={{ opacity: 0, y: tooltipPos.placement === "top" ? 8 : -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="guide-progress-bar mb-3">
            <div className="guide-progress-fill" style={{ width: `${progress}%` }} />
          </div>

          <p className="text-[13px] font-semibold mb-1" style={{ color: "var(--fg)" }}>
            {step.title}
          </p>
          <p className="text-[12px] leading-relaxed mb-4" style={{ color: "var(--fg-secondary)" }}>
            {step.description}
          </p>

          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
              {currentStep + 1} / {steps.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onSkip}
                className="rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors"
                style={{ color: "var(--fg-tertiary)" }}
              >
                Skip
              </button>
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={prev}
                  className="rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors"
                  style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition-colors"
                style={{ background: "var(--primary)" }}
              >
                {currentStep === steps.length - 1 ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
