"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { ReviewerItem } from "@/components/EditableReviewers";

/** Shape returned by /api/reviewer-search. Teams come in as `org/slug`; we
 *  strip to the bare slug when storing so the GitHub request_reviewers call
 *  can pass `team_reviewers` as-is. */
interface SearchHit {
  kind: "user" | "team";
  handle: string;
  name: string | null;
  avatarUrl: string | null;
  org: string;
}

function bareTeamSlug(handle: string): string {
  return handle.includes("/") ? handle.split("/")[1] : handle;
}

interface ReviewerPickerProps {
  reviewers: ReviewerItem[];
  onChange: (next: ReviewerItem[]) => void;
  /** GitHub org to scope search to; required by /api/reviewer-search. */
  org: string;
  /** Excludes the author from suggestions; you can't request review from yourself. */
  authorLogin?: string;
}

/**
 * Multi-select picker for the create-RFC flow that searches GitHub users and
 * teams within `org` on every keystroke (debounced). Backspace on an empty
 * input removes the last chip – same affordance as GitHub's own picker.
 */
export default function ReviewerPicker({
  reviewers,
  onChange,
  org,
  authorLogin,
}: ReviewerPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Debounced unified people+teams search.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSearching(true);
      try {
        const params = new URLSearchParams({ q: query.trim(), org });
        const res = await fetch(`/api/reviewer-search?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as SearchHit[];
        if (controller.signal.aborted) return;
        setResults(data);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          console.error("Reviewer search failed", e);
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, org]);

  function addReviewer(hit: SearchHit) {
    const handle = hit.kind === "team" ? bareTeamSlug(hit.handle) : hit.handle;
    if (reviewers.some((r) => r.kind === hit.kind && r.handle === handle))
      return;
    onChange([
      ...reviewers,
      {
        kind: hit.kind,
        handle,
        displayName: hit.name ?? handle,
        avatarUrl: hit.avatarUrl,
      },
    ]);
    setQuery("");
    setResults([]);
    inputRef.current?.focus();
  }

  function removeReviewer(item: ReviewerItem) {
    onChange(
      reviewers.filter(
        (r) => !(r.kind === item.kind && r.handle === item.handle),
      ),
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && query === "" && reviewers.length > 0) {
      onChange(reviewers.slice(0, -1));
    }
  }

  const filteredResults = results.filter((hit) => {
    const handle = hit.kind === "team" ? bareTeamSlug(hit.handle) : hit.handle;
    if (reviewers.some((r) => r.kind === hit.kind && r.handle === handle))
      return false;
    if (hit.kind === "user" && handle === authorLogin) return false;
    return true;
  });

  return (
    <div className="relative" ref={containerRef}>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: clicking the wrapper focuses the search input */}
      <label className="flex flex-wrap gap-1.5 border border-gray-30 rounded-sm bg-surface px-2 py-1.5 focus-within:ring-2 focus-within:ring-cyan focus-within:border-transparent cursor-text">
        {reviewers.map((r) => (
          <ChipAvatar key={`${r.kind}:${r.handle}`}>
            <ReviewerGlyph
              kind={r.kind}
              avatarUrl={r.avatarUrl}
              alt={r.displayName}
              size="chip"
            />
            <span className="font-medium">{r.handle}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeReviewer(r);
              }}
              className="text-gray-50 hover:text-foreground transition-colors cursor-pointer"
              aria-label={`Remove ${r.displayName}`}
            >
              ×
            </button>
          </ChipAvatar>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={reviewers.length === 0 ? "Search people or teams…" : ""}
          className="flex-1 min-w-32 bg-transparent text-sm text-foreground placeholder-gray-50 focus:outline-none"
        />
      </label>

      <AnimatePresence>
        {open && query.trim().length >= 2 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-1 w-full bg-surface border border-gray-20 rounded-md z-50 max-h-72 overflow-y-auto"
          >
            {isSearching && filteredResults.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-50">
                Searching…
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-50">
                No matches
              </div>
            ) : (
              filteredResults.map((hit) => (
                <button
                  key={`${hit.kind}:${hit.handle}`}
                  type="button"
                  onClick={() => addReviewer(hit)}
                  className="w-full text-left px-3 py-2 text-sm border-b border-gray-20 last:border-b-0 hover:bg-yellow-light transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <ReviewerGlyph
                    kind={hit.kind}
                    avatarUrl={hit.avatarUrl}
                    alt={hit.name ?? hit.handle}
                    size="row"
                  />
                  <span>{hit.handle}</span>
                  {hit.name && hit.name !== hit.handle && (
                    <span className="ml-1.5 text-gray-50">{hit.name}</span>
                  )}
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChipAvatar({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 border border-gray-20 bg-gray-5 rounded-sm pl-1 pr-1.5 py-0.5 text-xs">
      {children}
    </span>
  );
}

/** Renders the avatar (user) or team icon (team) for both the chip and the
 *  dropdown row. Sizing differs between the two contexts so we toggle via the
 *  `size` prop rather than hard-coding. */
function ReviewerGlyph({
  kind,
  avatarUrl,
  alt,
  size,
}: {
  kind: "user" | "team";
  avatarUrl: string | null;
  alt: string;
  size: "chip" | "row";
}) {
  const sizeClass = size === "chip" ? "h-4 w-4" : "h-5 w-5";
  const border = size === "row" ? "border border-gray-20" : "";
  if (kind === "team") {
    return (
      <TeamIcon
        className={`${sizeClass} rounded-full bg-gray-5 p-0.5 text-gray-70 ${border}`}
      />
    );
  }
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={alt}
        className={`${sizeClass} rounded-full ${border}`}
      />
    );
  }
  return <span className={`${sizeClass} rounded-full bg-gray-10 ${border}`} />;
}

function TeamIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <title>Team</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}
