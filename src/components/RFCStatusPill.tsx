"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import type { RFCDetail, RfcStateAction } from "@/lib/github";

export type { RfcStateAction };

interface DerivedState {
  label: string;
  dot: string;
}

/** Combines `status` + `isDraft` into the four states we surface in the UI. */
function deriveState(rfc: Pick<RFCDetail, "status" | "isDraft">): DerivedState {
  if (rfc.status === "merged") return { label: "Merged", dot: "bg-magenta" };
  if (rfc.status === "closed") return { label: "Closed", dot: "bg-gray-40" };
  if (rfc.isDraft) return { label: "Draft", dot: "bg-yellow" };
  return { label: "Open", dot: "bg-cyan" };
}

interface Transition {
  action: RfcStateAction;
  label: string;
  destructive?: boolean;
}

/** Valid transitions per current state. Merged is terminal. */
function transitionsFor(
  rfc: Pick<RFCDetail, "status" | "isDraft">,
): Transition[] {
  if (rfc.status === "merged") return [];
  if (rfc.status === "closed") return [{ action: "reopen", label: "Reopen" }];
  if (rfc.isDraft) {
    return [
      { action: "markReady", label: "Mark ready for review" },
      { action: "close", label: "Close RFC", destructive: true },
    ];
  }
  return [
    { action: "convertToDraft", label: "Convert to draft" },
    { action: "close", label: "Close RFC", destructive: true },
  ];
}

interface RFCStatusPillProps {
  rfc: Pick<RFCDetail, "status" | "isDraft">;
  isAuthor: boolean;
  busy: boolean;
  onAction: (action: RfcStateAction) => void;
}

/**
 * The eyebrow-row status indicator. For non-authors (and for merged RFCs)
 * it's a static label. For the RFC's author it becomes a Headless UI menu
 * – clicking the pill reveals the valid state transitions, mirroring how
 * Linear / Notion use the status display itself as the state control.
 */
export function RFCStatusPill({
  rfc,
  isAuthor,
  busy,
  onAction,
}: RFCStatusPillProps) {
  const state = deriveState(rfc);
  const transitions = isAuthor ? transitionsFor(rfc) : [];
  const interactive = transitions.length > 0;

  if (!interactive) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-gray-70">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${state.dot}`}
          aria-hidden
        />
        {state.label}
      </span>
    );
  }

  return (
    <Menu as="div" className="relative">
      <MenuButton
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-gray-70 hover:text-foreground transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60"
      >
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${state.dot}`}
          aria-hidden
        />
        {busy ? "Updating…" : state.label}
        <svg
          className="h-2.5 w-2.5 -mr-0.5 text-gray-50"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden
        >
          <title>Open status menu</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M6 9l6 6 6-6"
          />
        </svg>
      </MenuButton>
      <MenuItems
        anchor={{ to: "bottom start", gap: 6 }}
        className="z-50 min-w-44 rounded-md border border-gray-20 bg-surface py-1 shadow-md focus:outline-none"
      >
        {transitions.map((t) => (
          <MenuItem key={t.action}>
            <button
              type="button"
              onClick={() => onAction(t.action)}
              className={`block w-full text-left px-3 py-1.5 text-sm cursor-pointer data-[focus]:bg-gray-5 ${
                t.destructive
                  ? "text-magenta data-[focus]:bg-magenta-light/40"
                  : "text-foreground"
              }`}
            >
              {t.label}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}
