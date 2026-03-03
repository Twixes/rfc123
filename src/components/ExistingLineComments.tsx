import { CommentMarkdown } from "@/components/CommentMarkdown";
import type { Comment } from "@/lib/github";

interface ExistingLineCommentsProps {
  lineNumber: number;
  comments: Comment[];
  position: number;
  isReplying: boolean;
  replyText: string;
  isSubmitting: boolean;
  isCollapsed: boolean;
  onReplyTextChange: (text: string) => void;
  onStartReply: () => void;
  onCancelReply: () => void;
  onSubmitReply: () => void;
  onToggleCollapse: () => void;
  commentBoxRef: (el: HTMLDivElement | null) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function ExistingLineComments({
  lineNumber,
  comments,
  position,
  isReplying,
  replyText,
  isSubmitting,
  isCollapsed,
  onReplyTextChange,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  onToggleCollapse,
  commentBoxRef,
  onMouseEnter,
  onMouseLeave,
}: ExistingLineCommentsProps) {
  return (
    <div
      ref={commentBoxRef}
      className="lg:absolute static border border-gray-20 rounded-md shadow-sm bg-surface w-full lg:w-[400px] mb-4 lg:mb-0"
      style={{
        top: `${position}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-center justify-between px-3 sm:p-4">
        <a
          href={`#line-${lineNumber}`}
          className="block text-xs font-medium tracking-wide transition-opacity hover:opacity-70"
          style={{ color: "var(--magenta)" }}
          onClick={(e) => {
            if (isCollapsed) {
              e.preventDefault();
              onToggleCollapse();
            }
          }}
        >
          Line {lineNumber}
          {isCollapsed && (
            <span className="ml-2 text-gray-50">
              {comments[0]?.user} ({comments.length} {comments.length === 1 ? "comment" : "comments"})
            </span>
          )}
        </a>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded border border-gray-20 bg-surface p-1 transition-all hover:bg-gray-5"
          aria-label={isCollapsed ? "Expand thread" : "Collapse thread"}
        >
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <title>{isCollapsed ? "Expand" : "Collapse"}</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={isCollapsed ? "M19 9l-7 7-7-7" : "M5 15l7-7 7 7"}
            />
          </svg>
        </button>
      </div>

      {!isCollapsed && (
        <>
          <div className="space-y-3 px-3">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="border-l border-gray-20 pl-2"
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
                </div>
                <CommentMarkdown content={comment.body} />
              </div>
            ))}
          </div>
          {isReplying ? (
            <div className="p-3 sm:p-4 pt-0">
              <textarea
                value={replyText}
                onChange={(e) => onReplyTextChange(e.target.value)}
                placeholder="Add a comment..."
                className="w-full resize-none border border-gray-30 rounded-sm bg-surface px-3 py-2 text-sm text-foreground placeholder-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent"
                rows={4}
                autoFocus
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
          ) : (
            <div className="p-3 sm:p-4 pt-0">
              <button
                type="button"
                onClick={onStartReply}
                className="w-full rounded-md border border-gray-20 bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-gray-5"
              >
                Add comment
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
