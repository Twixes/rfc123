// biome-ignore-all lint/a11y/noStaticElementInteractions: the box itself is the comment-thread anchor; inner buttons carry the interactive semantics
// biome-ignore-all lint/a11y/useKeyWithClickEvents: border-only click is a mouse-affordance; keyboard users have the header button
// biome-ignore-all lint/performance/noImgElement: GitHub avatar URLs, served from a CDN; next/image's domain allowlist is heavier than the benefit here
"use client";

import { memo } from "react";
import { CommentMarkdown } from "@/components/CommentMarkdown";
import { CommentPermalink } from "@/components/CommentPermalink";
import { CommentReactionsBar } from "@/components/CommentReactions";
import { RelativeTime } from "@/components/RelativeTime";
import { ReplyDraftForm } from "@/components/ReplyDraftForm";
import type { CommentThread, LineReplyTarget } from "@/lib/comment-threads";
import type { ReactionContent } from "@/lib/github";

interface ExistingLineCommentsProps {
  lineNumber: number;
  endLineNumber?: number;
  threads: CommentThread[];
  position: number;
  replyTarget: LineReplyTarget | null;
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
  /** Toggle a reaction on a specific comment. */
  onToggleReaction?: (commentId: number, content: ReactionContent) => void;
  commentBoxRef: (el: HTMLDivElement | null) => void;
  /** Ref to the expandable content block; used to measure final height before animation */
  onContentRef?: (el: HTMLDivElement | null) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const ExistingLineComments = memo(function ExistingLineComments({
  lineNumber,
  endLineNumber,
  threads,
  position,
  replyTarget,
  replyInitialDraft,
  isSubmitting,
  isCollapsed,
  highlightedCommentId,
  onStartReply,
  onStartNewThread,
  onCancelReply,
  onSubmitReply,
  onToggleCollapse,
  onToggleReaction,
  commentBoxRef,
  onContentRef,
  onMouseEnter,
  onMouseLeave,
}: ExistingLineCommentsProps) {
  const allComments = threads.flatMap((t) => t.comments);
  const totalCommentCount = allComments.length;
  const firstComment = threads[0]?.comments[0];
  const hasMultipleThreads = threads.length > 1;
  const isOutdated = allComments.some((c) => c.outdated);
  const isRange = endLineNumber != null && endLineNumber > lineNumber;
  const lineLabel = isRange
    ? `${lineNumber}–${endLineNumber}`
    : String(lineNumber);

  return (
    <div
      ref={commentBoxRef}
      data-comment-line={lineNumber}
      className="group/note lg:absolute static lg:top-0 w-full lg:w-[400px] mb-3 lg:mb-0 rounded-md border bg-surface"
      style={{ transform: `translateY(${position}px)` }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => {
        if (e.target === e.currentTarget) onToggleCollapse();
      }}
    >
      {isCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex w-full items-center gap-2.5 py-2.5 pl-3.5 pr-3 text-left cursor-pointer rounded-md"
        >
          <span className="comment-line-badge shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] transition-opacity">
            L{lineLabel}
          </span>
          {isOutdated && (
            <span
              title="The line this comment was anchored to no longer exists in the diff."
              className="shrink-0 rounded-sm bg-gray-10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-70"
            >
              Outdated
            </span>
          )}
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
        <button
          type="button"
          onClick={onToggleCollapse}
          className="group/header flex w-full items-center justify-between py-2.5 pl-3.5 pr-2.5 text-left cursor-pointer rounded-md"
          aria-label="Collapse thread"
        >
          <span className="comment-line-badge inline-flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-opacity group-hover/header:opacity-70">
            Line {lineLabel}
            {hasMultipleThreads && (
              <span className="text-gray-40 normal-case tracking-normal">
                · {threads.length} threads
              </span>
            )}
            {isOutdated && (
              <span
                title="The line this comment was anchored to no longer exists in the diff."
                className="rounded-sm bg-gray-10 px-1.5 py-0.5 text-gray-70"
              >
                Outdated
              </span>
            )}
          </span>
          <span className="rounded p-1 text-gray-40 transition-colors group-hover/header:bg-gray-5 group-hover/header:text-foreground">
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
          </span>
        </button>
      )}

      {/* Only mount thread bodies when expanded — react-markdown +
          rehypeHighlight per comment is the dominant cost when many
          comments load at once. */}
      {!isCollapsed && (
        <div ref={onContentRef}>
          {threads.map((thread, threadIndex) => (
            <div key={thread.id}>
              {threadIndex > 0 && (
                <div className="border-t border-dashed border-gray-20 mx-3.5 my-3" />
              )}
              <div className="space-y-3.5 px-3.5 pb-2 pt-0.5">
                {thread.comments.map((comment, commentIndex) => {
                  const isBot = comment.user.endsWith("[bot]");
                  const authorContent = (
                    <>
                      <img
                        src={comment.userAvatar}
                        alt={comment.user}
                        className="h-4 w-4 rounded-full border border-gray-20"
                      />
                      <span className="text-xs font-medium text-foreground group-hover/author:underline underline-offset-2">
                        {comment.user}
                      </span>
                    </>
                  );
                  return (
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
                        {isBot ? (
                          <span className="flex items-center gap-2 cursor-default">
                            {authorContent}
                          </span>
                        ) : (
                          <a
                            href={`https://github.com/${encodeURIComponent(comment.user)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group/author flex items-center gap-2"
                          >
                            {authorContent}
                          </a>
                        )}
                        <span className="text-gray-30">·</span>
                        <RelativeTime
                          date={comment.createdAt}
                          className="text-[11px] text-gray-50"
                        />
                        <CommentPermalink commentId={comment.id} />
                      </div>
                      <CommentMarkdown content={comment.body} />
                      <CommentReactionsBar
                        reactions={comment.reactions}
                        disabled={!onToggleReaction || !comment.nodeId}
                        onToggle={(content) =>
                          onToggleReaction?.(comment.id, content)
                        }
                      />
                    </div>
                  );
                })}
              </div>
              {replyTarget?.type === "thread" &&
              replyTarget.threadId === thread.id ? (
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
                    replyTarget?.type !== "newThread" && (
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

          {replyTarget?.type === "newThread" && (
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
      )}
    </div>
  );
});
