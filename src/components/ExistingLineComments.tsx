"use client";

import { motion } from "motion/react";
import { CommentMarkdown } from "@/components/CommentMarkdown";
import { CommentPermalink } from "@/components/CommentPermalink";
import { RelativeTime } from "@/components/RelativeTime";
import { ReplyDraftForm } from "@/components/ReplyDraftForm";
import type { CommentThread } from "@/lib/comment-threads";

interface ExistingLineCommentsProps {
  lineNumber: number;
  endLineNumber?: number;
  threads: CommentThread[];
  position: number;
  replyingToThreadId: number | null;
  isStartingNewThread: boolean;
  /** Seed when reply UI opens (e.g. quoted selection). Not updated per keystroke. */
  replyInitialDraft: string;
  isSubmitting: boolean;
  isCollapsed: boolean;
  highlightedCommentId?: number | null;
  onStartReply: (threadId: number) => void;
  onStartNewThread: () => void;
  onCancelReply: () => void;
  onSubmitReply: (body: string) => void;
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
  endLineNumber,
  threads,
  position,
  replyingToThreadId,
  isStartingNewThread,
  replyInitialDraft,
  isSubmitting,
  isCollapsed,
  highlightedCommentId,
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
  const allComments = threads.flatMap((t) => t.comments);
  const totalCommentCount = allComments.length;
  const firstComment = threads[0]?.comments[0];
  const hasMultipleThreads = threads.length > 1;
  const isRange = endLineNumber != null && endLineNumber > lineNumber;
  const lineLabel = isRange
    ? `${lineNumber}–${endLineNumber}`
    : String(lineNumber);

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
            className="comment-line-badge shrink-0 text-xs font-medium tracking-wide transition-all"
            style={
              {
                "--comment-opacity": isHovered ? 1 : 0.7,
              } as React.CSSProperties
            }
          >
            L{lineLabel}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-gray-70">
            <span className="font-medium text-gray-90">
              {firstComment?.user}:{" "}
            </span>
            {firstComment?.body
              .replace(/^>\s.*\n?/gm, "")
              .replace(/\n/g, " ")
              .trim()}
          </span>
          <span className="shrink-0 text-[10px] text-gray-50">
            {hasMultipleThreads
              ? `${threads.length} threads, ${totalCommentCount} comments`
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
          <button
            type="button"
            onClick={onToggleCollapse}
            className="comment-line-badge block text-xs font-medium tracking-wide transition-all hover:opacity-70 cursor-pointer"
            style={
              {
                "--comment-opacity": isHovered ? 1 : 0.7,
              } as React.CSSProperties
            }
          >
            Lines {lineLabel}
            {hasMultipleThreads && (
              <span className="ml-1.5 text-[10px] text-gray-50 font-normal">
                {threads.length} threads
              </span>
            )}
          </button>
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
        animate={{
          height: isCollapsed ? 0 : "auto",
          opacity: isCollapsed ? 0 : 1,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
        className="overflow-hidden"
      >
        <div ref={onContentRef}>
          {threads.map((thread, threadIndex) => (
            <div key={thread.id}>
              {/* Thread separator for second thread onward */}
              {threadIndex > 0 && (
                <div className="border-t border-dashed border-gray-20 mt-1 mb-5 mx-2" />
              )}
              <div className="space-y-5 px-3">
                {thread.comments.map((comment) => (
                  <div
                    key={comment.id}
                    id={`comment-${comment.id}`}
                    className={`pl-2 transition-colors duration-700 ${highlightedCommentId === comment.id ? "border-cyan bg-cyan/10" : "border-gray-20"}`}
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
                      <RelativeTime
                        date={comment.createdAt}
                        className="text-xs text-gray-50"
                      />
                      <CommentPermalink commentId={comment.id} />
                    </div>
                    <CommentMarkdown content={comment.body} />
                  </div>
                ))}
              </div>
              {/* Per-thread reply */}
              {replyingToThreadId === thread.id ? (
                <div className="p-3 sm:p-4 pt-2">
                  <ReplyDraftForm
                    key={`reply-${thread.id}`}
                    initialDraft={replyInitialDraft}
                    isSubmitting={isSubmitting}
                    placeholder="Reply to this thread..."
                    submitLabel="Reply"
                    shouldFocus={!isCollapsed}
                    onCancel={onCancelReply}
                    onSubmit={onSubmitReply}
                  />
                </div>
              ) : (
                <div className="px-3 pb-3 pt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onStartReply(thread.id)}
                    className="grow rounded-md border border-gray-20 bg-surface px-2.5 py-1 text-[11px] font-medium text-gray-50 transition-all hover:bg-gray-5 hover:text-foreground"
                  >
                    Reply
                  </button>
                  {threadIndex === threads.length - 1 &&
                    !isStartingNewThread && (
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
              <p className="mb-2 text-[11px] font-medium text-gray-50">
                New thread
              </p>
              <ReplyDraftForm
                key="new-thread"
                initialDraft={replyInitialDraft}
                isSubmitting={isSubmitting}
                placeholder="Start a new thread..."
                submitLabel="Comment"
                shouldFocus={!isCollapsed}
                actionsRowClassName="mt-3"
                onCancel={onCancelReply}
                onSubmit={onSubmitReply}
              />
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
