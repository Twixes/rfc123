"use client";

import { useEffect, useRef, useState } from "react";

export interface ReviewerItem {
  kind: "user" | "team";
  /** GitHub login (users) or bare team slug (teams – we strip the `org/` prefix
   *  for storage so the request_reviewers call can pass it as-is). */
  handle: string;
  /** Display name (users: profile name or login; teams: team name or slug). */
  displayName: string;
  avatarUrl: string | null;
}

interface SearchHit {
  kind: "user" | "team";
  handle: string;
  name: string | null;
  avatarUrl: string | null;
  org: string;
}

/** Search results return team handles as `org/slug`; the request_reviewers API
 *  wants the bare slug. Centralized so the separator is in one place. */
function bareTeamSlug(handle: string): string {
  return handle.includes("/") ? handle.split("/")[1] : handle;
}

interface EditableReviewersProps {
  /** Current reviewers; the row renders them in this order. */
  items: ReviewerItem[];
  /** GitHub org to scope the picker search to (matches the RFC's repo owner). */
  org: string;
  /** Fires when the user adds or removes a reviewer. Should make the API call
   *  and update `items` (parent owns the state). */
  onChange: (next: ReviewerItem[]) => void;
  /** Greys out the row while a save is in flight. */
  saving?: boolean;
  /** Hide the "+ Add" affordance and per-chip × for non-authors. */
  readOnly?: boolean;
}

/**
 * Reviewers row that doubles as an editor for the RFC's author. Each chip
 * exposes a quick-remove × on hover; a trailing "+" chip opens an inline
 * popover with a unified user+team search. The display IS the editor – no
 * separate modal, no "Edit" mode toggle.
 *
 * Teams are searched alongside users (via `/api/reviewer-search`) and shown
 * with a small group icon instead of an avatar. GitHub validates repo access
 * at submit time – mismatches surface as a normal save error.
 */
export function EditableReviewers({
  items,
  org,
  onChange,
  saving,
  readOnly,
}: EditableReviewersProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
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
        setPickerOpen(false);
        setQuery("");
        setResults([]);
      }
    }
    if (pickerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      inputRef.current?.focus();
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const handle = setTimeout(async () => {
      // Set the spinner only when we actually start the request, so
      // each keystroke doesn't flash "Searching…" during the debounce.
      setIsSearching(true);
      try {
        const params = new URLSearchParams({ q: trimmed, org });
        const res = await fetch(`/api/reviewer-search?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as SearchHit[];
        if (!controller.signal.aborted) {
          setResults(data);
          setIsSearching(false);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setIsSearching(false);
      }
    }, 200);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, pickerOpen, org]);

  function addReviewer(hit: SearchHit) {
    const handle = hit.kind === "team" ? bareTeamSlug(hit.handle) : hit.handle;
    if (items.some((r) => r.kind === hit.kind && r.handle === handle)) return;
    onChange([
      ...items,
      {
        kind: hit.kind,
        handle,
        displayName: hit.name ?? handle,
        avatarUrl: hit.avatarUrl,
      },
    ]);
    setQuery("");
    setResults([]);
    setPickerOpen(false);
  }

  function removeReviewer(item: ReviewerItem) {
    onChange(
      items.filter((r) => !(r.kind === item.kind && r.handle === item.handle)),
    );
  }

  const filteredResults = results.filter(
    (r) =>
      !items.some(
        (i) =>
          i.kind === r.kind &&
          i.handle === (r.kind === "team" ? bareTeamSlug(r.handle) : r.handle),
      ),
  );

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center gap-1 ${saving ? "opacity-60" : ""}`}
    >
      {items.map((item) => (
        <ReviewerChip
          key={`${item.kind}:${item.handle}`}
          item={item}
          onRemove={readOnly ? undefined : () => removeReviewer(item)}
        />
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          aria-label="Add reviewer"
          className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-gray-30 text-gray-50 hover:border-gray-50 hover:text-foreground transition-colors cursor-pointer"
        >
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden
          >
            <title>Add reviewer</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M12 5v14m-7-7h14"
            />
          </svg>
        </button>
      )}
      {pickerOpen && (
        <div className="absolute left-0 top-7 z-50 w-64 rounded-md border border-gray-20 bg-surface shadow-md">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people or teams…"
            className="block w-full border-b border-gray-20 bg-transparent px-3 py-2 text-sm focus:outline-none"
          />
          <div className="max-h-64 overflow-y-auto py-1">
            {query.trim().length < 2 ? (
              <p className="px-3 py-2 text-xs text-gray-50">
                Type at least two characters to search.
              </p>
            ) : isSearching ? (
              <p className="px-3 py-2 text-xs text-gray-50">Searching…</p>
            ) : filteredResults.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-50">No matches.</p>
            ) : (
              filteredResults.map((hit) => (
                <button
                  key={`${hit.kind}:${hit.handle}`}
                  type="button"
                  onClick={() => addReviewer(hit)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left text-foreground hover:bg-gray-5 cursor-pointer"
                >
                  <ReviewerAvatar
                    kind={hit.kind}
                    avatarUrl={hit.avatarUrl}
                    alt=""
                    className="shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {hit.handle}
                    {hit.name && hit.name !== hit.handle && (
                      <span className="ml-1.5 text-gray-50">{hit.name}</span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewerChip({
  item,
  onRemove,
}: {
  item: ReviewerItem;
  onRemove?: () => void;
}) {
  return (
    <span className="group relative inline-flex" title={item.displayName}>
      <ReviewerAvatar
        kind={item.kind}
        avatarUrl={item.avatarUrl}
        alt={item.displayName}
        className="border border-gray-20"
      />
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.displayName}`}
          className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-foreground text-surface group-hover:flex hover:scale-110 transition-transform cursor-pointer"
        >
          <svg
            className="h-2 w-2"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden
          >
            <title>Remove</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </span>
  );
}

function ReviewerAvatar({
  kind,
  avatarUrl,
  alt,
  className = "",
}: {
  kind: "user" | "team";
  avatarUrl: string | null;
  alt: string;
  className?: string;
}) {
  if (kind === "team") {
    return (
      <TeamIcon
        className={`h-5 w-5 rounded-full bg-gray-5 p-0.5 text-gray-70 ${className}`}
      />
    );
  }
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={alt}
        className={`h-5 w-5 rounded-full ${className}`}
      />
    );
  }
  return <span className={`h-5 w-5 rounded-full bg-gray-10 ${className}`} />;
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
