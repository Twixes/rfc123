"use client";

import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ExistingLineComments } from "@/components/ExistingLineComments";
import type { CommentThread, ReplyTarget } from "@/lib/comment-threads";
import { groupIntoThreads, lineReplyTarget } from "@/lib/comment-threads";
import type { Comment } from "@/lib/github";
import {
  type ArrowPath,
  type CascadeBox,
  cascadeBoxes,
  layoutArrows,
} from "@/lib/inline-comment-layout";
import { usePerLineCommentHandlers } from "@/lib/use-per-line-comment-handlers";

const DEFAULT_BOX_HEIGHT_PX = 100;

/** Fallback array equality used to dedupe `arrowPaths` updates — mirror of
 *  the read-mode short-circuit. Without this every per-box ResizeObserver tick
 *  produces a fresh array identity and forces a downstream SVG re-render. */
function arrowPathsEqual(a: readonly ArrowPath[], b: readonly ArrowPath[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = b[i];
    if (
      p.lineNumber !== q.lineNumber ||
      p.from.x !== q.from.x ||
      p.from.y !== q.from.y ||
      p.to.x !== q.to.x ||
      p.to.y !== q.to.y ||
      p.elbowX !== q.elbowX
    )
      return false;
  }
  return true;
}

interface EditModeInlineCommentsProps {
  /** Original-file → current-buffer line mapping. Parent computes once and
   *  shares with the Preview-tab remap so the LCS DP doesn't run twice. */
  originalToCurrentLine: Map<number, number | null>;
  /** All comments — anchored to lines in the original file. Comments without
   *  a line number are ignored (general PR comments live elsewhere). */
  comments: Comment[];
  /** Ref to the CodeMirror wrapper from @uiw/react-codemirror. The view is
   *  used for per-line coords via `view.coordsAtPos`. */
  editorRef: RefObject<ReactCodeMirrorRef | null>;
  /** Wraps the editor + sidebar; arrows are drawn in this container's
   *  coordinate space. Must be position:relative. */
  containerRef: RefObject<HTMLDivElement | null>;
  isSubmitting: boolean;
  highlightedCommentId?: number | null;
  /** Incremented by the parent on every CodeMirror update. The component
   *  re-measures line positions whenever this changes. Avoids needing an
   *  imperative handle — the parent just bumps a counter. */
  editTick: number;
  /** Shares the parent's reply submission entrypoint. New-thread creation is
   *  disabled in edit mode, so `replyToCommentId` will always be a number at
   *  the call site, but the signature stays compatible with read mode's
   *  optional-arg variant. */
  onCommentSubmit: (
    line: number,
    body: string,
    replyToCommentId?: number,
  ) => Promise<void>;
}

interface LineCoords {
  /** Y position relative to the container, used for cascading. */
  topY: number;
  /** Right edge of the editor's line, used as the arrow target. */
  rightX: number;
}

function defaultCollapsedLines(
  threadsByLine: Map<number, CommentThread[]>,
): Set<number> {
  // Match read-mode behavior: if more than three lines have comments, collapse
  // them all by default. Otherwise everything starts open.
  return threadsByLine.size > 3 ? new Set(threadsByLine.keys()) : new Set();
}

export function EditModeInlineComments({
  originalToCurrentLine,
  comments,
  editorRef,
  containerRef,
  isSubmitting,
  highlightedCommentId,
  editTick,
  onCommentSubmit,
}: EditModeInlineCommentsProps) {
  const threadsByOriginalLine = useMemo(() => {
    const byLine = new Map<number, Comment[]>();
    for (const c of comments) {
      if (!c.line) continue;
      const group = byLine.get(c.line);
      if (group) group.push(c);
      else byLine.set(c.line, [c]);
    }
    const threads = new Map<number, CommentThread[]>();
    for (const [line, cs] of byLine) threads.set(line, groupIntoThreads(cs));
    return threads;
  }, [comments]);

  const [linePositions, setLinePositions] = useState<Map<number, LineCoords>>(
    new Map(),
  );
  const linePositionsRef = useRef(linePositions);
  linePositionsRef.current = linePositions;

  const measureRafRef = useRef<number | null>(null);
  const recalcLinePositions = useCallback(() => {
    const view = editorRef.current?.view;
    const container = containerRef.current;
    if (!view || !container) return;
    const containerRect = container.getBoundingClientRect();
    const editorRect = view.dom.getBoundingClientRect();

    const next = new Map<number, LineCoords>();
    const doc = view.state.doc;
    const currentLinesNeeded = new Set<number>();
    for (const originalLine of threadsByOriginalLine.keys()) {
      const currentLine = originalToCurrentLine.get(originalLine);
      if (currentLine != null) currentLinesNeeded.add(currentLine);
    }

    for (const currentLine of currentLinesNeeded) {
      if (currentLine < 1 || currentLine > doc.lines) continue;
      const lineInfo = doc.line(currentLine);
      const coords = view.coordsAtPos(lineInfo.from);
      if (!coords) continue;
      next.set(currentLine, {
        topY: coords.top - containerRect.top,
        // Editor right edge — stable target regardless of line wrapping.
        rightX: editorRect.right - containerRect.left,
      });
    }
    setLinePositions((prev) => {
      if (prev.size !== next.size) return next;
      for (const [k, v] of next) {
        const p = prev.get(k);
        if (!p || p.topY !== v.topY || p.rightX !== v.rightX) return next;
      }
      return prev;
    });
  }, [editorRef, containerRef, threadsByOriginalLine, originalToCurrentLine]);

  const scheduleRecalc = useCallback(() => {
    if (measureRafRef.current != null) return;
    measureRafRef.current = requestAnimationFrame(() => {
      measureRafRef.current = null;
      recalcLinePositions();
    });
  }, [recalcLinePositions]);

  // Re-measure whenever the mapping, threads, or parent-driven edit tick
  // changes. `editTick` lets the parent's CodeMirror updateListener fan-in to
  // this component without an imperative handle.
  // biome-ignore lint/correctness/useExhaustiveDependencies: editTick is intentionally a dep; bumping it from the parent's update listener is what triggers re-measurement
  useEffect(() => {
    scheduleRecalc();
  }, [scheduleRecalc, editTick]);

  // Width-only — arrow target X moves when the editor column changes width.
  // Height changes are handled by the per-box ResizeObserver and the editor's
  // own updateListener, so observing them here would just fire on every line
  // the user adds while typing.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let lastWidth = container.getBoundingClientRect().width;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.contentRect.width !== lastWidth) {
          lastWidth = e.contentRect.width;
          scheduleRecalc();
          return;
        }
      }
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      if (measureRafRef.current != null) {
        cancelAnimationFrame(measureRafRef.current);
        measureRafRef.current = null;
      }
    };
  }, [containerRef, scheduleRecalc]);

  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [collapsedLines, setCollapsedLines] = useState<Set<number> | null>(
    null,
  );
  const resolvedCollapsedLines = useMemo(
    () => collapsedLines ?? defaultCollapsedLines(threadsByOriginalLine),
    [collapsedLines, threadsByOriginalLine],
  );
  const resolvedCollapsedLinesRef = useRef(resolvedCollapsedLines);
  resolvedCollapsedLinesRef.current = resolvedCollapsedLines;

  // Auto-expand the line containing the highlighted comment.
  useEffect(() => {
    if (highlightedCommentId == null) return;
    for (const [line, threads] of threadsByOriginalLine.entries()) {
      if (
        threads.some((t) =>
          t.comments.some((c) => c.id === highlightedCommentId),
        )
      ) {
        setCollapsedLines((prev) => {
          const resolved = prev ?? defaultCollapsedLines(threadsByOriginalLine);
          if (!resolved.has(line)) return prev;
          const next = new Set(resolved);
          next.delete(line);
          return next;
        });
        break;
      }
    }
  }, [highlightedCommentId, threadsByOriginalLine]);

  // Refs the existing handler hook needs.
  const commentBoxRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const contentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const boxResizeObserverRef = useRef<ResizeObserver | null>(null);

  const [boxPositions, setBoxPositions] = useState<Map<number, number>>(
    new Map(),
  );
  const [minContentHeight, setMinContentHeight] = useState(0);
  const recalcRafRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (recalcRafRef.current != null) {
        cancelAnimationFrame(recalcRafRef.current);
        recalcRafRef.current = null;
      }
    },
    [],
  );

  const { orphanedLines, liveLines } = useMemo(() => {
    const orphans: number[] = [];
    const live: Array<{ originalLine: number; currentLine: number }> = [];
    for (const originalLine of threadsByOriginalLine.keys()) {
      const currentLine = originalToCurrentLine.get(originalLine);
      if (currentLine == null) orphans.push(originalLine);
      else live.push({ originalLine, currentLine });
    }
    orphans.sort((a, b) => a - b);
    live.sort((a, b) => a.currentLine - b.currentLine);
    return { orphanedLines: orphans, liveLines: live };
  }, [threadsByOriginalLine, originalToCurrentLine]);

  const measureBoxHeight = useCallback(
    (originalLine: number) => {
      const ref = commentBoxRefs.current.get(originalLine);
      if (!ref) return DEFAULT_BOX_HEIGHT_PX;
      const headerEl = ref.firstElementChild as HTMLElement | null;
      const replyLine = replyTarget?.line ?? null;
      const collapsed = resolvedCollapsedLinesRef.current;
      let height = ref.offsetHeight;
      if (collapsed.has(originalLine)) {
        height = headerEl?.offsetHeight ?? height;
      } else if (replyLine !== originalLine) {
        const contentEl = contentRefs.current.get(originalLine);
        if (contentEl && headerEl) {
          height = headerEl.offsetHeight + contentEl.offsetHeight;
        }
      }
      return height;
    },
    [replyTarget?.line],
  );

  const recalcPositions = useCallback(() => {
    // Orphan stack runs first, top-aligned, with a small label above the
    // first orphan so users know why these threads have no arrow.
    const ORPHAN_LABEL_OFFSET = 24;
    let orphanCursor = orphanedLines.length > 0 ? ORPHAN_LABEL_OFFSET : 0;
    const orphanPositions = new Map<number, number>();
    for (const originalLine of orphanedLines) {
      orphanPositions.set(originalLine, orphanCursor);
      orphanCursor += measureBoxHeight(originalLine) + 8;
    }

    const boxes: CascadeBox[] = liveLines.map(
      ({ originalLine, currentLine }) => {
        const coords = linePositionsRef.current.get(currentLine);
        const baseOffset = coords
          ? Math.max(coords.topY, orphanCursor)
          : orphanCursor;
        return {
          key: originalLine,
          sortLine: currentLine,
          baseOffset,
          boxHeight: measureBoxHeight(originalLine),
        };
      },
    );
    const live = cascadeBoxes(boxes);

    const positions = new Map<number, number>(orphanPositions);
    for (const [key, y] of live.positions) positions.set(key, y);

    setBoxPositions((prev) => {
      if (prev.size !== positions.size) return positions;
      for (const [k, v] of positions) if (prev.get(k) !== v) return positions;
      return prev;
    });
    const max = Math.max(orphanCursor, live.maxBottom);
    setMinContentHeight((prev) => (prev === max ? prev : max));
  }, [orphanedLines, liveLines, measureBoxHeight]);

  const scheduleRecalcPositions = useCallback(() => {
    if (recalcRafRef.current != null) return;
    recalcRafRef.current = requestAnimationFrame(() => {
      recalcRafRef.current = null;
      recalcPositions();
    });
  }, [recalcPositions]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: recalcPositions reads several values via refs; explicit deps make the effect re-run when those values change
  useEffect(() => {
    scheduleRecalcPositions();
  }, [
    scheduleRecalcPositions,
    linePositions,
    liveLines,
    orphanedLines,
    resolvedCollapsedLines,
    replyTarget,
  ]);

  // Per-box resize observer (collapse, reply UI, content height). We also
  // ping the arrows scheduler directly: a height-only change on the bottom
  // box keeps every box's Y identical, so `setBoxPositions` short-circuits
  // as byte-identical and the arrows effect never fires — leaving the arrow
  // tip pointing at the box's old vertical center.
  const scheduleRecalcArrowsRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      scheduleRecalcPositions();
      scheduleRecalcArrowsRef.current();
    });
    boxResizeObserverRef.current = ro;
    for (const el of commentBoxRefs.current.values()) ro.observe(el);
    return () => {
      ro.disconnect();
      boxResizeObserverRef.current = null;
    };
  }, [scheduleRecalcPositions]);

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

  const [arrowPaths, setArrowPaths] = useState<ArrowPath[]>([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const recalcArrows = useCallback(() => {
    const container = containerRef.current;
    if (!container || typeof window === "undefined") return;
    const rect = container.getBoundingClientRect();
    if (rect.width < 1024) {
      setArrowPaths([]);
      setContainerSize((prev) =>
        prev.width === 0 && prev.height === 0 ? prev : { width: 0, height: 0 },
      );
      return;
    }
    setContainerSize((prev) =>
      prev.width === rect.width && prev.height === rect.height
        ? prev
        : { width: rect.width, height: rect.height },
    );

    const inputs: Array<{
      lineNumber: number;
      from: { x: number; y: number };
      to: { x: number; y: number };
      color: string;
      isDraft: boolean;
    }> = [];
    for (const { originalLine, currentLine } of liveLines) {
      const coords = linePositionsRef.current.get(currentLine);
      if (!coords) continue;
      const boxEl = commentBoxRefs.current.get(originalLine);
      if (!boxEl) continue;
      const boxRect = boxEl.getBoundingClientRect();
      inputs.push({
        lineNumber: originalLine,
        from: {
          x: boxRect.left - rect.left,
          y: boxRect.top - rect.top + boxRect.height / 2,
        },
        to: {
          x: coords.rightX,
          y: coords.topY + 10,
        },
        color: "var(--magenta)",
        isDraft: false,
      });
    }
    const next = layoutArrows(inputs);
    setArrowPaths((prev) => (arrowPathsEqual(prev, next) ? prev : next));
  }, [containerRef, liveLines]);

  const arrowsRafRef = useRef<number | null>(null);
  const scheduleRecalcArrows = useCallback(() => {
    if (arrowsRafRef.current != null) return;
    arrowsRafRef.current = requestAnimationFrame(() => {
      arrowsRafRef.current = null;
      recalcArrows();
    });
  }, [recalcArrows]);
  scheduleRecalcArrowsRef.current = scheduleRecalcArrows;

  // biome-ignore lint/correctness/useExhaustiveDependencies: recalcArrows reads box/line positions via refs; explicit deps make the effect re-run when those values change
  useEffect(() => {
    scheduleRecalcArrows();
  }, [scheduleRecalcArrows, boxPositions, linePositions, orphanedLines]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let lastWidth = container.getBoundingClientRect().width;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.contentRect.width !== lastWidth) {
          lastWidth = e.contentRect.width;
          scheduleRecalcArrows();
          return;
        }
      }
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      if (arrowsRafRef.current != null) {
        cancelAnimationFrame(arrowsRafRef.current);
        arrowsRafRef.current = null;
      }
    };
  }, [containerRef, scheduleRecalcArrows]);

  const handleReplySubmit = useCallback(
    async (body: string) => {
      if (!replyTarget || replyTarget.type !== "thread" || !body.trim()) return;
      try {
        await onCommentSubmit(replyTarget.line, body, replyTarget.threadId);
        setReplyTarget(null);
      } catch (error) {
        console.error("Error submitting reply:", error);
        alert("Failed to post comment");
      }
    },
    [replyTarget, onCommentSubmit],
  );

  const getLineHandlers = usePerLineCommentHandlers({
    registerCommentBox,
    contentRefs,
    onStartReply: (lineNumber, threadId) => {
      setReplyTarget({ type: "thread", line: lineNumber, threadId });
    },
    // New-thread creation isn't reachable in edit mode (we never render the
    // "+ New thread" button because there's only ever one thread per line in
    // practice, and `ExistingLineComments` only shows the button at the very
    // bottom). This stays as a no-op for type compatibility.
    onStartNewThread: () => undefined,
    onToggleCollapse: (lineNumber) => {
      setCollapsedLines(() => {
        const next = new Set(resolvedCollapsedLines);
        if (next.has(lineNumber)) next.delete(lineNumber);
        else next.add(lineNumber);
        return next;
      });
    },
    onCommentMouseEnter: () => undefined,
    onCommentMouseLeave: () => undefined,
  });

  const renderOrder = useMemo(
    () => [...orphanedLines, ...liveLines.map((l) => l.originalLine)],
    [orphanedLines, liveLines],
  );

  return (
    <>
      <div
        className="relative w-full lg:w-auto"
        style={{ minHeight: `${minContentHeight}px` }}
      >
        {orphanedLines.length > 0 && (
          <p
            className="lg:absolute static top-0 left-0 m-0 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-50"
            title="Threads whose anchor line was edited away"
          >
            Orphaned ({orphanedLines.length})
          </p>
        )}
        {renderOrder.map((originalLine) => {
          const threads = threadsByOriginalLine.get(originalLine) ?? [];
          const h = getLineHandlers(originalLine);
          const isOrphan = originalToCurrentLine.get(originalLine) == null;
          return (
            <div
              key={originalLine}
              className={isOrphan ? "opacity-70" : undefined}
            >
              <ExistingLineComments
                lineNumber={originalLine}
                threads={threads}
                position={boxPositions.get(originalLine) ?? 0}
                replyTarget={lineReplyTarget(replyTarget, originalLine)}
                replyInitialDraft=""
                isSubmitting={isSubmitting}
                isCollapsed={resolvedCollapsedLines.has(originalLine)}
                highlightedCommentId={highlightedCommentId}
                onStartReply={h.onStartReply}
                onStartNewThread={h.onStartNewThread}
                onCancelReply={() => setReplyTarget(null)}
                onSubmitReply={handleReplySubmit}
                onToggleCollapse={h.onToggleCollapse}
                commentBoxRef={h.commentBoxRef}
                onContentRef={h.onContentRef}
              />
            </div>
          );
        })}
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
              id="arrowhead-magenta-edit"
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
          </defs>
          {arrowPaths.map(({ lineNumber, from, to, elbowX, color }) => {
            const d = `M ${from.x} ${from.y} H ${elbowX} V ${to.y} H ${to.x}`;
            return (
              <path
                key={lineNumber}
                data-arrow-line={lineNumber}
                d={d}
                fill="none"
                stroke={color}
                strokeWidth="1"
                strokeOpacity={0.6}
                markerEnd="url(#arrowhead-magenta-edit)"
              />
            );
          })}
        </svg>
      )}
    </>
  );
}
