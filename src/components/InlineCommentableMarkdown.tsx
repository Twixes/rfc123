// biome-ignore-all lint/a11y/useKeyWithClickEvents: every block is a comment anchor; keyboard path is the sidebar
// biome-ignore-all lint/a11y/noStaticElementInteractions: same – body text, no button role fits
"use client";

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { ClickableImage } from "@/components/ClickableImage";
import { ExistingLineComments } from "@/components/ExistingLineComments";

import { LineCommentBox } from "@/components/LineCommentBox";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { ProfilePictures } from "@/components/ProfilePictures";
import type { CommentThread } from "@/lib/comment-threads";
import { groupIntoThreads } from "@/lib/comment-threads";
import type { Comment } from "@/lib/github";
import {
  isRelativeMarkdownAssetSrc,
  resolveMarkdownImageRepoPath,
} from "@/lib/markdown-assets";
import { rehypeLineMarkers } from "@/lib/rehype-line-markers";
import { remarkMentions } from "@/lib/remark-mentions";
import { remarkMergeParagraphs } from "@/lib/remark-merge-paragraphs";

// Module-level constants – stable references across all renders and instances.
type PluginList = NonNullable<
  React.ComponentProps<typeof ReactMarkdown>["rehypePlugins"]
>;
const REMARK_PLUGINS: PluginList = [
  remarkGfm,
  remarkMentions,
  remarkBreaks,
  remarkMergeParagraphs,
];
const REHYPE_PLUGINS: PluginList = [
  [rehypeHighlight, { plainText: ["mermaid"] }],
  rehypeLineMarkers,
];

type LineHoverDispatch = (
  action:
    | { type: "enterLine"; index: number }
    | { type: "leaveLine" }
    | { type: "enterComment"; index: number }
    | { type: "leaveComment" },
) => void;

type HoverState = { line: number | null; comment: number | null };

function defaultCollapsedLines(
  commentsByLine: Map<number, Comment[]>,
): Set<number> {
  return commentsByLine.size > 3 ? new Set(commentsByLine.keys()) : new Set();
}

function buildLineHighlightCss(
  lineAlias: Map<number, number>,
  hoveredLineIndex: number | null,
  hoveredCommentLineIndex: number | null,
  activeLineIndex: number | null,
): string {
  const resolve = (ln: number) => lineAlias.get(ln) ?? ln;
  const hovered = new Set<number>();
  const active = new Set<number>();
  if (hoveredLineIndex !== null) hovered.add(resolve(hoveredLineIndex + 1));
  if (hoveredCommentLineIndex !== null)
    hovered.add(resolve(hoveredCommentLineIndex + 1));
  if (activeLineIndex !== null) active.add(resolve(activeLineIndex + 1));
  const all = new Set([...hovered, ...active]);
  if (all.size === 0) return "";
  return Array.from(all)
    .map((ln) => {
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
    })
    .join("\n");
}

/** 1-based line numbers currently hovered (line gutter and/or comment sidebar). */
function hoverDisplayLineNumbers(hover: HoverState): number[] {
  const lines = new Set<number>();
  if (hover.line !== null) lines.add(hover.line + 1);
  if (hover.comment !== null) lines.add(hover.comment + 1);
  return Array.from(lines);
}

function buildCommentAndArrowHoverCss(hover: HoverState): string {
  return hoverDisplayLineNumbers(hover)
    .map((ln) => {
      const shell = `.line-hover-shell[data-hovered-lines~="${ln}"]`;
      return `
    ${shell} [data-comment-line="${ln}"] {
      border-color: color-mix(in srgb, var(--magenta) 50%, transparent) !important;
      box-shadow: 0 1px 0 0 rgba(0,0,0,0.02), 0 8px 24px -12px rgba(114,30,60,0.18) !important;
    }
    ${shell} [data-comment-line="${ln}"] .comment-line-badge {
      --comment-opacity: 1 !important;
    }
    ${shell} path[data-arrow-line="${ln}"] {
      stroke-opacity: 1 !important;
    }`;
    })
    .join("\n");
}

function applyHoverToDom(
  shell: HTMLDivElement | null,
  styleEl: HTMLStyleElement | null,
  lineAlias: Map<number, number>,
  activeLineIndex: number | null,
  hover: HoverState,
) {
  if (styleEl) {
    styleEl.textContent =
      buildLineHighlightCss(
        lineAlias,
        hover.line,
        hover.comment,
        activeLineIndex,
      ) + buildCommentAndArrowHoverCss(hover);
  }
  if (!shell) return;
  const displayLines = hoverDisplayLineNumbers(hover);
  if (displayLines.length > 0) {
    shell.dataset.hoveredLines = displayLines.join(" ");
  } else {
    delete shell.dataset.hoveredLines;
  }
}

type ArrowPath = {
  lineNumber: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  elbowX: number;
  color: string;
  isDraft: boolean;
};

function LineHoverController({
  dispatchRef,
  lineAlias,
  activeLineIndex,
  commentsByLine,
  commentBoxRefs,
  commentPositions: _commentPositions,
  resolvedCollapsedLines: _resolvedCollapsedLines,
  markdownRef,
  containerRef,
  markdownColumn,
  sidebar,
}: {
  dispatchRef: React.MutableRefObject<LineHoverDispatch>;
  lineAlias: Map<number, number>;
  activeLineIndex: number | null;
  commentsByLine: Map<number, Comment[]>;
  commentBoxRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  commentPositions: Map<number, number>;
  resolvedCollapsedLines: Set<number>;
  markdownRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  markdownColumn: React.ReactNode;
  sidebar: React.ReactNode;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLStyleElement>(null);
  const hoverRef = useRef<HoverState>({ line: null, comment: null });
  const [arrowPaths, setArrowPaths] = useState<ArrowPath[]>([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const applyHover = useCallback(() => {
    applyHoverToDom(
      shellRef.current,
      styleRef.current,
      lineAlias,
      activeLineIndex,
      hoverRef.current,
    );
  }, [lineAlias, activeLineIndex]);

  useLayoutEffect(() => {
    dispatchRef.current = (action) => {
      switch (action.type) {
        case "enterLine":
          hoverRef.current.line = action.index;
          break;
        case "leaveLine":
          hoverRef.current.line = null;
          break;
        case "enterComment":
          hoverRef.current.comment = action.index;
          break;
        case "leaveComment":
          hoverRef.current.comment = null;
          break;
      }
      applyHover();
    };
    applyHover();
  }, [applyHover, dispatchRef]);

  const recalcArrows = useCallback(() => {
    const container = containerRef.current;
    const markdown = markdownRef.current;
    if (!container || !markdown || typeof window === "undefined") return;

    const rect = container.getBoundingClientRect();
    if (rect.width < 1024) {
      setArrowPaths([]);
      setContainerSize((prev) => {
        if (prev.width === 0 && prev.height === 0) return prev;
        return { width: 0, height: 0 };
      });
      return;
    }

    setContainerSize((prev) => {
      if (prev.width === rect.width && prev.height === rect.height) return prev;
      return { width: rect.width, height: rect.height };
    });

    const rawPaths: Array<{
      lineNumber: number;
      from: { x: number; y: number };
      to: { x: number; y: number };
      vy1: number;
      vy2: number;
      color: string;
      isDraft: boolean;
    }> = [];

    // Snapshot block info once to avoid O(N×M) querySelectorAll per comment.
    const blockEls = markdown.querySelectorAll("[data-line-element]");
    const blockInfo: Array<{ start: number; end: number; el: HTMLElement }> =
      [];
    for (const el of blockEls) {
      const start = Number.parseInt(
        el.getAttribute("data-line-element") ?? "",
        10,
      );
      if (Number.isNaN(start)) continue;
      const endAttr = el.getAttribute("data-line-end");
      const end = endAttr ? Number.parseInt(endAttr, 10) : start;
      blockInfo.push({ start, end, el: el as HTMLElement });
    }

    const collect = (
      lineNum: number,
      boxRef: HTMLDivElement | null,
      color: string,
      isDraft: boolean,
    ) => {
      if (!boxRef) return;
      const targetLine = lineAlias.get(lineNum) ?? lineNum;
      let targetEl: HTMLElement | null = null;
      for (const { start, end, el } of blockInfo) {
        if (targetLine >= start && targetLine <= end) {
          targetEl = el;
          break;
        }
      }
      if (!targetEl)
        targetEl = document.getElementById(`line-marker-${targetLine}`);
      if (!targetEl) return;

      const boxRect = boxRef.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const from = {
        x: boxRect.left - rect.left,
        y: boxRect.top - rect.top + boxRect.height / 2,
      };
      const to = {
        x: targetRect.right - rect.left,
        y: targetRect.top - rect.top + 13,
      };
      rawPaths.push({
        lineNumber: lineNum,
        from,
        to,
        vy1: Math.min(from.y, to.y),
        vy2: Math.max(from.y, to.y),
        color,
        isDraft,
      });
    };

    for (const ln of commentsByLine.keys()) {
      collect(
        ln,
        commentBoxRefs.current.get(ln) ?? null,
        "var(--magenta)",
        false,
      );
    }
    if (activeLineIndex !== null) {
      collect(
        activeLineIndex + 1,
        commentBoxRefs.current.get(-1) ?? null,
        "var(--cyan)",
        true,
      );
    }

    const OFFSET = 4;
    const baseElbowX =
      rawPaths.length > 0
        ? rawPaths.reduce((s, p) => s + (p.from.x + p.to.x) / 2, 0) /
          rawPaths.length
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
  }, [
    commentsByLine,
    activeLineIndex,
    lineAlias,
    commentBoxRefs,
    containerRef,
    markdownRef,
  ]);

  const arrowsRafRef = useRef<number | null>(null);
  const scheduleRecalcArrows = useCallback(() => {
    if (arrowsRafRef.current != null) return;
    arrowsRafRef.current = requestAnimationFrame(() => {
      arrowsRafRef.current = null;
      recalcArrows();
    });
  }, [recalcArrows]);

  useEffect(() => {
    scheduleRecalcArrows();
    const ro = new ResizeObserver(() => scheduleRecalcArrows());
    if (containerRef.current) ro.observe(containerRef.current);
    const onScroll = () => scheduleRecalcArrows();
    window.addEventListener("scroll", onScroll, true);
    const timer = setTimeout(() => scheduleRecalcArrows(), 350);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onScroll, true);
      clearTimeout(timer);
      if (arrowsRafRef.current != null) {
        cancelAnimationFrame(arrowsRafRef.current);
      }
    };
  }, [scheduleRecalcArrows, containerRef.current]);

  return (
    <>
      <style ref={styleRef} />
      <div
        ref={shellRef}
        className="line-hover-shell relative grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 lg:gap-12"
      >
        {markdownColumn}
        {sidebar}
      </div>
      {containerSize.width > 0 && arrowPaths.length > 0 && (
        <svg
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-10 hidden lg:block"
          width={containerSize.width}
          height={containerSize.height}
          viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
          preserveAspectRatio="none"
        >
          <title>Comment threads</title>
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
              <path d="M6,3 L0,0 L0,6 Z" fill="var(--cyan)" fillOpacity="1" />
            </marker>
          </defs>
          {arrowPaths.map(
            ({ lineNumber, from, to, elbowX, color, isDraft }) => {
              const d = `M ${from.x} ${from.y} H ${elbowX} V ${to.y} H ${to.x}`;
              return (
                <path
                  key={lineNumber}
                  data-arrow-line={lineNumber}
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth="1"
                  strokeOpacity={isDraft ? 1 : 0.6}
                  markerEnd={
                    isDraft ? "url(#arrowhead-cyan)" : "url(#arrowhead-magenta)"
                  }
                  className="svg-stroke-transition"
                />
              );
            },
          )}
        </svg>
      )}
    </>
  );
}

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

// `node` is react-markdown's HAST element; data-line-* come from rehypeLineMarkers.
type MDProps<T extends React.ElementType> =
  React.ComponentPropsWithoutRef<T> & {
    node?: unknown;
    "data-line-element"?: number;
    "data-line-end"?: number;
  };

interface LineNumbersColumnProps {
  lines: string[];
  commentsByLine: Map<number, Comment[]>;
  lineOffsets: Map<number, number>;
  linesWithMarkers: Set<number>;
  lineRanges: Map<number, number>;
  lineRefs: React.MutableRefObject<Map<number, HTMLButtonElement>>;
  onLineClick: (lineNumber: number) => void;
  onMouseEnterLine: (lineNumber: number) => void;
  onMouseLeaveLine: () => void;
}

function LineNumbersColumn({
  lines,
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
    <div className="shrink-0 select-none relative w-[40px]">
      {lines.map((_line, index) => {
        const lineNumber = index + 1;

        // Only show line numbers for lines that have rendered content (DOM marker) or comments.
        // Blank lines have no marker, so they would bunch up – hide them.
        const hasMarker = linesWithMarkers.has(lineNumber);
        const hasComments = commentsByLine.has(lineNumber);
        if (!hasMarker && !hasComments) return null;

        const lineOffset = lineOffsets.get(lineNumber);
        if (lineOffset === undefined) return null;

        const hasCommentsForStyle =
          (commentsByLine.get(lineNumber)?.length ?? 0) > 0;
        const endLine = lineRanges.get(lineNumber);
        const isRange = endLine != null && endLine > lineNumber;

        return (
          <button
            key={lineNumber}
            id={`line-${lineNumber}`}
            ref={(el) => {
              if (el) lineRefs.current.set(lineNumber, el);
            }}
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
            <div className="hidden sm:flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-cyan/90 text-surface opacity-0 transition-opacity group-hover:opacity-100">
              <svg
                className="h-2.5 w-2.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <title>Add comment</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </div>
            <span
              className={`font-mono text-[10px] sm:text-xs transition-opacity flex flex-col items-center leading-snug ${hasCommentsForStyle ? "text-magenta" : "text-gray-50"}`}
            >
              {isRange ? (
                <>
                  <span>{lineNumber}</span>
                  <span className="opacity-50">↓</span>
                  <span className="opacity-50">{endLine}</span>
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
}

type ReplyTarget =
  | { type: "thread"; line: number; threadId: number }
  | { type: "newThread"; line: number };

interface InlineCommentableMarkdownProps {
  content: string;
  prNumber: number;
  owner: string;
  repo: string;
  markdownFilePath: string | null;
  headRef: string;
  comments: Comment[];
  commentsLoading?: boolean;
  highlightedCommentId?: number | null;
  onCommentSubmit: (
    line: number,
    body: string,
    replyToCommentId?: number,
  ) => Promise<void>;
}

export function InlineCommentableMarkdown({
  content,
  prNumber: _prNumber,
  owner,
  repo,
  markdownFilePath,
  headRef,
  comments,
  commentsLoading,
  highlightedCommentId,
  onCommentSubmit,
}: InlineCommentableMarkdownProps) {
  const hoverDispatchRef = useRef<LineHoverDispatch>(() => {});
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  /** Only set when opening the line comment box (e.g. quoted selection), not on each keystroke. */
  const [lineCommentInitialDraft, setLineCommentInitialDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [collapsedLines, setCollapsedLines] = useState<Set<number> | null>(
    null,
  );
  const [lineOffsets, setLineOffsets] = useState<Map<number, number>>(
    new Map(),
  );
  const lineOffsetsRef = useRef<Map<number, number>>(new Map());
  lineOffsetsRef.current = lineOffsets;
  const [linesWithMarkers, setLinesWithMarkers] = useState<Set<number>>(
    new Set(),
  );
  const [lineRanges, setLineRanges] = useState<Map<number, number>>(new Map());
  const [lineAlias, setLineAlias] = useState<Map<number, number>>(new Map());
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  /** Only set when opening reply UI (e.g. quoted selection), not on each keystroke. */
  const [replyInitialDraft, setReplyInitialDraft] = useState("");
  const lineRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const markdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const isSelectingRef = useRef(false);

  const lines = useMemo(() => content.split("\n"), [content]);
  const commentBoxRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const contentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [commentPositions, setCommentPositions] = useState<Map<number, number>>(
    new Map(),
  );
  const [minContentHeight, setMinContentHeight] = useState(0);

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

  /** Sidebar + layout work is deferred so comment load does not block the markdown column. */
  const deferredComments = useDeferredValue(comments);
  const layoutCommentsByLine = useMemo(() => {
    const map = new Map<number, Comment[]>();
    for (const comment of deferredComments) {
      if (comment.line) {
        const existing = map.get(comment.line) || [];
        map.set(comment.line, [...existing, comment]);
      }
    }
    return map;
  }, [deferredComments]);

  /** Latest comment map for markdown renderers without rebuilding `markdownComponents`. */
  const commentsByLineRef = useRef(commentsByLine);
  commentsByLineRef.current = commentsByLine;
  const lineHasComments = useCallback(
    (lineNumber: number) => commentsByLineRef.current.has(lineNumber),
    [],
  );

  const threadsByLine = useMemo(() => {
    const map = new Map<number, CommentThread[]>();
    for (const [line, lineComments] of layoutCommentsByLine.entries()) {
      map.set(line, groupIntoThreads(lineComments));
    }
    return map;
  }, [layoutCommentsByLine]);
  const threadsByLineRef = useRef(threadsByLine);
  threadsByLineRef.current = threadsByLine;

  // Calculate line offsets after render using injected markers
  useEffect(() => {
    if (!markdownRef.current) return;

    const offsets = new Map<number, number>();
    const withMarkers = new Set<number>();
    const markdownElement = markdownRef.current;
    const containerRect = markdownElement.getBoundingClientRect();

    // One DOM query for all markers (avoid 250× getElementById per pass).
    for (const marker of markdownElement.querySelectorAll(
      '[id^="line-marker-"]',
    )) {
      const lineNum = Number.parseInt(
        marker.id.slice("line-marker-".length),
        10,
      );
      if (Number.isNaN(lineNum)) continue;
      withMarkers.add(lineNum);
      const markerRect = marker.getBoundingClientRect();
      const offset =
        markerRect.top - containerRect.top + markdownElement.scrollTop;
      offsets.set(lineNum, offset);
    }

    // Interpolate offsets ONLY for blank lines that have comments (so comment boxes can be positioned).
    // Do NOT interpolate for other blank lines – they have no rendered content, so no marker exists,
    // and showing their line numbers would bunch up in the gutter.
    // Alias omitted lines (no marker) with comments to the latest preceding line with rendered content.
    const alias = new Map<number, number>();
    const aliasCountAtPrev = new Map<number, number>();
    for (let i = 1; i <= lines.length; i++) {
      if (offsets.has(i)) continue;
      const isEmpty = lines[i - 1]?.trim() === "";
      if (isEmpty && !layoutCommentsByLine.has(i)) continue;

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
        if (
          !Number.isNaN(startNum) &&
          !Number.isNaN(endNum) &&
          endNum > startNum
        ) {
          ranges.set(startNum, endNum);
        }
      }
    }

    setLineOffsets(offsets);
    setLinesWithMarkers(withMarkers);
    setLineRanges(ranges);
    setLineAlias(alias);
    // activeLineIndex deliberately omitted: the comment form lives in the
    // absolutely-positioned sidebar, so toggling it does not move line markers
    // in the markdown column. Including it caused every click to rebuild
    // lineRanges/lineOffsets/lineAlias, which destabilized handleLineClick and
    // forced a full ReactMarkdown re-parse via markdownComponents.
  }, [lines, layoutCommentsByLine]);

  // Stable hover callbacks – delegate to LineHoverController via ref so this component
  // does not re-render when hover state changes.
  const handleMouseEnterLine = useCallback((lineNumber: number) => {
    hoverDispatchRef.current({ type: "enterLine", index: lineNumber - 1 });
  }, []);
  const handleMouseLeaveLine = useCallback(() => {
    hoverDispatchRef.current({ type: "leaveLine" });
  }, []);

  // Render profile pictures for a line if it has comments
  const renderProfilePictures = useCallback((lineNumber?: number) => {
    if (!lineNumber) return null;
    const lineComments = commentsByLineRef.current.get(lineNumber);
    if (!lineComments?.length) return null;
    return (
      <ProfilePictures
        users={lineComments.map((c) => ({
          name: c.user,
          avatar: c.userAvatar,
        }))}
      />
    );
  }, []);

  // Stable refs to mutable state so handleLineClick can avoid depending on
  // activeLineIndex / replyTarget / collapsedLines (which all change on click).
  // This keeps handleLineClick stable across clicks, which keeps
  // markdownComponents stable, which prevents ReactMarkdown from re-parsing
  // the entire RFC body on every interaction.
  const activeLineIndexRef = useRef(activeLineIndex);
  activeLineIndexRef.current = activeLineIndex;
  const replyTargetRef = useRef(replyTarget);
  replyTargetRef.current = replyTarget;
  const lineRangesRef = useRef(lineRanges);
  lineRangesRef.current = lineRanges;

  // Handle clicking on a line in the markdown content
  const handleLineClick = useCallback((lineNumber: number) => {
    const lineIndex = lineNumber - 1;
    const endLine = lineRangesRef.current.get(lineNumber);
    const isMultiLineBlock = endLine != null && endLine > lineNumber;

    if (commentsByLineRef.current.has(lineNumber)) {
      setActiveLineIndex(null);
      setLineCommentInitialDraft("");

      if (isMultiLineBlock) {
        // Multi-line block with existing thread: always expand and piggyback on the thread
        setCollapsedLines((prev) => {
          const resolved =
            prev ?? defaultCollapsedLines(commentsByLineRef.current);
          const updated = new Set(resolved);
          updated.delete(lineNumber);
          return updated;
        });
        // Only set reply target if not already replying to this line
        if (replyTargetRef.current?.line !== lineNumber) {
          const lineThreads = threadsByLineRef.current.get(lineNumber);
          if (lineThreads?.length === 1) {
            setReplyTarget({
              type: "thread",
              line: lineNumber,
              threadId: lineThreads[0].id,
            });
          } else {
            setReplyTarget({ type: "newThread", line: lineNumber });
          }
          setReplyInitialDraft("");
        }
      } else {
        // Single-line element: toggle collapse/expand
        setCollapsedLines((prev) => {
          const resolved =
            prev ?? defaultCollapsedLines(commentsByLineRef.current);
          const updated = new Set(resolved);
          if (resolved.has(lineNumber)) {
            updated.delete(lineNumber);
            // Opening: auto-start reply if single thread, otherwise let user pick
            const lineThreads = threadsByLineRef.current.get(lineNumber);
            if (lineThreads?.length === 1) {
              setReplyTarget({
                type: "thread",
                line: lineNumber,
                threadId: lineThreads[0].id,
              });
            } else {
              setReplyTarget(null);
            }
            setReplyInitialDraft("");
          } else {
            updated.add(lineNumber);
            if (replyTargetRef.current?.line === lineNumber) {
              setReplyTarget(null);
              setReplyInitialDraft("");
            }
          }
          return updated;
        });
      }
    } else {
      if (activeLineIndexRef.current === lineIndex) {
        setActiveLineIndex(null);
        setLineCommentInitialDraft("");
      } else {
        setReplyTarget(null);
        setReplyInitialDraft("");
        setActiveLineIndex(lineIndex);
        setLineCommentInitialDraft("");
      }
    }
  }, []);

  // Auto-expand the collapsed group that contains the highlighted comment
  useEffect(() => {
    if (highlightedCommentId == null) return;
    for (const [line, lineComments] of commentsByLine.entries()) {
      if (lineComments.some((c) => c.id === highlightedCommentId)) {
        setCollapsedLines((prev) => {
          const resolved = prev ?? defaultCollapsedLines(commentsByLine);
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
    () => collapsedLines ?? defaultCollapsedLines(layoutCommentsByLine),
    [collapsedLines, layoutCommentsByLine],
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
      for (const ln of layoutCommentsByLine.keys()) {
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
      let maxBoxBottom = 0;

      for (const { lineNum, ref, isActive } of boxesToPosition) {
        const baseOffset = lineOffsetsRef.current.get(lineNum) || 0;
        const adjustedOffset = Math.max(baseOffset, lastBottom);

        // Store the calculated position
        positions.set(isActive ? -1 : lineNum, adjustedOffset);

        // Update lastBottom for the next iteration
        let boxHeight: number;
        if (ref) {
          const headerEl = ref.firstElementChild as HTMLElement | null;
          boxHeight = ref.offsetHeight;
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
        } else {
          boxHeight = 100; // Minimum estimated height
        }

        maxBoxBottom = Math.max(maxBoxBottom, adjustedOffset + boxHeight);
        lastBottom = adjustedOffset + boxHeight + 8; // 8px gap between boxes
      }

      setCommentPositions(positions);
      setMinContentHeight(maxBoxBottom);
    }

    // Defer to rAF so layout reads happen after the browser paints.
    // lineOffsets is accessed via ref so it's excluded from deps –
    // removing it prevents a re-trigger when ELC boxes mount and shift layout.
    const raf = requestAnimationFrame(() => recalcPositions());
    return () => cancelAnimationFrame(raf);
  }, [layoutCommentsByLine, activeLineIndex, resolvedCollapsedLines]);

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
      const endLine = lineRanges.get(lineNumber);
      const isMultiLineBlock = endLine != null && endLine > lineNumber;

      if (isMultiLineBlock && commentsByLine.has(lineNumber)) {
        // Multi-line block with existing thread: expand and piggyback with selected text as quote
        setActiveLineIndex(null);
        setCollapsedLines((prev) => {
          const resolved = prev ?? defaultCollapsedLines(commentsByLine);
          const updated = new Set(resolved);
          updated.delete(lineNumber);
          return updated;
        });
        const lineThreads = threadsByLine.get(lineNumber);
        if (lineThreads?.length === 1) {
          setReplyTarget({
            type: "thread",
            line: lineNumber,
            threadId: lineThreads[0].id,
          });
        } else {
          setReplyTarget({ type: "newThread", line: lineNumber });
        }
        setReplyInitialDraft(`> ${selectedText}\n`);
      } else {
        setActiveLineIndex(lineIndex);
        setLineCommentInitialDraft(`> ${selectedText}\n`);
      }
      selection.removeAllRanges(); // Clear the selection
    }
  }

  async function handleSubmit(lineIndex: number, body: string) {
    if (!body.trim()) return;

    setIsSubmitting(true);
    try {
      await onCommentSubmit(lineIndex + 1, body);
      setLineCommentInitialDraft("");
      setActiveLineIndex(null);
    } catch (error) {
      console.error("Error submitting comment:", error);
      alert("Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReplySubmit(body: string) {
    if (!replyTarget || !body.trim()) return;

    setIsSubmitting(true);
    try {
      const threadId =
        replyTarget.type === "thread" ? replyTarget.threadId : undefined;
      await onCommentSubmit(replyTarget.line, body, threadId);
      setReplyInitialDraft("");
      setReplyTarget(null);
    } catch (error) {
      console.error("Error submitting reply:", error);
      alert("Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Memoized components – stable when comments load (comment UI reads refs).
  // Hover highlighting is applied imperatively in LineHoverController (injected <style>).

  const markdownComponents = useMemo(
    () => ({
      h1: ({ children, node: _node, ...props }: MDProps<"h1">) => {
        const lineNumber = props["data-line-element"];
        return (
          <h1
            className={`relative mb-3 mt-4 py-2 border-b border-gray-20 text-4xl font-serif! font-normal! tracking-tight leading-tight text-foreground ${lineNumber ? "cursor-pointer" : ""} ${lineNumber && lineHasComments(lineNumber) ? "pr-8" : ""}`}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-[3px] top-[3px]">
              {renderProfilePictures(lineNumber)}
            </span>
          </h1>
        );
      },
      h2: ({ children, node: _node, ...props }: MDProps<"h2">) => {
        const lineNumber = props["data-line-element"];
        return (
          <h2
            className={`relative mb-3 mt-3 py-2 border-b border-gray-20 text-3xl font-serif! font-normal! tracking-tight leading-tight text-foreground ${lineNumber ? "cursor-pointer" : ""} ${lineNumber && lineHasComments(lineNumber) ? "pr-8" : ""}`}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-[3px] top-[3px]">
              {renderProfilePictures(lineNumber)}
            </span>
          </h2>
        );
      },
      h3: ({ children, node: _node, ...props }: MDProps<"h3">) => {
        const lineNumber = props["data-line-element"];
        return (
          <h3
            className={`relative mb-2 mt-4 text-xl font-sans! font-semibold! leading-snug text-foreground ${lineNumber ? "cursor-pointer" : ""} ${lineNumber && lineHasComments(lineNumber) ? "pr-8" : ""}`}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-[3px] top-[3px]">
              {renderProfilePictures(lineNumber)}
            </span>
          </h3>
        );
      },
      p: ({ children, node: _node, ...props }: MDProps<"p">) => {
        const lineNumber = props["data-line-element"];
        return (
          <p
            className={`relative my-2 ${lineNumber ? "cursor-pointer" : ""} ${lineNumber && lineHasComments(lineNumber) ? "pr-8" : ""}`}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-[3px] top-[3px]">
              {renderProfilePictures(lineNumber)}
            </span>
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
        <strong className="font-semibold" {...props}>
          {children}
        </strong>
      ),
      hr: ({ node: _node, ...props }: MDProps<"hr">) => (
        <hr className="my-6 border-0 border-t-2 border-gray-20" {...props} />
      ),
      ul: ({ children, node: _node, ...props }: MDProps<"ul">) => {
        const { "data-line-element": _stripped, ...rest } = props;
        return (
          <ul
            className="my-2 ml-6 list-disc space-y-0.5 text-gray-90"
            {...rest}
          >
            {children}
          </ul>
        );
      },
      ol: ({ children, node: _node, ...props }: MDProps<"ol">) => {
        const { "data-line-element": _stripped, ...rest } = props;
        return (
          <ol
            className="my-2 ml-6 list-decimal space-y-0.5 text-gray-90"
            {...rest}
          >
            {children}
          </ol>
        );
      },
      li: ({ children, node: _node, ...props }: MDProps<"li">) => {
        const lineNumber = props["data-line-element"];
        return (
          <li
            className={`relative text-gray-90 ${lineNumber ? "cursor-pointer" : ""} ${lineNumber && lineHasComments(lineNumber) ? "pr-8" : ""}`}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-[3px] top-[3px]">
              {renderProfilePictures(lineNumber)}
            </span>
          </li>
        );
      },
      code: ({
        className,
        children,
        node: _node,
        ...props
      }: MDProps<"code">) => {
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
        const lineNumber = props["data-line-element"];
        const codeChild = children as
          | React.ReactElement<{ className?: string; children?: unknown }>
          | undefined;
        const childProps = codeChild?.props;
        const isMermaid = childProps?.className?.includes("language-mermaid");
        if (isMermaid) {
          const chart = String(childProps?.children ?? "").trim();
          return (
            <div
              className={`relative ${lineNumber ? "cursor-pointer" : ""}`}
              onClick={() => lineNumber && handleLineClick(lineNumber)}
              onMouseEnter={() =>
                lineNumber && handleMouseEnterLine(lineNumber)
              }
              onMouseLeave={handleMouseLeaveLine}
            >
              <MermaidDiagram chart={chart} />
              <span className="absolute right-2 top-2">
                {renderProfilePictures(lineNumber)}
              </span>
            </div>
          );
        }
        return (
          <pre
            className={`relative my-4 max-w-full overflow-x-auto border border-gray-30 rounded whitespace-pre-wrap bg-gray-90 p-4 ${lineNumber ? "cursor-pointer" : ""}`}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-2 top-2">
              {renderProfilePictures(lineNumber)}
            </span>
          </pre>
        );
      },
      blockquote: ({
        children,
        node: _node,
        ...props
      }: MDProps<"blockquote">) => {
        const lineNumber = props["data-line-element"];
        return (
          <blockquote
            className={`relative my-4 border-l-2 border-l-magenta bg-gray-5 py-2 pl-4 pr-4 italic text-gray-70 ${lineNumber ? "cursor-pointer" : ""}`}
            onClick={() => lineNumber && handleLineClick(lineNumber)}
            onMouseEnter={() => lineNumber && handleMouseEnterLine(lineNumber)}
            onMouseLeave={handleMouseLeaveLine}
            {...props}
          >
            {children}
            <span className="absolute right-2 top-2">
              {renderProfilePictures(lineNumber)}
            </span>
          </blockquote>
        );
      },
      table: ({ children, node: _node, ...props }: MDProps<"table">) => {
        const { "data-line-element": _stripped, ...rest } = props;
        return (
          <div className="my-4 overflow-x-auto">
            <table
              className="min-w-full border border-gray-20 rounded"
              {...rest}
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
        const lineNumber = props["data-line-element"];
        return (
          <tr
            className={`border-gray-20 ${lineNumber ? "cursor-pointer" : ""}`}
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
        if (typeof src === "string") {
          if (isRelativeMarkdownAssetSrc(src) && headRef) {
            const repoPath = resolveMarkdownImageRepoPath(
              markdownFilePath,
              src,
            );
            if (repoPath) {
              proxiedSrc = `/api/rfc-asset?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&ref=${encodeURIComponent(headRef)}&path=${encodeURIComponent(repoPath)}`;
            }
          } else {
            try {
              const url = new URL(src);
              if (
                url.hostname === "github.com" &&
                url.pathname.startsWith("/user-attachments/")
              ) {
                proxiedSrc = `/api/github-image?url=${encodeURIComponent(src)}`;
              }
            } catch {
              /* keep src */
            }
          }
        }
        return (
          <ClickableImage
            src={proxiedSrc as string | undefined}
            alt={(alt as string) ?? ""}
            {...props}
          />
        );
      },
    }),
    [
      handleLineClick,
      handleMouseEnterLine,
      handleMouseLeaveLine,
      renderProfilePictures,
      lineHasComments,
      owner,
      repo,
      markdownFilePath,
      headRef,
    ],
  );

  const markdownColumn = (
    <div className="relative flex gap-2 sm:gap-4 -ml-2 sm:-ml-4 min-w-0 h-fit">
      <LineNumbersColumn
        lines={lines}
        commentsByLine={commentsByLine}
        lineOffsets={lineOffsets}
        linesWithMarkers={linesWithMarkers}
        lineRanges={lineRanges}
        lineRefs={lineRefs}
        onLineClick={handleLineClick}
        onMouseEnterLine={handleMouseEnterLine}
        onMouseLeaveLine={handleMouseLeaveLine}
      />
      <div
        ref={markdownRef}
        className="prose prose-zinc max-w-none flex-1 min-w-0 overflow-x-auto relative [&>*:first-child]:mt-0 [&>*:first-child]:pt-0 [&>*:last-child]:mb-0 [&>*:last-child]:pb-0"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleTextSelection}
      >
        <MemoizedMarkdown content={content} components={markdownComponents} />
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="relative min-h-[var(--min-content-height)]"
      style={
        {
          "--min-content-height": `${minContentHeight}px`,
        } as React.CSSProperties
      }
    >
      <LineHoverController
        dispatchRef={hoverDispatchRef}
        lineAlias={lineAlias}
        activeLineIndex={activeLineIndex}
        commentsByLine={layoutCommentsByLine}
        commentBoxRefs={commentBoxRefs}
        commentPositions={commentPositions}
        resolvedCollapsedLines={resolvedCollapsedLines}
        markdownRef={markdownRef}
        containerRef={containerRef}
        markdownColumn={markdownColumn}
        sidebar={
          <CommentsSidebar
            activeLineIndex={activeLineIndex}
            lineRanges={lineRanges}
            lineCommentInitialDraft={lineCommentInitialDraft}
            isSubmitting={isSubmitting}
            commentPositions={commentPositions}
            lineOffsets={lineOffsets}
            threadsByLine={threadsByLine}
            replyTarget={replyTarget}
            replyInitialDraft={replyInitialDraft}
            resolvedCollapsedLines={resolvedCollapsedLines}
            highlightedCommentId={highlightedCommentId}
            commentsByLine={layoutCommentsByLine}
            commentsLoading={commentsLoading}
            onCloseActiveComment={() => {
              setActiveLineIndex(null);
              setLineCommentInitialDraft("");
            }}
            onSubmitActiveComment={(body) => {
              if (activeLineIndex !== null) {
                void handleSubmit(activeLineIndex, body);
              }
            }}
            onStartReply={(lineNumber, threadId) => {
              setReplyTarget({
                type: "thread",
                line: lineNumber,
                threadId,
              });
              setReplyInitialDraft("");
            }}
            onStartNewThread={(lineNumber) => {
              setReplyTarget({ type: "newThread", line: lineNumber });
              setReplyInitialDraft("");
            }}
            onCancelReply={() => {
              setReplyTarget(null);
              setReplyInitialDraft("");
            }}
            onSubmitReply={handleReplySubmit}
            onToggleCollapse={(lineNumber) => {
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
            getCommentPosition={getCommentPosition}
            commentBoxRefs={commentBoxRefs}
            contentRefs={contentRefs}
            onCommentMouseEnter={(lineIndex) =>
              hoverDispatchRef.current({
                type: "enterComment",
                index: lineIndex,
              })
            }
            onCommentMouseLeave={() =>
              hoverDispatchRef.current({ type: "leaveComment" })
            }
          />
        }
      />

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

interface CommentsSidebarProps {
  activeLineIndex: number | null;
  lineRanges: Map<number, number>;
  lineCommentInitialDraft: string;
  isSubmitting: boolean;
  commentPositions: Map<number, number>;
  lineOffsets: Map<number, number>;
  threadsByLine: Map<number, CommentThread[]>;
  replyTarget: ReplyTarget | null;
  replyInitialDraft: string;
  resolvedCollapsedLines: Set<number>;
  highlightedCommentId?: number | null;
  commentsByLine: Map<number, Comment[]>;
  commentsLoading?: boolean;
  onCloseActiveComment: () => void;
  onSubmitActiveComment: (body: string) => void;
  onStartReply: (lineNumber: number, threadId: number) => void;
  onStartNewThread: (lineNumber: number) => void;
  onCancelReply: () => void;
  onSubmitReply: (body: string) => void;
  onToggleCollapse: (lineNumber: number) => void;
  getCommentPosition: (lineNumber: number) => number;
  commentBoxRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  contentRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  onCommentMouseEnter: (lineIndex: number) => void;
  onCommentMouseLeave: () => void;
}

function CommentsSidebar({
  activeLineIndex,
  lineRanges,
  lineCommentInitialDraft,
  isSubmitting,
  commentPositions,
  lineOffsets,
  threadsByLine,
  replyTarget,
  replyInitialDraft,
  resolvedCollapsedLines,
  highlightedCommentId,
  commentsByLine,
  commentsLoading,
  onCloseActiveComment,
  onSubmitActiveComment,
  onStartReply,
  onStartNewThread,
  onCancelReply,
  onSubmitReply,
  onToggleCollapse,
  getCommentPosition,
  commentBoxRefs,
  contentRefs,
  onCommentMouseEnter,
  onCommentMouseLeave,
}: CommentsSidebarProps) {
  return (
    <div className="relative w-full lg:w-auto">
      {activeLineIndex !== null && (
        <LineCommentBox
          lineNumber={activeLineIndex + 1}
          endLineNumber={lineRanges.get(activeLineIndex + 1)}
          initialDraft={lineCommentInitialDraft}
          isSubmitting={isSubmitting}
          position={
            commentPositions.get(-1) ||
            lineOffsets.get(activeLineIndex + 1) ||
            0
          }
          onClose={onCloseActiveComment}
          onSubmit={onSubmitActiveComment}
          commentBoxRef={(el) => {
            if (el) {
              commentBoxRefs.current.set(-1, el);
            }
          }}
          onMouseEnter={() => onCommentMouseEnter(activeLineIndex)}
          onMouseLeave={onCommentMouseLeave}
        />
      )}

      {Array.from(threadsByLine.entries())
        .sort(([a], [b]) => a - b)
        .map(([lineNumber, lineThreads]) => (
          <ExistingLineComments
            key={lineNumber}
            lineNumber={lineNumber}
            endLineNumber={lineRanges.get(lineNumber)}
            threads={lineThreads}
            position={getCommentPosition(lineNumber)}
            replyingToThreadId={
              replyTarget?.line === lineNumber && replyTarget.type === "thread"
                ? replyTarget.threadId
                : null
            }
            isStartingNewThread={
              replyTarget?.line === lineNumber &&
              replyTarget.type === "newThread"
            }
            replyInitialDraft={
              replyTarget?.line === lineNumber ? replyInitialDraft : ""
            }
            isSubmitting={isSubmitting}
            isCollapsed={resolvedCollapsedLines.has(lineNumber)}
            highlightedCommentId={highlightedCommentId}
            onStartReply={(threadId) => onStartReply(lineNumber, threadId)}
            onStartNewThread={() => onStartNewThread(lineNumber)}
            onCancelReply={onCancelReply}
            onSubmitReply={onSubmitReply}
            onToggleCollapse={() => onToggleCollapse(lineNumber)}
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
            onMouseEnter={() => onCommentMouseEnter(lineNumber - 1)}
            onMouseLeave={onCommentMouseLeave}
          />
        ))}

      {commentsByLine.size === 0 && activeLineIndex === null && (
        <div className="lg:absolute top-2 w-full lg:w-[400px] pl-3.5">
          {commentsLoading ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-gray-40">
              Loading notes…
            </p>
          ) : (
            <p className="text-xs text-gray-50">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-gray-40">
                Margin
              </span>
              <span className="mx-2 text-gray-30">·</span>
              Click any line, or select text, to leave a note.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
