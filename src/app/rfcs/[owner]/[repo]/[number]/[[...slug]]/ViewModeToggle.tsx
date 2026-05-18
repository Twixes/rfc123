"use client";

import { motion } from "motion/react";

type ViewMode = "pretty" | "raw";

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const BTN_CLASS =
  "relative z-10 rounded-[5px] px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.1em] transition-colors cursor-pointer";

export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <div className="relative inline-grid grid-cols-2 rounded-md border border-gray-20 bg-gray-10 p-0.5">
      <motion.div
        layoutId="viewmode-indicator"
        className="absolute top-0.5 bottom-0.5 rounded-[5px] border border-gray-20 bg-surface shadow-[0_1px_2px_0_rgba(0,0,0,0.06)]"
        style={{
          left: value === "pretty" ? 2 : "50%",
          width: "calc(50% - 2px)",
        }}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
      />
      <button
        type="button"
        onClick={() => onChange("pretty")}
        className={`${BTN_CLASS} ${
          value === "pretty"
            ? "text-foreground"
            : "text-gray-50 hover:text-foreground"
        }`}
      >
        Pretty
      </button>
      <button
        type="button"
        onClick={() => onChange("raw")}
        className={`${BTN_CLASS} ${
          value === "raw"
            ? "text-foreground"
            : "text-gray-50 hover:text-foreground"
        }`}
      >
        Raw
      </button>
    </div>
  );
}
