"use client";

import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { Comment } from "@/lib/github";
import type { CommentThread } from "@/lib/comment-threads";
import { groupIntoThreads } from "@/lib/comment-threads";
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
              className={`font-mono text-[10px] sm:text-xs transition-opacity flex flex-col items-center leading-snug`}
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

type ReplyTarget =
  | { type: "thread"; line: number; threadId: number }
  | { type: "newThread"; line: number }

interface InlineCommentableMarkdownProps {
  content: string;
  prNumber: number;
  comments: Comment[];
  commentsLoading?: boolean;
  highlightedCommentId?: number | null;
  onCommentSubmit: (line: number, body: string, replyToCommentId?: number) => Promise<void>;
}

export function InlineCommentableMarkdown({
  content,
  prNumber,
  comments,
  commentsLoading,
  highlightedCommentId,
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
  const [lineAlias, setLineAlias] = useState<Map<number, number>>(new Map());
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [replyText, setReplyText] = useState("");
  const lineRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const markdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const isSelectingRef = useRef(false);
  const [arrowPaths, setArrowPaths] = useState<
    Array<{
      lineNumber: number;
      from: { x: number; y: number };
      to: { x: number; y: number };
      elbowX: number;
      color: string;
      isDraft: boolean;
    }>
  >([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const lines = useMemo(() => content.split("\n"), [content]);
  const commentBoxRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const contentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
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

  const threadsByLine = useMemo(() => {
    const map = new Map<number, CommentThread[]>();
    for (const [line, lineComments] of commentsByLine.entries()) {
      map.set(line, groupIntoThreads(lineComments));
    }
    return map;
  }, [commentsByLine]);

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
    // Alias omitted lines (no marker) with comments to the latest preceding line with rendered content.
    const alias = new Map<number, number>();
    const aliasCountAtPrev = new Map<number, number>();
    for (let i = 1; i <= lines.length; i++) {
      if (offsets.has(i)) continue;
      const isEmpty = lines[i - 1]?.trim() === "";
      if (isEmpty && !commentsByLine.has(i)) continue;

      let prevLine: number | undefined;
      let prevOffset: number | undefined;
      let nextOffset: number | undefined;
      for (let j = i - 1; j >= 1; j--) {
        const val = offsets.get(j);
        if (val !== undefined) {
          prevLine = j;
          prevOffset = val;
          break;
        }
      }
      for (let j = i + 1; j <= lines.length; j++) {
        const val = offsets.get(j);
        if (val !== undefined) {
          nextOffset = val;
          break;
        }
      }
      if (prevLine !== undefined && prevOffset !== undefined) {
        alias.set(i, prevLine);
        const stacked = aliasCountAtPrev.get(prevLine) ?? 0;
        aliasCountAtPrev.set(prevLine, stacked + 1);
        offsets.set(i, prevOffset + stacked * 4);
      } else if (nextOffset !== undefined) {
        offsets.set(i, Math.max(0, nextOffset - 24));
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
    setLineAlias(alias);
  }, [lines, commentsByLine, activeLineIndex]);

  // Stable hover callbacks — identity never changes, so they can be in memoized components
  const handleMouseEnterLine = useCallback((lineNumber: number) => {
    setHoveredLineIndex(lineNumber - 1);
  }, []);
  const handleMouseLeaveLine = useCallback(() => {
    setHoveredLineIndex(null);
  }, []);

  // CSS-based line highlighting — updating this never causes ReactMarkdown to re-render.
  // Omitted lines (no DOM marker) are aliased to the preceding line so we can highlight that content.
  // Hovered lines get a more intense color than merely active (selected) lines.
  const lineHighlightCss = useMemo(() => {
    const resolve = (ln: number) => lineAlias.get(ln) ?? ln;
    const hovered = new Set<number>();
    const active = new Set<number>();
    if (hoveredLineIndex !== null) hovered.add(resolve(hoveredLineIndex + 1));
    if (hoveredCommentLineIndex !== null) hovered.add(resolve(hoveredCommentLineIndex + 1));
    if (activeLineIndex !== null) active.add(resolve(activeLineIndex + 1));
    const all = new Set([...hovered, ...active]);
    if (all.size === 0) return "";
    return Array.from(all)
      .map(
        (ln) => {
          const isHovered = hovered.has(ln);
          const bg = isHovered ? "var(--yellow-medium)" : "var(--yellow-light)";
          return `
      [data-line-element="${ln}"] {
        background-color: ${bg};
        border-radius: 2px;
        padding-left: 0.5rem;
        margin-left: -0.5rem;
      }
      li[data-line-element="${ln}"] {
        margin-left: 0;
        padding-left: 0;
      }
      tr[data-line-element="${ln}"] {
        margin-left: 0;
        padding-left: 0;
      }
      blockquote[data-line-element="${ln}"] {
        border-left-color: var(--yellow) !important;
      }`;
        },
      )
      .join("\n");
  }, [hoveredLineIndex, activeLineIndex, hoveredCommentLineIndex, lineAlias]);

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
        setActiveLineIndex(null);
        setCommentText("");
        setSelectedText("");
        setCollapsedLines((prev) => {
          const resolved = prev ?? (commentsByLine.size > 3 ? new Set(commentsByLine.keys()) : new Set<number>());
          const updated = new Set(resolved);
          if (resolved.has(lineNumber)) {
            updated.delete(lineNumber);
            // Opening: auto-start reply if single thread, otherwise let user pick
            const lineThreads = threadsByLine.get(lineNumber);
            if (lineThreads?.length === 1) {
              setReplyTarget({ type: "thread", line: lineNumber, threadId: lineThreads[0].id });
            } else {
              setReplyTarget(null);
            }
            setReplyText("");
          } else {
            updated.add(lineNumber);
            if (replyTarget?.line === lineNumber) {
              setReplyTarget(null);
              setReplyText("");
            }
          }
          return updated;
        });
      } else {
        if (activeLineIndex === lineIndex) {
          setActiveLineIndex(null);
          setCommentText("");
          setSelectedText("");
        } else {
          setReplyTarget(null);
          setReplyText("");
          setActiveLineIndex(lineIndex);
          setCommentText("");
          setSelectedText("");
        }
      }
    },
    [activeLineIndex, commentsByLine, threadsByLine, replyTarget],
  );

  // Auto-expand the collapsed group that contains the highlighted comment
  useEffect(() => {
    if (highlightedCommentId == null) return;
    for (const [line, lineComments] of commentsByLine.entries()) {
      if (lineComments.some((c) => c.id === highlightedCommentId)) {
        setCollapsedLines((prev) => {
          const resolved = prev ?? (commentsByLine.size > 3 ? new Set(commentsByLine.keys()) : new Set<number>());
          if (!resolved.has(line)) return prev;
          const next = new Set(resolved);
          next.delete(line);
          return next;
        });
        break;
      }
    }
  }, [highlightedCommentId, commentsByLine]);

  // Initialize collapsed state: collapse all if more than 3 comment blocks
  const resolvedCollapsedLines = useMemo(
    () => collapsedLines ?? (commentsByLine.size > 3 ? new Set(commentsByLine.keys()) : new Set<number>()),
    [collapsedLines, commentsByLine],
  );

  // Calculate all comment box positions to prevent overlaps
  useEffect(() => {
    function recalcPositions() {
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
          const headerEl = ref.firstElementChild as HTMLElement | null;
          let boxHeight = ref.offsetHeight;
          if (!isActive) {
            // Use known end-state height so we don't read mid-animation
            if (resolvedCollapsedLines.has(lineNum)) {
              // Collapsed: content height = 0, so box = header only
              boxHeight = headerEl?.offsetHeight ?? boxHeight;
            } else {
              // Expanded: box = header + content
              const contentEl = contentRefs.current.get(lineNum);
              if (contentEl && headerEl) {
                boxHeight = headerEl.offsetHeight + contentEl.offsetHeight;
              }
            }
          }
          lastBottom = adjustedOffset + boxHeight + 8; // 8px gap between boxes
        } else {
          lastBottom = adjustedOffset + 100; // Minimum estimated height
        }
      }

      setCommentPositions(positions);
    }

    recalcPositions();
  }, [lineOffsets, commentsByLine, activeLineIndex, replyTarget, replyText, commentText, resolvedCollapsedLines]);

  // Compute SVG arrow paths from each comment to its line (only on lg when sidebar is beside content)
  const recalcArrows = useCallback(() => {
    const container = containerRef.current;
    const markdown = markdownRef.current;
    if (!container || !markdown || typeof window === "undefined") return;

    const rect = container.getBoundingClientRect();
    if (rect.width < 1024) {
      setArrowPaths([]);
      setContainerSize({ width: 0, height: 0 });
      return;
    }

    setContainerSize({ width: rect.width, height: rect.height });
    const rawPaths: Array<{
      lineNumber: number;
      from: { x: number; y: number };
      to: { x: number; y: number };
      vy1: number;
      vy2: number;
      color: string;
      isDraft: boolean;
    }> = [];

    const collect = (
      lineNum: number,
      boxRef: HTMLDivElement | null,
      color: string,
      isDraft: boolean,
    ) => {
      if (!boxRef) return;
      const targetLine = lineAlias.get(lineNum) ?? lineNum;
      // Use data-line-element block (full-width) for right edge; line-marker is zero-width at line start
      let targetEl: HTMLElement | null = null;
      const blocks = markdown?.querySelectorAll("[data-line-element]") ?? [];
      for (const el of blocks) {
        const start = Number.parseInt(
          el.getAttribute("data-line-element") ?? "",
          10,
        );
        const endAttr = el.getAttribute("data-line-end");
        const end = endAttr ? Number.parseInt(endAttr, 10) : start;
        if (!Number.isNaN(start) && targetLine >= start && targetLine <= end) {
          targetEl = el as HTMLElement;
          break;
        }
      }
      if (!targetEl) {
        targetEl = document.getElementById(`line-marker-${targetLine}`);
      }
      if (!targetEl) return;

      const boxRect = boxRef.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();

      // Start: left edge of comment box, vertical center
      const from = {
        x: boxRect.left - rect.left,
        y: boxRect.top - rect.top + boxRect.height / 2,
      };
      // End: top-right of line block, aligned with profile pic center (3px + 10px)
      const to = {
        x: targetRect.right - rect.left,
        y: targetRect.top - rect.top + 13,
      };
      const vy1 = Math.min(from.y, to.y);
      const vy2 = Math.max(from.y, to.y);
      rawPaths.push({ lineNumber: lineNum, from, to, vy1, vy2, color, isDraft });
    };

    for (const ln of commentsByLine.keys()) {
      collect(ln, commentBoxRefs.current.get(ln) ?? null, "var(--magenta)", false);
    }
    if (activeLineIndex !== null) {
      collect(activeLineIndex + 1, commentBoxRefs.current.get(-1) ?? null, "var(--cyan)", true);
    }

    // Assign elbowX: right-angle paths; offset overlapping vertical segments by 4px
    const OFFSET = 4;
    const baseElbowX =
      rawPaths.length > 0
        ? rawPaths.reduce((s, p) => s + (p.from.x + p.to.x) / 2, 0) / rawPaths.length
        : 0;
    const segments: Array<{ x: number; vy1: number; vy2: number }> = [];
    const paths = rawPaths
      .sort((a, b) => a.vy1 - b.vy1)
      .map((p) => {
        let offset = 0;
        let elbowX: number;
        for (;;) {
          const tryX = Math.max(p.to.x, baseElbowX - offset);
          const overlaps = segments.some(
            (s) =>
              Math.abs(s.x - tryX) < OFFSET &&
              Math.min(p.vy2, s.vy2) > Math.max(p.vy1, s.vy1),
          );
          if (!overlaps) {
            elbowX = tryX;
            segments.push({ x: tryX, vy1: p.vy1, vy2: p.vy2 });
            break;
          }
          offset += OFFSET;
        }
        return {
          lineNumber: p.lineNumber,
          from: p.from,
          to: p.to,
          elbowX,
          color: p.color,
          isDraft: p.isDraft,
        };
      });

    setArrowPaths(paths);
  }, [commentsByLine, activeLineIndex, lineAlias]);

  useEffect(() => {
    recalcArrows();
    const ro = new ResizeObserver(() => recalcArrows());
    if (containerRef.current) ro.observe(containerRef.current);
    const onScroll = () => requestAnimationFrame(recalcArrows);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [recalcArrows, commentPositions, resolvedCollapsedLines]);

  // Re-run after expand/collapse animations complete
  useEffect(() => {
    const timer = setTimeout(recalcArrows, 350);
    return () => clearTimeout(timer);
  }, [recalcArrows, commentPositions, resolvedCollapsedLines]);

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

  async function handleReplySubmit() {
    if (!replyTarget || !replyText.trim()) return;

    setIsSubmitting(true);
    try {
      const threadId = replyTarget.type === "thread" ? replyTarget.threadId : undefined;
      await onCommentSubmit(replyTarget.line, replyText, threadId);
      setReplyText("");
      setReplyTarget(null);
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
            className="relative mb-2 mt-6 pb-2 border-b border-gray-20 text-5xl font-sans font-semibold tracking-tight text-foreground"
            style={{ cursor: lineNumber ? "pointer" : undefined, ...(lineNumber && commentsByLine.has(lineNumber) && { paddingRight: "2rem" }) }}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-[3px] top-[3px]">{renderProfilePictures(lineNumber)}</span>
          </h1>
        );
      },
      h2: ({ children, ...props }: React.ComponentPropsWithoutRef<"h2">) => {
        const lineNumber = (props as any)["data-line-element"];
        return (
          <h2
            className="relative mb-2 mt-5 pb-2 border-b border-gray-20 text-4xl font-sans font-semibold tracking-tight text-foreground"
            style={{ cursor: lineNumber ? "pointer" : undefined, ...(lineNumber && commentsByLine.has(lineNumber) && { paddingRight: "2rem" }) }}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-[3px] top-[3px]">{renderProfilePictures(lineNumber)}</span>
          </h2>
        );
      },
      h3: ({ children, node: _node, ...props }: MDProps<"h3">) => {
        const lineNumber = (props as any)["data-line-element"];
        return (
          <h3
            className="relative mb-1 mt-4 text-lg font-sans font-semibold text-foreground"
            style={{ cursor: lineNumber ? "pointer" : undefined, ...(lineNumber && commentsByLine.has(lineNumber) && { paddingRight: "2rem" }) }}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-[3px] top-[3px]">{renderProfilePictures(lineNumber)}</span>
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
            <span className="absolute right-[3px] top-[3px]">{renderProfilePictures(lineNumber)}</span>
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
          <ul className="my-2 ml-6 list-disc space-y-0.5 text-gray-90" {...rest}>
            {children}
          </ul>
        );
      },
      ol: ({ children, node: _node, ...props }: MDProps<"ol">) => {
        const { "data-line-element": _stripped, ...rest } = props as any;
        return (
          <ol className="my-2 ml-6 list-decimal space-y-0.5 text-gray-90" {...rest}>
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
            <span className="absolute right-[3px] top-[3px]">{renderProfilePictures(lineNumber)}</span>
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
        const { "data-line-element": _stripped, ...rest } = props as any;
        return (
          <div className="my-4 overflow-x-auto">
            <table className="min-w-full border border-gray-20 rounded" {...rest}>
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
      th: ({ children, node: _node, ...props }: MDProps<"th">) => (
        <th
          className="border border-gray-20 px-4 py-2 text-left text-sm font-medium text-foreground"
          {...props}
        >
          {children}
        </th>
      ),
      td: ({ children, node: _node, ...props }: MDProps<"td">) => (
        <td
          className="border border-gray-20 px-4 py-2 text-sm text-gray-90"
          {...props}
        >
          {children}
        </td>
      ),
      img: ({ node: _node, src, alt, ...props }: MDProps<"img">) => {
        let proxiedSrc = src;
        try {
          if (typeof src === "string") {
            const url = new URL(src);
            if (url.hostname === "github.com" && url.pathname.startsWith("/user-attachments/")) {
              proxiedSrc = `/api/github-image?url=${encodeURIComponent(src)}`;
            }
          }
        } catch {}
        return <img src={proxiedSrc as string | undefined} alt={(alt as string) ?? ""} {...props} />;
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
    <div ref={containerRef} className="relative" style={{ minHeight: `${minContentHeight}px` }}>
      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 lg:gap-12">
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

        {Array.from(threadsByLine.entries())
          .sort(([a], [b]) => a - b)
          .map(([lineNumber, lineThreads]) => (
            <ExistingLineComments
              key={lineNumber}
              lineNumber={lineNumber}
              threads={lineThreads}
              position={getCommentPosition(lineNumber)}
              replyingToThreadId={replyTarget?.line === lineNumber && replyTarget.type === "thread" ? replyTarget.threadId : null}
              isStartingNewThread={replyTarget?.line === lineNumber && replyTarget.type === "newThread"}
              replyText={replyTarget?.line === lineNumber ? replyText : ""}
              isSubmitting={isSubmitting}
              isCollapsed={resolvedCollapsedLines.has(lineNumber)}
              highlightedCommentId={highlightedCommentId}
              onReplyTextChange={setReplyText}
              onStartReply={(threadId) => {
                setReplyTarget({ type: "thread", line: lineNumber, threadId });
                setReplyText("");
              }}
              onStartNewThread={() => {
                setReplyTarget({ type: "newThread", line: lineNumber });
                setReplyText("");
              }}
              onCancelReply={() => {
                setReplyTarget(null);
                setReplyText("");
              }}
              onSubmitReply={handleReplySubmit}
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
              onContentRef={(el) => {
                if (el) {
                  contentRefs.current.set(lineNumber, el);
                } else {
                  contentRefs.current.delete(lineNumber);
                }
              }}
              isHovered={hoveredCommentLineIndex === lineNumber - 1 || hoveredLineIndex === lineNumber - 1}
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
      </div>

      {/* SVG arrows from comments to line markers (lg only) */}
      {containerSize.width > 0 && arrowPaths.length > 0 && (
        <svg
          className="pointer-events-none absolute left-0 top-0 z-10 hidden lg:block"
          width={containerSize.width}
          height={containerSize.height}
          viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
          preserveAspectRatio="none"
        >
          <defs>
            <marker
              id="arrowhead-magenta"
              markerWidth="6"
              markerHeight="6"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path
                d="M6,3 L0,0 L0,6 Z"
                fill="var(--magenta)"
                fillOpacity="0.6"
              />
            </marker>
            <marker
              id="arrowhead-cyan"
              markerWidth="6"
              markerHeight="6"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path
                d="M6,3 L0,0 L0,6 Z"
                fill="var(--cyan)"
                fillOpacity="1"
              />
            </marker>
          </defs>
          {arrowPaths.map(({ lineNumber, from, to, elbowX, color, isDraft }) => {
            const isLineHovered = hoveredCommentLineIndex === lineNumber - 1 || hoveredLineIndex === lineNumber - 1;
            const d = `M ${from.x} ${from.y} H ${elbowX} V ${to.y} H ${to.x}`;
            return (
              <path
                key={lineNumber}
                d={d}
                fill="none"
                stroke={color}
                strokeWidth="1"
                strokeOpacity={isDraft ? 1 : isLineHovered ? 1 : 0.6}
                markerEnd={isDraft ? "url(#arrowhead-cyan)" : "url(#arrowhead-magenta)"}
                style={{ transition: "stroke-opacity 0.15s, stroke-width 0.15s" }}
              />
            );
          })}
        </svg>
      )}

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
