"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { RFC, RepoOption } from "@/lib/github";
import RFCListSkeleton from "@/components/RFCListSkeleton";
import RepoSelector from "@/components/RepoSelector";

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

  async function loadRFCs(repo?: RepoOption | null) {
    // Abort any in-flight request
    rfcsAbortControllerRef.current?.abort();
    const controller = new AbortController();
    rfcsAbortControllerRef.current = controller;

    setIsLoading(true);
    try {
      const params = repo
        ? `?owner=${encodeURIComponent(repo.owner)}&repo=${encodeURIComponent(repo.name)}`
        : "";
      const response = await fetch(`/api/rfcs${params}`, {
        signal: controller.signal,
      });
      const data = await response.json();
      setRfcs(data);
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
    loadRFCs(repo);
  }

  function handleShowAll() {
    setSelectedRepo(null);
    loadRFCs(null);
  }

  const repoSelectorElement = availableRepos &&
    availableRepos.length > 0 && (
      <div className="flex items-center gap-2">
        {selectedRepo ? (
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
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-50">
              All repositories
            </span>
            <RepoSelector
              currentRepo={{ owner: "", name: "Filter..." }}
              availableRepos={availableRepos}
              onSelect={handleRepoSelect}
            />
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
        <div className="flex items-center gap-3 sm:gap-4">
          {session?.user?.image && (
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full overflow-hidden border border-gray-20">
              <img
                src={session.user.image}
                alt={session.user.name || "User"}
                className="h-full w-full"
              />
            </div>
          )}
          <a
            href="/api/auth/signout"
            className="rounded-md border border-gray-20 bg-surface px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-foreground transition-all hover:bg-gray-5 inline-block"
          >
            Log out
          </a>
        </div>
      </header>

      {isLoading ? (
        <RFCListSkeleton />
      ) : (
        <div className="space-y-0">
          {rfcs?.map((rfc, index) => (
            <Link
              key={`${rfc.owner}/${rfc.repo}/${rfc.number}`}
              href={`/rfcs/${rfc.owner}/${rfc.repo}/${rfc.number}`}
              className="group block border-b border-gray-20 px-4 sm:px-6 py-4 sm:py-5 transition-all hover:bg-gray-5"
              style={{
                borderTop: index === 0 ? "1px solid var(--gray-20)" : "none",
                backgroundColor: rfc.reviewRequested
                  ? "var(--yellow-light)"
                  : undefined,
              }}
            >
              <div className="flex items-start justify-between gap-4 sm:gap-6">
                <div className="flex-1 min-w-0">
                  <div className="mb-2 flex flex-wrap items-baseline gap-2 sm:gap-3">
                    <h2 className="text-base sm:text-xl font-medium text-foreground break-words font-sans">
                      {rfc.title}
                    </h2>
                    {rfc.reviewRequested && (
                      <span
                        className="border rounded-sm px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium uppercase tracking-wider flex-shrink-0"
                        style={{
                          borderColor: "var(--magenta)",
                          backgroundColor: "var(--magenta-light)",
                          color: "var(--foreground)",
                        }}
                      >
                        Review Requested
                      </span>
                    )}
                    <span
                      className="border rounded-sm px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium uppercase tracking-wider flex-shrink-0"
                      style={{
                        borderColor:
                          rfc.status === "open"
                            ? "var(--cyan)"
                            : rfc.status === "merged"
                              ? "var(--yellow)"
                              : "var(--gray-30)",
                        backgroundColor:
                          rfc.status === "open"
                            ? "var(--cyan-light)"
                            : rfc.status === "merged"
                              ? "var(--yellow-light)"
                              : "var(--gray-5)",
                        color: "var(--foreground)",
                      }}
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
                      {new Date(rfc.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {rfc.inlineCommentCount > 0 && (
                      <span className="border-l border-gray-30 pl-2 sm:pl-4">
                        {rfc.inlineCommentCount} inline
                      </span>
                    )}
                    {rfc.regularCommentCount > 0 && (
                      <span className="border-l border-gray-30 pl-2 sm:pl-4">
                        {rfc.regularCommentCount} general
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
