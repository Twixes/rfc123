"use client";

import { useEffect, useRef } from "react";

export interface AdoptionPollItem {
  owner: string;
  name: string;
  fullName: string;
}

export type AdoptionPollResolution = "adopted" | "closed" | "missing";

export interface AdoptionPollResolved extends AdoptionPollItem {
  status: AdoptionPollResolution;
}

interface UseAdoptionStatusPollOptions {
  /** Repos to watch. Pass an empty list (or `enabled: false`) to stop polling. */
  pending: AdoptionPollItem[];
  intervalMs?: number;
  /** Master switch — useful for "only while the page/modal is visible". */
  enabled?: boolean;
  /**
   * Fired for each repo whose adoption resolved. The parent is expected to drop
   * the repo from its `pending` list (directly or via a refresh) so the loop
   * stops asking about it.
   *
   * `/api/repos/adopt/status` invalidates the viewer-repos cache via
   * `finalizeAdoptedRepo` whenever it sees `merged`, so a refresh that runs
   * after `onResolved` will see the freshly-adopted repo.
   */
  onResolved: (resolved: AdoptionPollResolved) => void;
}

const DEFAULT_INTERVAL_MS = 4000;

/**
 * Polls `/api/repos/adopt/status` for each pending repo on a fixed interval.
 * The endpoint is idempotent, so it's safe for multiple instances of this hook
 * to watch the same repo concurrently (e.g. the adoption modal and the RFC
 * list both polling while the modal is open).
 */
export function useAdoptionStatusPoll({
  pending,
  intervalMs = DEFAULT_INTERVAL_MS,
  enabled = true,
  onResolved,
}: UseAdoptionStatusPollOptions): void {
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  // Refs keep the latest values without retriggering the effect on every
  // parent render – the loop only restarts when the *set* of pending repos
  // changes (tracked via pendingKey below).
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const pendingKey = pending
    .map((p) => p.fullName)
    .sort()
    .join("|");

  useEffect(() => {
    if (!enabled || pendingKey === "") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      const results = await Promise.all(
        pendingRef.current.map(async (item) => {
          try {
            const params = new URLSearchParams({
              owner: item.owner,
              name: item.name,
            });
            const res = await fetch(
              `/api/repos/adopt/status?${params.toString()}`,
            );
            if (!res.ok) return null;
            const data = (await res.json()) as {
              status: "pending" | AdoptionPollResolution;
            };
            return { item, status: data.status };
          } catch (e) {
            if (!cancelled) console.error("Failed to poll adoption status", e);
            return null;
          }
        }),
      );
      if (cancelled) return;
      for (const r of results) {
        if (r && r.status !== "pending") {
          onResolvedRef.current({ ...r.item, status: r.status });
        }
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };

    // Fire immediately so resumed-from-other-device flows don't sit idle for a
    // full interval before the first status update.
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pendingKey, enabled, intervalMs]);
}
