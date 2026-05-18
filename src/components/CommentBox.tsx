"use client";

import { useState } from "react";

interface CommentBoxProps {
  owner: string;
  repo: string;
  prNumber: number;
  onCancel?: () => void;
  onCommentPosted?: (comment: string) => void;
}

export function CommentBox({
  owner,
  repo,
  prNumber,
  onCancel,
  onCommentPosted,
}: CommentBoxProps) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          prNumber,
          body: comment,
        }),
      });

      if (response.ok) {
        const commentText = comment;
        setComment("");
        onCommentPosted?.(commentText);
        onCancel?.();
      } else {
        alert("Failed to post comment");
      }
    } catch (error) {
      console.error("Error posting comment:", error);
      alert("Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasDraft = comment.length > 0;
  const isActive = isFocused || hasDraft;

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-md border bg-surface transition-colors ${
        isActive
          ? "border-cyan/60 shadow-[0_1px_0_0_rgba(0,0,0,0.02)]"
          : "border-gray-20"
      }`}
    >
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder="Add a general comment…"
        className="w-full resize-none rounded-md bg-transparent px-4 py-3 text-sm text-foreground placeholder-gray-40 focus:outline-none"
        rows={isActive ? 4 : 2}
        disabled={isSubmitting}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            void handleSubmit(e as unknown as React.FormEvent);
          }
        }}
      />
      <div
        className={`flex items-center justify-between gap-3 border-t border-gray-10 px-4 py-2.5 transition-opacity ${
          isActive ? "opacity-100" : "opacity-60"
        }`}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-gray-40">
          ⌘ + Enter to post
        </span>
        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-50 transition-colors hover:bg-gray-5 hover:text-foreground disabled:opacity-30 cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!comment.trim() || isSubmitting}
            className="rounded-md bg-foreground px-3.5 py-1.5 text-xs font-medium text-surface transition-all hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
          >
            {isSubmitting ? "Posting…" : "Post comment"}
          </button>
        </div>
      </div>
    </form>
  );
}
