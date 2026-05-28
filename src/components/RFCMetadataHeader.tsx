"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  EditableReviewers,
  type ReviewerItem,
} from "@/components/EditableReviewers";
import { PencilIcon } from "@/components/icons/PencilIcon";
import { ProfilePictures } from "@/components/ProfilePictures";
import { RelativeTime } from "@/components/RelativeTime";
import { RFCStatusPill, type RfcStateAction } from "@/components/RFCStatusPill";
import type { RFCDetail } from "@/lib/github";

/** Author-only callbacks + transient flags. Presence implies the viewer is
 *  the RFC's author; the header switches the status pill into a state menu
 *  and the reviewers row into an inline editor. */
export interface AuthorControls {
  busyStateAction: RfcStateAction | null;
  onStateAction: (action: RfcStateAction) => void;
  onReviewersChange: (next: ReviewerItem[]) => void;
  reviewersSaving: boolean;
  /** When set, the title becomes click-to-edit. The handler should resolve
   *  on success and throw on failure (the inline editor surfaces the error
   *  message). Omitted when title editing is disallowed (e.g. RFC is merged
   *  or the page already has body-edit mode open). */
  onTitleSave?: (next: string) => Promise<void>;
}

interface RFCMetadataHeaderProps {
  rfc: RFCDetail;
  /** Right-aligned controls in the row next to the H1 (Edit / Discuss). */
  actions?: ReactNode;
  /** Right-aligned controls in the byline row alongside Reviewers/Comments
   *  (e.g. the Pretty/Raw or Write/Preview segmented toggle). */
  bylineActions?: ReactNode;
  authorControls?: AuthorControls;
}

export function RFCMetadataHeader({
  rfc,
  actions,
  bylineActions,
  authorControls,
}: RFCMetadataHeaderProps) {
  const isAuthor = !!authorControls;
  // Derived from `rfc.reviewers` + `rfc.requestedTeamSlugs` so the editor row
  // stays in lockstep with the canonical state.
  const reviewerItems: ReviewerItem[] = [
    ...rfc.reviewers.map<ReviewerItem>((r) => ({
      kind: "user",
      handle: r.login,
      displayName: r.login,
      avatarUrl: r.avatar,
    })),
    ...rfc.requestedTeamSlugs.map<ReviewerItem>((slug) => ({
      kind: "team",
      handle: slug.includes("/") ? slug.split("/")[1] : slug,
      displayName: slug,
      avatarUrl: null,
    })),
  ];

  return (
    <section className="mb-6">
      {/* Eyebrow row: RFC number, right-aligned outbound link */}
      <div className="mb-6 flex items-center gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-gray-50">
          RFC #{rfc.number}
        </span>
        <span className="h-px flex-1 bg-gray-20" />
        {rfc.reviewRequested && (
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-magenta">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-magenta"
              aria-hidden
            />
            Review requested
          </span>
        )}
        <a
          href={rfc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-gray-50 transition-colors hover:text-foreground"
        >
          GitHub
          <svg
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            role="img"
            aria-label="Open in new tab"
          >
            <title>Open in new tab</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M14 4h6m0 0v6m0-6L10 14M6 6h4M6 6v12a2 2 0 002 2h12"
            />
          </svg>
        </a>
      </div>

      {/* Title block */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {authorControls?.onTitleSave ? (
          <EditableRfcTitle
            value={rfc.title}
            onSave={authorControls.onTitleSave}
          />
        ) : (
          <h1 className="max-w-3xl text-balance text-3xl sm:text-5xl font-serif font-bold leading-[1.05] tracking-tight text-foreground">
            {rfc.title}
          </h1>
        )}
        {actions && <div className="shrink-0 sm:pb-1.5">{actions}</div>}
      </div>

      {/* Byline – author, time, comments, reviewers, all on one quiet line */}
      <dl className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-gray-70">
        <div className="flex items-center gap-2">
          <dt className="sr-only">Author</dt>
          <dd className="flex items-center gap-2">
            <img
              src={rfc.authorAvatar}
              alt={rfc.author}
              className="h-5 w-5 rounded-full border border-gray-20"
            />
            <span className="font-medium text-foreground">{rfc.author}</span>
          </dd>
        </div>

        <span className="h-3 w-px bg-gray-20" aria-hidden />

        <div className="flex items-center gap-2">
          <dt className="text-gray-50">Status</dt>
          <dd>
            <RFCStatusPill
              rfc={rfc}
              isAuthor={isAuthor}
              busy={!!authorControls && authorControls.busyStateAction !== null}
              onAction={(action) => authorControls?.onStateAction(action)}
            />
          </dd>
        </div>

        <span className="h-3 w-px bg-gray-20" aria-hidden />

        <div className="flex items-center gap-1.5">
          <dt className="text-gray-50">Updated</dt>
          <dd className="text-foreground">
            <RelativeTime date={rfc.updatedAt} />
          </dd>
        </div>

        <span className="h-3 w-px bg-gray-20" aria-hidden />

        <div className="flex items-center gap-1.5">
          <dt className="text-gray-50">Comments</dt>
          <dd className="font-mono tabular-nums text-foreground">
            {rfc.commentCount ?? "–"}
          </dd>
        </div>

        {(isAuthor || reviewerItems.length > 0) && (
          <>
            <span className="h-3 w-px bg-gray-20" aria-hidden />
            <div className="flex items-center gap-2">
              <dt className="text-gray-50">Reviewers</dt>
              <dd>
                {authorControls ? (
                  <EditableReviewers
                    items={reviewerItems}
                    org={rfc.owner}
                    onChange={authorControls.onReviewersChange}
                    saving={authorControls.reviewersSaving}
                  />
                ) : (
                  <ProfilePictures
                    users={rfc.reviewers.map((r) => ({
                      name: r.login,
                      avatar: r.avatar,
                    }))}
                  />
                )}
              </dd>
            </div>
          </>
        )}

        {bylineActions && (
          <div className="ml-auto flex items-center">{bylineActions}</div>
        )}
      </dl>
    </section>
  );
}

interface EditableRfcTitleProps {
  value: string;
  onSave: (next: string) => Promise<void>;
}

/** Inline click-to-edit for the RFC title. The h1 looks the same in read mode;
 *  clicking swaps it for a same-typography text input with check / cancel
 *  buttons and Enter/Escape shortcuts. Errors bubble from the parent's save
 *  handler and render directly under the input. */
function EditableRfcTitle({ value, onSave }: EditableRfcTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function start() {
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function commit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      cancel();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message || "Failed to save title.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={start}
        title="Edit title"
        className="group max-w-3xl text-left text-balance text-3xl sm:text-5xl font-serif font-bold leading-[1.05] tracking-tight text-foreground transition-colors hover:text-foreground/80 cursor-pointer"
      >
        {value}
        <PencilIcon className="ml-2 inline-block h-4 w-4 align-middle text-gray-50 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <div className="max-w-3xl flex-1">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        disabled={saving}
        aria-label="RFC title"
        className="w-full bg-transparent text-balance text-3xl sm:text-5xl font-serif font-bold leading-[1.05] tracking-tight text-foreground placeholder-gray-40 focus:outline-none border-b border-cyan disabled:opacity-60"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={commit}
          disabled={saving || !draft.trim() || draft.trim() === value}
          className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-surface transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
        >
          {saving ? "Saving…" : "Save title"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="rounded-md border border-gray-20 bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-gray-5 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-magenta">{error}</span>}
      </div>
    </div>
  );
}
