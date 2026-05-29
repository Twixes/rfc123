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
import { ExistingLineComments } from "@/components/ExistingLineComments";
import { LineCommentBox } from "@/components/LineCommentBox";
import { ProfilePictures } from "@/components/ProfilePictures";
import {
  RFC_PRETTY_REHYPE_PLUGINS,
  RFC_PRETTY_REMARK_PLUGINS,
} from "@/components/RfcPrettyMarkdown";
import {
  createRfcMarkdownComponents,
  PROSE_WRAPPER_CLASS,
} from "@/components/rfc-pretty-markdown-components";
import type { CommentThread, ReplyTarget } from "@/lib/comment-threads";
import { groupIntoThreads, lineReplyTarget } from "@/lib/comment-threads";
import type { Comment } from "@/lib/github";
import { rehypeLineMarkers } from "@/lib/rehype-line-markers";

// Pretty-view plugins + line markers for inline comments.
type PluginList = NonNullable<
  React.ComponentProps<typeof ReactMarkdown>["rehypePlugins"]
>;
const REHYPE_PLUGINS: PluginList = [
  ...RFC_PRETTY_REHYPE_PLUGINS,
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

function mapsEqual<K, V>(a: Map<K, V>, b: Map<K, V>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function groupCommentsByLine(comments: Comment[]): Map<number, Comment[]> {
  const map = new Map<number, Comment[]>();
  for (const comment of comments) {
    if (!comment.line) continue;
    const line = comment.line;
    const group = map.get(line);
    if (group) group.push(comment);
    else map.set(line, [comment]);
  }
  return map;
}

/** Resolve the source line under a pointer event inside a `<pre>`, by
 *  picking the `line-marker-N` whose top is just at-or-above the event Y. */
function findSourceLineFromPreEvent(
  pre: HTMLElement,
  clientY: number,
  fallback: number,
): number {
  let bestLine = fallback;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const marker of pre.querySelectorAll<HTMLElement>(
    '[id^="line-marker-"]',
  )) {
    const delta = clientY - marker.getBoundingClientRect().top;
    if (delta >= 0 && delta < bestDelta) {
      bestDelta = delta;
      const parsed = Number.parseInt(
        marker.id.slice("line-marker-".length),
        10,
      );
      if (!Number.isNaN(parsed)) bestLine = parsed;
    }
  }
  return bestLine;
}

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
  const proseLineSelector = (ln: number) =>
    [
      `p[data-line-element="${ln}"]`,
      `h1[data-line-element="${ln}"]`,
      `h2[data-line-element="${ln}"]`,
      `h3[data-line-element="${ln}"]`,
      `li[data-line-element="${ln}"]`,
      `tr[data-line-element="${ln}"]`,
      `blockquote[data-line-element="${ln}"]`,
      `span.code-line[data-line-element="${ln}"]`,
      `div.mermaid-block[data-line-element="${ln}"]`,
    ].join(", ");

  return Array.from(all)
    .map((ln) => {
      const isHovered = hovered.has(ln);
      const bg = isHovered ? "var(--yellow-medium)" : "var(--yellow-light)";
      return `
      ${proseLineSelector(ln)} {
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
      }
      span.code-line[data-line-element="${ln}"] {
        margin-left: 0;
        padding-left: 0;
        border-radius: 0;
      }
      div.mermaid-block[data-line-element="${ln}"] {
        margin-left: 0;
        padding-left: 0;
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
    ${shell} [data-comment-line="${ln}"]:not([data-comment-draft]) {
      --comment-border-color: var(--magenta) !important;
      --comment-box-shadow: 0 1px 0 0 rgba(0,0,0,0.02), 0 8px 24px -12px rgba(114,30,60,0.18) !important;
    }
    ${shell} [data-comment-line="${ln}"][data-comment-draft] {
      --comment-border-color: var(--cyan) !important;
      --comment-box-shadow: 0 1px 0 0 rgba(0,0,0,0.02), 0 10px 28px -14px rgba(57,144,168,0.35) !important;
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
  containerEl,
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
  containerEl: HTMLDivElement | null;
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
    const container = containerEl;
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
    containerEl,
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
    if (!containerEl) return;
    scheduleRecalcArrows();
    const ro = new ResizeObserver(() => scheduleRecalcArrows());
    ro.observe(containerEl);
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
  }, [scheduleRecalcArrows, containerEl]);

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
      remarkPlugins={RFC_PRETTY_REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
});

interface LineNumbersColumnProps {
  lines: string[];
  commentsByLine: Map<number, Comment[]>;
  lineOffsets: Map<number, number>;
  linesWithMarkers: Set<number>;
  lineRanges: Map<number, number>;
  resolvedCollapsedLines: Set<number>;
  lineRefs: React.MutableRefObject<Map<number, HTMLButtonElement>>;
  onLineClick: (lineNumber: number, fromExtraGutter?: boolean) => void;
  onMouseEnterLine: (lineNumber: number, options?: { extra?: boolean }) => void;
  onMouseLeaveLine: () => void;
}

function LineNumbersColumn({
  lines,
  commentsByLine,
  lineOffsets,
  linesWithMarkers,
  lineRanges,
  resolvedCollapsedLines,
  lineRefs,
  onLineClick,
  onMouseEnterLine,
  onMouseLeaveLine,
}: LineNumbersColumnProps) {
  const rows = useMemo(() => {
    const byOffset = new Map<number, number[]>();
    for (let index = 0; index < lines.length; index++) {
      const lineNumber = index + 1;
      const hasMarker = linesWithMarkers.has(lineNumber);
      const hasComments = commentsByLine.has(lineNumber);
      if (!hasMarker && !hasComments) continue;
      const lineOffset = lineOffsets.get(lineNumber);
      if (lineOffset === undefined) continue;
      const group = byOffset.get(lineOffset) ?? [];
      group.push(lineNumber);
      byOffset.set(lineOffset, group);
    }

    return Array.from(byOffset.entries())
      .sort(([a], [b]) => a - b)
      .map(([offset, lineNumbers]) => {
        const anchors = lineNumbers.filter((ln) => linesWithMarkers.has(ln));
        const extras = lineNumbers
          .filter((ln) => !linesWithMarkers.has(ln))
          .sort((a, b) => a - b);
        return { offset, anchors, extras };
      });
  }, [lines, linesWithMarkers, commentsByLine, lineOffsets]);

  const renderButton = (
    lineNumber: number,
    { isExtra }: { isExtra: boolean },
  ) => {
    const hasCommentsForStyle =
      (commentsByLine.get(lineNumber)?.length ?? 0) > 0;
    const endLine = lineRanges.get(lineNumber);
    const isRange = endLine != null && endLine > lineNumber;
    const isThreadOpen =
      hasCommentsForStyle && !resolvedCollapsedLines.has(lineNumber);

    return (
      <button
        key={lineNumber}
        id={`line-${lineNumber}`}
        ref={(el) => {
          if (el) lineRefs.current.set(lineNumber, el);
          else lineRefs.current.delete(lineNumber);
        }}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onLineClick(lineNumber, isExtra);
        }}
        className={
          isExtra
            ? `min-w-[1.25rem] shrink-0 cursor-pointer rounded border px-0.5 py-px font-mono text-[10px] leading-snug transition-colors sm:text-xs ${
                isThreadOpen
                  ? "border-magenta/40 bg-magenta-light/40 text-magenta"
                  : "border-gray-20 bg-surface text-magenta hover:border-magenta/30 hover:bg-magenta-light/20"
              }`
            : `group flex shrink-0 cursor-pointer gap-1 sm:gap-2 ${
                isRange ? "items-start" : "items-center"
              }`
        }
        style={
          isExtra
            ? undefined
            : {
                height: isRange ? "auto" : "1.5rem",
                minHeight: "1.5rem",
              }
        }
        onMouseEnter={() => onMouseEnterLine(lineNumber, { extra: isExtra })}
        onMouseLeave={onMouseLeaveLine}
        aria-label={
          isExtra
            ? `Open comments on line ${lineNumber}${isRange ? `–${endLine}` : ""}`
            : `Add comment to lines ${lineNumber}${isRange ? `–${endLine}` : ""}`
        }
        aria-pressed={isExtra ? isThreadOpen : undefined}
      >
        {!isExtra && (
          <div className="hidden h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-cyan/90 text-surface opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
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
        )}
        <span
          className={
            isExtra
              ? "whitespace-nowrap"
              : `font-mono text-[10px] leading-snug transition-opacity sm:text-xs ${
                  isRange ? "flex flex-col items-center" : "whitespace-nowrap"
                } ${hasCommentsForStyle ? "text-magenta" : "text-gray-50"}`
          }
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
  };

  return (
    <div className="relative w-[40px] shrink-0 select-none overflow-visible">
      {rows.map(({ offset, anchors, extras }) => {
        const hasRange = anchors.some((ln) => {
          const endLine = lineRanges.get(ln);
          return endLine != null && endLine > ln;
        });

        if (extras.length === 0) {
          return anchors.map((lineNumber) => (
            <div
              key={lineNumber}
              className={`absolute right-0 flex justify-end pr-2 ${
                hasRange ? "items-start" : "items-center"
              }`}
              style={{ top: `${offset}px`, minHeight: "1.5rem" }}
            >
              {renderButton(lineNumber, { isExtra: false })}
            </div>
          ));
        }

        return (
          <div
            key={offset}
            className={`absolute right-0 flex flex-row-reverse items-start gap-1 pr-2 ${
              hasRange ? "" : "min-h-[1.5rem]"
            }`}
            style={{ top: `${offset}px` }}
          >
            {anchors.map((lineNumber) =>
              renderButton(lineNumber, { isExtra: false }),
            )}
            <div className="flex flex-col items-end gap-0.5">
              {extras.map((lineNumber) =>
                renderButton(lineNumber, { isExtra: true }),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface InlineCommentableMarkdownProps {
  content: string;
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
  const linesWithMarkersRef = useRef(linesWithMarkers);
  linesWithMarkersRef.current = linesWithMarkers;
  const [lineRanges, setLineRanges] = useState<Map<number, number>>(new Map());
  const [lineAlias, setLineAlias] = useState<Map<number, number>>(new Map());
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  /** Only set when opening reply UI (e.g. quoted selection), not on each keystroke. */
  const [replyInitialDraft, setReplyInitialDraft] = useState("");
  const lineRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  /** Last source line dispatched from a `<pre>` mouseover, so we skip
   *  repeated dispatches while the cursor moves within the same line. */
  const lastHoverLineRef = useRef<number | null>(null);
  const markdownRef = useRef<HTMLDivElement>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
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
  const commentsByLine = useMemo(
    () => groupCommentsByLine(comments),
    [comments],
  );

  /** Sidebar + layout work is deferred so comment load does not block the markdown column. */
  const deferredComments = useDeferredValue(comments);
  const layoutCommentsByLine = useMemo(
    () => groupCommentsByLine(deferredComments),
    [deferredComments],
  );

  /** Latest comment map for markdown renderers without rebuilding `markdownComponents`. */
  const commentsByLineRef = useRef(commentsByLine);
  commentsByLineRef.current = commentsByLine;
  const lineHasComments = useCallback(
    (lineNumber: number | undefined) =>
      lineNumber != null && commentsByLineRef.current.has(lineNumber),
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
  const layoutCommentsByLineRef = useRef(layoutCommentsByLine);
  layoutCommentsByLineRef.current = layoutCommentsByLine;
  const boxResizeObserverRef = useRef<ResizeObserver | null>(null);

  // Calculate line offsets after render using injected markers
  const recalcLinePositions = useCallback(() => {
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
        // Same Y as the anchor line; gutter row groups extras beside the anchor.
        offsets.set(i, prevOffset);
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

    // Skip setting state when the recalc produced byte-identical results –
    // ResizeObserver fires for any descendant size change (Mermaid mount,
    // image load) and most of those don't actually shift line positions.
    // Without these guards every recalc invalidates downstream memos and
    // re-runs the hover controller's effects.
    setLineOffsets((prev) => (mapsEqual(prev, offsets) ? prev : offsets));
    setLinesWithMarkers((prev) =>
      setsEqual(prev, withMarkers) ? prev : withMarkers,
    );
    setLineRanges((prev) => (mapsEqual(prev, ranges) ? prev : ranges));
    setLineAlias((prev) => (mapsEqual(prev, alias) ? prev : alias));
    // activeLineIndex deliberately omitted: the comment form lives in the
    // absolutely-positioned sidebar, so toggling it does not move line markers
    // in the markdown column. Including it caused every click to rebuild
    // lineRanges/lineOffsets/lineAlias, which destabilized handleLineClick and
    // forced a full ReactMarkdown re-parse via markdownComponents.
  }, [lines, layoutCommentsByLine]);

  // Re-run after async DOM growth (e.g. Mermaid diagrams that mount their
  // SVG after the initial render, or images that resolve their natural
  // height later) so that markers downstream of the growth stay aligned.
  // rAF-throttled to coalesce bursts of ResizeObserver callbacks.
  const recalcLineRafRef = useRef<number | null>(null);
  useEffect(() => {
    recalcLinePositions();
    const el = markdownRef.current;
    if (!el) return;
    const schedule = () => {
      if (recalcLineRafRef.current != null) return;
      recalcLineRafRef.current = requestAnimationFrame(() => {
        recalcLineRafRef.current = null;
        recalcLinePositions();
      });
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (recalcLineRafRef.current != null) {
        cancelAnimationFrame(recalcLineRafRef.current);
        recalcLineRafRef.current = null;
      }
    };
  }, [recalcLinePositions]);

  // Stable hover callbacks – delegate to LineHoverController via ref so this component
  // does not re-render when hover state changes.
  const handleMouseEnterLine = useCallback(
    (lineNumber: number, options?: { extra?: boolean }) => {
      if (options?.extra && commentsByLineRef.current.has(lineNumber)) {
        hoverDispatchRef.current({
          type: "enterComment",
          index: lineNumber - 1,
        });
        return;
      }
      hoverDispatchRef.current({ type: "enterLine", index: lineNumber - 1 });
    },
    [],
  );
  const handleMouseLeaveLine = useCallback(() => {
    hoverDispatchRef.current({ type: "leaveLine" });
    hoverDispatchRef.current({ type: "leaveComment" });
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
  const handleLineClick = useCallback(
    (lineNumber: number, fromExtraGutter = false) => {
      const lineIndex = lineNumber - 1;
      const endLine = lineRangesRef.current.get(lineNumber);
      const isMultiLineBlock = endLine != null && endLine > lineNumber;
      const isOutOfLayoutLine =
        fromExtraGutter || !linesWithMarkersRef.current.has(lineNumber);

      if (commentsByLineRef.current.has(lineNumber)) {
        setActiveLineIndex(null);
        setLineCommentInitialDraft("");

        if (isMultiLineBlock || isOutOfLayoutLine) {
          // Multi-line blocks and out-of-layout lines always open their thread.
          setCollapsedLines((prev) => {
            const resolved =
              prev ?? defaultCollapsedLines(commentsByLineRef.current);
            const updated = new Set(resolved);
            updated.delete(lineNumber);
            return updated;
          });
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
    },
    [],
  );

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
  const resolvedCollapsedLinesRef = useRef(resolvedCollapsedLines);
  resolvedCollapsedLinesRef.current = resolvedCollapsedLines;

  const recalcPositionsRafRef = useRef<number | null>(null);
  const recalcPositions = useCallback(() => {
    const positions = new Map<number, number>();
    const replyLine = replyTargetRef.current?.line ?? null;
    const collapsed = resolvedCollapsedLinesRef.current;
    const layoutComments = layoutCommentsByLineRef.current;
    const activeLine = activeLineIndexRef.current;

    const boxesToPosition: Array<{
      lineNum: number;
      ref: HTMLDivElement | null;
      isActive: boolean;
    }> = [];

    for (const ln of layoutComments.keys()) {
      boxesToPosition.push({
        lineNum: ln,
        ref: commentBoxRefs.current.get(ln) || null,
        isActive: false,
      });
    }

    if (activeLine !== null) {
      boxesToPosition.push({
        lineNum: activeLine + 1,
        ref: commentBoxRefs.current.get(-1) || null,
        isActive: true,
      });
    }

    boxesToPosition.sort((a, b) => a.lineNum - b.lineNum);

    let lastBottom = 0;
    let maxBoxBottom = 0;

    for (const { lineNum, ref, isActive } of boxesToPosition) {
      const baseOffset = lineOffsetsRef.current.get(lineNum) || 0;
      const adjustedOffset = Math.max(baseOffset, lastBottom);

      positions.set(isActive ? -1 : lineNum, adjustedOffset);

      let boxHeight: number;
      if (ref) {
        const headerEl = ref.firstElementChild as HTMLElement | null;
        boxHeight = ref.offsetHeight;
        if (!isActive) {
          if (collapsed.has(lineNum)) {
            boxHeight = headerEl?.offsetHeight ?? boxHeight;
          } else if (replyLine !== lineNum) {
            const contentEl = contentRefs.current.get(lineNum);
            if (contentEl && headerEl) {
              boxHeight = headerEl.offsetHeight + contentEl.offsetHeight;
            }
          }
        }
      } else {
        boxHeight = 100;
      }

      maxBoxBottom = Math.max(maxBoxBottom, adjustedOffset + boxHeight);
      lastBottom = adjustedOffset + boxHeight + 8;
    }

    setCommentPositions((prev) =>
      mapsEqual(prev, positions) ? prev : positions,
    );
    setMinContentHeight((prev) =>
      prev === maxBoxBottom ? prev : maxBoxBottom,
    );
  }, []);

  const scheduleRecalcPositions = useCallback(() => {
    if (recalcPositionsRafRef.current != null) return;
    recalcPositionsRafRef.current = requestAnimationFrame(() => {
      recalcPositionsRafRef.current = null;
      recalcPositions();
    });
  }, [recalcPositions]);

  const registerCommentBox = useCallback(
    (lineNum: number, el: HTMLDivElement | null) => {
      const prev = commentBoxRefs.current.get(lineNum);
      const ro = boxResizeObserverRef.current;
      if (prev && ro) ro.unobserve(prev);
      if (el) {
        commentBoxRefs.current.set(lineNum, el);
        ro?.observe(el);
      } else {
        commentBoxRefs.current.delete(lineNum);
      }
    },
    [],
  );

  // Re-run when comment layout structure changes (boxes added/removed, collapse, reply UI).
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs hold latest values; deps trigger recalc on structural state changes before RO may fire
  useEffect(() => {
    scheduleRecalcPositions();
  }, [
    scheduleRecalcPositions,
    layoutCommentsByLine,
    activeLineIndex,
    resolvedCollapsedLines,
    replyTarget,
  ]);

  // Absolutely positioned boxes don't resize the sidebar wrapper; observe each box instead.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reconnect observer when comment boxes mount/unmount
  useEffect(() => {
    const ro = new ResizeObserver(() => scheduleRecalcPositions());
    boxResizeObserverRef.current = ro;
    for (const el of commentBoxRefs.current.values()) {
      ro.observe(el);
    }
    return () => {
      ro.disconnect();
      boxResizeObserverRef.current = null;
    };
  }, [
    scheduleRecalcPositions,
    layoutCommentsByLine,
    activeLineIndex,
    replyTarget,
    resolvedCollapsedLines,
  ]);

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
    () =>
      createRfcMarkdownComponents({
        assets: { owner, repo, headRef, markdownFilePath },
        commentable: {
          onLineClick: handleLineClick,
          onMouseEnterLine: handleMouseEnterLine,
          onMouseLeaveLine: handleMouseLeaveLine,
          lineHasComments,
          renderProfilePictures,
          findSourceLineFromPre: findSourceLineFromPreEvent,
          lastHoverLineRef,
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
        resolvedCollapsedLines={resolvedCollapsedLines}
        lineRefs={lineRefs}
        onLineClick={handleLineClick}
        onMouseEnterLine={handleMouseEnterLine}
        onMouseLeaveLine={handleMouseLeaveLine}
      />
      <div
        ref={markdownRef}
        className={`${PROSE_WRAPPER_CLASS} flex-1 min-w-0 overflow-x-auto relative`}
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
      ref={setContainerEl}
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
        containerEl={containerEl}
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
            registerCommentBox={registerCommentBox}
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
  registerCommentBox: (lineNum: number, el: HTMLDivElement | null) => void;
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
  registerCommentBox,
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
          commentBoxRef={(el) => registerCommentBox(-1, el)}
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
            replyTarget={lineReplyTarget(replyTarget, lineNumber)}
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
            commentBoxRef={(el) => registerCommentBox(lineNumber, el)}
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
