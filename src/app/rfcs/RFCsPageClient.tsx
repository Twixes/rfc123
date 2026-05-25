"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { RelativeTime } from "@/components/RelativeTime";
import RepoSelector from "@/components/RepoSelector";
import RFCListSkeleton from "@/components/RFCListSkeleton";
import RFCsTopBar from "@/components/RFCsTopBar";
import RFCsTopBarActions, { newRfcHref } from "@/components/RFCsTopBarActions";
import type { RepoOption, RFC } from "@/lib/github";
import {
  ALL_STATUSES,
  STATUS_BORDER_CLASSES,
  STATUS_PILL_CLASSES,
} from "@/lib/rfc-status";
import { slugify } from "@/lib/slugify";

interface RFCsPageClientProps {
  session: {
    user?: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  } | null;
  /** Null on transient GH error – we degrade by treating every RFC as
   *  someone else's. */
  viewerLogin: string | null;
}

export default function RFCsPageClient({
  session,
  viewerLogin,
}: RFCsPageClientProps) {
  const [rfcs, setRfcs] = useState<RFC[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState<RepoOption | null>(null);
  const rfcsAbortControllerRef = useRef<AbortController | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<RFC["status"]>>(
    new Set(["open"]),
  );
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
  const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false);
  const [authorSearchQuery, setAuthorSearchQuery] = useState("");
  // Server tells us via `X-RFC123-Missing-Scopes` when the user's GitHub
  // token lacks a scope we now need (read:org, for team-requested reviews).
  // We render the list in degraded mode and prompt re-auth via a banner.
  const [missingScopes, setMissingScopes] = useState<string[]>([]);
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

  // One pass over `rfcs` derives every grouping the layout needs:
  // filter-respecting buckets for rendering and unfiltered totals for
  // empty-state copy ("N hidden by filters" vs first-time nudge).
  const { mineRfcs, othersRfcs, totalMine, hasAnyOthers } = useMemo(() => {
    const mineRfcs: RFC[] = [];
    const othersRfcs: RFC[] = [];
    let totalMine = 0;
    let hasAnyOthers = false;
    for (const rfc of rfcs ?? []) {
      const isMine = !!viewerLogin && rfc.author === viewerLogin;
      if (isMine) totalMine++;
      else hasAnyOthers = true;
      if (!selectedStatuses.has(rfc.status)) continue;
      if (selectedAuthor && rfc.author !== selectedAuthor) continue;
      (isMine ? mineRfcs : othersRfcs).push(rfc);
    }
    // Author-centric ordering for "My proposals": surface RFCs that need
    // attention first, then in-progress drafts, then terminal states. Tie-
    // break by most recent activity so the freshest item is always on top
    // within its tier.
    mineRfcs.sort((a, b) => {
      const ra = myProposalRank(a);
      const rb = myProposalRank(b);
      if (ra !== rb) return ra - rb;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return { mineRfcs, othersRfcs, totalMine, hasAnyOthers };
  }, [rfcs, viewerLogin, selectedStatuses, selectedAuthor]);

  const filteredCount = mineRfcs.length + othersRfcs.length;

  function clearFilters() {
    setSelectedStatuses(new Set(ALL_STATUSES));
    setSelectedAuthor(null);
  }

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only initial load
  useEffect(() => {
    loadRFCs();
  }, []);

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
        {
          signal: controller.signal,
        },
      );
      const data: RFC[] = await response.json();
      if (controller.signal.aborted) return;
      const missingHeader = response.headers.get("X-RFC123-Missing-Scopes");
      setMissingScopes(
        missingHeader
          ? missingHeader
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      );
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
        setRfcs(
          (prev) =>
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
      <RepoSelector
        currentRepo={selectedRepo}
        label="All repositories"
        onSelect={handleRepoSelect}
        onRepoAdopted={() => loadRFCs(selectedRepo)}
      />
      {selectedRepo && (
        <button
          type="button"
          onClick={handleShowAll}
          className="text-sm text-gray-50 hover:text-foreground transition-colors"
        >
          (all)
        </button>
      )}
    </div>
  );

  return (
    <div className="mx-auto min-h-screen max-w-240 px-4 sm:px-8 py-6 sm:py-12">
      <RFCsTopBar
        user={session?.user ?? null}
        homeHref="/"
        actions={<RFCsTopBarActions repo={selectedRepo} />}
      />

      {missingScopes.length > 0 && (
        <div className="mb-6 border border-magenta/30 bg-magenta-light rounded-md px-4 py-3 text-sm text-foreground flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span>
            Your GitHub sign-in predates support for team-requested reviews.
            <br />
            <a
              href="/api/auth/signout"
              className="underline font-medium text-magenta hover:no-underline"
            >
              Log out
            </a>{" "}
            and sign back in to fix this - GitHub will ask you to grant the new
            required scope (
            <code className="font-mono text-xs">
              {missingScopes.join(", ")}
            </code>
            ).
          </span>
        </div>
      )}

      {(isLoading || (rfcs && rfcs.length > 0)) && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            {ALL_STATUSES.map((status) => {
              const isSelected = selectedStatuses.has(status);
              const colorClasses = isSelected
                ? STATUS_PILL_CLASSES[status]
                : `bg-transparent opacity-40 hover:opacity-70 ${STATUS_BORDER_CLASSES[status]}`;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatus(status)}
                  className={`border rounded-sm px-2 py-1 text-xs font-medium uppercase tracking-wider transition-all cursor-pointer text-foreground ${colorClasses}`}
                >
                  {status}
                </button>
              );
            })}
          </div>

          <div className="h-5 w-px bg-gray-20" />

          {repoSelectorElement}

          <div className="relative" ref={authorDropdownRef}>
            <button
              type="button"
              onClick={() => setAuthorDropdownOpen(!authorDropdownOpen)}
              disabled={isLoading}
              className="text-sm text-gray-50 hover:text-foreground transition-colors flex items-center gap-2 disabled:opacity-50 disabled:hover:text-gray-50 disabled:cursor-default"
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
                aria-hidden
                className={`w-4 h-4 transition-transform ${authorDropdownOpen ? "rotate-180" : ""}`}
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

          {!isLoading && rfcs && (
            <span className="text-xs text-gray-50 ml-auto tabular-nums">
              {filteredCount} of {rfcs.length}
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <RFCListSkeleton />
      ) : rfcs && rfcs.length === 0 ? (
        <EmptyRFCsState selectedRepo={selectedRepo} />
      ) : (
        <div className="space-y-10">
          {viewerLogin && (
            <RFCSection
              title="My proposals"
              rfcs={mineRfcs}
              variant="mine"
              emptyState={
                <MyProposalsEmpty
                  selectedRepo={selectedRepo}
                  hiddenByFilters={totalMine - mineRfcs.length}
                  onClearFilters={clearFilters}
                />
              }
            />
          )}
          {hasAnyOthers && (
            <RFCSection
              title="Up for my review"
              rfcs={othersRfcs}
              variant="others"
              emptyState={<HiddenByFilters onClearFilters={clearFilters} />}
            />
          )}
        </div>
      )}
    </div>
  );
}

function EmptyRFCsState({ selectedRepo }: { selectedRepo: RepoOption | null }) {
  const headline = selectedRepo
    ? `No RFCs in ${selectedRepo.owner}/${selectedRepo.name} yet`
    : "No RFCs across your RFC repos yet";
  const subtext = selectedRepo
    ? "Start one here, or pick a different repo from the dropdown above."
    : "Start one in any of your RFC repos, or use the dropdown above to add a legacy RFCs repo.";
  return (
    <div className="mt-2 rounded-md border border-dashed border-gray-20 bg-surface px-6 py-10 text-center">
      <h2 className="text-2xl font-serif font-normal text-foreground">
        {headline}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-70">{subtext}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={newRfcHref(selectedRepo)}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-surface transition-all hover:opacity-80 cursor-pointer"
        >
          Start an RFC
        </Link>
      </div>
    </div>
  );
}

function MyProposalsEmpty({
  selectedRepo,
  hiddenByFilters,
  onClearFilters,
}: {
  selectedRepo: RepoOption | null;
  hiddenByFilters: number;
  onClearFilters: () => void;
}) {
  const headline =
    hiddenByFilters > 0
      ? "Nothing matches the current filters."
      : "You haven't started an RFC yet.";
  return (
    <div className="rounded-md border border-dashed border-gray-20 bg-surface px-6 pb-6 pt-8 text-center">
      <p className="text-sm text-gray-70">{headline}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={newRfcHref(selectedRepo)}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-surface transition-all hover:opacity-80 cursor-pointer"
        >
          Start an RFC
        </Link>
        {hiddenByFilters > 0 && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-sm text-gray-70 underline decoration-cyan underline-offset-2 hover:text-foreground transition-colors cursor-pointer"
          >
            Show {hiddenByFilters} hidden by filters
          </button>
        )}
      </div>
    </div>
  );
}

function HiddenByFilters({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <div className="rounded-md border border-dashed border-gray-20 bg-surface px-6 py-6 text-center">
      <p className="text-sm text-gray-70">
        Hidden by the current filters.{" "}
        <button
          type="button"
          onClick={onClearFilters}
          className="underline decoration-cyan underline-offset-2 hover:text-foreground transition-colors cursor-pointer"
        >
          Show everything
        </button>
        .
      </p>
    </div>
  );
}

function RFCSection({
  title,
  rfcs,
  variant,
  emptyState,
}: {
  title: string;
  rfcs: RFC[];
  variant: "mine" | "others";
  emptyState?: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-2xl sm:text-3xl font-serif font-normal tracking-tight text-foreground">
          {title}
        </h2>
        {rfcs.length > 0 && (
          <span className="text-xs text-gray-50 tabular-nums">
            {rfcs.length}
          </span>
        )}
      </div>
      {rfcs.length === 0 ? (
        emptyState
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
          {rfcs.map((rfc, index) => (
            <RFCRow
              key={`${rfc.owner}/${rfc.repo}/${rfc.number}`}
              rfc={rfc}
              isFirst={index === 0}
              variant={variant}
            />
          ))}
        </motion.div>
      )}
    </section>
  );
}

function RFCRow({
  rfc,
  isFirst,
  variant,
}: {
  rfc: RFC;
  isFirst: boolean;
  variant: "mine" | "others";
}) {
  const myState = variant === "mine" ? myProposalState(rfc) : null;
  return (
    <motion.div
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
          isFirst ? "border-t border-gray-20" : ""
        } ${rfc.reviewRequested ? "bg-yellow-light" : ""}`}
      >
        <div className="flex items-start justify-between gap-4 sm:gap-6">
          <div className="flex-1 min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2 sm:gap-3">
              <h2 className="text-3xl font-medium text-foreground break-words font-serif">
                {rfc.title}
              </h2>
              {rfc.reviewRequested && (
                <span className="border border-magenta bg-magenta-light text-foreground rounded-sm px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium uppercase tracking-wider flex-shrink-0">
                  Review Requested
                </span>
              )}
              <span
                className={`border rounded-sm px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium uppercase tracking-wider flex-shrink-0 text-foreground ${
                  myState?.classes ?? STATUS_PILL_CLASSES[rfc.status]
                }`}
              >
                {myState?.label ?? rfc.status}
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
  );
}

/** Sort tier for "My proposals": lower number = higher in the list. Active
 *  RFCs first, then drafts the author still owns, then terminal states. */
function myProposalRank(rfc: RFC): number {
  if (rfc.status === "open" && !rfc.isDraft) return 0;
  if (rfc.status === "open" && rfc.isDraft) return 1;
  if (rfc.status === "merged") return 2;
  return 3; // closed (unmerged)
}

/** Author-meaningful state for the viewer's own open RFCs. Merged/closed
 *  fall through to the standard status pill. */
function myProposalState(rfc: RFC): { label: string; classes: string } | null {
  if (rfc.status !== "open") return null;
  if (rfc.isDraft) {
    return {
      label: "Draft",
      classes: "border-yellow bg-yellow-light",
    };
  }
  const hasComments =
    (rfc.inlineCommentCount ?? 0) + rfc.regularCommentCount > 0;
  if (hasComments) {
    return {
      label: "Has feedback",
      classes: "border-magenta bg-magenta-light",
    };
  }
  return { label: "Ready for review", classes: "border-cyan bg-cyan-light" };
}
