"use client";

import { motion } from "motion/react";

interface StaggeredFadeInProps {
  children: React.ReactNode;
  delay?: number;
}

export function StaggeredFadeIn({ children, delay = 0 }: StaggeredFadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.25, 0.4, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}
