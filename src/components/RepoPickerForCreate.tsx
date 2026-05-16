"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WritableRepo } from "@/lib/github";

interface RepoPickerForCreateProps {
  repos: WritableRepo[] | null;
  selected: WritableRepo | null;
  onSelect: (repo: WritableRepo) => void;
}

/**
 * Dropdown that lists writable repos, grouping RFC-experienced repos first and
 * marking read-only repos as disabled. Used on /rfcs/new. Separate from
 * RepoSelector because the data shape and the "new repo" guidance differ.
 */
export default function RepoPickerForCreate({
  repos,
  selected,
  onSelect,
}: RepoPickerForCreateProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { rfcRepos, otherRepos } = useMemo(() => {
    const filtered =
      repos?.filter((r) =>
        r.fullName.toLowerCase().includes(query.toLowerCase()),
      ) ?? [];
    return {
      rfcRepos: filtered.filter((r) => r.hasRFCs),
      otherRepos: filtered.filter((r) => !r.hasRFCs),
    };
  }, [repos, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      inputRef.current?.focus();
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 border border-gray-30 rounded-sm bg-surface px-3 py-2 text-sm text-foreground hover:border-gray-40 transition-colors cursor-pointer"
      >
        <span className={selected ? "" : "text-gray-50"}>
          {selected ? (
            <span className="flex items-center gap-2">
              <span>{selected.fullName}</span>
              {!selected.canPush && (
                <span className="border border-gray-30 bg-gray-5 text-gray-70 rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                  Read only
                </span>
              )}
            </span>
          ) : (
            "Choose a repository…"
          )}
        </span>
        <svg
          className={`w-4 h-4 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <title>Toggle</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 w-full bg-surface border border-gray-20 rounded-md z-50"
          >
            <div className="p-3 border-b border-gray-20">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search repositories…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full border border-gray-30 rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent"
              />
            </div>

            <div className="max-h-80 overflow-y-auto">
              {repos === null ? (
                <div className="p-4 text-center text-sm text-gray-50">
                  Loading…
                </div>
              ) : rfcRepos.length === 0 && otherRepos.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-50">
                  No repositories found
                </div>
              ) : (
                <>
                  {rfcRepos.length > 0 && (
                    <RepoSection
                      title="Your RFC repositories"
                      repos={rfcRepos}
                      selectedFullName={selected?.fullName}
                      onSelect={(r) => {
                        onSelect(r);
                        setOpen(false);
                        setQuery("");
                      }}
                    />
                  )}
                  {otherRepos.length > 0 && (
                    <RepoSection
                      title="Other repositories"
                      repos={otherRepos}
                      selectedFullName={selected?.fullName}
                      onSelect={(r) => {
                        onSelect(r);
                        setOpen(false);
                        setQuery("");
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RepoSection({
  title,
  repos,
  selectedFullName,
  onSelect,
}: {
  title: string;
  repos: WritableRepo[];
  selectedFullName?: string;
  onSelect: (r: WritableRepo) => void;
}) {
  return (
    <div>
      <div className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-gray-50">
        {title}
      </div>
      {repos.map((repo) => (
        <button
          key={repo.fullName}
          type="button"
          disabled={!repo.canPush}
          onClick={() => repo.canPush && onSelect(repo)}
          className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-20 last:border-b-0 transition-colors flex items-center justify-between gap-2 ${
            repo.fullName === selectedFullName ? "bg-gray-5 font-medium" : ""
          } ${repo.canPush ? "hover:bg-yellow-light cursor-pointer" : "opacity-50 cursor-not-allowed"}`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate">{repo.fullName}</span>
            {repo.isOrg && (
              <span className="border border-gray-30 bg-gray-5 text-gray-70 rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider shrink-0">
                org
              </span>
            )}
          </span>
          {!repo.canPush && (
            <span className="text-[10px] text-gray-50 shrink-0 uppercase tracking-wider">
              read only
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
