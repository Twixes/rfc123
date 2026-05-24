"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DiscussWithAgentButton } from "@/components/DiscussWithAgentButton";
import type { ReviewerItem } from "@/components/EditableReviewers";
import { GeneralCommentsSection } from "@/components/GeneralCommentsSection";
import { InlineCommentableMarkdown } from "@/components/InlineCommentableMarkdown";
import { MarkdownRawView } from "@/components/MarkdownRawView";
import RFCDetailLoadingSkeleton from "@/components/RFCDetailLoadingSkeleton";
import { RFCMetadataHeader } from "@/components/RFCMetadataHeader";
import RFCsTopBar from "@/components/RFCsTopBar";
import RFCsTopBarActions from "@/components/RFCsTopBarActions";
import type { Comment, RFCDetail, RfcStateAction } from "@/lib/github";
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
  const [busyStateAction, setBusyStateAction] = useState<RfcStateAction | null>(
    null,
  );
  const [reviewersSaving, setReviewersSaving] = useState(false);
  // `teamNoAccess` carries the data the banner needs to render a deep-link to
  // the team's repo-access page on GitHub so the author can fix it in one click.
  const [mutationError, setMutationError] = useState<{
    message: string;
    teamNoAccess?: { team: string; org: string; repo: string };
  } | null>(null);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const response = await fetch(
        `/api/rfcs/${prNumber}/comments?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
      );
      if (!response.ok) {
        throw new Error("Failed to load comments");
      }
      const data = (await response.json()) as Comment[];
      setComments(data);
      setOptimisticComments([]); // Clear optimistic comments after loading real ones
    } catch (error) {
      console.error("Error loading comments:", error);
    } finally {
      setCommentsLoading(false);
    }
  }, [owner, repo, prNumber]);

  const loadRFC = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      // Suppress the skeleton on post-mutation refetches; the optimistic UI
      // already shows the new state, blanking back to skeleton is jarring.
      if (!opts.silent) setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/rfcs/${prNumber}?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
        );
        if (!response.ok) {
          throw new Error("Failed to load RFC");
        }
        const data = (await response.json()) as RFCDetail;
        setRfc(data);
        if (!opts.silent) loadComments();
      } catch (error) {
        console.error("Error loading RFC:", error);
        if (!opts.silent) setError("Failed to load RFC");
      } finally {
        if (!opts.silent) setIsLoading(false);
      }
    },
    [owner, repo, prNumber, loadComments],
  );

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

  async function handleStateAction(action: RfcStateAction) {
    if (busyStateAction !== null) return;
    setBusyStateAction(action);
    setMutationError(null);
    try {
      const res = await fetch(
        `/api/rfcs/${prNumber}/state?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to update RFC state");
      }
      await loadRFC({ silent: true });
    } catch (e) {
      setMutationError({ message: (e as Error).message });
    } finally {
      setBusyStateAction(null);
    }
  }

  async function handleReviewersChange(next: ReviewerItem[]) {
    if (!rfc) return;
    const previous = rfc;
    // Optimistic update so the chip change feels instant.
    setRfc({
      ...previous,
      reviewers: next
        .filter((r) => r.kind === "user")
        .map((r) => ({
          login: r.handle,
          avatar: r.avatarUrl ?? "",
          yetToReview: true,
          state: "PENDING" as const,
          submittedAt: null,
        })),
      requestedTeamSlugs: next
        .filter((r) => r.kind === "team")
        .map((r) => r.handle),
    });

    setReviewersSaving(true);
    setMutationError(null);
    try {
      const res = await fetch(
        `/api/rfcs/${prNumber}/reviewers?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            users: next.filter((r) => r.kind === "user").map((r) => r.handle),
            teams: next.filter((r) => r.kind === "team").map((r) => r.handle),
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          kind?: string;
          team?: string;
          org?: string;
          repo?: string;
        };
        if (
          res.status === 422 &&
          body.kind === "team_no_access" &&
          body.team &&
          body.org &&
          body.repo
        ) {
          setMutationError({
            message: body.error ?? "Team doesn't have access to this repo.",
            teamNoAccess: { team: body.team, org: body.org, repo: body.repo },
          });
        } else {
          setMutationError({
            message: body.error ?? "Failed to update reviewers",
          });
        }
        setRfc(previous);
        return;
      }
      // Refetch authoritative reviewer state (avatars for newly-added users,
      // reviewers GitHub silently dropped, etc.).
      await loadRFC({ silent: true });
    } catch (e) {
      setMutationError({ message: (e as Error).message });
      setRfc(previous);
    } finally {
      setReviewersSaving(false);
    }
  }

  if (isLoading) {
    return (
      <RFCDetailLoadingSkeleton
        user={{ name: currentUser, image: currentUserAvatar }}
        repo={{ owner, name: repo }}
      />
    );
  }

  if (error || !rfc) {
    return (
      <div className="mx-auto max-w-360 min-h-screen px-4 sm:px-8 py-6 sm:py-12">
        <RFCsTopBar
          user={{ name: currentUser, image: currentUserAvatar }}
          actions={<RFCsTopBarActions repo={{ owner, name: repo }} />}
        />
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
      <RFCsTopBar
        user={{ name: currentUser, image: currentUserAvatar }}
        actions={<RFCsTopBarActions repo={{ owner, name: repo }} />}
      />

      {mutationError && (
        <div className="mb-4 flex items-start gap-3 border border-magenta bg-magenta-light text-foreground rounded-sm px-3 py-2 text-sm">
          <p className="flex-1">
            {mutationError.message}
            {mutationError.teamNoAccess && (
              <span className="ml-1 text-xs text-gray-70">
                <a
                  href={`https://github.com/orgs/${encodeURIComponent(mutationError.teamNoAccess.org)}/teams/${encodeURIComponent(mutationError.teamNoAccess.team)}/repositories?type=source`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline decoration-magenta underline-offset-2 hover:text-magenta transition-colors"
                >
                  Add {mutationError.teamNoAccess.repo} to the team's
                  repositories →
                </a>
                {" then come back and try again."}
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => setMutationError(null)}
            aria-label="Dismiss"
            className="text-gray-50 hover:text-foreground cursor-pointer"
          >
            ×
          </button>
        </div>
      )}
      <RFCMetadataHeader
        rfc={rfc}
        authorControls={
          currentUser === rfc.author
            ? {
                busyStateAction,
                onStateAction: handleStateAction,
                onReviewersChange: handleReviewersChange,
                reviewersSaving,
              }
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <DiscussWithAgentButton
              owner={owner}
              repo={repo}
              prNumber={rfc.number}
              title={rfc.title}
              author={rfc.author}
            />
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
        }
      />

      <div className="relative border-t border-gray-20 pt-4">
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
