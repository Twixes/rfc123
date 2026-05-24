import { Octokit } from "octokit";
import {
  deleteCachedData,
  getCachedJsonData,
  getCachedJsonDataBatch,
  setCachedJsonData,
  setCachedJsonDataBatch,
} from "./cache";
import { sha256Hex } from "./mcp-oauth";
import { captureServerException } from "./posthog-server";
import { randomSuffix } from "./random-suffix";
import {
  defaultRfcConfig,
  parseRfcConfig,
  RFC_CONFIG_PATH,
  type RfcConfig,
  type RfcLayout,
  rfcFilePath,
  serializeRfcConfig,
  todayYmd,
} from "./rfc-config";
import { slugify } from "./slugify";

export type {
  RfcConfig,
  RfcLayout,
} from "./rfc-config";
export {
  defaultRfcConfig,
  RFC_CONFIG_PATH,
  rfcFilePath,
  todayYmd,
} from "./rfc-config";

export interface RepoOption {
  owner: string;
  name: string;
  fullName: string;
  /** True if the viewer can push (WRITE / MAINTAIN / ADMIN). The "Start an
   *  RFC" flow uses this to disable repos the user can't commit to. */
  canPush: boolean;
}

export interface RFC {
  number: number;
  title: string;
  author: string;
  authorAvatar: string;
  status: "open" | "merged" | "closed";
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  commentCount: number | null;
  inlineCommentCount: number | null;
  regularCommentCount: number;
  url: string;
  owner: string;
  repo: string;
  /** True if the current viewer is tagged as a reviewer (direct or via team). */
  reviewRequested: boolean;
  /** Team slugs (e.g. ["posthog/web"]) requested as reviewers. */
  requestedTeamSlugs: string[];
  /** Issue/PR labels – agents/managers use these for filtering and to derive
   *  `hasDecision` (applied by humans on the web app when they record a
   *  decision). */
  labels: string[];
  /** GitHub's aggregate review decision. `null` if no reviews submitted yet. */
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  /** True if any label matches the "decision-registered" convention. Lets a
   *  manager scan portfolios for un-decided RFCs without fetching bodies. */
  hasDecision: boolean;
}

export interface DecisionBlock {
  date: string;
  decidedBy: string | null;
  decision: string;
  rationale: string | null;
}

/** Per-reviewer verdict, derived from PR reviews + pending requests. */
export type ReviewerVerdict =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "COMMENTED"
  | "DISMISSED"
  | "PENDING";

export interface RFCDetail extends RFC {
  body: string;
  markdownContent: string;
  markdownFilePath: string | null;
  /** Blob SHA of the markdown file on the PR head branch. Required by the
   *  in-app editor to pass `baseFileSha` so concurrent edits surface as a 409
   *  instead of silently clobbering newer commits. Null when the PR has no
   *  markdown file. */
  markdownFileSha: string | null;
  /** PR head branch ref; used to resolve relative image paths to repo files */
  headRef: string;
  /** Head commit SHA – agents/UI use this for line-anchored review APIs. */
  headSha: string;
  reviewers: Array<{
    login: string;
    avatar: string;
    yetToReview: boolean;
    /** Last review verdict from this reviewer, or PENDING when still requested. */
    state: ReviewerVerdict;
    submittedAt: string | null;
  }>;
  /** Decision blocks parsed out of the body's `## Decisions` section, in
   *  document order. Empty when no decision has been registered. */
  decisionBlocks: DecisionBlock[];
  /** GitHub's coarse merge state: clean / blocked / behind / unstable / dirty / unknown. */
  mergeStateStatus: string | null;
  /** Boolean GitHub merge-readiness (null = not yet computed). */
  mergeable: boolean | null;
  comments: Comment[];
}

/** Standard label name used to mark "this RFC has a registered decision". */
export const DECISION_LABEL = "decision-registered";

/**
 * Pull every `### Decision (YYYY-MM-DD[ by @login])` heading out of the body
 * along with the text and optional `**Rationale:** ...` line that follows.
 * Strict on the heading format because that's the convention humans follow
 * when committing decisions to an RFC.
 */
export function parseDecisionBlocks(body: string): DecisionBlock[] {
  const out: DecisionBlock[] = [];
  const lines = body.split("\n");
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(
      /^###\s+Decision\s+\((\d{4}-\d{2}-\d{2})(?:\s+by\s+@([\w-]+))?\)/,
    );
    if (!m) continue;
    const date = m[1];
    const decidedBy = m[2] ?? null;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    let decision = "";
    while (
      j < lines.length &&
      !/^###?\s/.test(lines[j]) &&
      !/^\*\*Rationale:\*\*/.test(lines[j])
    ) {
      decision += (decision ? "\n" : "") + lines[j];
      j++;
    }
    let rationale: string | null = null;
    if (j < lines.length && /^\*\*Rationale:\*\*/.test(lines[j])) {
      rationale = lines[j].replace(/^\*\*Rationale:\*\*\s*/, "");
      j++;
      while (j < lines.length && !/^###?\s/.test(lines[j])) {
        if (lines[j].trim() !== "") rationale += "\n" + lines[j];
        j++;
      }
    }
    out.push({
      date,
      decidedBy,
      decision: decision.trim(),
      rationale: rationale?.trim() || null,
    });
  }
  return out;
}

export interface Comment {
  id: number;
  user: string;
  userAvatar: string;
  body: string;
  createdAt: string;
  path?: string;
  line?: number;
  diffHunk?: string;
  inReplyToId?: number;
  /** True for inline comments whose anchor line no longer exists in the PR
   *  diff (GitHub returns `line: null` once the file moves past them). The UI
   *  dims these and tags them as "Outdated". General (non-inline) comments
   *  are never outdated. */
  outdated?: boolean;
}

export type { CommentThread } from "./comment-threads";
export { groupIntoThreads } from "./comment-threads";

export async function getOctokit(accessToken: string) {
  return new Octokit({ auth: accessToken });
}

/**
 * Read the OAuth scopes granted to `accessToken` from GitHub's
 * `X-OAuth-Scopes` response header. Cached for an hour. Used so callers can
 * gracefully degrade GraphQL queries that touch fields gated behind scopes
 * the token does not have (e.g. `Team.slug` / `Team.organization` need
 * `read:org`).
 */
export async function getGrantedScopes(accessToken: string): Promise<string[]> {
  const cacheKey = `granted_scopes:${tokenKey(accessToken)}`;
  const cached = await getCachedJsonData<string[]>(cacheKey);
  if (cached) return cached;

  const octokit = await getOctokit(accessToken);
  const response = await octokit.rest.users.getAuthenticated();
  const header = (response.headers as Record<string, string | undefined>)[
    "x-oauth-scopes"
  ];
  const scopes = (header ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  await setCachedJsonData(cacheKey, scopes, 3600, {
    name: "getGrantedScopes:oauth_scopes",
  });
  return scopes;
}

function cleanTitle(title: string) {
  return title.replace(/(^RFC - |^RFC:? |^Add RFC for |^\[RFC\] | RFC$)/i, "");
}

/**
 * Short fingerprint of an access token for use in cache keys / log labels.
 * Critical: never use the raw access token as a key – cache.ts logs slow op
 * keys to stdout and ships them to PostHog on errors, and the token grants
 * the bearer full read-write GitHub access for the user.
 */
function tokenKey(accessToken: string): string {
  return sha256Hex(accessToken).slice(0, 16);
}

export {
  isRelativeMarkdownAssetSrc,
  normalizeRepoPath,
  resolveMarkdownImageRepoPath,
} from "./markdown-assets";

/**
 * Full picture of a viewer-accessible repo. Both the read-only "which repos
 * host RFCs" path and the "which repos can I write to" picker derive from
 * this. Built in one GraphQL sweep so we don't pay 3 REST probes per repo.
 */
interface ViewerRepo {
  owner: string;
  name: string;
  fullName: string;
  /** True if the viewer can push (WRITE / MAINTAIN / ADMIN). */
  canPush: boolean;
  /** True if the repo is owned by an Organization, not a user. */
  isOrg: boolean;
  /** Default branch name; null only for empty repos. */
  defaultBranch: string | null;
  /** True iff `.rfc123.json` exists at the default branch's root. */
  hasRfcConfig: boolean;
  /** ISO-8601 timestamp of the last push (any branch). Null for empty repos. */
  pushedAt: string | null;
}

// Cache key includes a version segment so a payload-shape change can
// invalidate prior entries by bumping it.
const VIEWER_REPOS_CACHE_TTL_SECONDS = 300;
function viewerReposCacheKey(accessToken: string): string {
  return `viewer_repos:v2:${tokenKey(accessToken)}`;
}

/** GraphQL `viewerPermission` values that imply push access. */
const WRITE_PERMISSIONS = new Set(["WRITE", "MAINTAIN", "ADMIN"]);

/** `Repository.object(expression)` argument that reads the RFC config blob
 *  from the default branch's root. */
const RFC_CONFIG_HEAD_EXPR = `HEAD:${RFC_CONFIG_PATH}`;

/**
 * One-shot GraphQL sweep of every repo the viewer can see, annotated with
 * push permission and `.rfc123.json` presence. Replaces N×3 REST probes with
 * `ceil(N/100)` GraphQL requests – the difference is night and day for users
 * sitting in orgs with hundreds of repos.
 *
 * Pages are walked sequentially because each cursor depends on the previous
 * response; for typical accounts that's 1–3 round-trips total.
 */
async function listViewerRepos(accessToken: string): Promise<ViewerRepo[]> {
  const cached = await getCachedJsonData<ViewerRepo[]>(
    viewerReposCacheKey(accessToken),
  );
  if (cached) return cached;

  const octokit = await getOctokit(accessToken);
  const query = `
    query($cursor: String) {
      viewer {
        repositories(
          first: 100,
          after: $cursor,
          affiliations: [OWNER, ORGANIZATION_MEMBER, COLLABORATOR],
          orderBy: {field: UPDATED_AT, direction: DESC}
        ) {
          pageInfo { hasNextPage endCursor }
          nodes {
            name
            nameWithOwner
            viewerPermission
            pushedAt
            owner { login __typename }
            defaultBranchRef { name }
            rfcConfig: object(expression: "${RFC_CONFIG_HEAD_EXPR}") { __typename }
          }
        }
      }
    }
  `;

  interface PageNode {
    name: string;
    nameWithOwner: string;
    viewerPermission: string | null;
    pushedAt: string | null;
    owner: { login: string; __typename: string };
    defaultBranchRef: { name: string } | null;
    rfcConfig: { __typename: string } | null;
  }
  interface PageResponse {
    viewer: {
      repositories: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: PageNode[];
      };
    };
  }

  const repos: ViewerRepo[] = [];
  let cursor: string | null = null;
  while (true) {
    const page: PageResponse = await octokit.graphql<PageResponse>(query, {
      cursor,
    });
    for (const node of page.viewer.repositories.nodes) {
      repos.push({
        owner: node.owner.login,
        name: node.name,
        fullName: node.nameWithOwner,
        canPush: WRITE_PERMISSIONS.has(node.viewerPermission ?? ""),
        isOrg: node.owner.__typename === "Organization",
        defaultBranch: node.defaultBranchRef?.name ?? null,
        hasRfcConfig: !!node.rfcConfig,
        pushedAt: node.pushedAt,
      });
    }
    if (!page.viewer.repositories.pageInfo.hasNextPage) break;
    cursor = page.viewer.repositories.pageInfo.endCursor;
    if (!cursor) break;
  }

  await setCachedJsonData(
    viewerReposCacheKey(accessToken),
    repos,
    VIEWER_REPOS_CACHE_TTL_SECONDS,
    { name: "listViewerRepos:viewer_repos" },
  );
  return repos;
}

/**
 * Drop the cached viewer-repo sweep for `accessToken`. Call after any action
 * that changes the set of RFC-bearing repos (creating one, adopting an
 * existing one) so the next list call rebuilds with the latest state.
 */
export async function invalidateViewerRepos(
  accessToken: string,
): Promise<void> {
  await deleteCachedData(viewerReposCacheKey(accessToken));
}

export async function listReposWithRFCs(
  accessToken: string,
): Promise<RepoOption[]> {
  try {
    const repos = await listViewerRepos(accessToken);
    return repos
      .filter((r) => r.hasRfcConfig)
      .map((r) => ({
        owner: r.owner,
        name: r.name,
        fullName: r.fullName,
        canPush: r.canPush,
      }));
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "listReposWithRFCs",
      context: "fetching_repos_with_rfcs",
    });
    throw error;
  }
}

export async function listRFCs(
  accessToken: string,
  owner: string,
  repo: string,
  currentUserLogin: string,
  opts: {
    withTeamFields?: boolean;
    /**
     * When true, skips the Redis MGET for per-PR inline review comment counts.
     * Returns `inlineCommentCount` / combined `commentCount` as null; callers
     * (e.g. `/api/rfcs/comment-counts`) can fill them in after the list renders.
     */
    deferInlineCommentCounts?: boolean;
  } = {},
): Promise<RFC[]> {
  try {
    const octokit = await getOctokit(accessToken);
    const withTeamFields = opts.withTeamFields ?? true;
    const deferInlineCommentCounts = opts.deferInlineCommentCounts ?? false;

    // GraphQL query to fetch all PRs with files and comment counts in one request.
    // The Team fragment is gated behind GitHub's `read:org` scope – callers
    // without that scope must omit it or GitHub returns INSUFFICIENT_SCOPES.
    const teamFragment = withTeamFields
      ? `... on Team {
                      slug
                      organization { login }
                    }`
      : "";
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          pullRequests(first: 100, orderBy: {field: CREATED_AT, direction: DESC}, states: [OPEN, CLOSED, MERGED]) {
            nodes {
              number
              title
              state
              isDraft
              createdAt
              updatedAt
              mergedAt
              url
              reviewDecision
              labels(first: 20) {
                nodes { name }
              }
              author {
                login
                avatarUrl
              }
              files(first: 100) {
                nodes {
                  path
                }
              }
              comments {
                totalCount
              }
              reviewRequests(first: 10) {
                nodes {
                  requestedReviewer {
                    ... on User {
                      login
                    }
                    ${teamFragment}
                  }
                }
              }
            }
          }
        }
      }
    `;

    // Check cache first. Key includes the team-fields variant so we don't
    // serve a no-team-slugs payload to a caller that has `read:org`.
    const cacheKey = `rfcs:${owner}:${repo}:graphql:${withTeamFields ? "with-teams" : "no-teams"}:v2`;
    let pulls: any[] = [];
    const cachedPulls = await getCachedJsonData<any[]>(cacheKey);

    if (cachedPulls) {
      pulls = cachedPulls;
    } else {
      const response: any = await octokit.graphql(query, {
        owner,
        repo,
      });
      pulls = response.repository.pullRequests.nodes;
      await setCachedJsonData(cacheKey, pulls, 300, {
        name: "listRFCs:graphql_pulls",
      }); // Cache for 5 minutes
    }

    // Filter PRs that have .md files (RFC content can be in any directory)
    const rfcPulls = pulls.filter((pr: any) =>
      pr.files.nodes.some((file: any) => file.path.endsWith(".md")),
    );

    // Inline (review) comment counts: either batch from cache here, or defer to
    // `/api/rfcs/comment-counts` + fetchInlineCommentCounts so list responses stay fast.
    let inlineCountByIndex: (number | null)[];
    if (deferInlineCommentCounts) {
      inlineCountByIndex = rfcPulls.map(() => null);
    } else {
      const commentCountCacheKeys = rfcPulls.map(
        (pr: any) => `rfc:${owner}:${repo}:${pr.number}:review_comments_count`,
      );
      inlineCountByIndex = await getCachedJsonDataBatch<number>(
        commentCountCacheKeys,
        { name: "listRFCs:inline_review_comment_counts" },
      );
    }

    const rfcPullsWithCounts = rfcPulls.map((pr: any, i: number) => {
      const reviewRequested = pr.reviewRequests?.nodes?.some(
        (req: any) => req.requestedReviewer?.login === currentUserLogin,
      );
      const requestedTeamSlugs: string[] =
        pr.reviewRequests?.nodes
          ?.map((req: any) => {
            const r = req.requestedReviewer;
            if (r?.slug && r?.organization?.login) {
              return `${r.organization.login}/${r.slug}`;
            }
            return null;
          })
          .filter((s: string | null): s is string => !!s) ?? [];

      const labels: string[] =
        pr.labels?.nodes?.map((n: any) => n.name).filter(Boolean) ?? [];
      return {
        number: pr.number,
        title: pr.title,
        state: pr.state.toLowerCase(),
        isDraft: !!pr.isDraft,
        merged_at: pr.mergedAt,
        created_at: pr.createdAt,
        updated_at: pr.updatedAt,
        html_url: pr.url,
        user: pr.author
          ? {
              login: pr.author.login,
              avatar_url: pr.author.avatarUrl,
            }
          : null,
        _inlineCommentCount: inlineCountByIndex[i],
        _regularCommentCount: pr.comments.totalCount,
        _reviewRequested: reviewRequested || false,
        _requestedTeamSlugs: requestedTeamSlugs,
        _labels: labels,
        _reviewDecision: pr.reviewDecision ?? null,
      };
    });

    const filteredPulls = rfcPullsWithCounts;

    // Sort: review requested first within each status, then open PRs, then by created date
    const sortedPulls = filteredPulls.sort((a: any, b: any) => {
      // First, sort by status (open > merged > closed)
      if (a.state === "open" && b.state !== "open") return -1;
      if (a.state !== "open" && b.state === "open") return 1;

      // Within same status, review requested comes first
      if (a._reviewRequested && !b._reviewRequested) return -1;
      if (!a._reviewRequested && b._reviewRequested) return 1;

      // Finally, sort by created date
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    return sortedPulls.map((pr: any) => ({
      number: pr.number,
      title: cleanTitle(pr.title),
      author: pr.user?.login || "unknown",
      authorAvatar: pr.user?.avatar_url || "",
      status: pr.merged_at ? "merged" : (pr.state as "open" | "closed"),
      isDraft: pr.isDraft,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      commentCount:
        pr._inlineCommentCount != null
          ? pr._inlineCommentCount + pr._regularCommentCount
          : null,
      inlineCommentCount: pr._inlineCommentCount,
      regularCommentCount: pr._regularCommentCount,
      url: pr.html_url,
      owner,
      repo,
      reviewRequested: pr._reviewRequested,
      requestedTeamSlugs: pr._requestedTeamSlugs ?? [],
      labels: pr._labels ?? [],
      reviewDecision: pr._reviewDecision ?? null,
      hasDecision: (pr._labels ?? []).includes(DECISION_LABEL),
    }));
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "listRFCs",
      owner,
      repo,
      context: "fetching_rfcs",
    });
    throw error;
  }
}

/**
 * Fetch the team memberships of the authenticated user, formatted as
 * `"org-login/team-slug"`. Used by the briefing flow so we can credit
 * team-requested reviews to members.
 *
 * GitHub paginates `user.teams` at 100/page; we cap at a few pages because
 * realistically nobody is on hundreds of teams and we don't want to hammer
 * the API from a cron.
 */
export async function listUserTeams(accessToken: string): Promise<string[]> {
  try {
    const octokit = await getOctokit(accessToken);
    const teams = await octokit.paginate(
      octokit.rest.teams.listForAuthenticatedUser,
      {
        per_page: 100,
      },
    );
    return teams.map((t) => `${t.organization.login}/${t.slug}`);
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "listUserTeams",
      context: "fetching_user_teams",
    });
    return [];
  }
}

/**
 * Return the RFCs the user (or any of their teams) is currently requested
 * to review and that are open and not in draft. Used by the daily briefing.
 */
export function filterRFCsAwaitingReview(
  rfcs: RFC[],
  userTeams: string[],
): RFC[] {
  const teamSet = new Set(userTeams);
  return rfcs.filter((rfc) => {
    if (rfc.status !== "open") return false;
    if (rfc.isDraft) return false;
    if (rfc.reviewRequested) return true;
    return rfc.requestedTeamSlugs.some((slug) => teamSet.has(slug));
  });
}

export async function listAllRFCs(
  accessToken: string,
  currentUserLogin: string,
  opts: {
    withTeamFields?: boolean;
    deferInlineCommentCounts?: boolean;
  } = {},
): Promise<RFC[]> {
  try {
    // Get all repos with RFC directories
    const repos = await listReposWithRFCs(accessToken);

    // Fetch RFCs from all repos in parallel
    const allRFCsArrays = await Promise.all(
      repos.map((repo) =>
        listRFCs(accessToken, repo.owner, repo.name, currentUserLogin, opts),
      ),
    );

    // Flatten the arrays and sort: review requested first within each status, then open PRs, then by created date
    const allRFCs = allRFCsArrays.flat();

    return allRFCs.sort((a, b) => {
      // First, sort by status (open > merged > closed)
      if (a.status === "open" && b.status !== "open") return -1;
      if (a.status !== "open" && b.status === "open") return 1;

      // Within same status, review requested comes first
      if (a.reviewRequested && !b.reviewRequested) return -1;
      if (!a.reviewRequested && b.reviewRequested) return 1;

      // Finally, sort by created date
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "listAllRFCs",
      context: "fetching_all_rfcs",
    });
    throw error;
  }
}

/** Fetch inline (review) comment counts for specific PRs, caching results. */
export async function fetchInlineCommentCounts(
  accessToken: string,
  owner: string,
  repo: string,
  prNumbers: number[],
): Promise<Record<number, number>> {
  if (prNumbers.length === 0) return {};

  try {
    const octokit = await getOctokit(accessToken);

    const cacheKeys = prNumbers.map(
      (n) => `rfc:${owner}:${repo}:${n}:review_comments_count`,
    );
    const cached = await getCachedJsonDataBatch<number>(cacheKeys, {
      name: "fetchInlineCommentCounts:review_comment_counts",
    });

    const result: Record<number, number> = {};
    const toFetch: number[] = [];

    for (let i = 0; i < prNumbers.length; i++) {
      if (cached[i] != null) {
        result[prNumbers[i]] = cached[i] as number;
      } else {
        toFetch.push(prNumbers[i]);
      }
    }

    if (toFetch.length > 0) {
      const fetched = await Promise.all(
        toFetch.map(async (prNumber) => {
          const response = await octokit.rest.pulls.listReviewComments({
            owner,
            repo,
            pull_number: prNumber,
            per_page: 1,
          });
          let count = response.data.length;
          const linkHeader = response.headers.link;
          if (linkHeader) {
            const lastPageMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
            if (lastPageMatch) {
              count = Number.parseInt(lastPageMatch[1], 10);
            }
          }
          return { prNumber, count };
        }),
      );

      await setCachedJsonDataBatch(
        fetched.map(({ prNumber, count }) => ({
          key: `rfc:${owner}:${repo}:${prNumber}:review_comments_count`,
          value: count,
        })),
        300,
        { name: "fetchInlineCommentCounts:review_comment_counts" },
      );

      for (const { prNumber, count } of fetched) {
        result[prNumber] = count;
      }
    }

    return result;
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "fetchInlineCommentCounts",
      owner,
      repo,
      prNumbers,
      context: "fetching_inline_comment_counts",
    });
    throw error;
  }
}

export async function getRFCDetail(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number,
  currentUserLogin: string,
): Promise<RFCDetail> {
  try {
    const t0 = performance.now();
    const octokit = await getOctokit(accessToken);

    // Check cache for RFC content (PR details + markdown + reviewers).
    // The `:v2` suffix invalidates pre-enrichment shapes that lacked
    // per-reviewer state + submittedAt.
    const contentCacheKey = `rfc:${owner}:${repo}:${prNumber}:content:v3`;
    interface CachedRFCContent {
      pr: any;
      files: any[];
      markdownContent: string;
      markdownFilePath: string | null;
      markdownFileSha: string | null;
      headRef: string;
      markdownEtag?: string;
      reviewers: RFCDetail["reviewers"];
      /** Logins of users with a pending review request – used to derive `reviewRequested` per-user. */
      requestedReviewerLogins: string[];
    }
    const tContentCache = performance.now();
    const cachedContent =
      await getCachedJsonData<CachedRFCContent>(contentCacheKey);
    console.log(
      `[getRFCDetail] content cache lookup took ${(performance.now() - tContentCache).toFixed(0)}ms (${cachedContent ? "HIT" : "MISS"})`,
    );

    let pr: any;
    let files: any[] = [];
    let markdownContent = "";
    let markdownFilePath: string | null = null;
    let markdownFileSha: string | null = null;
    let reviewers: RFCDetail["reviewers"] = [];
    let requestedReviewerLogins: string[] = [];
    let cacheValid = false;

    // On cache hit: validate markdown freshness with conditional request (304 = free, no rate limit)
    if (
      cachedContent &&
      cachedContent.reviewers !== undefined &&
      cachedContent.markdownFilePath &&
      cachedContent.markdownEtag
    ) {
      try {
        const conditionalResp = await octokit.request(
          "GET /repos/{owner}/{repo}/contents/{path}",
          {
            owner,
            repo,
            path: cachedContent.markdownFilePath,
            ref: cachedContent.pr.head.ref,
            headers: {
              "If-None-Match": cachedContent.markdownEtag,
            } as Record<string, string>,
          },
        );
        if ((conditionalResp.status as number) === 304) {
          cacheValid = true;
        }
      } catch (err: unknown) {
        const reqErr = err as { status?: number };
        if (reqErr.status === 304) {
          cacheValid = true;
        }
      }
      if (cacheValid) {
        pr = cachedContent.pr;
        files = cachedContent.files;
        markdownContent = cachedContent.markdownContent;
        markdownFilePath = cachedContent.markdownFilePath;
        markdownFileSha = cachedContent.markdownFileSha ?? null;
        reviewers = cachedContent.reviewers;
        requestedReviewerLogins = cachedContent.requestedReviewerLogins ?? [];
      }
    }

    if (!cacheValid) {
      const tFetch = performance.now();

      // Fetch PR details, files, reviewers, and reviews in parallel
      const [prResponse, filesResponse, requestedReviewersRes, reviewsRes] =
        await Promise.all([
          octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: prNumber,
          }),
          octokit.rest.pulls.listFiles({
            owner,
            repo,
            pull_number: prNumber,
          }),
          octokit.rest.pulls.listRequestedReviewers({
            owner,
            repo,
            pull_number: prNumber,
          }),
          octokit.rest.pulls.listReviews({
            owner,
            repo,
            pull_number: prNumber,
          }),
        ]);

      pr = prResponse.data;
      files = filesResponse.data;

      const markdownFile = files.find((file) => file.filename.endsWith(".md"));

      markdownContent = pr.body || "";
      markdownFilePath = markdownFile?.filename || null;

      let markdownEtag: string | undefined;
      if (markdownFile) {
        // Fetch the actual content of the markdown file (use request to capture ETag)
        try {
          const tMd = performance.now();
          const fileResp = await octokit.request(
            "GET /repos/{owner}/{repo}/contents/{path}",
            {
              owner,
              repo,
              path: markdownFile.filename,
              ref: pr.head.ref,
            },
          );
          console.log(
            `[getRFCDetail] repos.getContent() for markdown took ${(performance.now() - tMd).toFixed(0)}ms`,
          );

          const fileContent = fileResp.data as {
            content?: string;
            sha?: string;
          };
          const rawEtag = fileResp.headers?.["etag"] as string | undefined;
          if (rawEtag) {
            markdownEtag = rawEtag;
          }
          if (fileContent && "content" in fileContent && fileContent.content) {
            markdownContent = Buffer.from(
              fileContent.content,
              "base64",
            ).toString("utf-8");
          }
          markdownFileSha = fileContent?.sha ?? null;
        } catch (error) {
          console.error("Error fetching markdown file:", error);
          captureServerException(error as Error, undefined, {
            function: "getRFCDetail",
            subfunction: "fetch_markdown_content",
            owner,
            repo,
            prNumber,
            markdownFile: markdownFile.filename,
          });
        }
      }

      // Build reviewers list – take the *latest* review state per user so the
      // displayed verdict reflects "where are they now" not "where were they
      // when they first commented".
      const latestByLogin = new Map<
        string,
        { state: ReviewerVerdict; submittedAt: string | null; avatar: string }
      >();
      const reviewStateMap: Record<string, ReviewerVerdict> = {
        APPROVED: "APPROVED",
        CHANGES_REQUESTED: "CHANGES_REQUESTED",
        COMMENTED: "COMMENTED",
        DISMISSED: "DISMISSED",
      };
      for (const review of reviewsRes.data) {
        if (!review.user) continue;
        const mapped = reviewStateMap[review.state as string];
        if (!mapped) continue;
        const existing = latestByLogin.get(review.user.login);
        const submittedAt = review.submitted_at ?? null;
        if (
          !existing ||
          (submittedAt &&
            existing.submittedAt &&
            new Date(submittedAt) > new Date(existing.submittedAt))
        ) {
          latestByLogin.set(review.user.login, {
            state: mapped,
            submittedAt,
            avatar: review.user.avatar_url,
          });
        }
      }
      reviewers = [];
      const reviewersAlreadyAccountedFor: Set<string> = new Set();
      for (const [login, info] of latestByLogin.entries()) {
        reviewers.push({
          login,
          avatar: info.avatar,
          yetToReview: false,
          state: info.state,
          submittedAt: info.submittedAt,
        });
        reviewersAlreadyAccountedFor.add(login);
      }
      for (const requestedReviewer of requestedReviewersRes.data.users) {
        if (!reviewersAlreadyAccountedFor.has(requestedReviewer.login)) {
          reviewers.push({
            login: requestedReviewer.login,
            avatar: requestedReviewer.avatar_url,
            yetToReview: true,
            state: "PENDING",
            submittedAt: null,
          });
        }
      }

      requestedReviewerLogins = requestedReviewersRes.data.users.map(
        (user) => user.login,
      );

      console.log(
        `[getRFCDetail] content fetch (all GH calls) took ${(performance.now() - tFetch).toFixed(0)}ms`,
      );
      // Cache content + reviewers + ETag for conditional validation
      await setCachedJsonData(
        contentCacheKey,
        {
          pr,
          files,
          markdownContent,
          markdownFilePath,
          markdownFileSha,
          headRef: pr.head.ref,
          reviewers,
          requestedReviewerLogins,
          markdownEtag,
        },
        300,
        { name: "getRFCDetail:rfc_content" },
      );
    }

    const reviewRequested = requestedReviewerLogins.includes(currentUserLogin);

    const labels: string[] = (pr.labels ?? [])
      .map((l: any) => l.name)
      .filter(Boolean);
    const decisionBlocks = parseDecisionBlocks(markdownContent);

    console.log(
      `[getRFCDetail] total took ${(performance.now() - t0).toFixed(0)}ms`,
    );

    return {
      number: pr.number,
      title: cleanTitle(pr.title),
      author: pr.user?.login || "unknown",
      authorAvatar: pr.user?.avatar_url || "",
      status: pr.merged_at ? "merged" : (pr.state as "open" | "closed"),
      isDraft: !!pr.draft,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      commentCount: pr.comments + pr.review_comments,
      inlineCommentCount: pr.review_comments,
      regularCommentCount: pr.comments,
      url: pr.html_url,
      owner,
      repo,
      body: pr.body || "",
      markdownContent,
      markdownFilePath,
      markdownFileSha,
      headRef: pr.head.ref,
      headSha: pr.head.sha,
      reviewers,
      reviewRequested: reviewRequested || false,
      // RFCDetail doesn't need teams for now (it's used for the page view,
      // where direct review-requested is what matters). Empty for parity
      // with the RFC type.
      requestedTeamSlugs: [],
      labels,
      reviewDecision: null,
      hasDecision: labels.includes(DECISION_LABEL) || decisionBlocks.length > 0,
      decisionBlocks,
      mergeStateStatus: (pr.mergeable_state as string | null) ?? null,
      mergeable: pr.mergeable ?? null,
      comments: [], // Comments are loaded progressively by the client
    };
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "getRFCDetail",
      owner,
      repo,
      prNumber,
      context: "fetching_rfc_detail",
    });
    throw error;
  }
}

export async function postComment(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  path?: string,
  line?: number,
  replyToCommentId?: number,
  range?: {
    startLine?: number;
    side?: "LEFT" | "RIGHT";
    startSide?: "LEFT" | "RIGHT";
  },
): Promise<void> {
  try {
    const octokit = await getOctokit(accessToken);

    if (replyToCommentId) {
      await octokit.rest.pulls.createReplyForReviewComment({
        owner,
        repo,
        pull_number: prNumber,
        comment_id: replyToCommentId,
        body,
      });
    } else if (path && line) {
      const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      await octokit.rest.pulls.createReviewComment({
        owner,
        repo,
        pull_number: prNumber,
        body,
        commit_id: pr.head.sha,
        path,
        line,
        side: range?.side,
        start_line: range?.startLine,
        start_side: range?.startSide,
      });
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });
    }
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "postComment",
      owner,
      repo,
      prNumber,
      path,
      line,
      replyToCommentId,
      context: "posting_comment",
    });
    throw error;
  }
}

/**
 * Drop every cached entry whose value depends on the PR's current state
 * (open/closed/draft + reviewers). Call after any mutation – the detail
 * cache otherwise sticks because `getRFCDetail` only revalidates the
 * markdown file's ETag, not the PR meta itself.
 */
async function invalidateRfcCaches(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<void> {
  await Promise.all([
    deleteCachedData(`rfc:${owner}:${repo}:${prNumber}:content:v3`),
    deleteCachedData(`rfcs:${owner}:${repo}:graphql:with-teams:v2`),
    deleteCachedData(`rfcs:${owner}:${repo}:graphql:no-teams:v2`),
  ]);
}

export const RFC_STATE_ACTIONS = [
  "convertToDraft",
  "markReady",
  "close",
  "reopen",
] as const;
export type RfcStateAction = (typeof RFC_STATE_ACTIONS)[number];

/**
 * Thrown by author-only mutations when the caller isn't the PR's author.
 * Routes turn this into a 403 without leaking PR data.
 */
export class ForbiddenError extends Error {
  constructor() {
    super("forbidden");
    this.name = "ForbiddenError";
  }
}

/**
 * Fetches the PR and asserts the caller is its author. Returns the PR so
 * callers can use its `node_id` for follow-up GraphQL mutations.
 */
async function assertAuthor(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number,
) {
  const octokit = await getOctokit(accessToken);
  const [{ data: pr }, viewerLogin] = await Promise.all([
    octokit.rest.pulls.get({ owner, repo, pull_number: prNumber }),
    getCurrentUserLogin(accessToken),
  ]);
  if (pr.user?.login !== viewerLogin) throw new ForbiddenError();
  return { octokit, pr };
}

/**
 * Author-only state transition. Returns the new state (draft + open/closed)
 * so the client can reconcile its local copy without a follow-up GET.
 */
export async function setRfcState(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number,
  action: RfcStateAction,
): Promise<{ isDraft: boolean; state: "open" | "closed" | "merged" }> {
  const { octokit, pr } = await assertAuthor(
    accessToken,
    owner,
    repo,
    prNumber,
  );

  let updated: { draft?: boolean | null; state: string; merged?: boolean };
  try {
    if (action === "convertToDraft") {
      await octokit.graphql(
        `mutation($id: ID!) {
          convertPullRequestToDraft(input: { pullRequestId: $id }) {
            pullRequest { isDraft }
          }
        }`,
        { id: pr.node_id },
      );
      // GraphQL mutations don't include `merged`; read the PR for the canonical state.
      ({ data: updated } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      }));
    } else if (action === "markReady") {
      await octokit.graphql(
        `mutation($id: ID!) {
          markPullRequestReadyForReview(input: { pullRequestId: $id }) {
            pullRequest { isDraft }
          }
        }`,
        { id: pr.node_id },
      );
      ({ data: updated } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      }));
    } else {
      // `pulls.update` returns the freshly-updated PR; no follow-up GET needed.
      ({ data: updated } = await octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: prNumber,
        state: action === "close" ? "closed" : "open",
      }));
    }
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "setRfcState",
      owner,
      repo,
      prNumber,
      action,
    });
    throw error;
  }

  await invalidateRfcCaches(owner, repo, prNumber);

  return {
    isDraft: updated.draft ?? false,
    state: updated.merged
      ? "merged"
      : updated.state === "closed"
        ? "closed"
        : "open",
  };
}

/**
 * Thrown by `setRfcRequestedReviewers` when one of the teams the caller is
 * trying to add as a reviewer doesn't have access to the repo. Carries the
 * data the UI needs to render a "grant access" deep-link.
 */
export class TeamNoAccessError extends Error {
  constructor(
    public readonly team: string,
    public readonly org: string,
    public readonly repo: string,
  ) {
    super(`team_no_access:${org}/${team}`);
    this.name = "TeamNoAccessError";
  }
}

/**
 * Sync the PR's requested reviewers (users + teams) to the desired final
 * state. Computes deltas against the current request list. Author-only:
 * throws `Error("forbidden")` for any other caller.
 *
 * Pre-validates that each newly-added team has access to the repo and throws
 * `TeamNoAccessError` if not, so the UI can deep-link the author to the team's
 * repo-access page instead of leaving them with a generic GitHub error.
 *
 * `teams` items are bare team slugs (no `org/` prefix). Returns the final
 * requested users + teams so the client can reconcile.
 */
export async function setRfcRequestedReviewers(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number,
  users: string[],
  teams: string[],
): Promise<{ users: string[]; teams: string[] }> {
  const { octokit } = await assertAuthor(accessToken, owner, repo, prNumber);

  try {
    const { data: current } = await octokit.rest.pulls.listRequestedReviewers({
      owner,
      repo,
      pull_number: prNumber,
    });
    const currentUsers = new Set(current.users.map((u) => u.login));
    const currentTeams = new Set(current.teams.map((t) => t.slug));
    const wantUsers = new Set(users);
    const wantTeams = new Set(teams);

    const removeUsers = [...currentUsers].filter((u) => !wantUsers.has(u));
    const removeTeams = [...currentTeams].filter((t) => !wantTeams.has(t));
    const addUsers = [...wantUsers].filter((u) => !currentUsers.has(u));
    const addTeams = [...wantTeams].filter((t) => !currentTeams.has(t));

    // Pre-check each newly-added team's repo access in parallel. Cheaper than
    // letting GitHub reject the bulk request and parsing the resulting 422,
    // and it tells us *which* team is missing so we can deep-link the fix.
    await Promise.all(
      addTeams.map(async (teamSlug) => {
        try {
          await octokit.rest.teams.checkPermissionsForRepoInOrg({
            org: owner,
            team_slug: teamSlug,
            owner,
            repo,
          });
        } catch (err) {
          if ((err as { status?: number }).status === 404) {
            throw new TeamNoAccessError(teamSlug, owner, repo);
          }
          throw err;
        }
      }),
    );

    // Remove + request are independent (disjoint sets) – run them in parallel.
    await Promise.all([
      removeUsers.length || removeTeams.length
        ? octokit.rest.pulls.removeRequestedReviewers({
            owner,
            repo,
            pull_number: prNumber,
            reviewers: removeUsers,
            team_reviewers: removeTeams,
          })
        : null,
      addUsers.length || addTeams.length
        ? octokit.rest.pulls.requestReviewers({
            owner,
            repo,
            pull_number: prNumber,
            reviewers: addUsers.length ? addUsers : undefined,
            team_reviewers: addTeams.length ? addTeams : undefined,
          })
        : null,
    ]);

    await invalidateRfcCaches(owner, repo, prNumber);

    const { data: after } = await octokit.rest.pulls.listRequestedReviewers({
      owner,
      repo,
      pull_number: prNumber,
    });
    return {
      users: after.users.map((u) => u.login),
      teams: after.teams.map((t) => t.slug),
    };
  } catch (error) {
    if (!(error instanceof TeamNoAccessError)) {
      captureServerException(error as Error, undefined, {
        function: "setRfcRequestedReviewers",
        owner,
        repo,
        prNumber,
      });
    }
    throw error;
  }
}

/**
 * Thrown when the markdown file's SHA on GitHub has moved past what the client
 * sent. Surfaces as 409 to the route, which the UI turns into a
 * "Reset and refresh" banner.
 */
export class ContentConflictError extends Error {
  constructor() {
    super("content_conflict");
    this.name = "ContentConflictError";
  }
}

/**
 * Author-only: commit a new revision of the RFC's markdown file to the PR's
 * head branch. `baseFileSha` is the file SHA the client was viewing when it
 * started editing — if GitHub's current SHA differs, the write is refused with
 * {@link ContentConflictError} instead of clobbering newer work.
 *
 * Returns the new file SHA + the head-branch commit SHA so the client can
 * stamp its local draft without an immediate full refetch.
 */
export async function updateRFCContent(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number,
  input: { content: string; message: string; baseFileSha: string },
): Promise<{ fileSha: string; commitSha: string }> {
  const { octokit, pr } = await assertAuthor(
    accessToken,
    owner,
    repo,
    prNumber,
  );

  const filename: string | null = await (async () => {
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });
    return files.find((f) => f.filename.endsWith(".md"))?.filename ?? null;
  })();
  if (!filename) {
    throw new Error("This RFC has no markdown file to edit.");
  }

  try {
    const { data: result } =
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filename,
        message: input.message,
        content: Buffer.from(input.content, "utf-8").toString("base64"),
        branch: pr.head.ref,
        sha: input.baseFileSha,
      });
    await invalidateRfcCaches(owner, repo, prNumber);
    return {
      fileSha: result.content?.sha ?? "",
      commitSha: result.commit.sha ?? "",
    };
  } catch (e) {
    const err = e as { status?: number; message?: string };
    // GitHub returns 409 when the supplied SHA is stale. We also see 422 with
    // a "does not match" message in the same scenario on some branches.
    if (
      err?.status === 409 ||
      (err?.status === 422 && /does not match|sha/i.test(err.message ?? ""))
    ) {
      throw new ContentConflictError();
    }
    captureServerException(e as Error, undefined, {
      function: "updateRFCContent",
      owner,
      repo,
      prNumber,
    });
    throw e;
  }
}

/**
 * Author-only: update the PR's title. Returns the new title so the client can
 * reconcile without a follow-up GET.
 */
export async function updateRFCTitle(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number,
  title: string,
): Promise<{ title: string }> {
  const { octokit } = await assertAuthor(accessToken, owner, repo, prNumber);
  try {
    const { data } = await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      title,
    });
    await invalidateRfcCaches(owner, repo, prNumber);
    return { title: data.title };
  } catch (e) {
    captureServerException(e as Error, undefined, {
      function: "updateRFCTitle",
      owner,
      repo,
      prNumber,
    });
    throw e;
  }
}

interface CurrentUser {
  id: number;
  login: string;
  avatarUrl: string;
}

export async function getCurrentUser(
  accessToken: string,
): Promise<CurrentUser> {
  try {
    const t0 = performance.now();
    const userCacheKey = `user_info:${tokenKey(accessToken)}`;
    const cached = await getCachedJsonData<CurrentUser>(userCacheKey);

    if (cached && cached.id) {
      console.log(
        `[getCurrentUser] cache HIT, took ${(performance.now() - t0).toFixed(0)}ms`,
      );
      return cached;
    }

    // Also check the legacy login-only cache key to avoid an extra GH call during migration
    const legacyCacheKey = `user:${tokenKey(accessToken)}`;
    const cachedLogin = await getCachedJsonData<string>(legacyCacheKey);

    const octokit = await getOctokit(accessToken);
    const { data: user } = await octokit.rest.users.getAuthenticated();
    const currentUser: CurrentUser = {
      id: user.id,
      login: user.login,
      avatarUrl: user.avatar_url,
    };
    await setCachedJsonData(userCacheKey, currentUser, 3600, {
      name: "getCurrentUser:user_info",
    }); // Cache for 1 hour
    // Also update legacy key so getCurrentUserLogin callers benefit
    if (!cachedLogin) {
      await setCachedJsonData(legacyCacheKey, user.login, 3600, {
        name: "getCurrentUser:legacy_login",
      });
    }
    console.log(
      `[getCurrentUser] cache MISS, fetched from GH, took ${(performance.now() - t0).toFixed(0)}ms`,
    );
    return currentUser;
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "getCurrentUser",
      context: "fetching_current_user",
    });
    throw error;
  }
}

export async function getCurrentUserLogin(
  accessToken: string,
): Promise<string> {
  try {
    const t0 = performance.now();
    // Check the login-only cache key first (fast path)
    const legacyCacheKey = `user:${tokenKey(accessToken)}`;
    const cachedLogin = await getCachedJsonData<string>(legacyCacheKey);

    if (cachedLogin) {
      console.log(
        `[getCurrentUserLogin] cache HIT, took ${(performance.now() - t0).toFixed(0)}ms`,
      );
      return cachedLogin;
    }

    // Fall through to getCurrentUser which caches both
    const user = await getCurrentUser(accessToken);
    console.log(
      `[getCurrentUserLogin] resolved via getCurrentUser, took ${(performance.now() - t0).toFixed(0)}ms`,
    );
    return user.login;
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "getCurrentUserLogin",
      context: "fetching_current_user",
    });
    throw error;
  }
}

export async function getRFCTitle(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string | null> {
  try {
    const t0 = performance.now();
    // Same key as getRFCDetail (`:v2` – older `:content` keys are obsolete).
    const contentCacheKey = `rfc:${owner}:${repo}:${prNumber}:content:v3`;
    const cached = await getCachedJsonData<{ pr: { title: string } }>(
      contentCacheKey,
    );
    if (cached) {
      console.log(
        `[getRFCTitle] cache HIT, took ${(performance.now() - t0).toFixed(0)}ms`,
      );
      return cached.pr.title;
    }

    // Cache miss – fetch just the PR title
    const octokit = await getOctokit(accessToken);
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });
    console.log(
      `[getRFCTitle] cache MISS, fetched from GH, took ${(performance.now() - t0).toFixed(0)}ms`,
    );
    return pr.title;
  } catch {
    return null;
  }
}

export interface WritableRepo extends RepoOption {
  /** True if the authenticated user can push to this repo. */
  canPush: boolean;
  /** True if the repo is in a known RFC directory (or its name suggests so). */
  hasRFCs: boolean;
  /** True if the repo is owned by an organization rather than a user. */
  isOrg: boolean;
  /** The repo's default branch (e.g. "main"). */
  defaultBranch: string;
  /** ISO-8601 timestamp of the last push (any branch). Null for empty repos. */
  pushedAt: string | null;
}

/**
 * List repos the authenticated user has any access to, annotated with push
 * permission and whether the repo already hosts RFCs. Used by the "Create RFC"
 * flow's repo picker, which needs more info than the read-only RFC list does.
 *
 * Derives from the shared `listViewerRepos` sweep so we don't pay a second
 * round of repo enumeration here.
 */
export async function listWritableRepos(
  accessToken: string,
): Promise<WritableRepo[]> {
  try {
    const repos = await listViewerRepos(accessToken);
    const annotated: WritableRepo[] = repos.map((r) => ({
      owner: r.owner,
      name: r.name,
      fullName: r.fullName,
      canPush: r.canPush,
      hasRFCs: r.hasRfcConfig,
      isOrg: r.isOrg,
      defaultBranch: r.defaultBranch ?? "main",
      pushedAt: r.pushedAt,
    }));

    // Sort: RFC repos first (familiar territory), then by last updated
    // (which is the order GraphQL already returns them in).
    annotated.sort((a, b) => {
      if (a.hasRFCs !== b.hasRFCs) return a.hasRFCs ? -1 : 1;
      return 0;
    });

    return annotated;
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "listWritableRepos",
      context: "fetching_writable_repos",
    });
    throw error;
  }
}

interface RepoSearchNode {
  name?: string;
  nameWithOwner?: string;
  viewerPermission?: string | null;
  pushedAt?: string | null;
  owner?: { login: string; __typename: string };
  defaultBranchRef?: { name: string } | null;
  rfcConfig?: { __typename: string } | null;
}

const REPO_SEARCH_GQL_FRAGMENT = `
  nodes {
    ... on Repository {
      name
      nameWithOwner
      viewerPermission
      pushedAt
      owner { login __typename }
      defaultBranchRef { name }
      rfcConfig: object(expression: "${RFC_CONFIG_HEAD_EXPR}") { __typename }
    }
  }
`;

function nodeToWritableRepo(node: RepoSearchNode): WritableRepo | null {
  if (!node.name || !node.nameWithOwner || !node.owner) return null;
  return {
    owner: node.owner.login,
    name: node.name,
    fullName: node.nameWithOwner,
    canPush: WRITE_PERMISSIONS.has(node.viewerPermission ?? ""),
    hasRFCs: !!node.rfcConfig,
    isOrg: node.owner.__typename === "Organization",
    defaultBranch: node.defaultBranchRef?.name ?? "main",
    pushedAt: node.pushedAt ?? null,
  };
}

async function searchReposInOwner(
  octokit: Octokit,
  term: string,
  ownerLogin: string,
  limit: number,
): Promise<WritableRepo[]> {
  // `user:<login>` scopes search to that owner – critically, this is what
  // forces *private* org repos to show up. GitHub's global repo search
  // silently filters them out unless the query is owner-scoped (internal /
  // public repos behave differently, hence the bug where typing the name of
  // a private RFCs repo returned nothing even though the user has access).
  const q = `${term} in:name user:${ownerLogin} fork:true`;
  const gql = `
    query($q: String!, $first: Int!) {
      search(query: $q, type: REPOSITORY, first: $first) {
        ${REPO_SEARCH_GQL_FRAGMENT}
      }
    }
  `;
  const response = await octokit.graphql<{
    search: { nodes: RepoSearchNode[] };
  }>(gql, { q, first: limit });

  const out: WritableRepo[] = [];
  for (const node of response.search.nodes) {
    const repo = nodeToWritableRepo(node);
    if (repo) out.push(repo);
  }
  return out;
}

/**
 * Search GitHub repositories the viewer can see, returning `WritableRepo`
 * shape so callers can treat search hits and cached-sweep hits the same way.
 *
 * Fans out one scoped search per owner the viewer belongs to so private repos
 * surface – GitHub's unscoped repo search hides private org repos even from
 * users that can read them, while `user:<login>`-scoped searches don't.
 *
 * When the query contains a `/`, we treat it as `owner/name` and only search
 * within that owner. Otherwise we hit every owner the viewer has access to
 * (capped, to keep fan-out bounded).
 */
export async function searchAccessibleRepos(
  accessToken: string,
  query: string,
  opts: { limit?: number; adoptableOnly?: boolean } = {},
): Promise<WritableRepo[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const limit = opts.limit ?? 20;
  const MAX_OWNERS = 15;

  try {
    const octokit = await getOctokit(accessToken);

    const slashIdx = trimmed.indexOf("/");
    let scopes: Array<{ owner: string; term: string }>;
    if (slashIdx > 0) {
      const owner = trimmed.slice(0, slashIdx).trim();
      const term = trimmed.slice(slashIdx + 1).trim();
      scopes = owner && term ? [{ owner, term }] : [];
    } else {
      const owners = await listAvailableOwners(accessToken);
      scopes = owners
        .slice(0, MAX_OWNERS)
        .map((o) => ({ owner: o.login, term: trimmed }));
    }
    if (scopes.length === 0) return [];

    // Over-fetch per owner so the post-filter (`adoptableOnly`) still has
    // material to choose from when the first N results in an owner are all
    // already-adopted or read-only. Without this, querying e.g. "rfc" in an
    // org whose first 20 matches are all `.rfc123.json` repos returns zero
    // even though adoptable repos exist further down the list.
    const perScopeFetch = opts.adoptableOnly
      ? Math.min(50, Math.max(20, limit * 3))
      : Math.max(5, Math.min(20, limit));

    const results = await Promise.allSettled(
      scopes.map(({ owner, term }) =>
        searchReposInOwner(octokit, term, owner, perScopeFetch),
      ),
    );
    const allLists: WritableRepo[][] = [];
    let failedScopes = 0;
    for (const [i, r] of results.entries()) {
      if (r.status === "fulfilled") {
        allLists.push(r.value);
      } else {
        failedScopes++;
        console.error(
          `[searchAccessibleRepos] ${scopes[i].owner} failed:`,
          r.reason,
        );
      }
    }
    // All scopes blew up – likely token revoked or secondary rate-limit.
    // Surface as an error rather than an empty result the caller would
    // render as "no matches".
    if (failedScopes > 0 && failedScopes === scopes.length) {
      throw new Error("All GitHub repo searches failed");
    }

    const seen = new Set<string>();
    const merged: WritableRepo[] = [];
    for (const list of allLists) {
      for (const repo of list) {
        if (seen.has(repo.fullName)) continue;
        seen.add(repo.fullName);
        if (opts.adoptableOnly && (!repo.canPush || repo.hasRFCs)) continue;
        merged.push(repo);
        if (merged.length >= limit) break;
      }
      if (merged.length >= limit) break;
    }
    return merged;
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "searchAccessibleRepos",
      query: trimmed,
      context: "searching_accessible_repos",
    });
    throw error;
  }
}

export interface UserSearchResult {
  login: string;
  avatarUrl: string;
}

/**
 * Search GitHub users by login or name fragment. Used by the reviewer picker
 * on the create-RFC page; returns at most 10 users to keep the dropdown small.
 */
export async function searchUsers(
  accessToken: string,
  query: string,
): Promise<UserSearchResult[]> {
  if (!query.trim()) return [];
  try {
    const octokit = await getOctokit(accessToken);
    const { data } = await octokit.rest.search.users({
      q: `${query} in:login`,
      per_page: 10,
    });
    return data.items.map((u) => ({
      login: u.login,
      avatarUrl: u.avatar_url,
    }));
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "searchUsers",
      query,
      context: "searching_users",
    });
    return [];
  }
}

export interface CreateRFCInput {
  accessToken: string;
  owner: string;
  repo: string;
  title: string;
  /** Body of the .md file the RFC will live in. */
  rfcBody: string;
  /** Auto-generated PR description (separate from the RFC body itself). */
  prBody: string;
  /** Slug derived from the title; used for filename and branch. */
  slug: string;
  /** GitHub login of the current user; used in the branch name. */
  username: string;
  /** Optional reviewers to request on the new PR. */
  reviewers: string[];
  /** Open as draft PR. */
  draft: boolean;
  /** Override the RFC directory (default: load from `.rfc123.json` / heuristic). */
  directory?: string;
  /** Team subdirectory for `layout: multi-directory` repos. Ignored for flat layout. */
  team?: string;
  /** Override the branch name (default: `rfc/<username>/<slug>`). */
  branchName?: string;
}

export interface CreateRFCResult {
  number: number;
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  htmlUrl: string;
  draft: boolean;
  /** The directory the RFC was committed to (auto-detected or explicit). */
  directory: string;
}

/**
 * Detect the conventional RFC directory in a repo by probing well-known
 * locations. Returns `requests-for-comments` as the default for new repos so
 * the layout stays consistent with the rest of the ecosystem.
 */
export async function detectRfcDirectory(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<string> {
  const cacheKey = `repo_rfc_dir:${owner}:${repo}`;
  const cached = await getCachedJsonData<string>(cacheKey);
  if (cached) return cached;
  const octokit = await getOctokit(accessToken);
  const candidates = ["requests-for-comments", "RFCs", "rfcs", "docs/rfcs"];
  for (const path of candidates) {
    try {
      const res = await octokit.rest.repos.getContent({ owner, repo, path });
      if (Array.isArray(res.data)) {
        await setCachedJsonData(cacheKey, path, 3600, {
          name: "detectRfcDirectory:directory",
        });
        return path;
      }
    } catch {
      // not present – try next
    }
  }
  const fallback = "requests-for-comments";
  await setCachedJsonData(cacheKey, fallback, 3600, {
    name: "detectRfcDirectory:fallback",
  });
  return fallback;
}

/**
 * Create an RFC in `owner/repo`: branch off the default branch, commit the
 * markdown file, open a PR, request reviewers. On branch/file collision,
 * appends a random 4-letter suffix to both name and filename so they stay
 * aligned. Throws a typed error with `status` if write access is missing.
 */
export async function createRFC(
  input: CreateRFCInput,
): Promise<CreateRFCResult> {
  const {
    accessToken,
    owner,
    repo,
    title,
    rfcBody,
    prBody,
    slug,
    username,
    reviewers,
    draft,
  } = input;

  const octokit = await getOctokit(accessToken);

  try {
    // 1. Get the repo's default branch and check write access.
    const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo });
    if (!repoInfo.permissions?.push) {
      const err = new Error(
        "You do not have write access to this repository.",
      ) as Error & {
        code?: string;
      };
      err.code = "no_write_access";
      throw err;
    }
    const defaultBranch = repoInfo.default_branch;

    // 2. Get the SHA of the default branch tip.
    const { data: baseRef } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`,
    });
    const baseSha = baseRef.object.sha;

    // 3. Resolve where the RFC lives. We honor `.rfc123.json` when present;
    //    otherwise we fall back to the historical directory heuristic. New
    //    RFCs always get a date prefix (`YYYY-MM-DD-…`), even in legacy repos.
    const baseConfig = await loadRfcConfig(accessToken, owner, repo);
    const config: RfcConfig = input.directory
      ? { ...baseConfig, directory: input.directory }
      : baseConfig;
    const team =
      config.layout === "multi-directory" ? (input.team ?? null) : null;
    const date = todayYmd();
    const baseBranch = input.branchName ?? `rfc/${slugify(username)}/${slug}`;
    const baseFilePath = rfcFilePath(config, { team, slug, date });

    let branchName = baseBranch;
    let filePath = baseFilePath;
    let collision = await hasBranchOrFile(
      octokit,
      owner,
      repo,
      branchName,
      filePath,
      defaultBranch,
    );
    let attempts = 0;
    while (collision && attempts < 5) {
      const suffix = randomSuffix();
      branchName = `${baseBranch}-${suffix}`;
      filePath = rfcFilePath(config, {
        team,
        slug: `${slug}-${suffix}`,
        date,
      });
      collision = await hasBranchOrFile(
        octokit,
        owner,
        repo,
        branchName,
        filePath,
        defaultBranch,
      );
      attempts++;
    }
    if (collision) {
      throw new Error(
        "Could not find a free branch/file name after 5 attempts.",
      );
    }

    // 4. Create the branch from the default-branch SHA.
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });

    // 5. Commit the markdown file on the new branch.
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filePath,
      message: `RFC: ${title}`,
      content: Buffer.from(rfcBody, "utf-8").toString("base64"),
      branch: branchName,
    });

    // 6. Open the PR.
    const { data: pr } = await octokit.rest.pulls.create({
      owner,
      repo,
      title,
      head: branchName,
      base: defaultBranch,
      body: prBody,
      draft,
    });

    // 7. Request reviewers (best effort – don't fail the whole create if a
    //    reviewer can't be requested, e.g. they're not a repo collaborator).
    if (reviewers.length > 0) {
      try {
        await octokit.rest.pulls.requestReviewers({
          owner,
          repo,
          pull_number: pr.number,
          reviewers,
        });
      } catch (error) {
        captureServerException(error as Error, undefined, {
          function: "createRFC",
          subfunction: "requestReviewers",
          owner,
          repo,
          prNumber: pr.number,
          reviewers,
        });
      }
    }

    return {
      number: pr.number,
      owner,
      repo,
      branch: branchName,
      filePath,
      htmlUrl: pr.html_url,
      draft,
      directory: config.directory,
    };
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "createRFC",
      owner,
      repo,
      title,
      context: "creating_rfc",
    });
    throw error;
  }
}

async function hasBranchOrFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  defaultBranch: string,
): Promise<boolean> {
  const [branchRes, fileRes] = await Promise.allSettled([
    octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` }),
    octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: defaultBranch,
    }),
  ]);
  return branchRes.status === "fulfilled" || fileRes.status === "fulfilled";
}

const RFC_CONFIG_CACHE_PREFIX = "rfc_config:v1";

function rfcConfigCacheKey(owner: string, repo: string): string {
  return `${RFC_CONFIG_CACHE_PREFIX}:${owner}:${repo}`;
}

/**
 * List the top-level directories of `owner/repo`. In a `multi-directory` RFC
 * repo, these *are* the teams – no separate list to keep in sync. Hidden dirs
 * (`.github`, etc.) are excluded. Not cached so newly-typed teams show up
 * immediately in the picker after the first RFC commits the folder.
 */
export async function listRepoTeamDirectories(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<string[]> {
  const octokit = await getOctokit(accessToken);
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: "",
    });
    if (!Array.isArray(data)) return [];
    return data
      .filter((entry) => entry.type === "dir" && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Read `.rfc123.json` from `owner/repo`'s default branch. Returns a synthesized
 * fallback config when the file is missing, with `directory` resolved via the
 * historical `detectRfcDirectory` heuristic so legacy repos keep working.
 */
export async function loadRfcConfig(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<RfcConfig> {
  const cached = await getCachedJsonData<RfcConfig>(
    rfcConfigCacheKey(owner, repo),
  );
  if (cached) return cached;
  const octokit = await getOctokit(accessToken);
  try {
    const res = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: RFC_CONFIG_PATH,
    });
    if (
      !Array.isArray(res.data) &&
      "content" in res.data &&
      typeof res.data.content === "string"
    ) {
      const raw = Buffer.from(res.data.content, "base64").toString("utf-8");
      const config = parseRfcConfig(raw);
      await setCachedJsonData(rfcConfigCacheKey(owner, repo), config, 3600, {
        name: "loadRfcConfig:explicit",
      });
      return config;
    }
  } catch (e) {
    const err = e as { status?: number; message?: string };
    // Only fall through on a real 404 (file absent). Anything else (403, 5xx,
    // network) gets surfaced – otherwise a transient GH outage would pin the
    // synthesized legacy config in cache and new RFCs would land in the
    // wrong directory for up to its TTL.
    if (err?.status !== 404) {
      captureServerException(e as Error, undefined, {
        function: "loadRfcConfig",
        owner,
        repo,
        context: "fetching_rfc_config",
      });
      throw e;
    }
  }
  const directory = await detectRfcDirectory(accessToken, owner, repo);
  const config = defaultRfcConfig({ directory });
  // Short TTL so a later commit of `.rfc123.json` is picked up quickly rather
  // than waiting an hour for the legacy assumption to expire.
  await setCachedJsonData(rfcConfigCacheKey(owner, repo), config, 60, {
    name: "loadRfcConfig:legacy",
  });
  return config;
}

export interface AvailableOwner {
  login: string;
  type: "User" | "Organization";
  avatarUrl: string;
}

/**
 * List the user's account + every org they're a member of, for the onboarding
 * wizard's "where should the RFCs repo live?" picker and for owner-scoped
 * search fan-out in the "Add existing RFCs repo" modal. Cached for 10 min
 * because the modal's debounced search would otherwise re-fetch on every
 * keystroke.
 */
export async function listAvailableOwners(
  accessToken: string,
): Promise<AvailableOwner[]> {
  const cacheKey = `available_owners:v1:${tokenKey(accessToken)}`;
  const cached = await getCachedJsonData<AvailableOwner[]>(cacheKey);
  if (cached) return cached;

  const octokit = await getOctokit(accessToken);
  const [{ data: user }, orgs] = await Promise.all([
    octokit.rest.users.getAuthenticated(),
    octokit.paginate(octokit.rest.orgs.listForAuthenticatedUser, {
      per_page: 100,
    }),
  ]);
  const owners: AvailableOwner[] = [
    {
      login: user.login,
      type: "User",
      avatarUrl: user.avatar_url,
    },
    ...orgs.map((org) => ({
      login: org.login,
      type: "Organization" as const,
      avatarUrl: org.avatar_url,
    })),
  ];
  await setCachedJsonData(cacheKey, owners, 600, {
    name: "listAvailableOwners:owners",
  });
  return owners;
}

/** Return true if `owner/name` is free to claim, false if already taken. */
export async function checkRepoNameAvailable(
  accessToken: string,
  owner: string,
  name: string,
): Promise<boolean> {
  const octokit = await getOctokit(accessToken);
  try {
    await octokit.rest.repos.get({ owner, repo: name });
    return false;
  } catch (e) {
    const err = e as { status?: number };
    if (err?.status === 404) return true;
    throw e;
  }
}

export interface CreateRfcRepoInput {
  accessToken: string;
  owner: string;
  /** Personal account → false; organization → true. Determines the create endpoint. */
  isOrg: boolean;
  name: string;
  visibility: "private" | "public";
  layout: RfcLayout;
  teams: string[];
}

export interface CreateRfcRepoResult {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  htmlUrl: string;
  config: RfcConfig;
}

/**
 * Bootstrap a fresh dedicated RFCs repo. Steps:
 *   1. POST /user/repos or /orgs/{org}/repos with `auto_init: true`.
 *   2. Overwrite the auto-created README with one that explains the convention.
 *   3. Commit `.rfc123.json` so the layout is portable / human-readable.
 *   4. For `multi-directory` layouts, drop a `.gitkeep` into each starter team folder.
 *
 * If any post-create step fails we don't try to roll the repo back – the user
 * lands on a usable (if minimal) repo and we surface a warning. The README and
 * config are the only thing the rest of the app *needs* to behave correctly,
 * and both are best-effort idempotent for retry.
 */
export async function createRfcRepo(
  input: CreateRfcRepoInput,
): Promise<CreateRfcRepoResult> {
  const { accessToken, owner, isOrg, name, visibility, layout } = input;
  const octokit = await getOctokit(accessToken);

  const createParams = {
    name,
    description: "Requests for comments",
    private: visibility === "private",
    auto_init: true,
  } as const;

  const { data: repo } = isOrg
    ? await octokit.rest.repos.createInOrg({ org: owner, ...createParams })
    : await octokit.rest.repos.createForAuthenticatedUser(createParams);

  const defaultBranch = repo.default_branch;
  const teams =
    layout === "multi-directory"
      ? Array.from(
          new Set(input.teams.map((t) => t.trim()).filter((t) => t.length > 0)),
        )
      : [];
  const config = defaultRfcConfig({ layout });

  // `auto_init: true` gave us a stub README – fetch its sha so we can
  // overwrite it. Runs in parallel with the writes that don't need it.
  const readmeShaPromise = octokit.rest.repos
    .getContent({ owner, repo: name, path: "README.md", ref: defaultBranch })
    .then(({ data }) =>
      !Array.isArray(data) && "sha" in data ? data.sha : undefined,
    )
    .catch(() => undefined);

  const writeFile = (
    path: string,
    message: string,
    content: string,
    sha?: string,
  ) =>
    octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo: name,
      path,
      message,
      content: Buffer.from(content, "utf-8").toString("base64"),
      branch: defaultBranch,
      sha,
    });

  const readmeSha = await readmeShaPromise;
  await Promise.all([
    writeFile(
      "README.md",
      "Initialize RFCs repo",
      renderRfcRepoReadme({ config, teams, owner, name }),
      readmeSha,
    ),
    writeFile(RFC_CONFIG_PATH, "Add .rfc123.json", serializeRfcConfig(config)),
    ...teams.map((team) =>
      writeFile(`${team}/.gitkeep`, `Add ${team}/ directory`, ""),
    ),
  ]);

  // Seed the per-repo config cache so a follow-up `loadRfcConfig` (e.g. the
  // /rfcs/new page-load right after the wizard hands off) serves the explicit
  // config instead of paying a getContent round-trip + risking a 404 on
  // replication lag. The viewer-repo sweep is invalidated so the next list
  // call rebuilds with the new repo (and thus sees its fresh `.rfc123.json`).
  await Promise.all([
    setCachedJsonData(rfcConfigCacheKey(owner, name), config, 3600, {
      name: "createRfcRepo:seed_config",
    }),
    invalidateViewerRepos(accessToken),
  ]);

  return {
    owner,
    name,
    fullName: repo.full_name,
    defaultBranch,
    htmlUrl: repo.html_url,
    config,
  };
}

/**
 * Distinguish GitHub's "file already exists, supply a sha to update" 422
 * from other 422s (branch protection, push protection, archived repo, etc.).
 * The file-exists case is recognizable by `"sha" wasn't supplied` in the
 * top-level message AND/OR an `errors` entry citing the path.
 */
function isFileExists422(err: {
  status?: number;
  message?: string;
  response?: { data?: { message?: string; errors?: unknown } };
}): boolean {
  const message = err.message ?? err.response?.data?.message ?? "";
  return /sha.*supplied/i.test(message) || /already exists/i.test(message);
}

export interface AdoptRfcRepoInput {
  accessToken: string;
  owner: string;
  name: string;
  layout: RfcLayout;
}

export interface AdoptRfcRepoResult {
  owner: string;
  name: string;
  fullName: string;
  alreadyAdopted: boolean;
  config: RfcConfig;
}

/**
 * Adopt an existing repo as an RFCs repo by committing `.rfc123.json` to its
 * default branch. The list/picker keys off that file, so writing it is the
 * one and only step needed to bring a legacy repo back onto the user's list.
 *
 * Idempotent: if the file already exists we return `alreadyAdopted: true`
 * without an extra commit (the user reaches the list through normal discovery).
 *
 * Throws a typed error with `code = "no_write_access"` when the viewer lacks
 * push permission, so the API route can surface a friendly 403.
 */
export async function adoptRfcRepo(
  input: AdoptRfcRepoInput,
): Promise<AdoptRfcRepoResult> {
  const { accessToken, owner, name, layout } = input;
  const octokit = await getOctokit(accessToken);

  const { data: repoInfo } = await octokit.rest.repos.get({
    owner,
    repo: name,
  });
  if (!repoInfo.permissions?.push) {
    const err = new Error(
      "You do not have write access to this repository.",
    ) as Error & { code?: string };
    err.code = "no_write_access";
    throw err;
  }
  const defaultBranch = repoInfo.default_branch;
  const config = defaultRfcConfig({ layout });

  // Attempt the commit directly. GitHub returns 422 for several reasons –
  // file-exists-without-sha is the "already adopted" case we want to short
  // circuit; branch protection, push protection, signed-commit requirements,
  // and archived repos also return 422 and MUST surface as real errors
  // (otherwise we'd seed the cache and tell the user "added!" while the
  // file was never actually written).
  let alreadyAdopted = false;
  try {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo: name,
      path: RFC_CONFIG_PATH,
      message: "Add .rfc123.json",
      content: Buffer.from(serializeRfcConfig(config), "utf-8").toString(
        "base64",
      ),
      branch: defaultBranch,
    });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    if (err?.status !== 422 || !isFileExists422(err)) throw e;
    alreadyAdopted = true;
  }

  await Promise.all([
    setCachedJsonData(rfcConfigCacheKey(owner, name), config, 3600, {
      name: "adoptRfcRepo:seed_config",
    }),
    invalidateViewerRepos(accessToken),
  ]);

  return {
    owner,
    name,
    fullName: repoInfo.full_name,
    alreadyAdopted,
    config,
  };
}

function renderRfcRepoReadme({
  config,
  teams,
  owner,
  name,
}: {
  config: RfcConfig;
  teams: string[];
  owner: string;
  name: string;
}): string {
  const exampleFilename = `${todayYmd()}-example-proposal.md`;
  const layoutNote =
    config.layout === "multi-directory"
      ? `RFCs live in per-team directories at the repo root (${
          teams.length > 0
            ? teams.map((t) => `\`${t}/\``).join(", ")
            : "you'll create these as you go"
        }), with date-prefixed filenames like \`engineering/${exampleFilename}\`.`
      : `RFCs live at the repo root, with date-prefixed filenames like \`${exampleFilename}\`.`;
  const newRfcUrl = `https://rfc123.com/rfcs/new?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`;
  return `# RFCs

This is where we write things down before we build them – proposals, design docs, anything worth a second pair of eyes. Reviews happen on the pull request.

Created by [RFC123](https://rfc123.com).

## Got something to propose?

[**Start a new RFC here →**](${newRfcUrl})

RFC123 will scaffold the file in the right place, open the PR, and request the right reviewers.

## Layout

${layoutNote} The exact convention is encoded in [\`.rfc123.json\`](./.rfc123.json) – edit it if your conventions change.
`;
}
