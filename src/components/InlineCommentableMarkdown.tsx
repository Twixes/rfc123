"use client";

import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { Comment } from "@/lib/github";
import { rehypeLineMarkers } from "@/lib/rehype-line-markers";
import { remarkMergeParagraphs } from "@/lib/remark-merge-paragraphs";
import { remarkMentions } from "@/lib/remark-mentions";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { LineCommentBox } from "@/components/LineCommentBox";
import { ExistingLineComments } from "@/components/ExistingLineComments";
import { ProfilePictures } from "@/components/ProfilePictures";

// Module-level constants — stable references across all renders and instances.
type PluginList = NonNullable<React.ComponentProps<typeof ReactMarkdown>["rehypePlugins"]>;
const REMARK_PLUGINS: PluginList = [
  remarkGfm,
  remarkMentions,
  remarkBreaks,
  remarkMergeParagraphs,
];
const REHYPE_PLUGINS: PluginList = [[rehypeHighlight, { plainText: ["mermaid"] }], rehypeLineMarkers];

const MemoizedMarkdown = memo(function MemoizedMarkdown({
  content,
  components,
}: {
  content: string;
  components: React.ComponentProps<typeof ReactMarkdown>["components"];
}) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
});

// react-markdown passes a `node` prop (HAST element) to every component renderer.
// Excluding it from spreads prevents `node="[object Object]"` on DOM elements.
type MDProps<T extends React.ElementType> = React.ComponentPropsWithoutRef<T> & { node?: unknown };

interface LineNumbersColumnProps {
  lines: string[];
  linesInCodeBlocks: Set<number>;
  commentsByLine: Map<number, Comment[]>;
  lineOffsets: Map<number, number>;
  linesWithMarkers: Set<number>;
  lineRanges: Map<number, number>;
  lineRefs: React.MutableRefObject<Map<number, HTMLButtonElement>>;
  onLineClick: (lineNumber: number) => void;
  onMouseEnterLine: (lineNumber: number) => void;
  onMouseLeaveLine: () => void;
}

const LineNumbersColumn = memo(function LineNumbersColumn({
  lines,
  linesInCodeBlocks,
  commentsByLine,
  lineOffsets,
  linesWithMarkers,
  lineRanges,
  lineRefs,
  onLineClick,
  onMouseEnterLine,
  onMouseLeaveLine,
}: LineNumbersColumnProps) {
  return (
    <div className="shrink-0 select-none relative" style={{ width: "40px" }}>
      {lines.map((line, index) => {
        const lineNumber = index + 1;

        // Only show line numbers for lines that have rendered content (DOM marker) or comments.
        // Blank lines have no marker, so they would bunch up — hide them.
        const hasMarker = linesWithMarkers.has(lineNumber);
        const hasComments = commentsByLine.has(lineNumber);
        if (!hasMarker && !hasComments) return null;

        const lineOffset = lineOffsets.get(lineNumber);
        if (lineOffset === undefined) return null;

        const hasCommentsForStyle = (commentsByLine.get(lineNumber)?.length ?? 0) > 0;
        const endLine = lineRanges.get(lineNumber);
        const isRange = endLine != null && endLine > lineNumber;

        return (
          <button
            key={lineNumber}
            id={`line-${lineNumber}`}
            ref={(el) => { if (el) lineRefs.current.set(lineNumber, el); }}
            type="button"
            onClick={() => onLineClick(lineNumber)}
            className={`group flex gap-2 justify-end pr-2 absolute right-0 cursor-pointer ${isRange ? "items-start" : "items-center"}`}
            style={{
              top: `${lineOffset}px`,
              height: isRange ? "auto" : "1.5rem",
              minHeight: "1.5rem",
            }}
            onMouseEnter={() => onMouseEnterLine(lineNumber)}
            onMouseLeave={onMouseLeaveLine}
            aria-label={`Add comment to lines ${lineNumber}${isRange ? `–${endLine}` : ""}`}
          >
            <div className="hidden sm:flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-30 bg-surface opacity-0 transition-all group-hover:opacity-100 group-hover:bg-gray-5">
              <svg className="h-3 w-3 text-gray-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <title>Add comment</title>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span
              className={`font-mono text-[10px] sm:text-xs transition-opacity flex flex-col items-center leading-normal`}
              style={{ color: hasCommentsForStyle ? "var(--magenta)" : "var(--gray-50)" }}
            >
              {isRange ? (
                <>
                  <span>{lineNumber}</span>
                  <span>↓</span>
                  <span>{endLine}</span>
                </>
              ) : (
                lineNumber
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
});

interface InlineCommentableMarkdownProps {
  content: string;
  prNumber: number;
  comments: Comment[];
  commentsLoading?: boolean;
  onCommentSubmit: (line: number, body: string) => Promise<void>;
}

export function InlineCommentableMarkdown({
  content,
  prNumber,
  comments,
  commentsLoading,
  onCommentSubmit,
}: InlineCommentableMarkdownProps) {
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null);
  const [hoveredCommentLineIndex, setHoveredCommentLineIndex] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedText, setSelectedText] = useState<string>("");
  const [collapsedLines, setCollapsedLines] = useState<Set<number> | null>(null);
  const [lineOffsets, setLineOffsets] = useState<Map<number, number>>(
    new Map(),
  );
  const [linesWithMarkers, setLinesWithMarkers] = useState<Set<number>>(
    new Set(),
  );
  const [lineRanges, setLineRanges] = useState<Map<number, number>>(new Map());
  const [replyingToLine, setReplyingToLine] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const lineRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const markdownRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const isSelectingRef = useRef(false);

  const lines = useMemo(() => content.split("\n"), [content]);
  const commentBoxRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [commentPositions, setCommentPositions] = useState<Map<number, number>>(
    new Map(),
  );

  // Identify which lines are inside code blocks
  const linesInCodeBlocks = useMemo(() => {
    const set = new Set<number>();
    let inCodeBlock = false;
    let codeBlockStart = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Detect code fence (``` or ~~~)
      if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockStart = i;
        } else {
          // End of code block - add all lines between start and end
          for (let j = codeBlockStart + 1; j < i; j++) {
            set.add(j + 1); // +1 because line numbers are 1-indexed
          }
          inCodeBlock = false;
          codeBlockStart = -1;
        }
      }
    }

    return set;
  }, [lines]);

  // Group comments by line number
  const commentsByLine = useMemo(() => {
    const map = new Map<number, Comment[]>();
    for (const comment of comments) {
      if (comment.line) {
        const existing = map.get(comment.line) || [];
        map.set(comment.line, [...existing, comment]);
      }
    }
    return map;
  }, [comments]);

  // Calculate line offsets after render using injected markers
  useEffect(() => {
    if (!markdownRef.current) return;

    const offsets = new Map<number, number>();
    const withMarkers = new Set<number>();
    const markdownElement = markdownRef.current;
    const containerRect = markdownElement.getBoundingClientRect();

    // Query all line markers and calculate their offsets
    for (let i = 1; i <= lines.length; i++) {
      const marker = document.getElementById(`line-marker-${i}`);
      if (marker) {
        withMarkers.add(i);
        const markerRect = marker.getBoundingClientRect();
        const offset =
          markerRect.top - containerRect.top + markdownElement.scrollTop;
        offsets.set(i, offset);
      }
    }

    // Interpolate offsets ONLY for blank lines that have comments (so comment boxes can be positioned).
    // Do NOT interpolate for other blank lines — they have no rendered content, so no marker exists,
    // and showing their line numbers would bunch up in the gutter.
    for (let i = 1; i <= lines.length; i++) {
      if (offsets.has(i)) continue;
      const isEmpty = lines[i - 1]?.trim() === "";
      if (isEmpty && !commentsByLine.has(i)) continue;

      let prev: number | undefined;
      for (let j = i - 1; j >= 1; j--) {
        if (offsets.has(j)) {
          prev = offsets.get(j)!;
          break;
        }
      }
      let next: number | undefined;
      for (let j = i + 1; j <= lines.length; j++) {
        if (offsets.has(j)) {
          next = offsets.get(j)!;
          break;
        }
      }
      if (prev !== undefined && next !== undefined) {
        offsets.set(i, (prev + next) / 2);
      } else if (prev !== undefined) {
        offsets.set(i, prev + 24);
      } else if (next !== undefined) {
        offsets.set(i, Math.max(0, next - 24));
      }
    }

    // Build line ranges for multi-line blocks (e.g. merged paragraphs)
    const ranges = new Map<number, number>();
    const elements = markdownElement.querySelectorAll("[data-line-element]");
    for (const el of elements) {
      const start = el.getAttribute("data-line-element");
      const end = el.getAttribute("data-line-end");
      if (start && end) {
        const startNum = Number.parseInt(start, 10);
        const endNum = Number.parseInt(end, 10);
        if (!Number.isNaN(startNum) && !Number.isNaN(endNum) && endNum > startNum) {
          ranges.set(startNum, endNum);
        }
      }
    }

    setLineOffsets(offsets);
    setLinesWithMarkers(withMarkers);
    setLineRanges(ranges);
  }, [lines, commentsByLine, activeLineIndex]);

  // Stable hover callbacks — identity never changes, so they can be in memoized components
  const handleMouseEnterLine = useCallback((lineNumber: number) => {
    setHoveredLineIndex(lineNumber - 1);
  }, []);
  const handleMouseLeaveLine = useCallback(() => {
    setHoveredLineIndex(null);
  }, []);

  // CSS-based line highlighting — updating this never causes ReactMarkdown to re-render
  const lineHighlightCss = useMemo(() => {
    const highlighted = new Set<number>();
    if (hoveredLineIndex !== null) highlighted.add(hoveredLineIndex + 1);
    if (activeLineIndex !== null) highlighted.add(activeLineIndex + 1);
    if (hoveredCommentLineIndex !== null) highlighted.add(hoveredCommentLineIndex + 1);
    if (highlighted.size === 0) return "";
    return Array.from(highlighted)
      .map(
        (ln) => `
      [data-line-element="${ln}"] {
        background-color: var(--yellow-light);
        border-radius: 2px;
        padding-left: 0.5rem;
        margin-left: -0.5rem;
      }
      li[data-line-element="${ln}"] {
        margin-left: 0;
        padding-left: 0;
      }
      blockquote[data-line-element="${ln}"] {
        border-left-color: var(--yellow) !important;
      }`,
      )
      .join("\n");
  }, [hoveredLineIndex, activeLineIndex, hoveredCommentLineIndex]);

  // Render profile pictures for a line if it has comments
  const renderProfilePictures = useCallback(
    (lineNumber?: number) => {
      if (!lineNumber) return null;
      const lineComments = commentsByLine.get(lineNumber);
      if (!lineComments?.length) return null;
      return <ProfilePictures users={lineComments.map((c) => ({ name: c.user, avatar: c.userAvatar }))} />;
    },
    [commentsByLine],
  );

  // Handle clicking on a line in the markdown content
  const handleLineClick = useCallback(
    (lineNumber: number) => {
      const lineIndex = lineNumber - 1;
      if (commentsByLine.has(lineNumber)) {
        setReplyingToLine(lineNumber);
        setReplyText("");
        setActiveLineIndex(null);
        setCommentText("");
        setSelectedText("");
      } else {
        setActiveLineIndex(lineIndex);
        setCommentText("");
        setSelectedText("");
      }
    },
    [commentsByLine],
  );

  // Initialize collapsed state: collapse all if more than 3 comment blocks
  const resolvedCollapsedLines = useMemo(
    () => collapsedLines ?? (commentsByLine.size > 3 ? new Set(commentsByLine.keys()) : new Set<number>()),
    [collapsedLines, commentsByLine],
  );

  // Calculate all comment box positions to prevent overlaps
  useEffect(() => {
    const positions = new Map<number, number>();

    // Collect all boxes that need positioning (both existing comments and active form)
    const boxesToPosition: Array<{
      lineNum: number;
      ref: HTMLDivElement | null;
      isActive: boolean;
    }> = [];

    // Add all existing comment boxes
    for (const ln of commentsByLine.keys()) {
      boxesToPosition.push({
        lineNum: ln,
        ref: commentBoxRefs.current.get(ln) || null,
        isActive: false,
      });
    }

    // Add the active comment form if present
    if (activeLineIndex !== null) {
      boxesToPosition.push({
        lineNum: activeLineIndex + 1,
        ref: commentBoxRefs.current.get(-1) || null,
        isActive: true,
      });
    }

    // Sort by line number to process top-to-bottom
    boxesToPosition.sort((a, b) => a.lineNum - b.lineNum);

    let lastBottom = 0;

    for (const { lineNum, ref, isActive } of boxesToPosition) {
      const baseOffset = lineOffsets.get(lineNum) || 0;
      let adjustedOffset = Math.max(baseOffset, lastBottom);

      // Store the calculated position
      positions.set(isActive ? -1 : lineNum, adjustedOffset);

      // Update lastBottom for the next iteration
      if (ref) {
        const boxHeight = ref.offsetHeight;
        lastBottom = adjustedOffset + boxHeight + 8; // 8px gap between boxes
      } else {
        lastBottom = adjustedOffset + 100; // Minimum estimated height
      }
    }

    setCommentPositions(positions);
  }, [lineOffsets, commentsByLine, activeLineIndex, replyingToLine, replyText, commentText, resolvedCollapsedLines]);

  // Helper to get the position for a specific line
  const getCommentPosition = (lineNumber: number): number => {
    return commentPositions.get(lineNumber) || lineOffsets.get(lineNumber) || 0;
  };

  // Handle mouse down to start selection tracking
  function handleMouseDown() {
    isSelectingRef.current = true;
    if (tooltipRef.current) {
      tooltipRef.current.style.display = "none";
    }
  }

  // Handle mouse move during selection to update tooltip
  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isSelectingRef.current || !tooltipRef.current) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      tooltipRef.current.style.display = "none";
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      tooltipRef.current.style.display = "none";
      return;
    }

    // Position tooltip above cursor and update text
    tooltipRef.current.style.display = "block";
    tooltipRef.current.style.left = `${e.clientX}px`;
    tooltipRef.current.style.top = `${e.clientY - 24}px`;
    tooltipRef.current.textContent = `Release mouse button to cite selection`;
  }

  // Handle text selection to open comment box
  function handleTextSelection() {
    isSelectingRef.current = false;
    if (tooltipRef.current) {
      tooltipRef.current.style.display = "none";
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      return;
    }

    // Find the line marker within the selection
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;

    // Walk up the DOM to find elements with line marker data
    let element: HTMLElement | null =
      container instanceof HTMLElement ? container : container.parentElement;

    let lineNumber: number | null = null;

    while (element && element !== markdownRef.current) {
      const lineAttr = element.getAttribute("data-line-element");
      if (lineAttr) {
        lineNumber = Number.parseInt(lineAttr, 10);
        break;
      }
      element = element.parentElement;
    }

    if (lineNumber !== null) {
      const lineIndex = lineNumber - 1;
      setActiveLineIndex(lineIndex);
      setCommentText(`> ${selectedText}\n`);
      setSelectedText(selectedText);
      selection.removeAllRanges(); // Clear the selection
    }
  }

  async function handleSubmit(lineIndex: number) {
    if (!commentText.trim()) return;

    setIsSubmitting(true);
    try {
      await onCommentSubmit(lineIndex + 1, commentText);
      setCommentText("");
      setActiveLineIndex(null);
      setSelectedText("");
    } catch (error) {
      console.error("Error submitting comment:", error);
      alert("Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReplySubmit(lineNumber: number) {
    if (!replyText.trim()) return;

    setIsSubmitting(true);
    try {
      await onCommentSubmit(lineNumber, replyText);
      setReplyText("");
      setReplyingToLine(null);
    } catch (error) {
      console.error("Error submitting reply:", error);
      alert("Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Memoized components — only recomputes when comments change, not on hover/active state changes.
  // Hover highlighting is handled via a <style> tag (lineHighlightCss) so this stays stable.
  const markdownComponents = useMemo(
    () => ({
      h1: ({ children, ...props }: React.ComponentPropsWithoutRef<"h1">) => {
        const lineNumber = (props as any)["data-line-element"];
        return (
          <h1
            className="relative mb-2 mt-6 pb-2 border-b border-gray-20 text-4xl font-sans text-foreground"
            style={{ cursor: lineNumber ? "pointer" : undefined, ...(lineNumber && commentsByLine.has(lineNumber) && { paddingRight: "2rem" }) }}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-0 top-1/2 -translate-y-1/2">{renderProfilePictures(lineNumber)}</span>
          </h1>
        );
      },
      h2: ({ children, ...props }: React.ComponentPropsWithoutRef<"h2">) => {
        const lineNumber = (props as any)["data-line-element"];
        return (
          <h2
            className="relative mb-2 mt-5 pb-2 border-b border-gray-20 text-3xl font-sans text-foreground"
            style={{ cursor: lineNumber ? "pointer" : undefined, ...(lineNumber && commentsByLine.has(lineNumber) && { paddingRight: "2rem" }) }}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-0 top-1/2 -translate-y-1/2">{renderProfilePictures(lineNumber)}</span>
          </h2>
        );
      },
      h3: ({ children, node: _node, ...props }: MDProps<"h3">) => {
        const lineNumber = (props as any)["data-line-element"];
        return (
          <h3
            className="relative mb-1 mt-4 text-2xl font-sans text-foreground"
            style={{ cursor: lineNumber ? "pointer" : undefined, ...(lineNumber && commentsByLine.has(lineNumber) && { paddingRight: "2rem" }) }}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-0 top-1/2 -translate-y-1/2">{renderProfilePictures(lineNumber)}</span>
          </h3>
        );
      },
      p: ({ children, node: _node, ...props }: MDProps<"p">) => {
        const lineNumber = (props as any)["data-line-element"];
        return (
          <p
            className="relative my-2 leading-relaxed"
            style={{ cursor: lineNumber ? "pointer" : undefined, ...(lineNumber && commentsByLine.has(lineNumber) && { paddingRight: "2rem" }) }}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-0 top-1/2 -translate-y-1/2">{renderProfilePictures(lineNumber)}</span>
          </p>
        );
      },
      a: ({ href, children }: React.ComponentPropsWithoutRef<"a">) => (
        <a
          href={href}
          className="text-foreground underline decoration-cyan underline-offset-2 transition-all hover:decoration-foreground"
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      ),
      strong: ({ children, node: _node, ...props }: MDProps<"strong">) => (
        <strong style={{ fontWeight: 600 }} {...props}>
          {children}
        </strong>
      ),
      ul: ({ children, node: _node, ...props }: MDProps<"ul">) => {
        const { "data-line-element": _stripped, ...rest } = props as any;
        return (
          <ul className="my-2 ml-6 list-disc space-y-1 text-gray-90" {...rest}>
            {children}
          </ul>
        );
      },
      ol: ({ children, node: _node, ...props }: MDProps<"ol">) => {
        const { "data-line-element": _stripped, ...rest } = props as any;
        return (
          <ol className="my-2 ml-6 list-decimal space-y-1 text-gray-90" {...rest}>
            {children}
          </ol>
        );
      },
      li: ({ children, node: _node, ...props }: MDProps<"li">) => {
        const lineNumber = (props as any)["data-line-element"];
        return (
          <li
            className="relative leading-relaxed text-gray-90"
            style={{ cursor: lineNumber ? "pointer" : undefined, ...(lineNumber && commentsByLine.has(lineNumber) && { paddingRight: "2rem" }) }}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-0 top-1/2 -translate-y-1/2">{renderProfilePictures(lineNumber)}</span>
          </li>
        );
      },
      code: ({ className, children, node: _node, ...props }: MDProps<"code">) => {
        const isInline = !className;
        if (isInline) {
          return (
            <code
              className="border border-gray-20 rounded-sm bg-gray-5 px-1.5 py-0.5 font-mono text-sm text-foreground"
              {...props}
            >
              {children}
            </code>
          );
        }
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      },
      pre: ({ children, node: _node, ...props }: MDProps<"pre">) => {
        const lineNumber = (props as any)["data-line-element"];
        const childProps = (children as any)?.props;
        const isMermaid = childProps?.className?.includes("language-mermaid");
        if (isMermaid) {
          const chart = String(childProps?.children ?? "").trim();
          return (
            <div
              className="relative"
              style={{ cursor: lineNumber ? "pointer" : undefined }}
              onClick={() => lineNumber && handleLineClick(lineNumber)}
              onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
              onMouseLeave={handleMouseLeaveLine}
            >
              <MermaidDiagram chart={chart} />
              <span className="absolute right-2 top-2">{renderProfilePictures(lineNumber)}</span>
            </div>
          );
        }
        return (
          <pre
            className="relative my-4 max-w-full overflow-x-auto border border-gray-30 rounded whitespace-pre-wrap bg-gray-90 p-4"
            style={{ cursor: lineNumber ? "pointer" : undefined }}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-2 top-2">{renderProfilePictures(lineNumber)}</span>
          </pre>
        );
      },
      blockquote: ({ children, node: _node, ...props }: MDProps<"blockquote">) => {
        const lineNumber = (props as any)["data-line-element"];
        return (
          <blockquote
            className="relative my-4 border-l-2 bg-gray-5 py-2 pl-4 pr-4 italic text-gray-70"
            style={{ borderLeftColor: "var(--magenta)", cursor: lineNumber ? "pointer" : undefined }}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-2 top-2">{renderProfilePictures(lineNumber)}</span>
          </blockquote>
        );
      },
      table: ({ children, node: _node, ...props }: MDProps<"table">) => {
        const lineNumber = (props as any)["data-line-element"];
        return (
          <div className="my-4 overflow-x-auto">
            <table
              className="min-w-full border border-gray-20 rounded"
              style={{ cursor: lineNumber ? "pointer" : undefined }}
              onClick={() => lineNumber && handleLineClick(lineNumber)}
              onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
              onMouseLeave={handleMouseLeaveLine}
              {...props}
            >
              {children}
            </table>
          </div>
        );
      },
      thead: ({ children, node: _node, ...props }: MDProps<"thead">) => (
        <thead className="bg-gray-10" {...props}>
          {children}
        </thead>
      ),
      tbody: ({ children, node: _node, ...props }: MDProps<"tbody">) => (
        <tbody className="divide-y divide-gray-20 bg-surface" {...props}>
          {children}
        </tbody>
      ),
      tr: ({ children, node: _node, ...props }: MDProps<"tr">) => {
        const lineNumber = (props as any)["data-line-element"];
        return (
          <tr
            className="border-gray-20"
            style={{ cursor: lineNumber ? "pointer" : undefined }}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
          </tr>
        );
      },
      th: ({ children, node: _node, ...props }: MDProps<"th">) => {
        const lineNumber = (props as any)["data-line-element"];
        return (
          <th
            className="border border-gray-20 px-4 py-2 text-left text-sm font-medium text-foreground"
            style={{ cursor: lineNumber ? "pointer" : undefined }}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
          </th>
        );
      },
      td: ({ children, node: _node, ...props }: MDProps<"td">) => {
        const lineNumber = (props as any)["data-line-element"];
        return (
          <td
            className="border border-gray-20 px-4 py-2 text-sm text-gray-90"
            style={{ cursor: lineNumber ? "pointer" : undefined }}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
          </td>
        );
      },
    }),
    [commentsByLine, handleLineClick, handleMouseEnterLine, handleMouseLeaveLine, renderProfilePictures],
  );

  // Calculate the minimum height needed for the main content area to accommodate all comments
  const minContentHeight = useMemo(() => {
    let maxBottom = 0;
    for (const [key, position] of commentPositions.entries()) {
      const ref = commentBoxRefs.current.get(key);
      if (ref) {
        const bottom = position + ref.offsetHeight;
        maxBottom = Math.max(maxBottom, bottom);
      }
    }
    return maxBottom;
  }, [commentPositions]);

  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 lg:gap-12" style={{ minHeight: `${minContentHeight}px` }}>
      {/* Main content */}
      <div className="relative flex gap-2 sm:gap-4 -ml-2 sm:-ml-4 min-w-0 h-fit" >
        {/* Line numbers column */}
        <LineNumbersColumn
          lines={lines}
          linesInCodeBlocks={linesInCodeBlocks}
          commentsByLine={commentsByLine}
          lineOffsets={lineOffsets}
          linesWithMarkers={linesWithMarkers}
          lineRanges={lineRanges}
          lineRefs={lineRefs}
          onLineClick={handleLineClick}
          onMouseEnterLine={handleMouseEnterLine}
          onMouseLeaveLine={handleMouseLeaveLine}
        />

        {/* Full markdown content */}
        <div
          ref={markdownRef}
          className="prose prose-zinc max-w-none flex-1 min-w-0 overflow-x-auto relative"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleTextSelection}
        >
          {/* Scoped styles for hover/active line highlights — updating this string
              only patches the <style> text node, ReactMarkdown is unaffected */}
          <style>{lineHighlightCss}</style>
          <MemoizedMarkdown content={content} components={markdownComponents} />
        </div>
        <hr className="absolute -bottom-3 left-0 right-0 border-t border-dotted border-gray-30" />
      </div>

      {/* Comments sidebar */}
      <div className="relative w-full lg:w-auto">
        {activeLineIndex !== null && (
          <LineCommentBox
            lineNumber={activeLineIndex + 1}
            commentText={commentText}
            isSubmitting={isSubmitting}
            position={
              commentPositions.get(-1) ||
              lineOffsets.get(activeLineIndex + 1) ||
              0
            }
            onCommentTextChange={setCommentText}
            onClose={() => {
              setActiveLineIndex(null);
              setCommentText("");
              setSelectedText("");
            }}
            onSubmit={() => handleSubmit(activeLineIndex)}
            commentBoxRef={(el) => {
              if (el) {
                commentBoxRefs.current.set(-1, el);
              }
            }}
            onMouseEnter={() => setHoveredCommentLineIndex(activeLineIndex)}
            onMouseLeave={() => setHoveredCommentLineIndex(null)}
          />
        )}

        {Array.from(commentsByLine.entries())
          .sort(([a], [b]) => a - b)
          .map(([lineNumber, lineComments]) => (
            <ExistingLineComments
              key={lineNumber}
              lineNumber={lineNumber}
              comments={lineComments}
              position={getCommentPosition(lineNumber)}
              isReplying={replyingToLine === lineNumber}
              replyText={replyText}
              isSubmitting={isSubmitting}
              isCollapsed={resolvedCollapsedLines.has(lineNumber)}
              onReplyTextChange={setReplyText}
              onStartReply={() => {
                setReplyingToLine(lineNumber);
                setReplyText("");
              }}
              onCancelReply={() => {
                setReplyingToLine(null);
                setReplyText("");
              }}
              onSubmitReply={() => handleReplySubmit(lineNumber)}
              onToggleCollapse={() => {
                setCollapsedLines(() => {
                  const next = new Set(resolvedCollapsedLines);
                  if (next.has(lineNumber)) {
                    next.delete(lineNumber);
                  } else {
                    next.add(lineNumber);
                  }
                  return next;
                });
              }}
              commentBoxRef={(el) => {
                if (el) {
                  commentBoxRefs.current.set(lineNumber, el);
                }
              }}
              onMouseEnter={() => setHoveredCommentLineIndex(lineNumber - 1)}
              onMouseLeave={() => setHoveredCommentLineIndex(null)}
            />
          ))}

        {/* Empty/loading state */}
        {commentsByLine.size === 0 && activeLineIndex === null && (
          <div
            className="lg:absolute top-0 border border-dashed border-gray-30 rounded-md bg-gray-5 p-4 sm:p-6 text-center w-full lg:w-[400px]"
          >
            {commentsLoading ? (
              <>
                <div className="mx-auto h-8 w-8 animate-pulse rounded-full bg-gray-20" />
                <p className="mt-3 text-sm font-medium text-gray-50">
                  Loading comments...
                </p>
              </>
            ) : (
              <>
                <svg
                  className="mx-auto h-8 w-8 text-gray-30"
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
                <p className="mt-3 text-sm font-medium text-gray-50">
                  No comments yet
                </p>
                <p className="mt-1 text-xs text-gray-50">
                  Click any line to add a comment
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Selection tooltip */}
      <div
        ref={tooltipRef}
        className="pointer-events-none fixed z-50 border border-gray-20 rounded-md bg-surface px-3 py-2 text-xs font-medium text-foreground"
        style={{
          display: "none",
          transform: "translate(-50%, -100%)",
        }}
      />
    </div>
  );
}
