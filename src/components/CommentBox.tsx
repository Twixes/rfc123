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

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment..."
        className="w-full border border-gray-30 rounded-sm bg-surface px-3 py-2 text-sm text-foreground placeholder-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent"
        rows={4}
        disabled={isSubmitting}
      />
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={!comment.trim() || isSubmitting}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-surface transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {isSubmitting ? "Posting..." : "Post general comment"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-md border border-gray-20 bg-surface px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-gray-5 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
