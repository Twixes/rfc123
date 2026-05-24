import type { ReactNode } from "react";
import {
  EditableReviewers,
  type ReviewerItem,
} from "@/components/EditableReviewers";
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
}

interface RFCMetadataHeaderProps {
  rfc: RFCDetail;
  /** Optional inline controls rendered in the right-hand action cluster (e.g. view mode toggle). */
  actions?: ReactNode;
  authorControls?: AuthorControls;
}

export function RFCMetadataHeader({
  rfc,
  actions,
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
      {/* Eyebrow row: small caps status + RFC number, right-aligned outbound link */}
      <div className="mb-6 flex items-center gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-gray-50">
          RFC #{rfc.number}
        </span>
        <span className="h-px flex-1 bg-gray-20" />
        <RFCStatusPill
          rfc={rfc}
          isAuthor={isAuthor}
          busy={!!authorControls && authorControls.busyStateAction !== null}
          onAction={(action) => authorControls?.onStateAction(action)}
        />
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
        <h1 className="max-w-3xl text-balance text-3xl sm:text-5xl font-serif font-normal leading-[1.05] tracking-tight text-foreground">
          {rfc.title}
        </h1>
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
      </dl>
    </section>
  );
}
