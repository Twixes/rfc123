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
      className="lg:absolute static border-2 border-black bg-white w-full lg:w-[400px] mb-4 lg:mb-0"
      style={{
        top: `${position}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-center justify-between px-3 sm:p-4">
        <a
          href={`#line-${lineNumber}`}
          className="block font-mono text-xs font-bold tracking-wide transition-opacity hover:opacity-70"
          style={{ color: "var(--magenta)" }}
        >
          Line {lineNumber}
          {isCollapsed && (
            <span className="ml-2 text-gray-50">
              ({comments.length} {comments.length === 1 ? "comment" : "comments"})
            </span>
          )}
        </a>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="border-[1.5px] border-black bg-white p-1 transition-all hover:bg-black hover:text-white"
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
              strokeLinecap="square"
              strokeLinejoin="miter"
              strokeWidth={3}
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
                className="border-l-2 border-neutral-300 pl-2"
              >
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-4 w-4 border-[1.5px] border-black">
                    <img
                      src={comment.userAvatar}
                      alt={comment.user}
                      className="h-full w-full"
                    />
                  </div>
                  <span className="text-xs font-bold text-black">
                    {comment.user}
                  </span>
                  <span className="text-xs font-medium text-gray-50">
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
                className="w-full resize-none border-2 border-black bg-white px-3 py-2 text-sm font-medium text-black placeholder-gray-50 focus:outline-none"
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
                <span className="text-xs font-medium text-gray-50">
                  ⌘+Enter to submit
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onCancelReply}
                    disabled={isSubmitting}
                    className="border-2 border-black bg-white px-3 py-1.5 text-xs font-bold tracking-wide text-black transition-all hover:bg-black hover:text-white disabled:opacity-30"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onSubmitReply}
                    disabled={!replyText.trim() || isSubmitting}
                    className="border-2 border-black bg-black px-3 py-1.5 text-xs font-bold tracking-wide text-white transition-all hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-30"
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
                className="w-full border-[1.5px] border-black bg-white px-3 py-1.5 text-xs font-bold tracking-wide text-black transition-all hover:bg-black hover:text-white"
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
