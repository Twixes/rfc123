import Link from "next/link";
import { Suspense } from "react";
import {
  fetchShowcase,
  SHOWCASE_REPO,
  type ShowcaseRFC,
} from "@/lib/landing-showcase";
import { getPublicGitHubToken } from "@/lib/public-access";
import { STATUS_PILL_CLASSES } from "@/lib/rfc-status";
import { RelativeTime } from "./RelativeTime";

const SKELETON_ROW_COUNT = 6;

function ArrowIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="w-4 h-4 text-gray-50 group-hover/header:text-foreground transition-colors"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <title>Open</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8h10M9 4l4 4-4 4"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="w-3.5 h-3.5"
      fill="currentColor"
    >
      <title>Comments</title>
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v7a1.5 1.5 0 0 1-1.5 1.5H7l-3.5 2.5V12H3.5A1.5 1.5 0 0 1 2 10.5v-7z" />
    </svg>
  );
}

function StatusBadge({ status }: { status: "open" | "merged" }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-foreground ${STATUS_PILL_CLASSES[status]}`}
    >
      {status}
    </span>
  );
}

function ShowcaseRow({ rfc }: { rfc: ShowcaseRFC }) {
  return (
    <li>
      <Link
        href={rfc.detailHref}
        className="group flex items-start gap-3 px-4 sm:px-5 py-2.5 hover:bg-gray-5 transition-colors"
      >
        {rfc.authorAvatar ? (
          // biome-ignore lint/performance/noImgElement: external avatar
          <img
            src={rfc.authorAvatar}
            alt=""
            width={20}
            height={20}
            className="mt-0.5 h-5 w-5 rounded-full border border-gray-20"
          />
        ) : (
          <span className="mt-0.5 inline-block h-5 w-5 rounded-full bg-gray-20" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <StatusBadge status={rfc.status} />
            <span className="font-mono text-xs text-gray-50 shrink-0">
              #{rfc.number}
            </span>
            <span className="text-sm text-foreground group-hover:underline decoration-gray-40 underline-offset-2 truncate">
              {rfc.title}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-50">
            <span className="truncate">@{rfc.author}</span>
            <span aria-hidden>·</span>
            <RelativeTime date={rfc.updatedAt} className="whitespace-nowrap" />
            {rfc.commentCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <CommentIcon />
                  {rfc.commentCount}
                </span>
              </>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

function ShowcaseRowSkeleton({ index }: { index: number }) {
  // Deterministic per-row widths so SSR markup matches the client and the
  // visual rhythm reads as varied content rather than a copy-paste.
  const titleWidths = ["w-2/3", "w-3/4", "w-1/2", "w-4/5", "w-3/5", "w-2/3"];
  const metaWidths = ["w-32", "w-40", "w-28", "w-36", "w-32", "w-40"];
  const titleWidth = titleWidths[index % titleWidths.length];
  const metaWidth = metaWidths[index % metaWidths.length];
  return (
    <li
      aria-hidden
      className="flex items-start gap-3 px-4 sm:px-5 py-2.5 animate-pulse"
    >
      <span className="mt-0.5 inline-block h-5 w-5 rounded-full bg-gray-20" />
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="inline-block h-4 w-12 rounded-sm bg-gray-20" />
          <span
            className={`inline-block h-5 ${titleWidth} rounded bg-gray-20`}
          />
        </div>
        <span className={`inline-block h-4 ${metaWidth} rounded bg-gray-20`} />
      </div>
    </li>
  );
}

function ShowcaseListSkeleton() {
  return (
    <ul className="divide-y divide-gray-20 border-t border-gray-20">
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton list
        <ShowcaseRowSkeleton key={i} index={i} />
      ))}
    </ul>
  );
}

// On data load failure we keep showing the skeleton rather than collapse the
// widget mid-render – a brief flash of skeleton beats a layout shift.
async function ShowcaseList() {
  const rfcs = await fetchShowcase();
  if (!rfcs || rfcs.length === 0) return <ShowcaseListSkeleton />;
  return (
    <ul className="divide-y divide-gray-20 border-t border-gray-20">
      {rfcs.map((rfc) => (
        <ShowcaseRow key={rfc.number} rfc={rfc} />
      ))}
    </ul>
  );
}

export default function LandingShowcaseWidget() {
  if (!getPublicGitHubToken()) return null;

  const { owner, repo } = SHOWCASE_REPO;
  const repoListHref = `/rfcs/${owner}/${repo}`;
  return (
    <section
      aria-labelledby="showcase-heading"
      className="rounded-md border border-gray-20 bg-surface overflow-hidden"
    >
      <Link
        href={repoListHref}
        className="group/header block px-4 py-3 sm:px-5 sm:py-4 hover:bg-gray-5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h2
                id="showcase-heading"
                className="font-serif text-2xl text-foreground leading-tight tracking-tight"
              >
                Who's already here? PostHog
              </h2>
              {/* biome-ignore lint/performance/noImgElement: tiny static brand asset */}
              <img
                src="/posthog-logomark.svg"
                alt="PostHog"
                width={33}
                height={20}
                className="h-5 w-auto shrink-0"
              />
            </div>
            <div className="mt-1 font-mono text-xs text-gray-50 truncate">
              {owner}/{repo}
            </div>
          </div>
          <ArrowIcon />
        </div>
      </Link>

      <Suspense fallback={<ShowcaseListSkeleton />}>
        <ShowcaseList />
      </Suspense>
    </section>
  );
}
