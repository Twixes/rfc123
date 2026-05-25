"use client";

import { useEffect, useRef, useState } from "react";

interface UseRfcDraftOptions<T> {
  /** localStorage key. Caller is responsible for scoping (e.g. per-PR). */
  storageKey: string;
  /** Decides whether a previously persisted draft is worth surfacing in a
   *  restore banner. Skips no-op snapshots (empty title, untouched template). */
  hasRestorableContent: (draft: T) => boolean;
  /** Current snapshot. Pass `null` to indicate "there is nothing worth saving
   *  right now" – the hook clears the storage key. */
  current: T | null;
  /** Debounce window for writes (default 200ms). */
  debounceMs?: number;
}

interface UseRfcDraftResult<T> {
  /** Previously persisted draft if any. Stays non-null until the caller resolves
   *  the restore banner via {@link acceptDraft} or {@link discardDraft}. */
  pendingDraft: T | null;
  /** Mark the pending draft as resolved (the caller has copied fields onto its
   *  own state). Re-enables ongoing persistence. */
  acceptDraft: () => void;
  /** Drop the pending draft and clear storage. */
  discardDraft: () => void;
  /** Imperatively clear storage + pending. Use after a successful save or when
   *  the caller wants to force a "reset" (e.g. after a save conflict). */
  clearDraft: () => void;
}

/**
 * Shared "save-as-you-type with a restore-on-return banner" hook. The same
 * pattern is used by /rfcs/new (drafting a new RFC) and by the detail page's
 * edit mode (editing an existing RFC's body).
 *
 * Important: persistence is paused while a `pendingDraft` is showing so we
 * don't clobber the snapshot before the user decides what to do with it.
 */
export function useRfcDraft<T>({
  storageKey,
  hasRestorableContent,
  current,
  debounceMs = 200,
}: UseRfcDraftOptions<T>): UseRfcDraftResult<T> {
  const [pendingDraft, setPendingDraft] = useState<T | null>(null);
  const loadedRef = useRef(false);
  // Hold the predicate in a ref so the load effect doesn't re-fire when the
  // caller passes an inline function.
  const hasContentRef = useRef(hasRestorableContent);
  hasContentRef.current = hasRestorableContent;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as T;
        if (hasContentRef.current(parsed)) {
          setPendingDraft(parsed);
        }
      }
    } catch {}
    loadedRef.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!loadedRef.current) return;
    if (pendingDraft) return;
    if (current === null) {
      try {
        localStorage.removeItem(storageKey);
      } catch {}
      return;
    }
    const handle = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(current));
      } catch {}
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [storageKey, current, pendingDraft, debounceMs]);

  return {
    pendingDraft,
    acceptDraft: () => setPendingDraft(null),
    discardDraft: () => {
      try {
        localStorage.removeItem(storageKey);
      } catch {}
      setPendingDraft(null);
    },
    clearDraft: () => {
      try {
        localStorage.removeItem(storageKey);
      } catch {}
      setPendingDraft(null);
    },
  };
}
