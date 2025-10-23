"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface CommentBoxProps {
  prNumber: number;
  onCancel?: () => void;
}

export function CommentBox({ prNumber, onCancel }: CommentBoxProps) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prNumber,
          body: comment,
        }),
      });

      if (response.ok) {
        setComment("");
        router.refresh();
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
        className="w-full border-2 border-black bg-white px-3 py-2 text-sm font-medium text-black placeholder-gray-50 focus:outline-none"
        rows={4}
        disabled={isSubmitting}
      />
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={!comment.trim() || isSubmitting}
          className="border-2 border-black bg-black px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition-all hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-30"
        >
          {isSubmitting ? "Posting..." : "Post general comment"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="border-2 border-black bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-black transition-all hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
