"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { CommentMarkdown } from "@/components/CommentMarkdown";
import { CommentPermalink } from "@/components/CommentPermalink";
import type { CommentThread } from "@/lib/comment-threads";

interface ExistingLineCommentsProps {
  lineNumber: number;
  threads: CommentThread[];
  position: number;
  replyingToThreadId: number | null;
  isStartingNewThread: boolean;
  replyText: string;
  isSubmitting: boolean;
  isCollapsed: boolean;
  highlightedCommentId?: number | null;
  onReplyTextChange: (text: string) => void;
  onStartReply: (threadId: number) => void;
  onStartNewThread: () => void;
  onCancelReply: () => void;
  onSubmitReply: () => void;
  onToggleCollapse: () => void;
  commentBoxRef: (el: HTMLDivElement | null) => void;
  /** Ref to the expandable content block; used to measure final height before animation */
  onContentRef?: (el: HTMLDivElement | null) => void;
  isHovered?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function ExistingLineComments({
  lineNumber,
  threads,
  position,
  replyingToThreadId,
  isStartingNewThread,
  replyText,
  isSubmitting,
  isCollapsed,
  highlightedCommentId,
  onReplyTextChange,
  onStartReply,
  onStartNewThread,
  onCancelReply,
  onSubmitReply,
  onToggleCollapse,
  commentBoxRef,
  onContentRef,
  isHovered,
  onMouseEnter,
  onMouseLeave,
}: ExistingLineCommentsProps) {
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const newThreadTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyingToThreadId != null && !isCollapsed) {
      const id = requestAnimationFrame(() => {
        replyTextareaRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [replyingToThreadId, isCollapsed]);

  useEffect(() => {
    if (isStartingNewThread && !isCollapsed) {
      const id = requestAnimationFrame(() => {
        newThreadTextareaRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isStartingNewThread, isCollapsed]);

  const allComments = threads.flatMap((t) => t.comments);
  const totalCommentCount = allComments.length;
  const firstComment = threads[0]?.comments[0];
  const hasMultipleThreads = threads.length > 1;

  return (
    <motion.div
      ref={commentBoxRef}
      className="lg:absolute static border border-gray-20 rounded-md bg-surface w-full lg:w-[400px] mb-4 lg:mb-0"
      initial={{ top: position }}
      animate={{ top: position }}
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {isCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex w-full items-center gap-2 p-3 sm:p-4 text-left cursor-pointer hover:bg-gray-5 transition-colors rounded-md"
        >
          <span
            className="shrink-0 text-xs font-medium tracking-wide transition-all"
            style={{ color: "var(--magenta)", opacity: isHovered ? 1 : 0.7 }}
          >
            L{lineNumber}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-gray-70">
            <span className="font-medium text-gray-90">{firstComment?.user}: </span>
            {firstComment?.body.replace(/^>\s.*\n?/gm, "").replace(/\n/g, " ").trim()}
          </span>
          <span className="shrink-0 text-[10px] text-gray-50">
            {hasMultipleThreads
              ? `${threads.length}T · ${totalCommentCount}C`
              : totalCommentCount > 1
                ? `+${totalCommentCount - 1}`
                : null}
          </span>
          <svg
            className="h-3 w-3 shrink-0 text-gray-40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <title>Expand</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      ) : (
        <div className="flex items-center justify-between p-3 sm:p-4">
          <a
            href={`#line-${lineNumber}`}
            className="block text-xs font-medium tracking-wide transition-all hover:opacity-70"
            style={{ color: "var(--magenta)", opacity: isHovered ? 1 : 0.7 }}
          >
            Line {lineNumber}
            {hasMultipleThreads && (
              <span className="ml-1.5 text-[10px] text-gray-50 font-normal">
                {threads.length} threads
              </span>
            )}
          </a>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded border border-gray-20 bg-surface p-1 transition-all hover:bg-gray-5"
            aria-label="Collapse thread"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <title>Collapse</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>
        </div>
      )}

      <motion.div
        initial={false}
        animate={{ height: isCollapsed ? 0 : "auto", opacity: isCollapsed ? 0 : 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
        className="overflow-hidden"
      >
        <div ref={onContentRef}>
          {threads.map((thread, threadIndex) => (
            <div key={thread.id}>
              {/* Thread separator for second thread onward */}
              {threadIndex > 0 && (
                <div className="mx-3 border-t border-dashed border-gray-20 my-2" />
              )}
              <div className="space-y-3 px-3">
                {thread.comments.map((comment) => (
                  <div
                    key={comment.id}
                    id={`comment-${comment.id}`}
                    className={`border-l pl-2 transition-colors duration-700 ${highlightedCommentId === comment.id ? "border-cyan bg-cyan/10" : "border-gray-20"}`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <div className="h-4 w-4 rounded-full overflow-hidden border border-gray-20">
                        <img
                          src={comment.userAvatar}
                          alt={comment.user}
                          className="h-full w-full"
                        />
                      </div>
                      <span className="text-xs font-medium text-foreground">
                        {comment.user}
                      </span>
                      <span className="text-xs text-gray-50">
                        {new Date(comment.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <CommentPermalink commentId={comment.id} />
                    </div>
                    <CommentMarkdown content={comment.body} />
                  </div>
                ))}
              </div>
              {/* Per-thread reply */}
              {replyingToThreadId === thread.id ? (
                <div className="p-3 sm:p-4 pt-2">
                  <textarea
                    ref={replyTextareaRef}
                    value={replyText}
                    onChange={(e) => onReplyTextChange(e.target.value)}
                    placeholder="Reply to this thread..."
                    className="w-full resize-none border border-gray-30 rounded-sm bg-surface px-3 py-2 text-sm text-foreground placeholder-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent"
                    rows={4}
                    disabled={isSubmitting}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        onCancelReply();
                      }
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        onSubmitReply();
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
                        onClick={onCancelReply}
                        disabled={isSubmitting}
                        className="rounded-md border border-gray-20 bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-gray-5 disabled:opacity-30"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={onSubmitReply}
                        disabled={!replyText.trim() || isSubmitting}
                        className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-surface transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        {isSubmitting ? "Posting..." : "Reply"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-3 pb-3 pt-1 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onStartReply(thread.id)}
                    className="rounded-md border border-gray-20 bg-surface px-2.5 py-1 text-[11px] font-medium text-gray-50 transition-all hover:bg-gray-5 hover:text-foreground"
                  >
                    Reply
                  </button>
                  {threadIndex === threads.length - 1 && !isStartingNewThread && (
                    <button
                      type="button"
                      onClick={onStartNewThread}
                      className="rounded-md border border-dashed border-gray-20 bg-surface px-2.5 py-1 text-[11px] font-medium text-gray-50 transition-all hover:bg-gray-5 hover:text-foreground hover:border-gray-30"
                    >
                      + New thread
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* New thread form */}
          {isStartingNewThread && (
            <div className="p-3 sm:p-4 pt-2 border-t border-dashed border-gray-20 mt-2">
              <p className="mb-2 text-[11px] font-medium text-gray-50">New thread</p>
              <textarea
                ref={newThreadTextareaRef}
                value={replyText}
                onChange={(e) => onReplyTextChange(e.target.value)}
                placeholder="Start a new thread..."
                className="w-full resize-none border border-gray-30 rounded-sm bg-surface px-3 py-2 text-sm text-foreground placeholder-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent"
                rows={4}
                disabled={isSubmitting}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    onCancelReply();
                  }
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    onSubmitReply();
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
                    onClick={onCancelReply}
                    disabled={isSubmitting}
                    className="rounded-md border border-gray-20 bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-gray-5 disabled:opacity-30"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onSubmitReply}
                    disabled={!replyText.trim() || isSubmitting}
                    className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-surface transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {isSubmitting ? "Posting..." : "Comment"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
