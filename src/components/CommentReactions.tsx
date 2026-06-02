"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  type CommentReactions,
  REACTION_CONTENTS,
  REACTION_EMOJI,
  REACTION_LABEL,
  type ReactionContent,
} from "@/lib/reactions";

interface CommentReactionsProps {
  reactions?: CommentReactions;
  /** Disabled (e.g. while the comment is still being posted, no nodeId yet,
   *  or the viewer isn't signed in). Renders read-only. */
  disabled?: boolean;
  onToggle: (content: ReactionContent) => void | Promise<void>;
}

interface ReactionChip {
  content: ReactionContent;
  count: number;
  viewer: boolean;
}

function buildReactionList(reactions?: CommentReactions): ReactionChip[] {
  if (!reactions) return [];
  const viewerSet = new Set(reactions.viewer);
  return REACTION_CONTENTS.filter(
    (content) => (reactions.counts[content] ?? 0) > 0,
  ).map((content) => ({
    content,
    count: reactions.counts[content] ?? 0,
    viewer: viewerSet.has(content),
  }));
}

/** Approximate dimensions; only used to pick above vs. below and to clamp the
 *  popover to the viewport. Exact size is decided by the rendered content. */
const POPOVER_WIDTH = 280;
const POPOVER_HEIGHT = 44;
const VIEWPORT_GAP = 8;

interface PopoverPosition {
  top: number;
  left: number;
}

function computePopoverPosition(triggerRect: DOMRect): PopoverPosition {
  const wantsAbove = triggerRect.top >= POPOVER_HEIGHT + VIEWPORT_GAP;
  const top = wantsAbove
    ? triggerRect.top - POPOVER_HEIGHT - VIEWPORT_GAP
    : triggerRect.bottom + VIEWPORT_GAP;
  let left = triggerRect.left;
  if (left + POPOVER_WIDTH > window.innerWidth - VIEWPORT_GAP) {
    left = window.innerWidth - POPOVER_WIDTH - VIEWPORT_GAP;
  }
  if (left < VIEWPORT_GAP) left = VIEWPORT_GAP;
  return { top, left };
}

export function CommentReactionsBar({
  reactions,
  disabled,
  onToggle,
}: CommentReactionsProps) {
  const chips = buildReactionList(reactions);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Keep the popover anchored to its trigger as the user scrolls or resizes.
  // `position: fixed` means we recompute every frame the trigger could move.
  useLayoutEffect(() => {
    if (!pickerOpen) return;
    const reposition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      setPos(computePopoverPosition(trigger.getBoundingClientRect()));
    };
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [pickerOpen]);

  // Click-outside + Escape. The portaled popover is outside the trigger's DOM
  // subtree, so we have to check both refs explicitly.
  useEffect(() => {
    if (!pickerOpen) return;
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setPickerOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [pickerOpen]);

  const handleChipClick = useCallback(
    (content: ReactionContent) => {
      if (disabled) return;
      void onToggle(content);
    },
    [disabled, onToggle],
  );

  const handlePickerSelect = useCallback(
    (content: ReactionContent) => {
      setPickerOpen(false);
      if (disabled) return;
      void onToggle(content);
    },
    [disabled, onToggle],
  );

  if (chips.length === 0 && disabled) return null;

  const viewerSet = new Set(reactions?.viewer ?? []);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {chips.map((chip) => (
        <button
          key={chip.content}
          type="button"
          disabled={disabled}
          onClick={() => handleChipClick(chip.content)}
          aria-label={`${chip.viewer ? "Remove" : "Add"} ${REACTION_LABEL[chip.content]} reaction`}
          aria-pressed={chip.viewer}
          title={REACTION_LABEL[chip.content]}
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition-colors ${
            disabled ? "cursor-default" : "cursor-pointer"
          } ${
            chip.viewer
              ? "border-cyan/40 bg-cyan-light text-cyan"
              : "border-gray-20 bg-surface text-gray-70 hover:border-gray-30 hover:bg-gray-5"
          }`}
        >
          <span className="text-[13px] leading-none">
            {REACTION_EMOJI[chip.content]}
          </span>
          <span className="font-mono tabular-nums">{chip.count}</span>
        </button>
      ))}
      {!disabled && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          aria-label="Add reaction"
          title="Add reaction"
          className={`relative inline-flex items-center gap-0.5 rounded-full border border-dashed px-1.5 py-0.5 text-[11px] leading-none transition-colors cursor-pointer ${
            pickerOpen
              ? "border-gray-40 bg-gray-5 text-foreground"
              : "border-gray-20 bg-surface text-gray-40 hover:border-gray-30 hover:bg-gray-5 hover:text-gray-70"
          }`}
        >
          <svg
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>Smiley</title>
            <circle
              cx="12"
              cy="12"
              r="9"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 10h.01M15 10h.01M9 14c.83 1.2 1.86 1.8 3 1.8s2.17-.6 3-1.8"
            />
          </svg>
          <span className="absolute -right-0.5 -top-0.5 grid h-2.5 w-2.5 place-items-center rounded-full bg-cyan text-[8px] font-bold leading-none text-surface">
            +
          </span>
        </button>
      )}

      {pickerOpen &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Pick a reaction"
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-50 flex items-center gap-0.5 rounded-full border border-gray-20 bg-surface p-1 shadow-lg"
          >
            {REACTION_CONTENTS.map((content) => {
              const isActive = viewerSet.has(content);
              return (
                <button
                  key={content}
                  type="button"
                  onClick={() => handlePickerSelect(content)}
                  aria-label={REACTION_LABEL[content]}
                  aria-pressed={isActive}
                  title={REACTION_LABEL[content]}
                  className={`grid size-8 place-items-center rounded-full text-base transition-transform hover:scale-125 cursor-pointer ${
                    isActive ? "bg-cyan-light" : "hover:bg-gray-5"
                  }`}
                >
                  {REACTION_EMOJI[content]}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
