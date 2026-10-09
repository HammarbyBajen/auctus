"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import { springs } from "@/lib/motion";

/**
 * The one staggered entrance per route (docs/DESIGN.md, section 8). It runs
 * once when the route mounts, never on later state changes. With reduced
 * motion it becomes a plain fade.
 */
export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  const container: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.05 } } };
  return (
    <motion.div className={className} variants={container} initial="hidden" animate="shown">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const item: Variants = reduce
    ? { hidden: { opacity: 0 }, shown: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 8 }, shown: { opacity: 1, y: 0, transition: springs.gentle } };
  return (
    <motion.div className={className} variants={item} data-entrance="">
      {children}
    </motion.div>
  );
}
