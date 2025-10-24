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
      className="absolute animate-in fade-in slide-in-from-right-2 border-2 bg-white p-4"
      style={{
        top: `${position}px`,
        width: "400px",
        borderColor: "var(--cyan)",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-xs font-bold tracking-wide text-gray-50">
          Line {lineNumber}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="border-[1.5px] border-black bg-white p-1 transition-all hover:bg-black hover:text-white"
        >
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <title>Close</title>
            <path
              strokeLinecap="square"
              strokeLinejoin="miter"
              strokeWidth={3}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <textarea
        value={commentText}
        onChange={(e) => onCommentTextChange(e.target.value)}
        placeholder="Add a comment..."
        className="w-full resize-none border-2 border-black bg-white px-3 py-2 text-sm font-medium text-black placeholder-gray-50 focus:outline-none"
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
        <span className="text-xs font-medium text-gray-50">
          ⌘+Enter to submit
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="border-2 border-black bg-white px-3 py-1.5 text-xs font-bold tracking-wide text-black transition-all hover:bg-black hover:text-white disabled:opacity-30"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!commentText.trim() || isSubmitting}
            className="border-2 border-black bg-black px-3 py-1.5 text-xs font-bold tracking-wide text-white transition-all hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-30"
          >
            {isSubmitting ? "Posting..." : "Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}
