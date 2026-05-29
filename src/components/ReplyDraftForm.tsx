"use client";

import { useEffect, useRef, useState } from "react";
import { CommentDraftTextarea } from "@/components/CommentDraftTextarea";

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
  actionsRowClassName = "mt-2",
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
      <CommentDraftTextarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
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
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-gray-40">
          ⌘ + Enter to send
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
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
            {isSubmitting ? "Sending…" : submitLabel}
          </button>
        </div>
      </div>
    </>
  );
}
