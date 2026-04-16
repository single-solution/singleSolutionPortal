import type { Variants, Transition } from "framer-motion";

export const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const staggerContainerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

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

export const cardHover = {
  scale: 1.02,
  transition: { type: "spring", stiffness: 300, damping: 30 } as Transition,
};

export const tabIndicatorTransition: Transition = {
  type: "spring",
  bounce: 0.12,
  duration: 0.4,
};

export const dockEntrance = {
  initial: { y: 40, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  transition: { delay: 0.6, duration: 0.5, ease },
};
