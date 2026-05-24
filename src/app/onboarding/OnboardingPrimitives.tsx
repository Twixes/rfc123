"use client";

import { motion } from "motion/react";

export function StepCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      className="space-y-5"
    >
      {children}
    </motion.div>
  );
}

export function StepActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-5 border-t border-gray-20">
      {children}
    </div>
  );
}

export function StepHeading({
  title,
  subtext,
}: {
  title: string;
  subtext?: string;
}) {
  return (
    <div>
      <h2 className="text-3xl sm:text-4xl font-serif font-normal text-foreground">
        {title}
      </h2>
      {subtext && <p className="mt-2 text-gray-70">{subtext}</p>}
    </div>
  );
}

export function PrimaryButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-surface transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
    >
      {children}
    </button>
  );
}

export function ArrowRightIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <title>Arrow right</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14 5l7 7m0 0l-7 7m7-7H3"
      />
    </svg>
  );
}
