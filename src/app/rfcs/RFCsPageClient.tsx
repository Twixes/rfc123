"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import type { RFC, RepoOption } from "@/lib/github";
import RFCListSkeleton from "@/components/RFCListSkeleton";
import { RelativeTime } from "@/components/RelativeTime";
import { slugify } from "@/lib/slugify";
import RepoSelector from "@/components/RepoSelector";
import AccountDropdown from "@/components/AccountDropdown";

interface RFCsPageClientProps {
  session: {
    user?: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  } | null;
}

export default function RFCsPageClient({ session }: RFCsPageClientProps) {
  const [rfcs, setRfcs] = useState<RFC[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [availableRepos, setAvailableRepos] = useState<RepoOption[] | null>(
    null,
  );
  const [selectedRepo, setSelectedRepo] = useState<RepoOption | null>(null);
  const rfcsAbortControllerRef = useRef<AbortController | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<
    Set<RFC["status"]>
  >(new Set(["open"]));
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
  const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false);
  const [authorSearchQuery, setAuthorSearchQuery] = useState("");
  const authorDropdownRef = useRef<HTMLDivElement>(null);
  const authorInputRef = useRef<HTMLInputElement>(null);

  const authors = useMemo(() => {
    if (!rfcs) return [];
    const map = new Map<string, string>();
    for (const rfc of rfcs) {
      if (!map.has(rfc.author)) map.set(rfc.author, rfc.authorAvatar);
    }
    return Array.from(map.entries())
      .map(([login, avatar]) => ({ login, avatar }))
      .sort((a, b) => a.login.localeCompare(b.login));
  }, [rfcs]);

  const filteredRfcs = useMemo(() => {
    if (!rfcs) return null;
    return rfcs.filter((rfc) => {
      if (!selectedStatuses.has(rfc.status)) return false;
      if (selectedAuthor && rfc.author !== selectedAuthor) return false;
      return true;
    });
  }, [rfcs, selectedStatuses, selectedAuthor]);

  function toggleStatus(status: RFC["status"]) {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        if (next.size > 1) next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        authorDropdownRef.current &&
        !authorDropdownRef.current.contains(event.target as Node)
      ) {
        setAuthorDropdownOpen(false);
        setAuthorSearchQuery("");
      }
    }
    if (authorDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      authorInputRef.current?.focus();
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [authorDropdownOpen]);

  useEffect(() => {
    loadRepos();
    loadRFCs();
  }, []);

  async function loadRepos() {
    try {
      const response = await fetch("/api/repos");
      const data = await response.json();
      setAvailableRepos(data);
    } catch (error) {
      console.error("Error loading repos:", error);
    }
  }

  function repoQueryParams(repo?: RepoOption | null): string {
    return repo
      ? `owner=${encodeURIComponent(repo.owner)}&repo=${encodeURIComponent(repo.name)}`
      : "";
  }

  async function loadRFCs(repo?: RepoOption | null) {
    rfcsAbortControllerRef.current?.abort();
    const controller = new AbortController();
    rfcsAbortControllerRef.current = controller;

    setIsLoading(true);
    try {
      const repoParams = repoQueryParams(repo);
      const response = await fetch(
        `/api/rfcs${repoParams ? `?${repoParams}` : ""}`,
        { signal: controller.signal },
      );
      const data: RFC[] = await response.json();
      if (controller.signal.aborted) return;
      setRfcs(data);
      setIsLoading(false);

      // Resolve any missing inline comment counts per repo
      const missingByRepo = new Map<string, number[]>();
      for (const rfc of data) {
        if (rfc.inlineCommentCount === null) {
          const key = `${rfc.owner}/${rfc.repo}`;
          const list = missingByRepo.get(key);
          if (list) {
            list.push(rfc.number);
          } else {
            missingByRepo.set(key, [rfc.number]);
          }
        }
      }

      if (missingByRepo.size > 0) {
        const countEntries = await Promise.all(
          Array.from(missingByRepo.entries()).map(async ([key, numbers]) => {
            const [owner, repo] = key.split("/");
            const params = new URLSearchParams({
              owner,
              repo,
              numbers: numbers.join(","),
            });
            const res = await fetch(`/api/rfcs/comment-counts?${params}`, {
              signal: controller.signal,
            });
            return (await res.json()) as Record<string, number>;
          }),
        );
        if (controller.signal.aborted) return;

        const allCounts = Object.assign({}, ...countEntries) as Record<
          string,
          number
        >;
        setRfcs((prev) =>
          prev?.map((rfc) => {
            const count = allCounts[rfc.number];
            if (count !== undefined && rfc.inlineCommentCount === null) {
              return {
                ...rfc,
                inlineCommentCount: count,
                commentCount: count + rfc.regularCommentCount,
              };
            }
            return rfc;
          }) ?? null,
        );
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      console.error("Error loading RFCs:", error);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }

  function handleRepoSelect(repo: RepoOption) {
    setSelectedRepo(repo);
    setSelectedAuthor(null);
    loadRFCs(repo);
  }

  function handleShowAll() {
    setSelectedRepo(null);
    setSelectedAuthor(null);
    loadRFCs(null);
  }

  const repoSelectorElement = (
    <div className="flex items-center gap-2">
      {availableRepos && availableRepos.length > 0 ? (
        selectedRepo ? (
          <>
            <RepoSelector
              currentRepo={selectedRepo}
              availableRepos={availableRepos}
              onSelect={handleRepoSelect}
            />
            <button
              type="button"
              onClick={handleShowAll}
              className="text-sm text-gray-50 hover:text-foreground transition-colors"
            >
              (all)
            </button>
          </>
        ) : (
          <RepoSelector
            currentRepo={{ owner: "", name: "" }}
            label="All repositories"
            availableRepos={availableRepos}
            onSelect={handleRepoSelect}
          />
        )
      ) : (
        <div
          className="text-sm font-medium text-gray-50 flex items-center gap-2"
          aria-hidden
        >
          All repositories
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <title>Dropdown</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto min-h-screen max-w-240 px-4 sm:px-8 py-6 sm:py-12">
      <header className="mb-8 sm:mb-12 flex flex-col sm:flex-row items-start sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-5xl font-serif font-normal text-foreground">
            <Link href="/" className="hover:opacity-70 transition-opacity">
              RFC123
            </Link>
          </h1>
          <div className="mt-3">{repoSelectorElement}</div>
        </div>
        {session?.user && (
          <AccountDropdown user={session.user} />
        )}
      </header>

      {!isLoading && rfcs && rfcs.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            {(["open", "merged", "closed"] as const).map((status) => {
              const isSelected = selectedStatuses.has(status);
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatus(status)}
                  className={`border rounded-sm px-2 py-1 text-xs font-medium uppercase tracking-wider transition-all cursor-pointer text-foreground ${
                    isSelected
                      ? status === "open"
                        ? "border-cyan bg-cyan-light"
                        : status === "merged"
                          ? "border-yellow bg-yellow-light"
                          : "border-gray-30 bg-gray-5"
                      : "bg-transparent opacity-40 hover:opacity-70 " +
                        (status === "open"
                          ? "border-cyan"
                          : status === "merged"
                            ? "border-yellow"
                            : "border-gray-30")
                  }`}
                >
                  {status}
                </button>
              );
            })}
          </div>

          <div className="h-5 w-px bg-gray-20" />

          <div className="relative" ref={authorDropdownRef}>
            <button
              type="button"
              onClick={() => setAuthorDropdownOpen(!authorDropdownOpen)}
              className="text-sm text-gray-50 hover:text-foreground transition-colors flex items-center gap-2"
            >
              {selectedAuthor ? (
                <span className="flex items-center gap-1.5">
                  <img
                    src={
                      authors.find((a) => a.login === selectedAuthor)?.avatar
                    }
                    alt={selectedAuthor}
                    className="h-4 w-4 rounded-full border border-gray-20"
                  />
                  {selectedAuthor}
                </span>
              ) : (
                "All authors"
              )}
              <svg
                className={`w-4 h-4 transition-transform ${authorDropdownOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            <AnimatePresence>
              {authorDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 mt-2 w-64 bg-surface border border-gray-20 rounded-md z-50"
                >
                  {authors.length > 5 && (
                    <div className="p-3 border-b border-gray-20">
                      <input
                        ref={authorInputRef}
                        type="text"
                        placeholder="Search authors..."
                        value={authorSearchQuery}
                        onChange={(e) => setAuthorSearchQuery(e.target.value)}
                        className="w-full border border-gray-30 rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent"
                      />
                    </div>
                  )}
                  <div className="max-h-64 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAuthor(null);
                        setAuthorDropdownOpen(false);
                        setAuthorSearchQuery("");
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-20 hover:bg-yellow-light transition-colors ${
                        !selectedAuthor ? "bg-gray-5 font-medium" : ""
                      }`}
                    >
                      All authors
                    </button>
                    {authors
                      .filter((a) =>
                        a.login
                          .toLowerCase()
                          .includes(authorSearchQuery.toLowerCase()),
                      )
                      .map((author) => (
                        <button
                          key={author.login}
                          type="button"
                          onClick={() => {
                            setSelectedAuthor(author.login);
                            setAuthorDropdownOpen(false);
                            setAuthorSearchQuery("");
                          }}
                          className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-20 last:border-b-0 hover:bg-yellow-light transition-colors flex items-center gap-2 ${
                            selectedAuthor === author.login
                              ? "bg-gray-5 font-medium"
                              : ""
                          }`}
                        >
                          <img
                            src={author.avatar}
                            alt={author.login}
                            className="h-5 w-5 rounded-full border border-gray-20"
                          />
                          {author.login}
                        </button>
                      ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {selectedAuthor && (
            <button
              type="button"
              onClick={() => setSelectedAuthor(null)}
              className="text-sm text-gray-50 hover:text-foreground transition-colors"
            >
              (clear)
            </button>
          )}

          <span className="text-xs text-gray-50 ml-auto tabular-nums">
            {filteredRfcs?.length} of {rfcs.length}
          </span>
        </div>
      )}

      {isLoading ? (
        <RFCListSkeleton />
      ) : (
        <motion.div
          className="space-y-0"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.04 } },
            hidden: {},
          }}
        >
          {filteredRfcs?.map((rfc, index) => (
            <motion.div
              key={`${rfc.owner}/${rfc.repo}/${rfc.number}`}
              variants={{
                visible: { opacity: 1, y: 0 },
                hidden: { opacity: 0, y: 8 },
              }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              whileHover={{ scale: 1.002 }}
            >
              <Link
                href={`/rfcs/${rfc.owner}/${rfc.repo}/${rfc.number}/${slugify(rfc.title)}`}
                className={`group block border-b border-gray-20 px-4 sm:px-6 py-4 sm:py-5 transition-all hover:bg-gray-5 ${
                  index === 0 ? "border-t border-gray-20" : ""
                } ${rfc.reviewRequested ? "bg-yellow-light" : ""}`}
              >
              <div className="flex items-start justify-between gap-4 sm:gap-6">
                <div className="flex-1 min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2 sm:gap-3">
                    <h2 className="text-2xl font-medium text-foreground break-words font-serif">
                      {rfc.title}
                    </h2>
                    {rfc.reviewRequested && (
                      <span
                        className="border border-magenta bg-magenta-light text-foreground rounded-sm px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium uppercase tracking-wider flex-shrink-0"
                      >
                        Review Requested
                      </span>
                    )}
                    <span
                      className={`border rounded-sm px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium uppercase tracking-wider flex-shrink-0 text-foreground ${
                        rfc.status === "open"
                          ? "border-cyan bg-cyan-light"
                          : rfc.status === "merged"
                            ? "border-yellow bg-yellow-light"
                            : "border-gray-30 bg-gray-5"
                      }`}
                    >
                      {rfc.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-gray-50">
                    <span className="font-medium">
                      {rfc.owner}/{rfc.repo}
                    </span>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <div className="h-4 w-4 sm:h-5 sm:w-5 rounded-full overflow-hidden border border-gray-20">
                        <img
                          src={rfc.authorAvatar}
                          alt={rfc.author}
                          className="h-full w-full"
                        />
                      </div>
                      <span className="truncate max-w-24 sm:max-w-none">
                        {rfc.author}
                      </span>
                    </div>
                    <span>#{rfc.number}</span>
                    <span className="hidden sm:inline">
                      <RelativeTime date={rfc.createdAt} />
                    </span>
                    {rfc.inlineCommentCount === null ? (
                      <span className="border-l border-gray-30 pl-2 sm:pl-4">
                        <span className="inline-block h-3 w-16 animate-pulse rounded bg-gray-20" />
                      </span>
                    ) : rfc.inlineCommentCount > 0 ? (
                      <span className="border-l border-gray-30 pl-2 sm:pl-4">
                        {rfc.inlineCommentCount} inline
                      </span>
                    ) : null}
                    {rfc.regularCommentCount > 0 && (
                      <span className="border-l border-gray-30 pl-2 sm:pl-4">
                        {rfc.regularCommentCount} general
                      </span>
                    )}
                  </div>
                </div>
              </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
