"use client";

import { useState } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { Comment } from "@/lib/github";

interface InlineCommentableMarkdownProps {
  content: string;
  prNumber: number;
  comments: Comment[];
  onCommentSubmit: (line: number, body: string) => Promise<void>;
}

export function InlineCommentableMarkdown({
  content,
  prNumber,
  comments,
  onCommentSubmit,
}: InlineCommentableMarkdownProps) {
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lines = content.split("\n");

  // Group comments by line number
  const commentsByLine = new Map<number, Comment[]>();
  for (const comment of comments) {
    if (comment.line) {
      const existing = commentsByLine.get(comment.line) || [];
      commentsByLine.set(comment.line, [...existing, comment]);
    }
  }

  async function handleSubmit(lineIndex: number) {
    if (!commentText.trim()) return;

    setIsSubmitting(true);
    try {
      await onCommentSubmit(lineIndex + 1, commentText);
      setCommentText("");
      setActiveLineIndex(null);
    } catch (error) {
      console.error("Error submitting comment:", error);
      alert("Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative grid grid-cols-[1fr_350px] gap-8">
      {/* Main content */}
      <div className="space-y-0">
        {lines.map((line, index) => {
          const lineComments = commentsByLine.get(index + 1) || [];
          const hasComments = lineComments.length > 0;
          const isActive = activeLineIndex === index;

          return (
            <div
              key={index}
              id={`line-${index + 1}`}
              className="group relative"
            >
              {/* Line content with hover effect */}
              <div
                className={`relative cursor-pointer rounded px-4 py-1 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                  hasComments
                    ? "bg-amber-50/50 dark:bg-amber-900/10"
                    : ""
                } ${isActive ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
                onClick={() => {
                  if (!isActive) {
                    setActiveLineIndex(index);
                    setCommentText("");
                  }
                }}
              >
                {/* Line number and add comment button */}
                <div className="absolute left-0 top-1 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="text-xs text-zinc-400">{index + 1}</span>
                  <button
                    type="button"
                    className="flex h-5 w-5 items-center justify-center rounded bg-blue-600 text-white transition-opacity hover:bg-blue-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveLineIndex(index);
                      setCommentText("");
                    }}
                    aria-label="Add comment"
                  >
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <title>Add comment</title>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </button>
                </div>

                {/* Comment indicator */}
                {hasComments && (
                  <div className="absolute -right-2 top-1/2 -translate-y-1/2">
                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                  </div>
                )}

                {/* Render the line content as markdown */}
                <div className="prose-sm ml-12">
                  <MarkdownRenderer content={line || " "} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comments sidebar */}
      <div className="sticky top-8 h-fit space-y-4 self-start">
        {/* Active comment form */}
        {activeLineIndex !== null && (
          <div className="animate-in fade-in slide-in-from-right-2 rounded-lg border border-blue-500 bg-white p-4 shadow-sm dark:border-blue-600 dark:bg-zinc-800">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Line {activeLineIndex + 1}
              </span>
              <button
                type="button"
                onClick={() => {
                  setActiveLineIndex(null);
                  setCommentText("");
                }}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <title>Close</title>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="w-full resize-none rounded border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-400"
              rows={4}
              autoFocus
              disabled={isSubmitting}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setActiveLineIndex(null);
                  setCommentText("");
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleSubmit(activeLineIndex);
                }
              }}
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                ⌘+Enter to submit
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveLineIndex(null);
                    setCommentText("");
                  }}
                  disabled={isSubmitting}
                  className="rounded px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit(activeLineIndex)}
                  disabled={!commentText.trim() || isSubmitting}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "Posting..." : "Comment"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Existing comments organized by line */}
        {Array.from(commentsByLine.entries())
          .sort(([a], [b]) => a - b)
          .map(([lineNumber, lineComments]) => (
            <div
              key={lineNumber}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <a
                href={`#line-${lineNumber}`}
                className="mb-3 block text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                Line {lineNumber}
              </a>
              <div className="space-y-3">
                {lineComments.map((comment) => (
                  <div key={comment.id} className="border-l-2 border-amber-500 pl-3">
                    <div className="mb-2 flex items-center gap-2">
                      <img
                        src={comment.userAvatar}
                        alt={comment.user}
                        className="h-5 w-5 rounded-full"
                      />
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-50">
                        {comment.user}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {new Date(comment.createdAt).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                          }
                        )}
                      </span>
                    </div>
                    <div className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                      {comment.body}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

        {/* Empty state */}
        {commentsByLine.size === 0 && activeLineIndex === null && (
          <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
            <svg
              className="mx-auto h-8 w-8 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
              />
            </svg>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              No comments yet
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Click any line to add a comment
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
