"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

export interface Reviewer {
  login: string;
  avatarUrl: string;
}

interface ReviewerPickerProps {
  reviewers: Reviewer[];
  onChange: (next: Reviewer[]) => void;
  /** Excludes the author from suggestions; you can't request review from yourself. */
  authorLogin?: string;
}

/**
 * Multi-select picker that searches GitHub users on every keystroke (debounced)
 * and adds them as avatar chips. Backspace on an empty input removes the last
 * chip — same affordance as GitHub's own reviewer picker.
 */
export default function ReviewerPicker({
  reviewers,
  onChange,
  authorLogin,
}: ReviewerPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Reviewer[]>([]);
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

  // Debounced GitHub user search.
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
        const res = await fetch(
          `/api/user-search?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data: Reviewer[] = await res.json();
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
  }, [query]);

  function addReviewer(r: Reviewer) {
    if (reviewers.some((existing) => existing.login === r.login)) return;
    onChange([...reviewers, r]);
    setQuery("");
    setResults([]);
    inputRef.current?.focus();
  }

  function removeReviewer(login: string) {
    onChange(reviewers.filter((r) => r.login !== login));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && query === "" && reviewers.length > 0) {
      onChange(reviewers.slice(0, -1));
    }
  }

  const filteredResults = results.filter(
    (r) =>
      !reviewers.some((existing) => existing.login === r.login) &&
      r.login !== authorLogin,
  );

  return (
    <div className="relative" ref={containerRef}>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: clicking the wrapper focuses the search input */}
      <label className="flex flex-wrap gap-1.5 border border-gray-30 rounded-sm bg-surface px-2 py-1.5 focus-within:ring-2 focus-within:ring-cyan focus-within:border-transparent cursor-text">
        {reviewers.map((r) => (
          <span
            key={r.login}
            className="flex items-center gap-1.5 border border-gray-20 bg-gray-5 rounded-sm pl-1 pr-1.5 py-0.5 text-xs"
          >
            <img
              src={r.avatarUrl}
              alt={r.login}
              className="h-4 w-4 rounded-full"
            />
            <span className="font-medium">{r.login}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeReviewer(r.login);
              }}
              className="text-gray-50 hover:text-foreground transition-colors cursor-pointer"
              aria-label={`Remove ${r.login}`}
            >
              ×
            </button>
          </span>
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
          placeholder={reviewers.length === 0 ? "Search GitHub users…" : ""}
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
            className="absolute top-full left-0 mt-2 w-full bg-surface border border-gray-20 rounded-md z-50 max-h-72 overflow-y-auto"
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
              filteredResults.map((r) => (
                <button
                  key={r.login}
                  type="button"
                  onClick={() => addReviewer(r)}
                  className="w-full text-left px-3 py-2 text-sm border-b border-gray-20 last:border-b-0 hover:bg-yellow-light transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <img
                    src={r.avatarUrl}
                    alt={r.login}
                    className="h-5 w-5 rounded-full border border-gray-20"
                  />
                  <span>{r.login}</span>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
