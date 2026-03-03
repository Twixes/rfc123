"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { RFCDetail, Comment } from "@/lib/github";
import { GeneralCommentsSection } from "@/components/GeneralCommentsSection";
import { InlineCommentableMarkdown } from "@/components/InlineCommentableMarkdown";
import { RFCMetadataHeader } from "@/components/RFCMetadataHeader";
import { MarkdownRawView } from "@/components/MarkdownRawView";
import { ViewModeToggle } from "./ViewModeToggle";

interface RFCDetailClientProps {
  owner: string;
  repo: string;
  prNumber: number;
  currentUser: string;
  currentUserAvatar: string;
}

export default function RFCDetailClient({
  owner,
  repo,
  prNumber,
  currentUser,
  currentUserAvatar,
}: RFCDetailClientProps) {
  const [rfc, setRfc] = useState<RFCDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [optimisticComments, setOptimisticComments] = useState<Comment[]>([]);
  const [viewMode, setViewMode] = useState<"pretty" | "raw">("pretty");

  const loadComments = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/rfcs/${prNumber}/comments?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
      );
      if (!response.ok) {
        throw new Error("Failed to load comments");
      }
      const data = await response.json();
      setComments(data);
      setOptimisticComments([]); // Clear optimistic comments after loading real ones
    } catch (error) {
      console.error("Error loading comments:", error);
    }
  }, [owner, repo, prNumber]);

  const loadRFC = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/rfcs/${prNumber}?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
      );
      if (!response.ok) {
        throw new Error("Failed to load RFC");
      }
      const data = await response.json();
      setRfc(data);
      setComments(data.comments); // Set initial comments from RFC data
    } catch (error) {
      console.error("Error loading RFC:", error);
      setError("Failed to load RFC");
    } finally {
      setIsLoading(false);
    }
  }, [owner, repo, prNumber]);

  useEffect(() => {
    loadRFC();
  }, [loadRFC]);

  async function handleInlineComment(line: number, body: string) {
    if (!rfc?.markdownFilePath) return;

    // Create optimistic comment
    const optimisticComment: Comment = {
      id: Date.now(), // Temporary ID
      user: currentUser,
      userAvatar: currentUserAvatar,
      body,
      createdAt: new Date().toISOString(),
      path: rfc.markdownFilePath,
      line,
    };

    // Add optimistic comment immediately
    setOptimisticComments((prev) => [...prev, optimisticComment]);

    try {
      const response = await fetch("/api/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          prNumber: rfc.number,
          body,
          path: rfc.markdownFilePath,
          line,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to post comment");
      }

      // Comment posted successfully - reload only comments in background
      await loadComments();
    } catch (error) {
      console.error("Error posting comment:", error);
      // Remove optimistic comment on error
      setOptimisticComments((prev) =>
        prev.filter((c) => c.id !== optimisticComment.id),
      );
      alert("Failed to post comment");
    }
  }

  async function handleGeneralComment(body: string) {
    // Create optimistic comment
    const optimisticComment: Comment = {
      id: Date.now(), // Temporary ID
      user: currentUser,
      userAvatar: currentUserAvatar,
      body,
      createdAt: new Date().toISOString(),
    };

    // Add optimistic comment immediately
    setOptimisticComments((prev) => [...prev, optimisticComment]);

    // The actual API call is handled by CommentBox
    // After successful post, reload only comments
    await loadComments();
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-360 min-h-screen px-4 sm:px-8 py-6 sm:py-12">
        <nav className="mb-6">
          <Link
            href="/rfcs"
            className="rounded-md border border-gray-20 bg-surface px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-foreground transition-all hover:bg-gray-5"
          >
            ← Back to RFCs
          </Link>
        </nav>

        {/* RFCMetadataHeader Skeleton */}
        <div className="mb-4 border border-gray-20 rounded-md bg-surface p-4 sm:p-8">
          <div className="mb-2 flex items-start justify-between gap-4">
            <div className="flex items-baseline gap-4">
              <div className="h-5 w-20 animate-pulse rounded bg-gray-20" />
              <div className="h-7 w-16 animate-pulse rounded-sm border border-gray-20 bg-gray-5" />
            </div>
            <div className="h-10 w-40 animate-pulse rounded-md border border-gray-20 bg-gray-10" />
          </div>

          <div className="mb-6 h-10 w-3/4 animate-pulse rounded bg-gray-20" />

          <div className="grid grid-cols-1 gap-x-8 gap-y-6 border-t border-gray-20 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="mb-2 h-3 w-16 animate-pulse rounded bg-gray-20" />
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 animate-pulse rounded-full bg-gray-20" />
                <div className="h-4 w-24 animate-pulse rounded bg-gray-20" />
              </div>
            </div>

            <div>
              <div className="mb-2 h-3 w-20 animate-pulse rounded bg-gray-20" />
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 animate-pulse rounded-full bg-gray-20" />
                <div className="h-6 w-6 animate-pulse rounded-full bg-gray-20" />
                <div className="h-6 w-6 animate-pulse rounded-full bg-gray-20" />
              </div>
            </div>

            <div>
              <div className="mb-2 h-3 w-16 animate-pulse rounded bg-gray-20" />
              <div className="h-4 w-28 animate-pulse rounded bg-gray-20" />
            </div>

            <div>
              <div className="mb-2 h-3 w-28 animate-pulse rounded bg-gray-20" />
              <div className="h-4 w-8 animate-pulse rounded bg-gray-20" />
            </div>
          </div>
        </div>

        {/* Markdown Content Skeleton */}
        <div className="border border-gray-20 rounded-md bg-surface p-4 sm:p-8">
          <div className="space-y-4">
            <div className="h-6 w-full animate-pulse rounded bg-gray-20" />
            <div className="h-6 w-5/6 animate-pulse rounded bg-gray-20" />
            <div className="h-6 w-full animate-pulse rounded bg-gray-20" />
            <div className="h-6 w-4/5 animate-pulse rounded bg-gray-20" />

            <div className="py-4" />

            <div className="h-6 w-full animate-pulse rounded bg-gray-20" />
            <div className="h-6 w-full animate-pulse rounded bg-gray-20" />
            <div className="h-6 w-3/4 animate-pulse rounded bg-gray-20" />

            <div className="py-4" />

            <div className="h-32 w-full animate-pulse rounded border border-gray-20 bg-gray-5" />

            <div className="py-4" />

            <div className="h-6 w-full animate-pulse rounded bg-gray-20" />
            <div className="h-6 w-5/6 animate-pulse rounded bg-gray-20" />
            <div className="h-6 w-full animate-pulse rounded bg-gray-20" />
          </div>
        </div>

        {/* General Comments Section Skeleton */}
        <div className="mt-8 border border-gray-20 rounded-md bg-surface p-4 sm:p-8">
          <div className="mb-6 h-8 w-48 animate-pulse rounded bg-gray-20" />

          <div className="space-y-6">
            {[...Array(3)].map((_, index) => (
              <div
                key={index}
                className="border-b border-gray-20 pb-6 last:border-0"
              >
                <div className="mb-4 flex items-start gap-3">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-gray-20" />
                  <div className="flex-1">
                    <div className="mb-2 h-4 w-32 animate-pulse rounded bg-gray-20" />
                    <div className="h-3 w-24 animate-pulse rounded bg-gray-20" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-full animate-pulse rounded bg-gray-20" />
                  <div className="h-4 w-5/6 animate-pulse rounded bg-gray-20" />
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
      <div className="mx-auto max-w-360 min-h-screen px-4 sm:px-8 py-6 sm:py-12">
        <nav className="mb-6">
          <Link
            href="/rfcs"
            className="rounded-md border border-gray-20 bg-surface px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-foreground transition-all hover:bg-gray-5"
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

  // Merge actual comments with optimistic comments
  const allComments = [...comments, ...optimisticComments];
  const generalComments = allComments.filter((c) => !c.line);
  const lineComments = allComments.filter((c) => c.line);

  return (
    <div className="mx-auto max-w-360 min-h-screen px-4 sm:px-8 py-6 sm:py-12">
      <nav className="mb-6">
        <Link
          href="/rfcs"
          className="rounded-md border border-gray-20 bg-surface px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-foreground transition-all hover:bg-gray-5"
        >
          ← Back to RFCs
        </Link>
      </nav>

      <RFCMetadataHeader rfc={rfc} />

      <div className="border border-gray-20 rounded-md bg-surface p-4 sm:p-8">
        <div className="flex justify-end mb-4">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
        {viewMode === "pretty" ? (
          <InlineCommentableMarkdown
            content={rfc.markdownContent}
            prNumber={rfc.number}
            comments={lineComments}
            onCommentSubmit={handleInlineComment}
          />
        ) : (
          <MarkdownRawView content={rfc.markdownContent} />
        )}
      </div>

      <GeneralCommentsSection
        owner={owner}
        repo={repo}
        comments={generalComments}
        prNumber={rfc.number}
        onCommentPosted={handleGeneralComment}
      />
    </div>
  );
}
