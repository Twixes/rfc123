"use client";

import { useEffect, useRef, useState } from "react";

const TEXTAREA_CLASS =
  "w-full resize-none border border-gray-30 rounded-sm bg-surface px-3 py-2 text-sm text-foreground placeholder-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent";

interface ReplyDraftFormProps {
  initialDraft: string;
  isSubmitting: boolean;
  placeholder: string;
  submitLabel: string;
  shouldFocus: boolean;
  /** e.g. new-thread block uses mt-3 to match layout */
  actionsRowClassName?: string;
  onCancel: () => void;
  onSubmit: (body: string) => void;
}

/**
 * Reply / new-thread composer with local draft state so typing does not re-render
 * parent thread lists (CommentMarkdown, etc.).
 */
export function ReplyDraftForm({
  initialDraft,
  isSubmitting,
  placeholder,
  submitLabel,
  shouldFocus,
  actionsRowClassName = "mt-1",
  onCancel,
  onSubmit,
}: ReplyDraftFormProps) {
  const [draft, setDraft] = useState(initialDraft);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  useEffect(() => {
    if (!shouldFocus) return;
    const id = requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [shouldFocus]);

  return (
    <>
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        className={TEXTAREA_CLASS}
        rows={4}
        disabled={isSubmitting}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onCancel();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            onSubmit(draft);
          }
        }}
      />
      <div
        className={`${actionsRowClassName} flex items-center justify-between`}
      >
        <span className="text-xs text-gray-50">⌘+Enter to submit</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
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
            {isSubmitting ? "Posting..." : submitLabel}
          </button>
        </div>
      </div>
    </>
  );
}
