"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import AddExistingRepoModal from "@/components/AddExistingRepoModal";
import type { RepoOption } from "@/lib/github";

interface RepoSelectorProps {
  /** The repo to display in the trigger. Pass `null` to show `label`. */
  currentRepo: { owner: string; name: string } | null;
  /** Trigger text when `currentRepo` is `null` (e.g. "All repositories"). */
  label?: string;
  /** Fired when the user picks a repo from the dropdown. */
  onSelect: (repo: RepoOption) => void;
  /** Fired after a successful adopt via the inline "+ Add existing" modal. */
  onRepoAdopted?: (repo: RepoOption) => void;
  /**
   * Render the trigger as a full-width form input (border, padding) instead
   * of the compact text-link style used in the page chrome. Also widens the
   * dropdown to match and centers the open-animation origin (`top` rather
   * than `top left`) since the trigger spans the full row.
   */
  fullWidth?: boolean;
  /**
   * Placeholder for the trigger when no repo is selected AND no `label` is
   * provided. Defaults to "Choose a repository…".
   */
  placeholder?: string;
}

/**
 * Self-contained picker for adopted (`.rfc123.json`) repositories. Fetches its
 * own list from `/api/repos`, renders the dropdown with search, and hosts the
 * "+ Add existing RFCs repo" flow inline – picking the action opens an embedded
 * `AddExistingRepoModal`, and on a successful adopt the new repo is folded into
 * the in-memory list immediately so the parent doesn't have to re-fetch.
 *
 * Two visual modes via `fullWidth`: the compact text-link trigger (default,
 * used in the `/rfcs` chrome) and a full-row form-input trigger (used on the
 * Create RFC page where the picker sits inside a form layout).
 */
export default function RepoSelector({
  currentRepo,
  label,
  onSelect,
  onRepoAdopted,
  fullWidth = false,
  placeholder = "Choose a repository…",
}: RepoSelectorProps) {
  const [availableRepos, setAvailableRepos] = useState<RepoOption[] | null>(
    null,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [addRepoOpen, setAddRepoOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Tracks optimistic inserts (just-adopted repos) so a /api/repos response
  // issued *before* the adopt commit can't overwrite them when it resolves
  // afterwards (GitHub's GraphQL view of HEAD:.rfc123.json may not reflect
  // the new commit yet by the time the request returns).
  const optimisticReposRef = useRef<RepoOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/repos");
        if (!res.ok) return;
        const data: RepoOption[] = await res.json();
        if (cancelled) return;
        const optimistic = optimisticReposRef.current;
        if (optimistic.length === 0) {
          setAvailableRepos(data);
          return;
        }
        const present = new Set(data.map((r) => r.fullName));
        setAvailableRepos([
          ...data,
          ...optimistic.filter((r) => !present.has(r.fullName)),
        ]);
      } catch (e) {
        console.error("Failed to load RFC repos", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      inputRef.current?.focus();
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const filteredRepos = (availableRepos ?? []).filter((repo) =>
    repo.fullName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  function handleAdopted(repo: {
    owner: string;
    name: string;
    fullName: string;
  }) {
    // Newly adopted repos are guaranteed writable (we just committed to them),
    // so `canPush: true` is a safe assumption that avoids waiting on the next
    // `/api/repos` fetch to learn it.
    const enriched: RepoOption = { ...repo, canPush: true };
    optimisticReposRef.current = [
      ...optimisticReposRef.current.filter(
        (r) => r.fullName !== enriched.fullName,
      ),
      enriched,
    ];
    setAvailableRepos((prev) => {
      if (!prev) return [enriched];
      if (prev.some((r) => r.fullName === enriched.fullName)) return prev;
      return [...prev, enriched];
    });
    onRepoAdopted?.(enriched);
  }

  const triggerLabel = currentRepo
    ? `${currentRepo.owner}/${currentRepo.name}`
    : (label ?? placeholder);

  const chevron = (
    <svg
      className={`w-4 h-4 transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <title>Toggle</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );

  const trigger = fullWidth ? (
    <button
      type="button"
      onClick={() => setIsOpen((v) => !v)}
      className="w-full flex items-center justify-between gap-2 border border-gray-30 rounded-sm bg-surface px-3 py-2 text-sm text-foreground hover:border-gray-40 transition-colors cursor-pointer"
    >
      <span className={currentRepo ? "" : "text-gray-50"}>{triggerLabel}</span>
      {chevron}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className="text-sm font-medium text-gray-50 hover:text-foreground transition-colors flex items-center gap-2"
    >
      {triggerLabel}
      {chevron}
    </button>
  );

  return (
    <div className={`relative ${fullWidth ? "w-full" : ""}`} ref={dropdownRef}>
      {trigger}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{ transformOrigin: fullWidth ? "top" : "top left" }}
            className={`absolute top-full left-0 mt-1 bg-surface border border-gray-20 rounded-md z-50 ${
              fullWidth ? "w-full" : "w-80"
            }`}
          >
            <div className="p-3 border-b border-gray-20">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border border-gray-30 rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent"
              />
            </div>

            <div className="max-h-80 overflow-y-auto">
              {availableRepos === null ? (
                <div className="p-4 text-center text-sm text-gray-50">
                  Loading…
                </div>
              ) : filteredRepos.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-50">
                  {searchQuery ? "No repositories match." : "No RFC repos yet."}
                </div>
              ) : (
                filteredRepos.map((repo) => {
                  const isCurrent =
                    currentRepo?.owner === repo.owner &&
                    currentRepo?.name === repo.name;
                  return (
                    <button
                      key={repo.fullName}
                      type="button"
                      disabled={!repo.canPush && fullWidth}
                      onClick={() => {
                        if (fullWidth && !repo.canPush) return;
                        onSelect(repo);
                        setIsOpen(false);
                        setSearchQuery("");
                      }}
                      className={`w-full text-left px-4 py-3 text-sm border-b border-gray-20 last:border-b-0 transition-colors flex items-center justify-between gap-2 ${
                        isCurrent ? "bg-gray-5 font-medium" : ""
                      } ${
                        fullWidth && !repo.canPush
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:bg-yellow-light cursor-pointer"
                      }`}
                    >
                      <span className="truncate">{repo.fullName}</span>
                      {fullWidth && !repo.canPush && (
                        <span className="shrink-0 text-[10px] uppercase tracking-wider text-gray-50">
                          read only
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setSearchQuery("");
                setAddRepoOpen(true);
              }}
              className="w-full text-left px-4 py-2.5 text-sm border-t border-gray-20 text-gray-50 hover:bg-yellow-light hover:text-foreground transition-colors flex items-center gap-2"
            >
              <span aria-hidden className="text-base leading-none">
                +
              </span>
              Add existing RFCs repo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {addRepoOpen && (
        <AddExistingRepoModal
          open={addRepoOpen}
          onClose={() => setAddRepoOpen(false)}
          onAdopted={handleAdopted}
        />
      )}
    </div>
  );
}
