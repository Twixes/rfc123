"use client";

import { motion } from "motion/react";

interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

interface ViewModeToggleProps<T extends string> {
  value: T;
  onChange: (mode: T) => void;
  /** Exactly two options, left then right. The active side gets the moving
   *  surface; the other side is muted. */
  options: [ToggleOption<T>, ToggleOption<T>];
}

const BTN_CLASS =
  "relative z-10 rounded-[5px] px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.1em] transition-colors cursor-pointer";

export function ViewModeToggle<T extends string>({
  value,
  onChange,
  options,
}: ViewModeToggleProps<T>) {
  const [left, right] = options;
  const isLeft = value === left.value;
  return (
    <div className="relative inline-grid grid-cols-2 rounded-md border border-gray-20 bg-gray-10 p-0.5">
      <motion.div
        layoutId="viewmode-indicator"
        className="absolute top-0.5 bottom-0.5 rounded-[5px] border border-gray-20 bg-surface shadow-[0_1px_2px_0_rgba(0,0,0,0.06)]"
        style={{
          left: isLeft ? 2 : "50%",
          width: "calc(50% - 2px)",
        }}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
      />
      <button
        type="button"
        onClick={() => onChange(left.value)}
        className={`${BTN_CLASS} ${
          isLeft ? "text-foreground" : "text-gray-50 hover:text-foreground"
        }`}
      >
        {left.label}
      </button>
      <button
        type="button"
        onClick={() => onChange(right.value)}
        className={`${BTN_CLASS} ${
          !isLeft ? "text-foreground" : "text-gray-50 hover:text-foreground"
        }`}
      >
        {right.label}
      </button>
    </div>
  );
}
