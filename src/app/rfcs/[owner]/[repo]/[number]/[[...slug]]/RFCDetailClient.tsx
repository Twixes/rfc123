"use client";

import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnonymousSignInButton,
  AnonymousSignInCTA,
} from "@/components/AnonymousSignInCTA";
import Checkbox from "@/components/Checkbox";
import {
  CommitRangePicker,
  type DiffRange,
} from "@/components/CommitRangePicker";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { DiscussWithAgentButton } from "@/components/DiscussWithAgentButton";
import type { ReviewerItem } from "@/components/EditableReviewers";
import { EditModeInlineComments } from "@/components/EditModeInlineComments";
import { GeneralCommentsSection } from "@/components/GeneralCommentsSection";
import { InlineCommentableMarkdown } from "@/components/InlineCommentableMarkdown";
import { PencilIcon } from "@/components/icons/PencilIcon";
import { MarkdownRawView } from "@/components/MarkdownRawView";
import { RelativeTime } from "@/components/RelativeTime";
import { EmptyPreviewHint, RFCBodyEditor } from "@/components/RFCBodyEditor";
import RFCDetailLoadingSkeleton from "@/components/RFCDetailLoadingSkeleton";
import { RFCMetadataHeader } from "@/components/RFCMetadataHeader";
import RFCsTopBar from "@/components/RFCsTopBar";
import {
  RFCsTopBarPrimaryAction,
  RFCsTopBarSecondaryActions,
} from "@/components/RFCsTopBarActions";
import { RfcMonoDiffView, RfcPrettyDiffView } from "@/components/RfcDiffView";
import { RfcMarkdownMissing } from "@/components/RfcMarkdownMissing";
import type { RfcMarkdownAssets } from "@/components/RfcPrettyMarkdown";
import Tooltip from "@/components/Tooltip";
import {
  DIFF_PARAM,
  formatDiffRange,
  parseDiffRange,
  shortSha,
} from "@/lib/diff-range";
import type {
  Comment,
  CommentReactions,
  ReactionContent,
  RFCDetail,
  RfcStateAction,
} from "@/lib/github";
import { lineDiff, mapOriginalLines } from "@/lib/line-diff";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useRfcDraft } from "@/lib/use-rfc-draft";
import { ViewModeToggle } from "./ViewModeToggle";

interface PersistedBodyDraft {
  body: string;
  /** File SHA the draft was started against. If GitHub's current SHA differs
   *  on a later visit, the draft is "stale" and the user is offered a reset. */
  baseFileSha: string;
  /** Repo-relative path of the file the draft edits. Absent on drafts saved
   *  before multi-file support – those implicitly edited the only file. */
  path?: string;
  lastEditedAt: string;
}

function parseCommentIdFromHash(hash: string): number | null {
  const match = hash.match(/^#comment-(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/** Query param that deep-links to one file's section on multi-file RFCs. */
const FILE_PARAM = "file";

/** DOM id of a file's section, so `?file=<path>` deep links can scroll to it. */
function fileSectionId(path: string): string {
  return `file-${path.replace(/[^a-zA-Z0-9_.-]+/g, "-")}`;
}

interface RFCDetailClientProps {
  owner: string;
  repo: string;
  prNumber: number;
  currentUser: string;
  currentUserAvatar: string;
  /** Public/unauthenticated render path. Comment + reaction affordances are
   *  swapped out for a sign-in CTA; reads still resolve via the server-side
   *  public token. */
  isAnonymous?: boolean;
}

type DiffState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      /** Per markdown file path: content at both refs (null = absent at ref). */
      byPath: Record<string, { base: string | null; compare: string | null }>;
    }
  | { kind: "error"; message: string };

export default function RFCDetailClient({
  owner,
  repo,
  prNumber,
  currentUser,
  currentUserAvatar,
  isAnonymous = false,
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
  /** Non-null while the author edits one file: its path plus the working copy
   *  of the markdown. The file's content in `rfc.files` stays the canonical
   *  version until a successful save. */
  const [editing, setEditing] = useState<{
    path: string;
    body: string;
  } | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [savingBody, setSavingBody] = useState(false);
  const [bodyConflict, setBodyConflict] = useState(false);
  const [bodySaveError, setBodySaveError] = useState<string | null>(null);
  // Diff range lives in `?diff=<baseSha>...<compareSha>` so the current
  // comparison is shareable / back-forward navigable. The URL is the source of
  // truth – we derive the range from it and writes go via `setDiffRange`.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const diffRange = useMemo(
    () => parseDiffRange(searchParams.get(DIFF_PARAM)),
    [searchParams],
  );
  const setDiffRange = useCallback(
    (next: DiffRange | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set(DIFF_PARAM, formatDiffRange(next));
      else params.delete(DIFF_PARAM);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );
  /** Keyed by `<shortSha>:<path>`. HEAD content is seeded from `rfc.files`
   *  so the common "previous → HEAD" compare only fetches the base side. */
  const diffContentCache = useRef<Map<string, string | null>>(new Map());
  const [diffState, setDiffState] = useState<DiffState>({ kind: "idle" });

  const isAuthor = !!rfc && !isAnonymous && currentUser === rfc.author;
  const canEditBody = isAuthor && !!rfc && rfc.status === "open";

  const redirectToSignIn = useCallback(() => {
    if (typeof window === "undefined") return;
    const callback = encodeURIComponent(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
    window.location.href = `/api/auth/signin?callbackUrl=${callback}`;
  }, []);
  const anonymousInlineSubmit = useCallback(async () => {
    redirectToSignIn();
  }, [redirectToSignIn]);
  /** Per-file inline comment submitter – closes over the file's repo path so
   *  the review comment lands on the right document. */
  const inlineCommentHandlerFor = (path: string) =>
    isAnonymous
      ? anonymousInlineSubmit
      : (line: number, body: string, replyToCommentId?: number) =>
          handleInlineComment(path, line, body, replyToCommentId);
  const toggleReactionHandler = isAnonymous ? undefined : handleToggleReaction;
  const generalCommentHandler = isAnonymous ? undefined : handleGeneralComment;

  /** The canonical (saved) version of the file currently being edited. */
  const editingFile = useMemo(
    () =>
      editing != null
        ? (rfc?.files.find((file) => file.path === editing.path) ?? null)
        : null,
    [rfc?.files, editing],
  );

  const handleEditingBodyChange = useCallback((next: string) => {
    setEditing((prev) => (prev ? { ...prev, body: next } : prev));
  }, []);

  /** The file a persisted draft belongs to. Pre-multi-file drafts have no
   *  `path` – they implicitly edited the PR's only markdown file. */
  const resolveDraftFile = (draft: PersistedBodyDraft) =>
    (draft.path != null
      ? rfc?.files.find((file) => file.path === draft.path)
      : rfc?.files[0]) ?? null;

  const draftStorageKey = `rfc123:edit:${owner}/${repo}#${prNumber}`;
  const bodyDraftSnapshot: PersistedBodyDraft | null = useMemo(() => {
    if (editing == null) return null;
    if (!editingFile?.sha) return null;
    if (editing.body === editingFile.content) return null;
    return {
      body: editing.body,
      baseFileSha: editingFile.sha,
      path: editingFile.path,
      lastEditedAt: new Date().toISOString(),
    };
  }, [editing, editingFile]);

  const viewDiffEntriesByPath = useMemo(() => {
    if (diffState.kind !== "ready") return null;
    const out = new Map<string, ReturnType<typeof lineDiff>>();
    for (const [path, sides] of Object.entries(diffState.byPath)) {
      out.set(path, lineDiff(sides.base ?? "", sides.compare ?? ""));
    }
    return out;
  }, [diffState]);

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
          { cache: "no-store" },
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

  // App Router + the Suspense wrapper around this client component means a
  // navigation here (e.g. clicking an RFC from the landing showcase) often
  // doesn't reset the browser's scroll position. Force it to the top on the
  // first mount of a given PR – unless the URL targets a specific comment via
  // `#comment-NNN` or a file section via `?file=`, in which case the
  // dedicated scroll effects should win.
  useEffect(() => {
    if (
      parseCommentIdFromHash(window.location.hash) == null &&
      !new URLSearchParams(window.location.search).get(FILE_PARAM)
    ) {
      window.scrollTo(0, 0);
    }
  }, []);

  // Scroll to the file section targeted by `?file=<path>` once content is up.
  const hasScrolledToFile = useRef(false);
  useEffect(() => {
    if (isLoading || !rfc || hasScrolledToFile.current) return;
    const target = searchParams.get(FILE_PARAM);
    if (!target || !rfc.files.some((file) => file.path === target)) return;
    hasScrolledToFile.current = true;
    // Wait a tick for markdown + comment layout to settle.
    const timer = setTimeout(() => {
      document
        .getElementById(fileSectionId(target))
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(timer);
  }, [isLoading, rfc, searchParams]);

  useEffect(() => {
    if (!rfc?.headSha) return;
    // Cache keys come from the picker / URL, which use short SHAs.
    for (const file of rfc.files) {
      diffContentCache.current.set(
        `${shortSha(rfc.headSha)}:${file.path}`,
        file.content,
      );
    }
  }, [rfc?.headSha, rfc?.files]);

  // Out-of-order responses (user flips Base while a previous request is in
  // flight) are dropped with a cancellation token.
  useEffect(() => {
    const paths = rfc?.files.map((file) => file.path) ?? [];
    if (!diffRange || paths.length === 0) {
      setDiffState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    const cache = diffContentCache.current;

    async function fetchSide(
      sha: string,
      path: string,
    ): Promise<string | null> {
      const cacheKey = `${sha}:${path}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;
      const res = await fetch(
        `/api/rfcs/${prNumber}/content-at?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&sha=${encodeURIComponent(sha)}&path=${encodeURIComponent(path)}`,
      );
      if (res.status === 404) {
        // File absent at this ref (e.g. added later in the PR) – diff as fully added.
        cache.set(cacheKey, null);
        return null;
      }
      if (!res.ok) throw new Error("Failed to fetch content");
      const data = (await res.json()) as { content: string };
      cache.set(cacheKey, data.content);
      return data.content;
    }

    setDiffState({ kind: "loading" });
    Promise.all(
      paths.map(async (path) => {
        const [base, compare] = await Promise.all([
          fetchSide(diffRange.baseSha, path),
          fetchSide(diffRange.compareSha, path),
        ]);
        return [path, { base, compare }] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        setDiffState({ kind: "ready", byPath: Object.fromEntries(entries) });
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setDiffState({
          kind: "error",
          message: e.message || "Failed to load diff",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [diffRange, rfc?.files, owner, repo, prNumber]);

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
    path: string,
    line: number,
    body: string,
    replyToCommentId?: number,
  ) {
    if (!rfc) return;

    const optimisticComment: Comment = {
      id: Date.now(),
      user: currentUser,
      userAvatar: currentUserAvatar,
      body,
      createdAt: new Date().toISOString(),
      path,
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
          path,
          line,
          replyToCommentId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to post comment");
      }

      posthog.capture("comment_posted", {
        comment_type: "inline",
        is_reply: replyToCommentId != null,
        owner,
        repo,
        rfc_number: rfc.number,
      });

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

  function toggleViewerReaction(
    reactions: CommentReactions | undefined,
    content: ReactionContent,
    add: boolean,
  ): CommentReactions {
    const next: CommentReactions = {
      counts: { ...(reactions?.counts ?? {}) },
      viewer: [...(reactions?.viewer ?? [])],
      users: { ...(reactions?.users ?? {}) },
    };
    const current = next.counts[content] ?? 0;
    const currentUsers = next.users[content] ?? [];
    if (add) {
      next.counts[content] = current + 1;
      if (!next.viewer.includes(content)) next.viewer.push(content);
      if (!currentUsers.includes(currentUser)) {
        next.users[content] = [...currentUsers, currentUser];
      }
    } else {
      const dec = Math.max(0, current - 1);
      if (dec === 0) delete next.counts[content];
      else next.counts[content] = dec;
      next.viewer = next.viewer.filter((c) => c !== content);
      const filtered = currentUsers.filter((u) => u !== currentUser);
      if (filtered.length === 0) delete next.users[content];
      else next.users[content] = filtered;
    }
    return next;
  }

  async function handleToggleReaction(
    commentId: number,
    content: ReactionContent,
  ) {
    // Find the latest authoritative comment (server-fetched, not optimistic).
    const target = comments.find((c) => c.id === commentId);
    if (!target?.nodeId) return;
    const previousReactions = target.reactions;
    const hasReaction = previousReactions?.viewer.includes(content) ?? false;
    const method = hasReaction ? "DELETE" : "POST";

    // Optimistic update.
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? {
              ...c,
              reactions: toggleViewerReaction(
                c.reactions,
                content,
                !hasReaction,
              ),
            }
          : c,
      ),
    );

    try {
      const res = await fetch(`/api/rfcs/${prNumber}/reactions`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentNodeId: target.nodeId, content }),
      });
      if (!res.ok) throw new Error("Failed to update reaction");
      const data = (await res.json()) as { reactions: CommentReactions };
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, reactions: data.reactions } : c,
        ),
      );
    } catch (error) {
      console.error("Error toggling reaction:", error);
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, reactions: previousReactions } : c,
        ),
      );
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

    posthog.capture("comment_posted", {
      comment_type: "general",
      is_reply: false,
      owner,
      repo,
      rfc_number: prNumber,
    });

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
      posthog.capture("rfc_state_changed", {
        action,
        owner,
        repo,
        rfc_number: prNumber,
      });
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

  function enterBodyEdit(path: string) {
    const file = rfc?.files.find((f) => f.path === path);
    if (!file) return;
    setEditing({ path: file.path, body: file.content });
    setEditTab("write");
    setCommitMessage("");
    setBodyConflict(false);
    setBodySaveError(null);
    setDiffRange(null);
  }

  function exitBodyEdit(opts: { clearDraft?: boolean } = {}) {
    setEditing(null);
    setBodyConflict(false);
    setBodySaveError(null);
    if (opts.clearDraft) clearBodyDraft();
  }

  function resumeBodyDraft() {
    if (!pendingBodyDraft || !rfc) return;
    const draftFile = resolveDraftFile(pendingBodyDraft);
    if (!draftFile) return;
    setEditing({ path: draftFile.path, body: pendingBodyDraft.body });
    setCommitMessage("");
    setBodyConflict(false);
    setBodySaveError(null);
    setDiffRange(null);
    acceptBodyDraft();
  }

  function handleDiscardEdit() {
    if (editing == null || !rfc) return;
    const dirty = editing.body !== editingFile?.content;
    if (dirty && !window.confirm("Discard your unsaved edits to this RFC?")) {
      return;
    }
    exitBodyEdit({ clearDraft: true });
  }

  async function resetAndRefresh() {
    exitBodyEdit({ clearDraft: true });
    await loadRFC({ silent: true });
  }

  async function handleSaveBody() {
    if (editing == null || !editingFile?.sha) return;
    if (editing.body === editingFile.content) {
      // Nothing changed – just exit. Save shouldn't be reachable here, but
      // belt + suspenders.
      exitBodyEdit({ clearDraft: true });
      return;
    }
    // An empty commit message is allowed – the server generates a short one
    // from the diff between the saved body and this edit.
    const trimmedMessage = commitMessage.trim();
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
            body: editing.body,
            commitMessage: trimmedMessage,
            baseFileSha: editingFile.sha,
            markdownFilePath: editingFile.path,
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
              files: prev.files.map((file) =>
                file.path === editingFile.path
                  ? { ...file, content: editing.body, sha: saved.fileSha }
                  : file,
              ),
              headSha: saved.commitSha,
              updatedAt: new Date().toISOString(),
            }
          : prev,
      );
      posthog.capture("rfc_body_saved", {
        owner,
        repo,
        rfc_number: prNumber,
      });
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
      posthog.capture("reviewers_updated", {
        reviewer_count: next.length,
        owner,
        repo,
        rfc_number: prNumber,
      });
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

  const topBarUser = isAnonymous
    ? null
    : { name: currentUser, image: currentUserAvatar };
  const topBarHomeHref = isAnonymous ? "/" : "/rfcs";
  const topBarSecondaryActions = isAnonymous ? null : (
    <RFCsTopBarSecondaryActions />
  );
  const topBarPrimaryActions = isAnonymous ? (
    <AnonymousSignInButton />
  ) : (
    <RFCsTopBarPrimaryAction repo={{ owner, name: repo }} />
  );

  if (isLoading) {
    return (
      <RFCDetailLoadingSkeleton
        user={topBarUser}
        repo={{ owner, name: repo }}
      />
    );
  }

  if (error || !rfc) {
    return (
      <div className="mx-auto max-w-360 min-h-screen px-4 sm:px-8 py-6 sm:py-12">
        <RFCsTopBar
          user={topBarUser}
          homeHref={topBarHomeHref}
          secondaryActions={topBarSecondaryActions}
          primaryActions={topBarPrimaryActions}
        />
        <div className="py-12 text-center text-sm text-magenta">
          {error || "Failed to load RFC"}
        </div>
      </div>
    );
  }

  // Merge actual comments with optimistic comments. Inline comments anchor to
  // one of the PR's markdown files; inline comments on any *other* changed
  // file (images, code riding along in the PR) surface with the general
  // discussion instead of being dropped.
  const allComments = [...comments, ...optimisticComments];
  const markdownPaths = new Set(rfc.files.map((file) => file.path));
  const isAnchoredToFile = (c: Comment) =>
    !!c.line && c.path != null && markdownPaths.has(c.path);
  const lineCommentsByPath = new Map<string, Comment[]>();
  for (const c of allComments.filter(isAnchoredToFile)) {
    const path = c.path as string;
    const group = lineCommentsByPath.get(path);
    if (group) group.push(c);
    else lineCommentsByPath.set(path, [c]);
  }
  const generalComments = allComments.filter((c) => !isAnchoredToFile(c));

  const multiFile = rfc.files.length > 1;
  const pendingDraftFile = pendingBodyDraft
    ? resolveDraftFile(pendingBodyDraft)
    : null;

  return (
    <div className="mx-auto max-w-360 min-h-screen px-4 sm:px-8 py-6 sm:py-12">
      <RFCsTopBar
        user={topBarUser}
        homeHref={topBarHomeHref}
        secondaryActions={topBarSecondaryActions}
        primaryActions={topBarPrimaryActions}
      />

      {isAnonymous && (
        <div className="mb-3">
          <AnonymousSignInCTA message="You're viewing this RFC publicly, but PostHog's team members see it the same way. Sign up with GitHub to get started yourself." />
        </div>
      )}

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
                // body isn't already being edited – the two modes are
                // mutually exclusive per spec.
                onTitleSave:
                  rfc.status === "open" && editing == null
                    ? handleTitleSave
                    : undefined,
              }
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            {editing == null && (
              <DiscussWithAgentButton
                owner={owner}
                repo={repo}
                prNumber={rfc.number}
                title={rfc.title}
                author={rfc.author}
              />
            )}
            {/* With several files the per-section pencil disambiguates which
                one is being edited; the header button covers the common
                single-document RFC. */}
            {canEditBody && editing == null && !multiFile && (
              <button
                type="button"
                onClick={() => enterBodyEdit(rfc.files[0].path)}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-30 bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-gray-5 cursor-pointer"
              >
                <PencilIcon className="h-3.5 w-3.5" />
                Edit
              </button>
            )}
            {editing != null && (
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
          editing == null && rfc.files.length > 0 ? (
            <div className="flex items-center gap-2">
              <CommitRangePicker
                owner={owner}
                repo={repo}
                prNumber={rfc.number}
                range={diffRange}
                onRangeChange={setDiffRange}
              />
              <ViewModeToggle
                value={viewMode}
                onChange={setViewMode}
                options={[
                  { value: "pretty", label: "Pretty" },
                  { value: "raw", label: "Raw" },
                ]}
              />
            </div>
          ) : editing != null ? (
            <ViewModeToggle
              value={editTab}
              onChange={setEditTab}
              options={[
                { value: "write", label: "Write" },
                { value: "preview", label: "Preview" },
              ]}
            />
          ) : null
        }
      />

      {editing == null && canEditBody && pendingBodyDraft && (
        <BodyDraftRestoreBanner
          draft={pendingBodyDraft}
          stale={
            !!pendingDraftFile?.sha &&
            pendingBodyDraft.baseFileSha !== pendingDraftFile.sha
          }
          onResume={resumeBodyDraft}
          onDiscard={discardBodyDraft}
        />
      )}

      <div className="relative border-t border-gray-20 pt-4">
        {rfc.files.length === 0 ? (
          <RfcMarkdownMissing
            attempts={
              rfc.markdownMissingAttempts ?? [
                "Listed changed files on this pull request and looked for a path ending in `.md`.",
              ]
            }
            githubUrl={rfc.url}
          />
        ) : (
          <>
            {diffRange && diffState.kind === "error" && (
              <div className="mb-4 rounded-sm border border-magenta bg-magenta-light px-3 py-2 text-sm text-foreground">
                {diffState.message}
              </div>
            )}
            <div className="space-y-10">
              {rfc.files.map((file) => {
                const isEditingThisFile =
                  editing != null && editing.path === file.path;
                const fileLineComments =
                  lineCommentsByPath.get(file.path) ?? [];
                const fileDiffEntries =
                  viewDiffEntriesByPath?.get(file.path) ?? null;
                const showDiffForFile =
                  !isEditingThisFile &&
                  !!diffRange &&
                  diffState.kind !== "error";
                return (
                  <section
                    key={file.path}
                    id={fileSectionId(file.path)}
                    className="scroll-mt-20"
                  >
                    {multiFile && (
                      <FileSectionHeading
                        path={file.path}
                        onEdit={
                          canEditBody && editing == null
                            ? () => enterBodyEdit(file.path)
                            : undefined
                        }
                      />
                    )}
                    {isEditingThisFile ? (
                      <BodyEditMode
                        body={editing.body}
                        originalBody={file.content}
                        owner={owner}
                        repo={repo}
                        markdownFilePath={file.path}
                        headRef={rfc.headSha}
                        lineComments={fileLineComments}
                        highlightedCommentId={highlightedCommentId}
                        onCommentSubmit={inlineCommentHandlerFor(file.path)}
                        onToggleReaction={handleToggleReaction}
                        previewAssets={{
                          owner,
                          repo,
                          headRef: rfc.headSha,
                          markdownFilePath: file.path,
                        }}
                        onBodyChange={handleEditingBodyChange}
                        mode={editTab}
                        onModeChange={setEditTab}
                        commitMessage={commitMessage}
                        onCommitMessageChange={setCommitMessage}
                        saving={savingBody}
                        onSave={handleSaveBody}
                        disabled={editing.body === file.content}
                        conflict={bodyConflict}
                        onResetAndRefresh={resetAndRefresh}
                        saveError={bodySaveError}
                      />
                    ) : showDiffForFile ? (
                      !fileDiffEntries ? (
                        <p className="text-sm text-gray-50">
                          Loading diff between {shortSha(diffRange.baseSha)} and{" "}
                          {shortSha(diffRange.compareSha)}…
                        </p>
                      ) : viewMode === "pretty" ? (
                        <RfcPrettyDiffView
                          entries={fileDiffEntries}
                          assets={{
                            owner,
                            repo,
                            // Image proxy points at the "compare" commit so relative
                            // `![](./img.png)` references resolve against that tree.
                            headRef: diffRange.compareSha,
                            markdownFilePath: file.path,
                          }}
                        />
                      ) : (
                        <RfcMonoDiffView entries={fileDiffEntries} />
                      )
                    ) : viewMode === "pretty" ? (
                      <InlineCommentableMarkdown
                        content={file.content}
                        owner={owner}
                        repo={repo}
                        markdownFilePath={file.path}
                        headRef={rfc.headSha}
                        comments={fileLineComments}
                        commentsLoading={commentsLoading}
                        highlightedCommentId={highlightedCommentId}
                        onCommentSubmit={inlineCommentHandlerFor(file.path)}
                        onToggleReaction={toggleReactionHandler}
                        disableNewComments={isAnonymous}
                      />
                    ) : (
                      <MarkdownRawView content={file.content} />
                    )}
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>

      <GeneralCommentsSection
        owner={owner}
        repo={repo}
        comments={generalComments}
        commentsLoading={commentsLoading}
        prNumber={rfc.number}
        highlightedCommentId={highlightedCommentId}
        onCommentPosted={generalCommentHandler}
        onToggleReaction={toggleReactionHandler}
        readOnlyFooter={isAnonymous ? <AnonymousSignInCTA /> : undefined}
      />
    </div>
  );
}

/** Heading above each document on multi-file RFCs: the repo path (styled as
 *  metadata so it doesn't compete with the markdown's own headings), a
 *  copy-deep-link affordance, and the per-file edit entry point. */
function FileSectionHeading({
  path,
  onEdit,
}: {
  path: string;
  onEdit?: () => void;
}) {
  const mutateUrl = useCallback(
    (url: URL) => {
      url.searchParams.set(FILE_PARAM, path);
      url.hash = "";
    },
    [path],
  );

  return (
    <div className="mb-4 flex items-center gap-2 border-b border-gray-20 pb-2">
      <span className="min-w-0 truncate font-mono text-sm text-gray-70">
        {path}
      </span>
      <Tooltip content="Copy link to this document">
        <CopyLinkButton
          mutateUrl={mutateUrl}
          ariaLabel={`Copy link to ${path}`}
          className="text-gray-50 hover:text-foreground transition-colors cursor-pointer"
          iconClassName="h-3.5 w-3.5"
        />
      </Tooltip>
      {onEdit && (
        <Tooltip content="Edit this document">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${path}`}
            className="text-gray-50 hover:text-foreground transition-colors cursor-pointer"
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

interface BodyEditModeProps {
  body: string;
  /** The unedited version of the body – used as the "before" side of the diff
   *  view when the user toggles Preview → Diff, and as the original-line
   *  reference for inline-comment anchoring. */
  originalBody: string;
  owner: string;
  repo: string;
  markdownFilePath: string | null;
  headRef: string;
  /** Inline comments to display next to the editor — anchored to lines in
   *  `originalBody`. The component remaps them to the current buffer. */
  lineComments: Comment[];
  highlightedCommentId: number | null;
  onCommentSubmit: (
    line: number,
    body: string,
    replyToCommentId?: number,
  ) => Promise<void>;
  onToggleReaction: (commentId: number, content: ReactionContent) => void;
  previewAssets: RfcMarkdownAssets;
  onBodyChange: (next: string) => void;
  /** Page-level Write/Preview toggle drives the editor – RFCBodyEditor hides
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
  owner,
  repo,
  markdownFilePath,
  headRef,
  lineComments,
  highlightedCommentId,
  onCommentSubmit,
  onToggleReaction,
  previewAssets,
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
  const [wordWrap, setWordWrap] = useState(true);

  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const writeContainerRef = useRef<HTMLDivElement>(null);
  const [editTick, setEditTick] = useState(0);
  const bumpEditTick = useCallback(() => setEditTick((t) => t + 1), []);

  // Line-mapping (and lineDiff) is O(n*m), so we delay it until the user stops
  // typing for 200ms. The editor itself still receives the live `body`; only
  // inline-comment anchor positions and the diff view lag, which is fine — a
  // brief misalignment is far less disruptive than a keystroke stutter on a
  // long RFC.
  const debouncedBody = useDebouncedValue(body, 200);

  const diffEntries = useMemo(
    () =>
      mode === "preview" && showDiff
        ? lineDiff(originalBody, debouncedBody)
        : null,
    [mode, showDiff, originalBody, debouncedBody],
  );

  // Single LCS pass shared by the Write-tab sidebar and the Preview-tab remap.
  const lineMapping = useMemo(
    () => mapOriginalLines(originalBody, debouncedBody),
    [originalBody, debouncedBody],
  );
  const previewRemappedComments = useMemo(() => {
    if (mode !== "preview" || showDiff) return [];
    const out: Comment[] = [];
    for (const c of lineComments) {
      if (!c.line) continue;
      const mapped = lineMapping.get(c.line);
      if (mapped == null) continue;
      out.push({ ...c, line: mapped });
    }
    return out;
  }, [lineComments, lineMapping, mode, showDiff]);

  // Replies in Preview tab arrive with the *buffer-remapped* line (the only
  // line the child knows about). The reply is always against an existing
  // comment, so we look up the original line via `replyToCommentId` and pass
  // that to the parent — keeps optimistic state anchored to the same line the
  // persisted thread will resolve to.
  const onPreviewCommentSubmit = useCallback(
    (line: number, replyBody: string, replyToCommentId?: number) => {
      let originalLine = line;
      if (replyToCommentId != null) {
        const source = lineComments.find((c) => c.id === replyToCommentId);
        if (source?.line) originalLine = source.line;
      }
      return onCommentSubmit(originalLine, replyBody, replyToCommentId);
    },
    [lineComments, onCommentSubmit],
  );

  const showWriteSidebar = mode === "write" && !!markdownFilePath;
  const showPreviewInline =
    mode === "preview" && !showDiff && !!markdownFilePath;
  const previewSlot =
    mode === "preview" && showDiff ? (
      <RfcPrettyDiffView
        entries={diffEntries ?? []}
        assets={previewAssets}
        noChangesMessage="No changes. Your version matches the saved revision."
      />
    ) : undefined;
  const writeDiffAgainst =
    mode === "write" && showDiff ? originalBody : undefined;

  return (
    <>
      <div className="space-y-4 pb-24">
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
        {showPreviewInline ? (
          body.trim() ? (
            <InlineCommentableMarkdown
              content={body}
              owner={owner}
              repo={repo}
              markdownFilePath={markdownFilePath}
              headRef={headRef}
              comments={previewRemappedComments}
              highlightedCommentId={highlightedCommentId}
              onCommentSubmit={onPreviewCommentSubmit}
              onToggleReaction={onToggleReaction}
              disableNewComments
            />
          ) : (
            <EmptyPreviewHint />
          )
        ) : (
          <div
            ref={writeContainerRef}
            className="relative grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 lg:gap-12"
          >
            <div className="min-w-0">
              <RFCBodyEditor
                body={body}
                onBodyChange={onBodyChange}
                mode={mode}
                onModeChange={onModeChange}
                previewSlot={previewSlot}
                diffAgainst={writeDiffAgainst}
                wordWrap={wordWrap}
                previewAssets={previewAssets}
                editorRef={editorRef}
                onEditorUpdate={bumpEditTick}
              />
            </div>
            {showWriteSidebar && (
              <EditModeInlineComments
                originalToCurrentLine={lineMapping}
                comments={lineComments}
                editorRef={editorRef}
                containerRef={writeContainerRef}
                editTick={editTick}
                isSubmitting={false}
                highlightedCommentId={highlightedCommentId}
                onCommentSubmit={onCommentSubmit}
              />
            )}
          </div>
        )}
        {saveError && !conflict && (
          <div className="rounded-sm border border-magenta bg-magenta-light px-3 py-2 text-sm text-foreground">
            {saveError}
          </div>
        )}
      </div>
      <EditCommitBar
        commitMessage={commitMessage}
        onCommitMessageChange={onCommitMessageChange}
        disabled={disabled}
        saving={saving}
        conflict={conflict}
        onSave={onSave}
        showDiff={showDiff}
        onShowDiffChange={setShowDiff}
        wordWrap={wordWrap}
        onWordWrapChange={setWordWrap}
      />
    </>
  );
}

interface EditCommitBarProps {
  commitMessage: string;
  onCommitMessageChange: (next: string) => void;
  disabled: boolean;
  saving: boolean;
  conflict: boolean;
  onSave: () => void;
  showDiff: boolean;
  onShowDiffChange: (next: boolean) => void;
  wordWrap: boolean;
  onWordWrapChange: (next: boolean) => void;
}

/** Fixed commit message + save control for RFC body edit mode. */
function EditCommitBar({
  commitMessage,
  onCommitMessageChange,
  disabled,
  saving,
  conflict,
  onSave,
  showDiff,
  onShowDiffChange,
  wordWrap,
  onWordWrapChange,
}: EditCommitBarProps) {
  return (
    <section
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-20/80 bg-surface/90 shadow-[0_-8px_24px_-4px_rgba(0,0,0,0.06)] backdrop-blur-md supports-backdrop-filter:bg-surface/75"
      aria-label="Commit changes"
    >
      <div className="mx-auto flex max-w-360 items-center gap-3 px-4 py-3 sm:gap-4 sm:px-8 sm:py-3.5">
        <Checkbox
          checked={showDiff}
          onChange={onShowDiffChange}
          label="Show diff"
          className="shrink-0"
        />
        <Checkbox
          checked={wordWrap}
          onChange={onWordWrapChange}
          label="Wrap"
          className="shrink-0"
        />
        <input
          type="text"
          value={commitMessage}
          onChange={(e) => onCommitMessageChange(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter saves, matching the Save button's guards.
            if (
              e.key === "Enter" &&
              (e.metaKey || e.ctrlKey) &&
              !saving &&
              !disabled &&
              !conflict
            ) {
              e.preventDefault();
              onSave();
            }
          }}
          placeholder="What's changed? (optional – we'll summarize it)"
          className="min-w-0 flex-1 rounded-md border border-gray-20 bg-background/60 px-3.5 py-2 text-sm text-foreground placeholder:text-gray-50 transition-colors hover:border-gray-30 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan"
        />
        <SaveButton
          disabled={disabled}
          saving={saving}
          conflict={conflict}
          commitMessage={commitMessage}
          onSave={onSave}
        />
      </div>
    </section>
  );
}

interface SaveButtonProps {
  /** True when the body matches what's on GitHub – nothing to save. */
  disabled: boolean;
  saving: boolean;
  conflict: boolean;
  commitMessage: string;
  onSave: () => void;
}

/** Save button + tooltip. When saving is blocked the tooltip explains why;
 *  otherwise it hints at the behavior – an empty commit message gets
 *  summarized server-side, and ⌘/Ctrl+Enter saves. */
function SaveButton({
  disabled,
  saving,
  conflict,
  commitMessage,
  onSave,
}: SaveButtonProps) {
  // Hydration-safe macOS detection: starts false (matching SSR) and resolves
  // after mount, so the first client render never diverges from the server.
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } })
        .userAgentData?.platform ||
      navigator.platform ||
      "";
    setIsMac(/mac/i.test(platform));
  }, []);
  const shortcut = `${isMac ? "⌘" : "Ctrl"}+Enter`;
  const disabledReason: string | null = conflict
    ? "Resolve the conflict before saving."
    : disabled
      ? "Nothing to save – the body hasn't changed."
      : null;
  const tooltip =
    disabledReason ??
    (commitMessage.trim().length === 0
      ? `Leave blank and we'll summarize your changes. ${shortcut}`
      : `Save your changes. ${shortcut}`);
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

  // Wrap in a span so the tooltip trigger still receives pointer events when
  // the button is disabled (disabled <button>s swallow them in some browsers).
  return (
    <Tooltip content={tooltip}>
      <span className="inline-flex">{button}</span>
    </Tooltip>
  );
}

interface BodyDraftRestoreBannerProps {
  draft: PersistedBodyDraft;
  /** True when the draft was started against a different file SHA than what
   *  GitHub currently has – restoring would risk overwriting newer commits. */
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
          ? "The RFC has new commits since then – resuming would overwrite them. Discard recommended."
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
