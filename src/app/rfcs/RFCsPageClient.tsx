"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { RFC, RepoOption } from "@/lib/github";
import RepoSelectorEmptyState from "@/components/RepoSelectorEmptyState";
import RepoSelector from "@/components/RepoSelector";
import RFCListSkeleton from "@/components/RFCListSkeleton";

interface RFCsPageClientProps {
  availableRepos: RepoOption[];
  session: {
    user?: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  } | null;
}

const REPO_STORAGE_KEY = "selected_repo";

export default function RFCsPageClient({
  availableRepos,
  session,
}: RFCsPageClientProps) {
  const [selectedRepo, setSelectedRepo] = useState<{
    owner: string;
    name: string;
  } | null>(null);
  const [rfcs, setRfcs] = useState<RFC[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedRepo = localStorage.getItem(REPO_STORAGE_KEY);
    if (storedRepo) {
      const repo = JSON.parse(storedRepo);
      setSelectedRepo(repo);
      loadRFCs(repo.owner, repo.name);
    } else {
      setIsLoading(false);
    }
  }, []);

  async function loadRFCs(owner: string, name: string) {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/rfcs?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`,
      );
      const data = await response.json();
      setRfcs(data);
    } catch (error) {
      console.error("Error loading RFCs:", error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleRepoSelect(repo: RepoOption) {
    const repoData = { owner: repo.owner, name: repo.name };
    localStorage.setItem(REPO_STORAGE_KEY, JSON.stringify(repoData));
    setSelectedRepo(repoData);
    loadRFCs(repo.owner, repo.name);
  }

  if (isLoading) {
    return (
      <div className="mx-auto min-h-screen max-w-240 px-8 py-12">
        <header className="mb-12 flex items-start justify-between">
          <div>
            <h1 className="text-5xl font-bold uppercase tracking-tight text-black">
              <Link href="/" className="hover:underline">
                RFC123
              </Link>
            </h1>
            <div className="mt-3 h-5 w-48 animate-pulse bg-gray-20" />
          </div>
          <div className="flex items-center gap-4">
            {session?.user?.image && (
              <div className="h-10 w-10 border-2 border-black">
                <img
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  className="h-full w-full"
                />
              </div>
            )}
            <a
              href="/api/auth/signout"
              className="border-2 border-black bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-black transition-all hover:bg-black hover:text-white inline-block"
            >
              Log out
            </a>
          </div>
        </header>
        <RFCListSkeleton />
      </div>
    );
  }

  if (!selectedRepo) {
    return (
      <div className="mx-auto min-h-screen max-w-240 px-8 py-12">
        <header className="mb-12 flex items-start justify-between">
          <div>
            <h1 className="text-5xl font-bold uppercase tracking-tight text-black">
              <Link href="/" className="hover:underline">
                RFC123
              </Link>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {session?.user?.image && (
              <div className="h-10 w-10 border-2 border-black">
                <img
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  className="h-full w-full"
                />
              </div>
            )}
            <a
              href="/api/auth/signout"
              className="border-2 border-black bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-black transition-all hover:bg-black hover:text-white inline-block"
            >
              Log out
            </a>
          </div>
        </header>
        <RepoSelectorEmptyState
          repos={availableRepos}
          onSelect={handleRepoSelect}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-240 px-8 py-12">
      <header className="mb-12 flex items-start justify-between">
        <div>
          <h1 className="text-5xl font-bold uppercase tracking-tight text-black">
            <Link href="/" className="hover:underline">
              RFC123
            </Link>
          </h1>
          <div className="mt-3">
            <RepoSelector
              currentRepo={selectedRepo}
              availableRepos={availableRepos}
              onSelect={handleRepoSelect}
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          {session?.user?.image && (
            <div className="h-10 w-10 border-2 border-black">
              <img
                src={session.user.image}
                alt={session.user.name || "User"}
                className="h-full w-full"
              />
            </div>
          )}
          <a
            href="/api/auth/signout"
            className="border-2 border-black bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-black transition-all hover:bg-black hover:text-white inline-block"
          >
            Log out
          </a>
        </div>
      </header>

      <div className="space-y-0">
        {rfcs?.map((rfc, index) => (
            <Link
              key={rfc.number}
              href={`/rfcs/${rfc.number}`}
              className="group block border-b-2 border-black bg-white px-6 py-5 transition-all hover:bg-gray-10"
              style={{
                borderTop: index === 0 ? "2px solid black" : "none",
              }}
            >
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1">
                  <div className="mb-2 flex items-baseline gap-3">
                    <h2 className="text-xl font-bold tracking-tight text-black">
                      {rfc.title}
                    </h2>
                    <span
                      className="border-2 px-2 py-0.5 text-xs font-bold uppercase tracking-wider"
                      style={{
                        borderColor:
                          rfc.status === "open"
                            ? "var(--cyan)"
                            : rfc.status === "merged"
                              ? "var(--yellow)"
                              : "var(--gray-30)",
                        backgroundColor:
                          rfc.status === "open"
                            ? "var(--cyan)"
                            : rfc.status === "merged"
                              ? "var(--yellow)"
                              : "var(--gray-10)",
                        color: "black",
                      }}
                    >
                      {rfc.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-medium tracking-wide text-gray-70">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 border-2 border-black">
                        <img
                          src={rfc.authorAvatar}
                          alt={rfc.author}
                          className="h-full w-full"
                        />
                      </div>
                      <span>{rfc.author}</span>
                    </div>
                    <span className="font-mono">#{rfc.number}</span>
                    <span>
                      {new Date(rfc.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {rfc.inlineCommentCount > 0 && (
                      <span className="border-l-2 border-gray-30 pl-4">
                        {rfc.inlineCommentCount} inline
                      </span>
                    )}
                    {rfc.regularCommentCount > 0 && (
                      <span className="border-l-2 border-gray-30 pl-4">
                        {rfc.regularCommentCount} general
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
      </div>
    </div>
  );
}
