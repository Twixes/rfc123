import "server-only";

import { listRFCs } from "./github";
import { getPublicGitHubToken } from "./public-access";
import { slugify } from "./slugify";

/** The repo we feature on the landing page – PostHog's public RFC stream. */
export const SHOWCASE_REPO = {
  owner: "posthog",
  repo: "requests-for-comments-public",
} as const;

const SHOWCASE_RFC_LIMIT = 6;

export interface ShowcaseRFC {
  number: number;
  title: string;
  author: string;
  authorAvatar: string;
  commentCount: number;
  updatedAt: string;
  status: "open" | "merged";
  detailHref: string;
}

export async function fetchShowcase(): Promise<ShowcaseRFC[] | null> {
  const token = getPublicGitHubToken();
  if (!token) {
    console.warn(
      "[fetchShowcase] PUBLIC_GITHUB_TOKEN is not set – the landing showcase widget will not render.",
    );
    return null;
  }

  const { owner, repo } = SHOWCASE_REPO;
  try {
    const rfcs = await listRFCs(token, owner, repo, "", {
      withTeamFields: false,
      deferInlineCommentCounts: true,
    });
    return rfcs
      .filter(
        (r) => (r.status === "open" || r.status === "merged") && !r.isDraft,
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, SHOWCASE_RFC_LIMIT)
      .map((r) => ({
        number: r.number,
        title: r.title,
        author: r.author,
        authorAvatar: r.authorAvatar,
        commentCount: r.commentCount ?? r.regularCommentCount,
        updatedAt: r.updatedAt,
        status: r.status === "merged" ? "merged" : "open",
        detailHref: `/rfcs/${owner}/${repo}/${r.number}/${slugify(r.title)}`,
      }));
  } catch (error) {
    console.error("[fetchShowcase] failed to load PostHog RFCs:", error);
    return null;
  }
}
