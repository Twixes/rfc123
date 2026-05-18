"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GeneralCommentsSection } from "@/components/GeneralCommentsSection";
import { InlineCommentableMarkdown } from "@/components/InlineCommentableMarkdown";
import { MarkdownRawView } from "@/components/MarkdownRawView";
import RFCDetailLoadingSkeleton from "@/components/RFCDetailLoadingSkeleton";
import { RFCMetadataHeader } from "@/components/RFCMetadataHeader";
import RFCsTopBar from "@/components/RFCsTopBar";
import type { Comment, RFCDetail } from "@/lib/github";
import { ViewModeToggle } from "./ViewModeToggle";

function parseCommentIdFromHash(hash: string): number | null {
  const match = hash.match(/^#comment-(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

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
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [optimisticComments, setOptimisticComments] = useState<Comment[]>([]);
  const [viewMode, setViewMode] = useState<"pretty" | "raw">("pretty");
  const [highlightedCommentId, setHighlightedCommentId] = useState<
    number | null
  >(null);
  const hasScrolledToComment = useRef(false);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
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
    } finally {
      setCommentsLoading(false);
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
      // Load comments progressively after content is ready
      loadComments();
    } catch (error) {
      console.error("Error loading RFC:", error);
      setError("Failed to load RFC");
    } finally {
      setIsLoading(false);
    }
  }, [owner, repo, prNumber, loadComments]);

  useEffect(() => {
    loadRFC();
  }, [loadRFC]);

  // Scroll to and highlight the comment referenced in the URL hash
  useEffect(() => {
    if (commentsLoading || hasScrolledToComment.current) return;
    const commentId = parseCommentIdFromHash(window.location.hash);
    if (commentId == null) return;
    const allComments = [...comments, ...optimisticComments];
    if (!allComments.some((c) => c.id === commentId)) return;

    setHighlightedCommentId(commentId);

    // Wait a tick for the DOM to update (expand animation, render)
    const scrollTimer = setTimeout(() => {
      const el = document.getElementById(`comment-${commentId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 400);

    const fadeTimer = setTimeout(() => {
      setHighlightedCommentId(null);
    }, 3000);

    hasScrolledToComment.current = true;

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(fadeTimer);
    };
  }, [commentsLoading, comments, optimisticComments]);

  // Also handle hash changes while the page is open (e.g. clicking a permalink)
  useEffect(() => {
    function onHashChange() {
      const commentId = parseCommentIdFromHash(window.location.hash);
      if (commentId == null) return;
      setHighlightedCommentId(commentId);
      setTimeout(() => {
        const el = document.getElementById(`comment-${commentId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 400);
      setTimeout(() => setHighlightedCommentId(null), 3000);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  async function handleInlineComment(
    line: number,
    body: string,
    replyToCommentId?: number,
  ) {
    if (!rfc?.markdownFilePath) return;

    const optimisticComment: Comment = {
      id: Date.now(),
      user: currentUser,
      userAvatar: currentUserAvatar,
      body,
      createdAt: new Date().toISOString(),
      path: rfc.markdownFilePath,
      line,
      inReplyToId: replyToCommentId,
    };

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
          replyToCommentId,
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
      <RFCDetailLoadingSkeleton
        user={{ name: currentUser, image: currentUserAvatar }}
      />
    );
  }

  if (error || !rfc) {
    return (
      <div className="mx-auto max-w-360 min-h-screen px-4 sm:px-8 py-6 sm:py-12">
        <RFCsTopBar user={{ name: currentUser, image: currentUserAvatar }} />
        <div className="py-12 text-center text-sm text-magenta">
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
      <RFCsTopBar user={{ name: currentUser, image: currentUserAvatar }} />

      <RFCMetadataHeader
        rfc={rfc}
        actions={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
      />

      <div className="relative border-t border-gray-20 pt-8">
        {viewMode === "pretty" ? (
          <InlineCommentableMarkdown
            content={rfc.markdownContent}
            prNumber={rfc.number}
            owner={owner}
            repo={repo}
            markdownFilePath={rfc.markdownFilePath}
            headRef={rfc.headRef}
            comments={lineComments}
            commentsLoading={commentsLoading}
            highlightedCommentId={highlightedCommentId}
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
        commentsLoading={commentsLoading}
        prNumber={rfc.number}
        highlightedCommentId={highlightedCommentId}
        onCommentPosted={handleGeneralComment}
      />
    </div>
  );
}
