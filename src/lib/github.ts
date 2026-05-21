import { Octokit } from "octokit";
import {
  getCachedJsonData,
  getCachedJsonDataBatch,
  setCachedJsonData,
  setCachedJsonDataBatch,
} from "./cache";
import { captureServerException } from "./posthog-server";
import { randomSuffix } from "./random-suffix";
import { slugify } from "./slugify";

export interface RepoOption {
  owner: string;
  name: string;
  fullName: string;
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
  const cacheKey = `granted_scopes:${accessToken}`;
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

export {
  isRelativeMarkdownAssetSrc,
  normalizeRepoPath,
  resolveMarkdownImageRepoPath,
} from "./markdown-assets";

function repoHasRfcsCacheKey(owner: string, name: string): string {
  return `repo_has_rfcs:${owner}:${name}`;
}

async function detectRepoHasRfcs(
  octokit: Octokit,
  owner: string,
  name: string,
): Promise<boolean> {
  const nameLower = name.toLowerCase();
  if (
    nameLower.includes("rfc") ||
    nameLower.includes("requests-for-comments")
  ) {
    return true;
  }
  const [variantFull, variantShort] = await Promise.allSettled([
    octokit.rest.repos.getContent({
      owner,
      repo: name,
      path: "requests-for-comments",
    }),
    octokit.rest.repos.getContent({
      owner,
      repo: name,
      path: "RFCs",
    }),
  ]);
  return (
    variantFull.status === "fulfilled" || variantShort.status === "fulfilled"
  );
}

export async function listReposWithRFCs(
  accessToken: string,
): Promise<RepoOption[]> {
  try {
    const octokit = await getOctokit(accessToken);

    // Get all repos the user has access to (personal + orgs)
    const cachedReposWithRFCs = await getCachedJsonData<RepoOption[]>(
      `repos_with_rfcs:${accessToken}`,
    );
    if (cachedReposWithRFCs) {
      return cachedReposWithRFCs;
    }

    // Paginate so users in orgs with hundreds of repos aren't capped at the
    // 100 most-recently-updated. Without this, dedicated-but-quiet RFC repos
    // (e.g. `requests-for-comments-internal`) silently fall off the list.
    //
    // `octokit.paginate` walks pages sequentially. We instead fetch page 1,
    // read the `Link: …; rel="last"` header to learn the total page count,
    // then fire the remaining pages in parallel via `Promise.all` – same
    // trick used for review-comment counts further down.
    const listParams = {
      per_page: 100,
      sort: "updated" as const,
      affiliation: "owner,organization_member,collaborator",
    };
    const firstPage =
      await octokit.rest.repos.listForAuthenticatedUser(listParams);
    const linkHeader = firstPage.headers.link;
    const lastPageMatch = linkHeader?.match(/[?&]page=(\d+)>; rel="last"/);
    const lastPage = lastPageMatch ? Number.parseInt(lastPageMatch[1], 10) : 1;
    const restPages =
      lastPage > 1
        ? await Promise.all(
            Array.from({ length: lastPage - 1 }, (_, i) =>
              octokit.rest.repos.listForAuthenticatedUser({
                ...listParams,
                page: i + 2,
              }),
            ),
          )
        : [];
    const repos = [firstPage, ...restPages].flatMap((r) =>
      r.data.map((repo) => ({
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
      })),
    );

    // Check all repos in parallel for RFC content (single MGET for cache hits).
    const repoHasRfcsKeys = repos.map((repo) =>
      repoHasRfcsCacheKey(repo.owner, repo.name),
    );
    const cachedHasRFCs = await getCachedJsonDataBatch<boolean>(
      repoHasRfcsKeys,
      { name: "listReposWithRFCs:repo_has_rfcs" },
    );

    const checks = repos.map(async (repo, i) => {
      let hasRFCs: boolean | null = cachedHasRFCs[i];
      if (hasRFCs != null) {
        return hasRFCs ? repo : null;
      }
      hasRFCs = await detectRepoHasRfcs(octokit, repo.owner, repo.name);
      await setCachedJsonData(
        repoHasRfcsCacheKey(repo.owner, repo.name),
        hasRFCs,
        600,
        { name: "listReposWithRFCs:repo_has_rfcs" },
      );
      return hasRFCs ? repo : null;
    });

    const results = await Promise.all(checks);
    const reposWithRFCs = results.filter(
      (repo): repo is RepoOption => repo !== null,
    );
    await setCachedJsonData(
      `repos_with_rfcs:${accessToken}`,
      reposWithRFCs,
      600,
      { name: "listReposWithRFCs:repos_with_rfcs" },
    );
    return reposWithRFCs;
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
    const contentCacheKey = `rfc:${owner}:${repo}:${prNumber}:content:v2`;
    interface CachedRFCContent {
      pr: any;
      files: any[];
      markdownContent: string;
      markdownFilePath: string | null;
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

          const fileContent = fileResp.data as { content?: string };
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
    const userCacheKey = `user_info:${accessToken}`;
    const cached = await getCachedJsonData<CurrentUser>(userCacheKey);

    if (cached && cached.id) {
      console.log(
        `[getCurrentUser] cache HIT, took ${(performance.now() - t0).toFixed(0)}ms`,
      );
      return cached;
    }

    // Also check the legacy login-only cache key to avoid an extra GH call during migration
    const legacyCacheKey = `user:${accessToken}`;
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
    const legacyCacheKey = `user:${accessToken}`;
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
    const contentCacheKey = `rfc:${owner}:${repo}:${prNumber}:content:v2`;
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
}

/**
 * List repos the authenticated user has any access to, annotated with push
 * permission and whether the repo already hosts RFCs. Used by the "Create RFC"
 * flow's repo picker, which needs more info than the read-only RFC list does.
 */
export async function listWritableRepos(
  accessToken: string,
): Promise<WritableRepo[]> {
  try {
    const octokit = await getOctokit(accessToken);

    const cacheKey = `writable_repos:${accessToken}`;
    const cached = await getCachedJsonData<WritableRepo[]>(cacheKey);
    if (cached) return cached;

    // Paginate to catch users with many repos (default is 30/page).
    const data = await octokit.paginate(
      octokit.rest.repos.listForAuthenticatedUser,
      {
        per_page: 100,
        sort: "updated",
        affiliation: "owner,organization_member,collaborator",
      },
    );

    // Determine which repos already host RFCs, in parallel, using the same
    // heuristic as listReposWithRFCs (name or directory).
    const repoHasRfcsKeys = data.map((repo) =>
      repoHasRfcsCacheKey(repo.owner.login, repo.name),
    );
    const cachedHasRFCs = await getCachedJsonDataBatch<boolean>(
      repoHasRfcsKeys,
      { name: "listWritableRepos:repo_has_rfcs" },
    );

    const cacheWrites: Array<{ key: string; value: boolean }> = [];

    const annotated = await Promise.all(
      data.map(async (repo, i) => {
        const owner = repo.owner.login;
        const name = repo.name;
        let hasRFCs: boolean | null = cachedHasRFCs[i];
        if (hasRFCs == null) {
          hasRFCs = await detectRepoHasRfcs(octokit, owner, name);
          cacheWrites.push({
            key: repoHasRfcsCacheKey(owner, name),
            value: hasRFCs,
          });
        }

        return {
          owner,
          name,
          fullName: repo.full_name,
          canPush: repo.permissions?.push ?? false,
          hasRFCs: !!hasRFCs,
          isOrg: repo.owner.type === "Organization",
          defaultBranch: repo.default_branch || "main",
        } satisfies WritableRepo;
      }),
    );

    if (cacheWrites.length > 0) {
      await setCachedJsonDataBatch(cacheWrites, 600, {
        name: "listWritableRepos:repo_has_rfcs",
      });
    }

    // Sort: RFC repos first (familiar territory), then by last updated.
    annotated.sort((a, b) => {
      if (a.hasRFCs !== b.hasRFCs) return a.hasRFCs ? -1 : 1;
      return 0;
    });

    await setCachedJsonData(cacheKey, annotated, 300, {
      name: "listWritableRepos:writable_repos_list",
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
  /** Override the RFC directory (default: auto-detect from existing layout). */
  directory?: string;
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

    // 3. Choose branch / file path. If either collides, append the same
    //    random 4-letter suffix to both so they stay aligned. Slugify the
    //    username defensively – GitHub logins are already URL-safe, but the
    //    client preview passes display names which may contain spaces/caps.
    const directory =
      input.directory ?? (await detectRfcDirectory(accessToken, owner, repo));
    const baseBranch = input.branchName ?? `rfc/${slugify(username)}/${slug}`;
    const baseFilePath = `${directory}/${slug}.md`;

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
      filePath = `${directory}/${slug}-${suffix}.md`;
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
      directory,
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
