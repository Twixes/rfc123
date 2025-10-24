"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RFCDetail } from "@/lib/github";
import { GeneralCommentsSection } from "@/components/GeneralCommentsSection";
import { InlineCommentableMarkdown } from "@/components/InlineCommentableMarkdown";
import { RFCMetadataHeader } from "@/components/RFCMetadataHeader";

interface RFCDetailClientProps {
  prNumber: number;
}

const REPO_STORAGE_KEY = "selected_repo";

export default function RFCDetailClient({ prNumber }: RFCDetailClientProps) {
  const [rfc, setRfc] = useState<RFCDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const loadRFC = useCallback(async (owner: string, name: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/rfcs/${prNumber}?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`,
      );
      if (!response.ok) {
        throw new Error("Failed to load RFC");
      }
      const data = await response.json();
      setRfc(data);
    } catch (error) {
      console.error("Error loading RFC:", error);
      setError("Failed to load RFC");
    } finally {
      setIsLoading(false);
    }
  }, [prNumber]);

  useEffect(() => {
    const storedRepo = localStorage.getItem(REPO_STORAGE_KEY);
    if (!storedRepo) {
      router.push("/rfcs");
      return;
    }

    const repo = JSON.parse(storedRepo);
    loadRFC(repo.owner, repo.name);
  }, [router, loadRFC]);

  async function handleInlineComment(line: number, body: string) {
    if (!rfc?.markdownFilePath) return;

    const storedRepo = localStorage.getItem(REPO_STORAGE_KEY);
    if (!storedRepo) return;

    const repo = JSON.parse(storedRepo);

    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: repo.owner,
          repo: repo.name,
          prNumber: rfc.number,
          body,
          path: rfc.markdownFilePath,
          line,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to post comment");
      }

      // Reload the RFC to show the new comment
      loadRFC(repo.owner, repo.name);
    } catch (error) {
      console.error("Error posting comment:", error);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-360 min-h-screen px-8 py-12">
        <nav className="mb-6">
          <Link
            href="/rfcs"
            className="border-2 border-black bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-black transition-all hover:bg-black hover:text-white"
          >
            ← Back to RFCs
          </Link>
        </nav>

        {/* RFCMetadataHeader Skeleton */}
        <div className="mb-4 border-2 border-black bg-white p-8">
          <div className="mb-2 flex items-start justify-between gap-4">
            <div className="flex items-baseline gap-4">
              <div className="h-5 w-20 animate-pulse bg-gray-20" />
              <div className="h-7 w-16 animate-pulse border-2 border-gray-30 bg-gray-10" />
            </div>
            <div className="h-10 w-40 animate-pulse border-2 border-black bg-gray-20" />
          </div>

          <div className="mb-6 h-10 w-3/4 animate-pulse bg-gray-20" />

          <div className="grid grid-cols-1 gap-x-8 gap-y-6 border-t-2 border-black pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="mb-2 h-3 w-16 animate-pulse bg-gray-20" />
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 animate-pulse border-2 border-black bg-gray-20" />
                <div className="h-4 w-24 animate-pulse bg-gray-20" />
              </div>
            </div>

            <div>
              <div className="mb-2 h-3 w-20 animate-pulse bg-gray-20" />
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 animate-pulse border-2 border-black bg-gray-20" />
                <div className="h-6 w-6 animate-pulse border-2 border-black bg-gray-20" />
                <div className="h-6 w-6 animate-pulse border-2 border-black bg-gray-20" />
              </div>
            </div>

            <div>
              <div className="mb-2 h-3 w-16 animate-pulse bg-gray-20" />
              <div className="h-4 w-28 animate-pulse bg-gray-20" />
            </div>

            <div>
              <div className="mb-2 h-3 w-28 animate-pulse bg-gray-20" />
              <div className="h-4 w-8 animate-pulse bg-gray-20" />
            </div>
          </div>
        </div>

        {/* Markdown Content Skeleton */}
        <div className="border-2 border-black bg-white p-8">
          <div className="space-y-4">
            <div className="h-6 w-full animate-pulse bg-gray-20" />
            <div className="h-6 w-5/6 animate-pulse bg-gray-20" />
            <div className="h-6 w-full animate-pulse bg-gray-20" />
            <div className="h-6 w-4/5 animate-pulse bg-gray-20" />

            <div className="py-4" />

            <div className="h-6 w-full animate-pulse bg-gray-20" />
            <div className="h-6 w-full animate-pulse bg-gray-20" />
            <div className="h-6 w-3/4 animate-pulse bg-gray-20" />

            <div className="py-4" />

            <div className="h-32 w-full animate-pulse border-2 border-gray-30 bg-gray-10" />

            <div className="py-4" />

            <div className="h-6 w-full animate-pulse bg-gray-20" />
            <div className="h-6 w-5/6 animate-pulse bg-gray-20" />
            <div className="h-6 w-full animate-pulse bg-gray-20" />
          </div>
        </div>

        {/* General Comments Section Skeleton */}
        <div className="mt-8 border-2 border-black bg-white p-8">
          <div className="mb-6 h-8 w-48 animate-pulse bg-gray-20" />

          <div className="space-y-6">
            {[...Array(3)].map((_, index) => (
              <div
                key={index}
                className="border-b-2 border-gray-20 pb-6 last:border-0"
              >
                <div className="mb-4 flex items-start gap-3">
                  <div className="h-8 w-8 animate-pulse border-2 border-black bg-gray-20" />
                  <div className="flex-1">
                    <div className="mb-2 h-4 w-32 animate-pulse bg-gray-20" />
                    <div className="h-3 w-24 animate-pulse bg-gray-20" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-full animate-pulse bg-gray-20" />
                  <div className="h-4 w-5/6 animate-pulse bg-gray-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !rfc) {
    return (
      <div className="mx-auto max-w-360 min-h-screen px-8 py-12">
        <nav className="mb-6">
          <Link
            href="/rfcs"
            className="border-2 border-black bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-black transition-all hover:bg-black hover:text-white"
          >
            ← Back to RFCs
          </Link>
        </nav>
        <div className="text-center text-red-500 py-12">
          {error || "Failed to load RFC"}
        </div>
      </div>
    );
  }

  const generalComments = rfc.comments.filter((c) => !c.line);
  const lineComments = rfc.comments.filter((c) => c.line);

  return (
    <div className="mx-auto max-w-360 min-h-screen px-8 py-12">
      <nav className="mb-6">
        <Link
          href="/rfcs"
          className="border-2 border-black bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-black transition-all hover:bg-black hover:text-white"
        >
          ← Back to RFCs
        </Link>
      </nav>

      <RFCMetadataHeader rfc={rfc} />

      <div className="border-2 border-black bg-white p-8">
        <InlineCommentableMarkdown
          content={rfc.markdownContent}
          prNumber={rfc.number}
          comments={lineComments}
          onCommentSubmit={handleInlineComment}
        />
      </div>

      <GeneralCommentsSection
        comments={generalComments}
        prNumber={rfc.number}
      />
    </div>
  );
}
