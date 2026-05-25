"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Checkbox from "@/components/Checkbox";
import { DiscussWithAgentButton } from "@/components/DiscussWithAgentButton";
import type { ReviewerItem } from "@/components/EditableReviewers";
import { GeneralCommentsSection } from "@/components/GeneralCommentsSection";
import { InlineCommentableMarkdown } from "@/components/InlineCommentableMarkdown";
import { PencilIcon } from "@/components/icons/PencilIcon";
import { MarkdownRawView } from "@/components/MarkdownRawView";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { RelativeTime } from "@/components/RelativeTime";
import { RFCBodyEditor } from "@/components/RFCBodyEditor";
import RFCDetailLoadingSkeleton from "@/components/RFCDetailLoadingSkeleton";
import { RFCMetadataHeader } from "@/components/RFCMetadataHeader";
import RFCsTopBar from "@/components/RFCsTopBar";
import RFCsTopBarActions from "@/components/RFCsTopBarActions";
import Tooltip from "@/components/Tooltip";
import type { Comment, RFCDetail, RfcStateAction } from "@/lib/github";
import { type LineDiffEntry, lineDiff } from "@/lib/line-diff";
import { useRfcDraft } from "@/lib/use-rfc-draft";
import { ViewModeToggle } from "./ViewModeToggle";

interface PersistedBodyDraft {
  body: string;
  /** File SHA the draft was started against. If GitHub's current SHA differs
   *  on a later visit, the draft is "stale" and the user is offered a reset. */
  baseFileSha: string;
  lastEditedAt: string;
}

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
  const [editTab, setEditTab] = useState<"write" | "preview">("write");
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
  /** Non-null when the author is editing the body. The string is the working
   *  copy of the markdown — `rfc.markdownContent` stays the canonical version
   *  until a successful save. */
  const [editingBody, setEditingBody] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [savingBody, setSavingBody] = useState(false);
  const [bodyConflict, setBodyConflict] = useState(false);
  const [bodySaveError, setBodySaveError] = useState<string | null>(null);

  const isAuthor = !!rfc && currentUser === rfc.author;
  const canEditBody = isAuthor && !!rfc && rfc.status === "open";

  const draftStorageKey = `rfc123:edit:${owner}/${repo}#${prNumber}`;
  const bodyDraftSnapshot: PersistedBodyDraft | null = useMemo(() => {
    if (editingBody == null) return null;
    if (!rfc?.markdownFileSha) return null;
    if (editingBody === rfc.markdownContent) return null;
    return {
      body: editingBody,
      baseFileSha: rfc.markdownFileSha,
      lastEditedAt: new Date().toISOString(),
    };
  }, [editingBody, rfc?.markdownContent, rfc?.markdownFileSha]);

  const {
    pendingDraft: pendingBodyDraft,
    acceptDraft: acceptBodyDraft,
    discardDraft: discardBodyDraft,
    clearDraft: clearBodyDraft,
  } = useRfcDraft<PersistedBodyDraft>({
    storageKey: draftStorageKey,
    hasRestorableContent: (d) =>
      typeof d.body === "string" && d.body.length > 0,
    current: bodyDraftSnapshot,
  });

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

  async function handleTitleSave(nextTitle: string): Promise<void> {
    const res = await fetch(
      `/api/rfcs/${prNumber}/title?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to save title.");
    }
    const saved = (await res.json()) as { title: string };
    setRfc((prev) =>
      prev
        ? {
            ...prev,
            title: saved.title,
            updatedAt: new Date().toISOString(),
          }
        : prev,
    );
  }

  function enterBodyEdit() {
    if (!rfc) return;
    setEditingBody(rfc.markdownContent);
    setEditTab("write");
    setCommitMessage("");
    setBodyConflict(false);
    setBodySaveError(null);
  }

  function exitBodyEdit(opts: { clearDraft?: boolean } = {}) {
    setEditingBody(null);
    setBodyConflict(false);
    setBodySaveError(null);
    if (opts.clearDraft) clearBodyDraft();
  }

  function resumeBodyDraft() {
    if (!pendingBodyDraft || !rfc) return;
    setEditingBody(pendingBodyDraft.body);
    setCommitMessage("");
    setBodyConflict(false);
    setBodySaveError(null);
    acceptBodyDraft();
  }

  function handleDiscardEdit() {
    if (editingBody == null || !rfc) return;
    const dirty = editingBody !== rfc.markdownContent;
    if (dirty && !window.confirm("Discard your unsaved edits to this RFC?")) {
      return;
    }
    exitBodyEdit({ clearDraft: true });
  }

  async function resetAndRefresh() {
    clearBodyDraft();
    setEditingBody(null);
    setBodyConflict(false);
    setBodySaveError(null);
    await loadRFC({ silent: true });
  }

  async function handleSaveBody() {
    if (editingBody == null || !rfc?.markdownFileSha) return;
    if (editingBody === rfc.markdownContent) {
      // Nothing changed — just exit. Save shouldn't be reachable here, but
      // belt + suspenders.
      exitBodyEdit({ clearDraft: true });
      return;
    }
    const trimmedMessage = commitMessage.trim();
    if (!trimmedMessage) return;
    setSavingBody(true);
    setBodyConflict(false);
    setBodySaveError(null);
    try {
      const res = await fetch(
        `/api/rfcs/${prNumber}/content?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: editingBody,
            commitMessage: trimmedMessage,
            baseFileSha: rfc.markdownFileSha,
          }),
        },
      );
      if (res.status === 409) {
        setBodyConflict(true);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setBodySaveError(body.error ?? "Failed to save changes.");
        return;
      }
      const saved = (await res.json()) as {
        fileSha: string;
        commitSha: string;
      };
      // Optimistic local update: stamp the new body + SHA so a follow-up
      // background refetch isn't required for the UI to feel correct.
      setRfc((prev) =>
        prev
          ? {
              ...prev,
              markdownContent: editingBody,
              markdownFileSha: saved.fileSha,
              headSha: saved.commitSha,
              updatedAt: new Date().toISOString(),
            }
          : prev,
      );
      exitBodyEdit({ clearDraft: true });
      // Pick up the new commit's other side effects (e.g. outdated inline
      // comments) without blanking the page.
      loadRFC({ silent: true });
    } catch (e) {
      setBodySaveError((e as Error).message || "Failed to save changes.");
    } finally {
      setSavingBody(false);
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
          isAuthor
            ? {
                busyStateAction,
                onStateAction: handleStateAction,
                onReviewersChange: handleReviewersChange,
                reviewersSaving,
                // Title editing only available when the RFC is open and the
                // body isn't already being edited — the two modes are
                // mutually exclusive per spec.
                onTitleSave:
                  rfc.status === "open" && editingBody == null
                    ? handleTitleSave
                    : undefined,
              }
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            {editingBody == null && (
              <DiscussWithAgentButton
                owner={owner}
                repo={repo}
                prNumber={rfc.number}
                title={rfc.title}
                author={rfc.author}
              />
            )}
            {canEditBody && editingBody == null && (
              <button
                type="button"
                onClick={enterBodyEdit}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-30 bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-gray-5 cursor-pointer"
              >
                <PencilIcon className="h-3.5 w-3.5" />
                Edit
              </button>
            )}
            {editingBody != null && (
              <button
                type="button"
                onClick={handleDiscardEdit}
                disabled={savingBody}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-30 bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-gray-5 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <title>Cross</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 6l12 12M6 18L18 6"
                  />
                </svg>
                Discard changes
              </button>
            )}
          </div>
        }
        bylineActions={
          editingBody == null ? (
            <ViewModeToggle
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: "pretty", label: "Pretty" },
                { value: "raw", label: "Raw" },
              ]}
            />
          ) : (
            <ViewModeToggle
              value={editTab}
              onChange={setEditTab}
              options={[
                { value: "write", label: "Write" },
                { value: "preview", label: "Preview" },
              ]}
            />
          )
        }
      />

      {editingBody == null && canEditBody && pendingBodyDraft && (
        <BodyDraftRestoreBanner
          draft={pendingBodyDraft}
          stale={
            !!rfc.markdownFileSha &&
            pendingBodyDraft.baseFileSha !== rfc.markdownFileSha
          }
          onResume={resumeBodyDraft}
          onDiscard={discardBodyDraft}
        />
      )}

      <div className="relative border-t border-gray-20 pt-4">
        {editingBody != null ? (
          <BodyEditMode
            body={editingBody}
            originalBody={rfc.markdownContent}
            onBodyChange={setEditingBody}
            mode={editTab}
            onModeChange={setEditTab}
            commitMessage={commitMessage}
            onCommitMessageChange={setCommitMessage}
            saving={savingBody}
            onSave={handleSaveBody}
            disabled={editingBody === rfc.markdownContent}
            conflict={bodyConflict}
            onResetAndRefresh={resetAndRefresh}
            saveError={bodySaveError}
          />
        ) : viewMode === "pretty" ? (
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

interface BodyEditModeProps {
  body: string;
  /** The unedited version of the body — used as the "before" side of the diff
   *  view when the user toggles Preview → Diff. */
  originalBody: string;
  onBodyChange: (next: string) => void;
  /** Page-level Write/Preview toggle drives the editor — RFCBodyEditor hides
   *  its internal tabs when controlled. */
  mode: "write" | "preview";
  onModeChange: (next: "write" | "preview") => void;
  commitMessage: string;
  onCommitMessageChange: (next: string) => void;
  saving: boolean;
  onSave: () => void;
  /** True when there's nothing to save (body matches what's on GitHub). */
  disabled: boolean;
  /** Last save attempt hit a SHA mismatch (someone else pushed first). */
  conflict: boolean;
  onResetAndRefresh: () => void;
  saveError: string | null;
}

function BodyEditMode({
  body,
  originalBody,
  onBodyChange,
  mode,
  onModeChange,
  commitMessage,
  onCommitMessageChange,
  saving,
  onSave,
  disabled,
  conflict,
  onResetAndRefresh,
  saveError,
}: BodyEditModeProps) {
  const [showDiff, setShowDiff] = useState(false);
  const diffEntries = useMemo(
    () =>
      mode === "preview" && showDiff ? lineDiff(originalBody, body) : null,
    [mode, showDiff, originalBody, body],
  );
  const previewSlot =
    mode === "preview" ? (
      showDiff ? (
        <DiffView entries={diffEntries ?? []} />
      ) : body.trim() ? (
        <MarkdownRenderer content={body} />
      ) : (
        <p className="text-sm text-gray-50">Nothing to preview yet.</p>
      )
    ) : undefined;

  return (
    <div className="space-y-4">
      {conflict && (
        <div className="rounded-md border border-magenta bg-magenta-light px-4 py-3 text-sm">
          <p className="font-medium text-foreground">
            This RFC was updated on GitHub after you started editing.
          </p>
          <p className="mt-1 text-gray-70">
            Your edits can't be saved as-is. Reset to discard them and reload,
            or copy your text out first.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onResetAndRefresh}
              className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-surface transition-all hover:opacity-80 cursor-pointer"
            >
              Reset and refresh
            </button>
            <span className="text-xs text-gray-70">
              Keep this editor open if you'd rather copy your draft out first.
            </span>
          </div>
        </div>
      )}
      <RFCBodyEditor
        body={body}
        onBodyChange={onBodyChange}
        mode={mode}
        onModeChange={onModeChange}
        previewSlot={previewSlot}
      />
      {saveError && !conflict && (
        <div className="rounded-sm border border-magenta bg-magenta-light px-3 py-2 text-sm text-foreground">
          {saveError}
        </div>
      )}
      {mode === "preview" && (
        <Checkbox
          checked={showDiff}
          onChange={setShowDiff}
          label="Show diff against the saved revision"
          className="text-xs text-gray-70"
        />
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex flex-col gap-1.5 sm:flex-1">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-gray-50">
            Commit message
          </span>
          <input
            type="text"
            value={commitMessage}
            onChange={(e) => onCommitMessageChange(e.target.value)}
            placeholder="What's changed?"
            className="w-full rounded-sm border border-gray-30 bg-surface px-3 py-2 text-sm text-foreground hover:border-gray-40 focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent transition-colors"
          />
        </label>
        <SaveButton
          disabled={disabled}
          saving={saving}
          conflict={conflict}
          commitMessage={commitMessage}
          onSave={onSave}
        />
      </div>
    </div>
  );
}

interface SaveButtonProps {
  /** True when the body matches what's on GitHub — nothing to save. */
  disabled: boolean;
  saving: boolean;
  conflict: boolean;
  commitMessage: string;
  onSave: () => void;
}

/** Save button + disabled-reason tooltip. The reason rotates through the
 *  states that block saving so the user knows exactly what to fix. */
function SaveButton({
  disabled,
  saving,
  conflict,
  commitMessage,
  onSave,
}: SaveButtonProps) {
  const commitMessageEmpty = commitMessage.trim().length === 0;
  const disabledReason: string | null = conflict
    ? "Resolve the conflict before saving."
    : disabled
      ? "Nothing to save — the body hasn't changed."
      : commitMessageEmpty
        ? "Write a commit message to save."
        : null;
  const isDisabled = saving || disabledReason !== null;

  const button = (
    <button
      type="button"
      onClick={onSave}
      disabled={isDisabled}
      className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-surface transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <title>Check</title>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
      {saving ? "Saving…" : "Save"}
    </button>
  );

  if (!disabledReason) return button;
  // Wrap the disabled button in a span so the tooltip trigger still receives
  // pointer events (disabled <button> elements swallow them in some browsers).
  return (
    <Tooltip content={disabledReason}>
      <span className="inline-flex">{button}</span>
    </Tooltip>
  );
}

interface BodyDraftRestoreBannerProps {
  draft: PersistedBodyDraft;
  /** True when the draft was started against a different file SHA than what
   *  GitHub currently has — restoring would risk overwriting newer commits. */
  stale: boolean;
  onResume: () => void;
  onDiscard: () => void;
}

function BodyDraftRestoreBanner({
  draft,
  stale,
  onResume,
  onDiscard,
}: BodyDraftRestoreBannerProps) {
  return (
    <div
      className={`mb-4 flex flex-col gap-3 rounded-md border px-4 py-3 sm:flex-row sm:items-center ${
        stale
          ? "border-magenta bg-magenta-light"
          : "border-yellow bg-yellow-light"
      }`}
    >
      <div className="flex-1 text-sm text-foreground">
        <span className="font-medium">
          You have an unsaved edit from{" "}
          <RelativeTime date={draft.lastEditedAt} />.
        </span>{" "}
        {stale
          ? "The RFC has new commits since then — resuming would overwrite them. Discard recommended."
          : "Want to resume editing?"}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onResume}
          className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-surface transition-all hover:opacity-80 cursor-pointer"
        >
          {stale ? "Resume anyway" : "Resume editing"}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-md border border-gray-20 bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-gray-5 cursor-pointer"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

interface DiffViewProps {
  entries: LineDiffEntry[];
}

/** Renders a block-level diff over the rendered markdown. Consecutive lines
 *  of the same kind are grouped and rendered through MarkdownRenderer so the
 *  diff reads as the regular preview, just with red + strikethrough for
 *  removed blocks and a green hairline for added blocks. Some markdown
 *  structure (e.g. a half-removed list) inevitably breaks across block
 *  boundaries — that's acceptable for a preview affordance. */
function DiffView({ entries }: DiffViewProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-50">No diff to show yet.</p>;
  }
  if (entries.every((e) => e.kind === "context")) {
    return (
      <p className="text-sm text-gray-50">
        No changes. Your version matches the saved revision.
      </p>
    );
  }
  // Coalesce consecutive same-kind entries so each markdown block stays
  // intact when handed to react-markdown.
  const blocks: { kind: LineDiffEntry["kind"]; text: string }[] = [];
  for (const entry of entries) {
    const last = blocks[blocks.length - 1];
    if (last && last.kind === entry.kind) {
      last.text += `\n${entry.text}`;
    } else {
      blocks.push({ kind: entry.kind, text: entry.text });
    }
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, idx) => {
        if (block.kind === "context") {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: diff blocks have no stable identity; the list re-renders on every edit
            <div key={idx}>
              <MarkdownRenderer content={block.text} />
            </div>
          );
        }
        const isAdded = block.kind === "added";
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: diff blocks have no stable identity; the list re-renders on every edit
            key={idx}
            className={`relative rounded-sm pl-3 pr-2 py-1 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 ${
              isAdded
                ? "bg-green-50 before:bg-green-400"
                : "bg-red-50 line-through decoration-red-400/70 [&_*]:decoration-red-400/70 before:bg-red-400"
            }`}
          >
            <span
              aria-hidden
              className={`absolute right-2 top-1 font-mono text-[10px] uppercase tracking-[0.12em] no-underline ${
                isAdded ? "text-green-700" : "text-red-700"
              }`}
            >
              {isAdded ? "Added" : "Removed"}
            </span>
            <MarkdownRenderer content={block.text} />
          </div>
        );
      })}
    </div>
  );
}
