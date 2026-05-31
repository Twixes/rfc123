"use client";

import { useRef } from "react";

/** Parent-side callbacks the sidebar passes down once per render. They
 *  generally aren't memoized at the source (each parent render creates fresh
 *  inline arrows), which is fine -- the hook reads them through a ref so the
 *  cached per-line handlers never go stale. */
interface PerLineHandlerInputs {
  registerCommentBox: (lineNum: number, el: HTMLDivElement | null) => void;
  contentRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  onStartReply: (lineNumber: number, threadId: number) => void;
  onStartNewThread: (lineNumber: number) => void;
  onToggleCollapse: (lineNumber: number) => void;
  onCommentMouseEnter: (lineIndex: number) => void;
  onCommentMouseLeave: () => void;
}

/** Per-line bound versions of the parent callbacks. Identities are stable
 *  for a given `lineNumber` across renders, so React doesn't detach/reattach
 *  the comment-box ref (which would retrigger the per-box ResizeObserver and
 *  cascade into the layout recalc) and `memo`-ed children can bail out. */
export interface PerLineCommentHandlers {
  commentBoxRef: (el: HTMLDivElement | null) => void;
  onContentRef: (el: HTMLDivElement | null) => void;
  onStartReply: (threadId: number) => void;
  onStartNewThread: () => void;
  onToggleCollapse: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/** Returns a `(lineNumber) => handlers` accessor whose returned handlers
 *  are stable per `lineNumber` for the lifetime of the hook. Cached entries
 *  are keyed by `lineNumber`; since the set of lines is bounded by the RFC's
 *  comment count, the cache is bounded and never pruned. */
export function usePerLineCommentHandlers(
  inputs: PerLineHandlerInputs,
): (lineNumber: number) => PerLineCommentHandlers {
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;

  const cacheRef = useRef(new Map<number, PerLineCommentHandlers>());

  return (lineNumber: number) => {
    let handlers = cacheRef.current.get(lineNumber);
    if (handlers) return handlers;
    handlers = {
      commentBoxRef: (el) =>
        inputsRef.current.registerCommentBox(lineNumber, el),
      onContentRef: (el) => {
        if (el) inputsRef.current.contentRefs.current.set(lineNumber, el);
        else inputsRef.current.contentRefs.current.delete(lineNumber);
      },
      onStartReply: (threadId) =>
        inputsRef.current.onStartReply(lineNumber, threadId),
      onStartNewThread: () => inputsRef.current.onStartNewThread(lineNumber),
      onToggleCollapse: () => inputsRef.current.onToggleCollapse(lineNumber),
      onMouseEnter: () => inputsRef.current.onCommentMouseEnter(lineNumber - 1),
      onMouseLeave: () => inputsRef.current.onCommentMouseLeave(),
    };
    cacheRef.current.set(lineNumber, handlers);
    return handlers;
  };
}
