"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface LineCommentBoxProps {
  lineNumber: number;
  endLineNumber?: number;
  /** Seed when the box opens (e.g. quoted selection). Kept in parent only for open/close, not per keystroke. */
  initialDraft: string;
  isSubmitting: boolean;
  position: number;
  onClose: () => void;
  onSubmit: (body: string) => void;
  commentBoxRef: (el: HTMLDivElement | null) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const SPRING = {
  type: "spring" as const,
  stiffness: 360,
  damping: 36,
  mass: 0.6,
};

export function LineCommentBox({
  lineNumber,
  endLineNumber,
  initialDraft,
  isSubmitting,
  position,
  onClose,
  onSubmit,
  commentBoxRef,
  onMouseEnter,
  onMouseLeave,
}: LineCommentBoxProps) {
  const [draft, setDraft] = useState(initialDraft);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft, lineNumber, endLineNumber]);

  const isRange = endLineNumber != null && endLineNumber > lineNumber;
  const lineLabel = isRange
    ? `${lineNumber}–${endLineNumber}`
    : String(lineNumber);

  return (
    <motion.div
      ref={commentBoxRef}
      className="lg:absolute static w-full lg:w-[400px] rounded-md bg-surface border border-cyan/70 shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_10px_28px_-14px_rgba(57,144,168,0.35)]"
      style={{ top: position }}
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -2 }}
      transition={SPRING}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-center justify-between py-2.5 pl-3.5 pr-2.5">
        <span className="inline-flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan">
          <span
            className="inline-block h-1 w-1 rounded-full bg-cyan"
            aria-hidden
          />
          New note on line {lineLabel}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-40 transition-colors hover:bg-gray-5 hover:text-foreground cursor-pointer"
          aria-label="Close"
        >
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <title>Close</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="px-3.5 pb-3 pt-0.5">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          className="w-full resize-none rounded-sm border border-gray-20 bg-surface px-3 py-2 text-sm text-foreground placeholder-gray-40 transition-shadow focus:outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20"
          rows={4}
          autoFocus
          disabled={isSubmitting}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onClose();
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              onSubmit(draft);
            }
          }}
        />
        <div className="mt-2.5 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-gray-40">
            ⌘ + Enter to send
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-50 transition-colors hover:bg-gray-5 hover:text-foreground disabled:opacity-30 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSubmit(draft)}
              disabled={!draft.trim() || isSubmitting}
              className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-surface transition-all hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
            >
              {isSubmitting ? "Sending…" : "Comment"}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
