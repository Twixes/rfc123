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

const SPRING = {
  type: "spring" as const,
  stiffness: 360,
  damping: 36,
  mass: 0.6,
};

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
      className={`group/note lg:absolute static w-full lg:w-[400px] mb-3 lg:mb-0 rounded-md bg-surface border transition-shadow ${
        isHovered
          ? "border-magenta/50 shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(114,30,60,0.18)]"
          : "border-gray-20 shadow-[0_1px_0_0_rgba(0,0,0,0.02)]"
      }`}
      initial={{ top: position }}
      animate={{ top: position }}
      transition={SPRING}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {isCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex w-full items-center gap-2.5 py-2.5 pl-3.5 pr-3 text-left cursor-pointer rounded-md"
        >
          <span
            className="comment-line-badge shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] transition-opacity"
            style={
              {
                "--comment-opacity": isHovered ? 1 : 0.7,
              } as React.CSSProperties
            }
          >
            L{lineLabel}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-gray-70">
            <span className="font-medium text-foreground">
              {firstComment?.user}
              <span className="text-gray-40">: </span>
            </span>
            {firstComment?.body
              .replace(/^>\s.*\n?/gm, "")
              .replace(/\n/g, " ")
              .trim()}
          </span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-gray-40">
            {hasMultipleThreads
              ? `${threads.length}t · ${totalCommentCount}`
              : totalCommentCount > 1
                ? `+${totalCommentCount - 1}`
                : null}
          </span>
          <svg
            className="h-3 w-3 shrink-0 text-gray-40 transition-transform group-hover/note:translate-y-px"
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
        <div className="flex items-center justify-between py-2.5 pl-3.5 pr-2.5">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="comment-line-badge inline-flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-opacity hover:opacity-70 cursor-pointer"
            style={
              {
                "--comment-opacity": isHovered ? 1 : 0.7,
              } as React.CSSProperties
            }
          >
            Line {lineLabel}
            {hasMultipleThreads && (
              <span className="text-gray-40 normal-case tracking-normal">
                · {threads.length} threads
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded p-1 text-gray-40 transition-colors hover:bg-gray-5 hover:text-foreground cursor-pointer"
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
        transition={SPRING}
        className="overflow-hidden"
      >
        <div ref={onContentRef}>
          {threads.map((thread, threadIndex) => (
            <div key={thread.id}>
              {threadIndex > 0 && (
                <div className="border-t border-dashed border-gray-20 mx-3.5 my-3" />
              )}
              <div className="space-y-3.5 px-3.5 pb-2 pt-0.5">
                {thread.comments.map((comment, commentIndex) => (
                  <div
                    key={comment.id}
                    id={`comment-${comment.id}`}
                    className={`relative rounded transition-colors duration-700 ${
                      highlightedCommentId === comment.id
                        ? "bg-cyan/10 -mx-1.5 px-1.5 py-1"
                        : ""
                    }`}
                  >
                    {commentIndex > 0 && (
                      <span
                        aria-hidden
                        className="absolute -top-2 left-2 h-2 w-px bg-gray-20"
                      />
                    )}
                    <div className="mb-1.5 flex items-center gap-2">
                      <img
                        src={comment.userAvatar}
                        alt={comment.user}
                        className="h-4 w-4 rounded-full border border-gray-20"
                      />
                      <span className="text-xs font-medium text-foreground">
                        {comment.user}
                      </span>
                      <span className="text-gray-30">·</span>
                      <RelativeTime
                        date={comment.createdAt}
                        className="text-[11px] text-gray-50"
                      />
                      <CommentPermalink commentId={comment.id} />
                    </div>
                    <CommentMarkdown content={comment.body} />
                  </div>
                ))}
              </div>
              {replyingToThreadId === thread.id ? (
                <div className="px-3.5 pb-3 pt-1">
                  <ReplyDraftForm
                    key={`reply-${thread.id}`}
                    initialDraft={replyInitialDraft}
                    isSubmitting={isSubmitting}
                    placeholder="Reply to this thread…"
                    submitLabel="Reply"
                    shouldFocus={!isCollapsed}
                    onCancel={onCancelReply}
                    onSubmit={onSubmitReply}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3.5 pb-2.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => onStartReply(thread.id)}
                    className="grow rounded-md border border-gray-20 bg-surface px-2.5 py-1 text-[11px] font-medium text-gray-50 transition-colors hover:bg-gray-5 hover:text-foreground cursor-pointer"
                  >
                    Reply
                  </button>
                  {threadIndex === threads.length - 1 &&
                    !isStartingNewThread && (
                      <button
                        type="button"
                        onClick={onStartNewThread}
                        className="rounded-md border border-dashed border-gray-20 bg-surface px-2.5 py-1 text-[11px] font-medium text-gray-50 transition-colors hover:bg-gray-5 hover:text-foreground hover:border-gray-30 cursor-pointer"
                      >
                        + New thread
                      </button>
                    )}
                </div>
              )}
            </div>
          ))}

          {isStartingNewThread && (
            <div className="px-3.5 pb-3.5 pt-2 border-t border-dashed border-gray-20 mt-1">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-50">
                New thread
              </p>
              <ReplyDraftForm
                key="new-thread"
                initialDraft={replyInitialDraft}
                isSubmitting={isSubmitting}
                placeholder="Start a new thread…"
                submitLabel="Comment"
                shouldFocus={!isCollapsed}
                actionsRowClassName="mt-2.5"
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
