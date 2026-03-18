"use client";

import { motion } from "motion/react";

type ViewMode = "pretty" | "raw";

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <div className="relative inline-flex rounded-md border border-gray-20 bg-gray-5 p-0.5">
      <motion.div
        layoutId="viewmode-indicator"
        className="absolute inset-y-0.5 rounded border border-gray-20 bg-surface shadow-sm"
        style={{
          left: value === "pretty" ? 2 : "50%",
          right: value === "pretty" ? "50%" : 2,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
      />
      <button
        type="button"
        onClick={() => onChange("pretty")}
        className={`relative z-10 flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
          value === "pretty" ? "text-foreground" : "text-gray-50 hover:text-foreground"
        }`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <title>Pretty view</title>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
        Pretty
      </button>
      <button
        type="button"
        onClick={() => onChange("raw")}
        className={`relative z-10 flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
          value === "raw" ? "text-foreground" : "text-gray-50 hover:text-foreground"
        }`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <title>Raw view</title>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        Raw
      </button>
    </div>
  );
}
