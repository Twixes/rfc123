"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { type DiffRange, shortSha } from "@/lib/diff-range";
import type { RFCCommitHistory } from "@/lib/github";
import { RelativeTime } from "./RelativeTime";

export type { DiffRange };

interface CommitRangePickerProps {
  owner: string;
  repo: string;
  prNumber: number;
  /** Active commit range, or `null` when the reader is on the latest version. */
  range: DiffRange | null;
  onRangeChange: (next: DiffRange | null) => void;
}

interface PickerEntry {
  sha: string;
  label: string;
  sublabel: string;
  authoredDate: string | null;
  /** True for the synthetic PR base entry. */
  isBase: boolean;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; history: RFCCommitHistory }
  | { kind: "error"; message: string };

function buildEntries(history: RFCCommitHistory): PickerEntry[] {
  const commits = [...history.commits].reverse().map<PickerEntry>((c, i) => {
    const sha = shortSha(c.sha);
    return {
      sha,
      label: c.summary || sha,
      sublabel: i === 0 ? "Latest" : sha,
      authoredDate: c.authoredDate,
      isBase: false,
    };
  });
  const baseSha = shortSha(history.base.sha);
  commits.push({
    sha: baseSha,
    label: history.base.label,
    sublabel: baseSha,
    authoredDate: null,
    isBase: true,
  });
  return commits;
}

export function CommitRangePicker({
  owner,
  repo,
  prNumber,
  range,
  onRangeChange,
}: CommitRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const rootRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  // Guards the lazy fetch: we want it to run once on first open, not every
  // time `open` flips back to true. Can't read `state.kind` from deps and
  // mutate it in the effect body — the cleanup would fire on the resulting
  // re-render and discard the in-flight response.
  const fetchStartedRef = useRef(false);

  useEffect(() => {
    if (!open || fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    let cancelled = false;
    setState({ kind: "loading" });
    fetch(
      `/api/rfcs/${prNumber}/commits?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
    )
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load commits");
        return (await res.json()) as RFCCommitHistory;
      })
      .then((history) => {
        if (cancelled) return;
        setState({ kind: "ready", history });
      })
      .catch((e: Error) => {
        if (cancelled) return;
        fetchStartedRef.current = false; // allow retry on next open
        setState({ kind: "error", message: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [open, owner, repo, prNumber]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const entries = useMemo<PickerEntry[]>(
    () => (state.kind === "ready" ? buildEntries(state.history) : []),
    [state],
  );

  // Seed defaults once the commit list arrives: Compare = HEAD, Base =
  // previous commit (or PR base when only one commit exists). Resyncs to a
  // newly-applied range so reopening the popover reflects it.
  const [draftBase, setDraftBase] = useState<string | null>(null);
  const [draftCompare, setDraftCompare] = useState<string | null>(null);
  useEffect(() => {
    if (state.kind !== "ready") return;
    setDraftBase(range?.baseSha ?? entries[1]?.sha ?? entries[0]?.sha ?? null);
    setDraftCompare(range?.compareSha ?? entries[0]?.sha ?? null);
  }, [state, range?.baseSha, range?.compareSha, entries]);

  function applyDraft() {
    if (!draftBase || !draftCompare) return;
    if (draftBase === draftCompare) {
      onRangeChange(null);
    } else {
      onRangeChange({ baseSha: draftBase, compareSha: draftCompare });
    }
    setOpen(false);
  }

  function reset() {
    onRangeChange(null);
    setOpen(false);
  }

  const buttonLabel = range
    ? `Comparing ${shortSha(range.baseSha)}…${shortSha(range.compareSha)}`
    : "Compare versions";
  const isActive = range != null;

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={buttonLabel}
        title={buttonLabel}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.1em] transition-colors cursor-pointer ${
          isActive
            ? "border-gray-30 bg-gray-10 text-foreground"
            : "border-gray-20 bg-surface text-gray-70 hover:text-foreground hover:bg-gray-5"
        }`}
      >
        <svg
          className="h-3 w-3"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden
        >
          <title>Compare</title>
          <circle cx="4" cy="4" r="1.6" />
          <circle cx="4" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <path d="M4 5.6v4.8" />
          <path d="M5.6 4H10a2 2 0 0 1 2 2v4.4" />
        </svg>
        {isActive ? (
          <span className="font-mono normal-case tracking-normal text-[11px]">
            {shortSha(range.baseSha)}
            <span className="mx-0.5 text-gray-40">→</span>
            {shortSha(range.compareSha)}
          </span>
        ) : (
          "Compare"
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-labelledby={labelId}
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.13 }}
            style={{ transformOrigin: "top right" }}
            className="absolute top-full right-0 mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-md border border-gray-20 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] z-50"
          >
            <div
              id={labelId}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-b border-gray-20 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-gray-70">
                  Compare versions
                </span>
                {isActive && (
                  <button
                    type="button"
                    onClick={reset}
                    className="text-[11px] text-gray-50 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
              <span className="text-center w-16 text-[10px] font-medium uppercase tracking-[0.1em] text-gray-50">
                Base
              </span>
              <span className="text-center w-16 text-[10px] font-medium uppercase tracking-[0.1em] text-gray-50">
                Compare
              </span>
            </div>

            {state.kind === "loading" && <CommitListSkeleton />}
            {state.kind === "error" && (
              <div className="px-3 py-6 text-sm text-magenta">
                {state.message || "Failed to load commits."}
              </div>
            )}
            {state.kind === "ready" && (
              <>
                <ul className="max-h-72 overflow-y-auto">
                  {entries.map((e) => {
                    const isBase = draftBase === e.sha;
                    const isCompare = draftCompare === e.sha;
                    return (
                      <li
                        key={e.sha}
                        className={`grid grid-cols-[1fr_auto_auto] items-center gap-x-3 px-3 py-2 border-b border-gray-10 last:border-b-0 ${
                          e.isBase ? "bg-gray-5/40" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm text-foreground">
                            {e.label}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-gray-50">
                            <span className="font-mono">{e.sublabel}</span>
                            {e.authoredDate && (
                              <>
                                <span aria-hidden>·</span>
                                <RelativeTime date={e.authoredDate} />
                              </>
                            )}
                          </div>
                        </div>
                        <label className="w-16 flex justify-center cursor-pointer">
                          <input
                            type="radio"
                            name={`${labelId}-base`}
                            checked={isBase}
                            onChange={() => setDraftBase(e.sha)}
                            className="accent-foreground cursor-pointer"
                            aria-label={`Use ${e.label} as base`}
                          />
                        </label>
                        <label className="w-16 flex justify-center cursor-pointer">
                          <input
                            type="radio"
                            name={`${labelId}-compare`}
                            checked={isCompare}
                            onChange={() => setDraftCompare(e.sha)}
                            className="accent-foreground cursor-pointer"
                            aria-label={`Use ${e.label} as compare`}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex items-center justify-between gap-2 border-t border-gray-20 px-3 py-2">
                  <div className="text-[11px] text-gray-50">
                    {draftBase && draftCompare && draftBase !== draftCompare ? (
                      <>
                        Diff{" "}
                        <span className="font-mono text-foreground">
                          {shortSha(draftBase)}
                        </span>{" "}
                        →{" "}
                        <span className="font-mono text-foreground">
                          {shortSha(draftCompare)}
                        </span>
                      </>
                    ) : (
                      "Pick a base and a compare commit."
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={applyDraft}
                    disabled={
                      !draftBase ||
                      !draftCompare ||
                      draftBase === draftCompare ||
                      (range?.baseSha === draftBase &&
                        range?.compareSha === draftCompare)
                    }
                    className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-surface transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                  >
                    Show diff
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CommitListSkeleton() {
  return (
    <>
      <ul className="max-h-72 overflow-y-auto" aria-busy>
        {[72, 58, 64, 50].map((labelWidth, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
            key={i}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 px-3 py-2 border-b border-gray-10 last:border-b-0"
          >
            <div className="min-w-0 space-y-1.5">
              <div
                className="h-3.5 animate-pulse rounded bg-gray-20"
                style={{ width: `${labelWidth}%` }}
              />
              <div className="h-2.5 w-24 animate-pulse rounded bg-gray-10" />
            </div>
            <div className="w-16 flex justify-center">
              <div className="h-3 w-3 animate-pulse rounded-full bg-gray-20" />
            </div>
            <div className="w-16 flex justify-center">
              <div className="h-3 w-3 animate-pulse rounded-full bg-gray-20" />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2 border-t border-gray-20 px-3 py-2">
        <div className="h-3 w-32 animate-pulse rounded bg-gray-10" />
        <div className="h-7 w-20 animate-pulse rounded-md bg-gray-10" />
      </div>
    </>
  );
}
