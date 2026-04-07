import type { Variants, Transition } from "framer-motion";

/* ============================================ */
/* FRAMER MOTION PRESETS                        */
/* Ported from old portal + inventory + voting  */
/* ============================================ */

export const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

// --- Container variants (stagger children) ---

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

export const staggerContainerDelayed: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

export const staggerContainerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

// --- Item entrance variants ---

export const slideUpItem: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: "spring", stiffness: 100, damping: 10 },
  },
};

export const fadeInItem: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

export const slideFromLeft: Variants = {
  hidden: { x: -50, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { delay: 0.3 } },
};

export const slideFromRight: Variants = {
  hidden: { x: 50, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { delay: 0.3 } },
};

// Inventory-style card entrance with custom delay index
export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.08,
      duration: 0.5,
      ease,
    },
  }),
};

// --- Hover / Tap interactions ---

export const cardHover = {
  scale: 1.02,
  transition: { type: "spring", stiffness: 300, damping: 30 } as Transition,
};

export const buttonHover = {
  scale: 1.05,
  transition: { type: "spring", stiffness: 400, damping: 25 } as Transition,
};

export const listItemHover = { x: 5 };

// --- Page transitions (from voting app) ---

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 24, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -16 },
};

export const pageTransitionConfig: Transition = {
  duration: 0.45,
  ease,
};

// --- Status alert (toast/notification) ---

export const statusAlert: Variants = {
  hidden: { opacity: 0, y: -10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 25 },
  },
  exit: { opacity: 0, y: -10, transition: { duration: 0.3 } },
};

// --- Modal animations ---

export const modalOverlay: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export const modalContent: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 30 },
  },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } },
};

// --- Sidebar slide-from-right ---

export const sidebarOverlay: Variants = {
  hidden: { x: "100%" },
  visible: {
    x: 0,
    opacity: 0.5,
    transition: { type: "spring", stiffness: 300, damping: 50 },
  },
  exit: {
    x: "100%",
    opacity: 0,
    transition: { type: "spring", stiffness: 400, damping: 40 },
  },
};

export const sidebarContent: Variants = {
  hidden: { x: "100%" },
  visible: {
    x: 0,
    transition: { type: "spring", stiffness: 300, damping: 30 },
  },
  exit: {
    x: "100%",
    transition: { type: "spring", stiffness: 400, damping: 40 },
  },
};

// --- Tab indicator ---

export const tabIndicatorTransition: Transition = {
  type: "spring",
  bounce: 0.12,
  duration: 0.4,
};

// --- Scale-in (for badges, chips, pills) ---

export const scaleIn: Variants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: "spring", stiffness: 500, damping: 28 },
  },
  exit: { scale: 0, opacity: 0, transition: { duration: 0.15 } },
};

// --- Blur-in (glass-feel entrance) ---

export const blurIn: Variants = {
  hidden: { opacity: 0, filter: "blur(8px)", y: 12 },
  visible: {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    transition: { duration: 0.5, ease },
  },
};

// --- Skeleton → content crossfade ---

export const contentReveal: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

// --- Stagger with blur (premium entrance) ---

export const staggerBlur: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

export const blurItem: Variants = {
  hidden: { opacity: 0, filter: "blur(6px)", y: 16, scale: 0.97 },
  visible: {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    scale: 1,
    transition: { duration: 0.45, ease },
  },
};

// --- Floating dock entrance (from voting app) ---

export const dockEntrance = {
  initial: { y: 40, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  transition: { delay: 0.6, duration: 0.5, ease },
};

// --- Smooth page transition (enhanced) ---

export const smoothPage: Variants = {
  initial: { opacity: 0, y: 16, filter: "blur(4px)" },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.35, ease },
  },
  exit: {
    opacity: 0,
    y: -8,
    filter: "blur(4px)",
    transition: { duration: 0.2 },
  },
};

// --- Attendance page (inline variants → progressive loading) ---

/** Session timeline list — `app/(dashboard)/attendance/page.tsx` */
export const timelineStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

export const timelineItem: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.32, ease },
  },
};

/** Office segments under a session row */
export const officeSegmentStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

export const officeSegmentItem: Variants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0 },
};

/** Monthly insights stat chips grid */
export const monthlyInsightsStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

export const monthlyInsightChipItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25 },
  },
};

/** Aggregate employee overview cards grid */
export const employeeOverviewStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
};

export const employeeOverviewCardItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25 },
  },
};

// --- Settings page — collapsible confirm-password block (`initial`/`animate`/`exit` equivalent) ---

export const settingsCollapsibleSection: Variants = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: "auto" },
};

// --- Campaigns create/edit modal (`initial`/`animate`/`exit` equivalent; panel spring differs from `modalContent`) ---

export const campaignModalBackdrop: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export const campaignModalPanel: Variants = {
  hidden: { scale: 0.95, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: "spring", stiffness: 400, damping: 30 },
  },
  exit: { scale: 0.95, opacity: 0 },
};
