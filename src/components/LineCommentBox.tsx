"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

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
  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft, lineNumber, endLineNumber]);

  const isRange = endLineNumber != null && endLineNumber > lineNumber;
  return (
    <motion.div
      ref={commentBoxRef}
      className="lg:absolute static border border-cyan rounded-md bg-surface p-3 sm:p-4 w-full lg:w-[400px]"
      initial={{ top: position }}
      animate={{ top: position }}
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-gray-50">
          {isRange ? `Lines ${lineNumber}–${endLineNumber}` : `Line ${lineNumber}`}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-gray-20 bg-surface p-1 transition-all hover:bg-gray-5"
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
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a comment..."
        className="w-full resize-none border border-gray-30 rounded-sm bg-surface px-3 py-2 text-sm text-foreground placeholder-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent"
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
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-gray-50">
          ⌘+Enter to submit
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md border border-gray-20 bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-gray-5 disabled:opacity-30"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(draft)}
            disabled={!draft.trim() || isSubmitting}
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-surface transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {isSubmitting ? "Posting..." : "Comment"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
