interface LineCommentBoxProps {
  lineNumber: number;
  commentText: string;
  isSubmitting: boolean;
  position: number;
  onCommentTextChange: (text: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  commentBoxRef: (el: HTMLDivElement | null) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function LineCommentBox({
  lineNumber,
  commentText,
  isSubmitting,
  position,
  onCommentTextChange,
  onClose,
  onSubmit,
  commentBoxRef,
  onMouseEnter,
  onMouseLeave,
}: LineCommentBoxProps) {
  return (
    <div
      ref={commentBoxRef}
      className="lg:absolute static border rounded-md bg-surface p-3 sm:p-4 w-full lg:w-[400px]"
      style={{
        top: `${position}px`,
        borderColor: "var(--cyan)",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-gray-50">
          Line {lineNumber}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-gray-20 bg-surface p-1 transition-all hover:bg-gray-5"
        >
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <title>Close</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <textarea
        value={commentText}
        onChange={(e) => onCommentTextChange(e.target.value)}
        placeholder="Add a comment..."
        className="w-full resize-none border border-gray-30 rounded-sm bg-surface px-3 py-2 text-sm text-foreground placeholder-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent"
        rows={4}
        autoFocus
        disabled={isSubmitting}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onClose();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            onSubmit();
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
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md border border-gray-20 bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-gray-5 disabled:opacity-30"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!commentText.trim() || isSubmitting}
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-surface transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {isSubmitting ? "Posting..." : "Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}
