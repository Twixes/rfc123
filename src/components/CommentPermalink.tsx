"use client";

import { useState, useCallback } from "react";

interface CommentPermalinkProps {
  commentId: number;
}

export function CommentPermalink({ commentId }: CommentPermalinkProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const url = new URL(window.location.href);
      url.hash = `comment-${commentId}`;
      navigator.clipboard.writeText(url.toString()).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    },
    [commentId],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group/link relative ml-auto shrink-0 rounded p-0.5 text-gray-30 transition-colors hover:text-gray-70"
      aria-label="Copy link to comment"
    >
      {copied ? (
        <svg
          className="h-3 w-3 text-cyan"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <title>Copied</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <title>Copy link</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
      )}
    </button>
  );
}
