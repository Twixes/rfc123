import { Octokit } from "octokit";
import { listReposWithRFCs } from "./github";
import { captureServerException } from "./posthog-server";

/**
 * MCP-specific GitHub helpers. These wrap Octokit calls used only by the
 * MCP server's tools – review-thread listing, comment listing, PR merging,
 * reviewer requests, and deterministic searches. Kept separate from
 * `src/lib/github.ts` because that module is already large and pulls in
 * caches the MCP path doesn't always need.
 *
 * Surface rule: only *read* and *structural* helpers live here. There is no
 * helper that turns LLM prose into GitHub content – that lands on the
 * human-driven web app routes (`/api/comment`, `/api/rfcs` POST) instead.
 */

export interface RfcRef {
  owner: string;
  repo: string;
  number: number;
}

/**
 * Resolve an `(owner, repo, number)` reference. If owner+repo are both
 * provided, returns them unchanged. Otherwise fans out `pulls.get` across
 * every RFC repo the user can access (using the cached repo list) and
 * returns the unique match.
 *
 * Throws with a descriptive message when zero or multiple repos contain a PR
 * with that number – the agent should then prompt the user (or call
 * list_rfcs to narrow down) rather than guess.
 */
export async function resolveRfcRef(
  accessToken: string,
  opts: { owner?: string; repo?: string; number: number },
): Promise<RfcRef> {
  if (opts.owner && opts.repo) {
    return { owner: opts.owner, repo: opts.repo, number: opts.number };
  }
  const repos = await listReposWithRFCs(accessToken);
  if (opts.repo) {
    const candidates = repos.filter((r) => r.name === opts.repo);
    if (candidates.length === 1) {
      return {
        owner: candidates[0].owner,
        repo: opts.repo,
        number: opts.number,
      };
    }
    if (candidates.length === 0) {
      throw new Error(
        `No RFC repository named "${opts.repo}" is visible to you.`,
      );
    }
    throw new Error(
      `Multiple RFC repositories are named "${opts.repo}": ${candidates
        .map((c) => `${c.owner}/${c.name}`)
        .join(", ")}. Pass \`owner\` explicitly.`,
    );
  }

  const octokit = new Octokit({ auth: accessToken });
  const hits = await Promise.all(
    repos.map(async (r) => {
      try {
        const { data } = await octokit.rest.pulls.get({
          owner: r.owner,
          repo: r.name,
          pull_number: opts.number,
        });
        // Confirm it's actually an RFC PR (has a .md file in its diff). Cheap
        // shortcut: we trust listReposWithRFCs to have filtered to RFC-bearing
        // repos already, so any PR with this number in such a repo is fair
        // game – re-listing files would multiply API calls per resolution.
        return { owner: r.owner, repo: r.name, number: data.number };
      } catch {
        return null;
      }
    }),
  );
  const matches = hits.filter((h): h is RfcRef => h !== null);
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(
      `No PR #${opts.number} found in any RFC repository you can access.`,
    );
  }
  throw new Error(
    `PR #${opts.number} exists in multiple RFC repositories: ${matches
      .map((m) => `${m.owner}/${m.repo}`)
      .join(", ")}. Pass \`owner\` and \`repo\` explicitly.`,
  );
}

export interface ReviewThread {
  id: string;
  firstCommentId: number | null;
  isResolved: boolean;
  isOutdated: boolean;
  path: string | null;
  line: number | null;
  /** Diff context (the surrounding code/text the thread is anchored to). */
  diffHunk: string | null;
  comments: Array<{
    id: string;
    databaseId: number | null;
    author: string | null;
    body: string;
    createdAt: string;
    url: string;
  }>;
}

export interface ListReviewThreadsResult {
  threads: ReviewThread[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

/**
 * List a page of review threads on a PR with their resolution state and
 * diff context. `pageSize` defaults to 50, max 100.
 */
export async function listReviewThreads(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number,
  opts: { pageSize?: number; after?: string } = {},
): Promise<ListReviewThreadsResult> {
  const octokit = new Octokit({ auth: accessToken });
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 100);
  const query = `
    query($owner: String!, $repo: String!, $number: Int!, $pageSize: Int!, $after: String) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          reviewThreads(first: $pageSize, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              isResolved
              isOutdated
              path
              line
              comments(first: 50) {
                nodes {
                  id
                  databaseId
                  body
                  createdAt
                  url
                  diffHunk
                  author { login }
                }
              }
            }
          }
        }
      }
    }
  `;
  const resp = (await octokit.graphql(query, {
    owner,
    repo,
    number: prNumber,
    pageSize,
    after: opts.after ?? null,
  })) as {
    repository: {
      pullRequest: {
        reviewThreads: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{
            id: string;
            isResolved: boolean;
            isOutdated: boolean;
            path: string | null;
            line: number | null;
            comments: {
              nodes: Array<{
                id: string;
                databaseId: number | null;
                body: string;
                createdAt: string;
                url: string;
                diffHunk: string | null;
                author: { login: string } | null;
              }>;
            };
          }>;
        };
      };
    };
  };

  const threads: ReviewThread[] =
    resp.repository.pullRequest.reviewThreads.nodes.map((t) => {
      const comments = t.comments.nodes;
      return {
        id: t.id,
        firstCommentId: comments[0]?.databaseId ?? null,
        isResolved: t.isResolved,
        isOutdated: t.isOutdated,
        path: t.path,
        line: t.line,
        diffHunk: comments[0]?.diffHunk ?? null,
        comments: comments.map((c) => ({
          id: c.id,
          databaseId: c.databaseId,
          author: c.author?.login ?? null,
          body: c.body,
          createdAt: c.createdAt,
          url: c.url,
        })),
      };
    });
  return {
    threads,
    pageInfo: resp.repository.pullRequest.reviewThreads.pageInfo,
  };
}

/**
 * Fetch every comment (general issue + inline review) on an RFC's PR,
 * sorted oldest → newest. Shared by the `get_rfc_comments` tool and the
 * `rfc-comments` resource.
 */
export async function fetchAllRfcComments(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number,
) {
  const octokit = new Octokit({ auth: accessToken });
  const [issueComments, reviewComments] = await Promise.all([
    octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    }),
    octokit.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    }),
  ]);
  const flat = [
    ...issueComments.data.map((c) => ({
      id: c.id,
      user: c.user?.login ?? "unknown",
      userAvatar: c.user?.avatar_url ?? "",
      body: c.body ?? "",
      createdAt: c.created_at,
    })),
    ...reviewComments.data.map((c) => ({
      id: c.id,
      user: c.user?.login ?? "unknown",
      userAvatar: c.user?.avatar_url ?? "",
      body: c.body ?? "",
      createdAt: c.created_at,
      path: c.path,
      line: c.line ?? undefined,
      inReplyToId: c.in_reply_to_id,
      diffHunk: c.diff_hunk,
    })),
  ].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return {
    flat,
    raw: { general: issueComments.data, inline: reviewComments.data },
  };
}

/**
 * Refuse to merge an RFC silently. The default path requires:
 *  1. at least one APPROVE review,
 *  2. zero unresolved review threads,
 *  3. a `### Decision (...)` block in the RFC body.
 *
 * `force: true` bypasses every check – the caller is on the hook for why.
 *
 * Merge method auto-selection: if `mergeMethod` is omitted, prefer `squash`
 * (RFC convention: one decision commit), fall back to whichever the repo
 * actually allows.
 */
export async function mergeRFC(input: {
  accessToken: string;
  owner: string;
  repo: string;
  prNumber: number;
  mergeMethod?: "merge" | "squash" | "rebase";
  commitTitle?: string;
  commitMessage?: string;
  force?: boolean;
}): Promise<{
  merged: boolean;
  sha: string | null;
  mergeMethod: "merge" | "squash" | "rebase";
  preflight: {
    approvals: number;
    unresolvedThreadCount: number;
    hasDecision: boolean;
  };
}> {
  const octokit = new Octokit({ auth: input.accessToken });
  const [reviewsRes, threadsRes, repoInfo, prRes, filesRes] = await Promise.all(
    [
      octokit.rest.pulls.listReviews({
        owner: input.owner,
        repo: input.repo,
        pull_number: input.prNumber,
      }),
      listReviewThreads(
        input.accessToken,
        input.owner,
        input.repo,
        input.prNumber,
      ),
      octokit.rest.repos.get({ owner: input.owner, repo: input.repo }),
      octokit.rest.pulls.get({
        owner: input.owner,
        repo: input.repo,
        pull_number: input.prNumber,
      }),
      octokit.rest.pulls.listFiles({
        owner: input.owner,
        repo: input.repo,
        pull_number: input.prNumber,
      }),
    ],
  );

  // Latest review state per user – same logic as getRFCDetail.
  const latest = new Map<string, string>();
  const ordered = [...reviewsRes.data].sort(
    (a, b) =>
      new Date(a.submitted_at ?? 0).getTime() -
      new Date(b.submitted_at ?? 0).getTime(),
  );
  for (const r of ordered) {
    if (!r.user) continue;
    if (
      r.state === "APPROVED" ||
      r.state === "CHANGES_REQUESTED" ||
      r.state === "DISMISSED"
    ) {
      latest.set(r.user.login, r.state);
    }
  }
  const approvals = [...latest.values()].filter((s) => s === "APPROVED").length;
  const unresolved = threadsRes.threads.filter((t) => !t.isResolved);

  // Decision block check – read the .md file from the head branch.
  let hasDecision = false;
  const mdFile = filesRes.data.find((f) => f.filename.endsWith(".md"));
  if (mdFile) {
    try {
      const contentRes = await octokit.rest.repos.getContent({
        owner: input.owner,
        repo: input.repo,
        path: mdFile.filename,
        ref: prRes.data.head.ref,
      });
      if (!Array.isArray(contentRes.data) && contentRes.data.type === "file") {
        const body = Buffer.from(contentRes.data.content, "base64").toString(
          "utf-8",
        );
        const { parseDecisionBlocks } = await import("./github");
        hasDecision = parseDecisionBlocks(body).length > 0;
      }
    } catch {
      hasDecision = false;
    }
  }

  if (!input.force) {
    const problems: string[] = [];
    if (approvals === 0) problems.push("no APPROVE review on file");
    if (unresolved.length > 0)
      problems.push(`${unresolved.length} unresolved review thread(s)`);
    if (!hasDecision)
      problems.push("no `### Decision (...)` block in the RFC body");
    if (problems.length > 0) {
      throw new Error(
        `Refusing to merge ${input.owner}/${input.repo}#${input.prNumber}: ${problems.join("; ")}. ` +
          "Address the gaps or pass `force: true` to override.",
      );
    }
  }

  let mergeMethod = input.mergeMethod;
  if (!mergeMethod) {
    const repo = repoInfo.data;
    if (repo.allow_squash_merge) mergeMethod = "squash";
    else if (repo.allow_merge_commit) mergeMethod = "merge";
    else if (repo.allow_rebase_merge) mergeMethod = "rebase";
    else mergeMethod = "merge";
  }

  const { data } = await octokit.rest.pulls.merge({
    owner: input.owner,
    repo: input.repo,
    pull_number: input.prNumber,
    merge_method: mergeMethod,
    commit_title: input.commitTitle,
    commit_message: input.commitMessage,
  });
  return {
    merged: !!data.merged,
    sha: data.sha ?? null,
    mergeMethod,
    preflight: {
      approvals,
      unresolvedThreadCount: unresolved.length,
      hasDecision,
    },
  };
}

export interface RequestReviewersResult {
  /** Reviewers freshly added on this call. */
  added: { users: string[]; teams: string[] };
  /** Reviewers already pending before this call (no-op for them). */
  alreadyRequested: { users: string[]; teams: string[] };
  /** Reviewers removed on this call. */
  removed: { users: string[]; teams: string[] };
  /** Final state of pending review requests after both add and remove. */
  pending: { users: string[]; teams: string[] };
}

/**
 * Add and/or remove reviewers in one call. Passes a user who previously
 * reviewed (and is no longer pending) re-requests them via GitHub's standard
 * `requestReviewers` semantic. Returns a structured echo so the agent can
 * tell what changed without a follow-up read.
 */
export async function requestReviewers(input: {
  accessToken: string;
  owner: string;
  repo: string;
  prNumber: number;
  users?: string[];
  teams?: string[];
  removeUsers?: string[];
  removeTeams?: string[];
}): Promise<RequestReviewersResult> {
  const octokit = new Octokit({ auth: input.accessToken });

  const { data: current } = await octokit.rest.pulls.listRequestedReviewers({
    owner: input.owner,
    repo: input.repo,
    pull_number: input.prNumber,
  });
  const currentUsers = new Set(current.users.map((u) => u.login));
  const currentTeams = new Set(current.teams.map((t) => t.slug));

  const wantUsers = input.users ?? [];
  const wantTeams = input.teams ?? [];
  const addedUsers = wantUsers.filter((u) => !currentUsers.has(u));
  const addedTeams = wantTeams.filter((t) => !currentTeams.has(t));
  const alreadyUsers = wantUsers.filter((u) => currentUsers.has(u));
  const alreadyTeams = wantTeams.filter((t) => currentTeams.has(t));

  const removeUsers = input.removeUsers ?? [];
  const removeTeams = input.removeTeams ?? [];

  if (
    addedUsers.length > 0 ||
    addedTeams.length > 0 ||
    wantUsers.length > 0 ||
    wantTeams.length > 0
  ) {
    // Pass through all of `wantUsers`/`wantTeams` (not just `addedUsers`) so a
    // user who previously reviewed and is no longer pending gets re-requested.
    await octokit.rest.pulls.requestReviewers({
      owner: input.owner,
      repo: input.repo,
      pull_number: input.prNumber,
      reviewers: wantUsers.length > 0 ? wantUsers : undefined,
      team_reviewers: wantTeams.length > 0 ? wantTeams : undefined,
    });
  }

  let removedUsers: string[] = [];
  let removedTeams: string[] = [];
  if (removeUsers.length > 0 || removeTeams.length > 0) {
    await octokit.rest.pulls.removeRequestedReviewers({
      owner: input.owner,
      repo: input.repo,
      pull_number: input.prNumber,
      reviewers: removeUsers,
      team_reviewers: removeTeams,
    });
    removedUsers = removeUsers.filter((u) => currentUsers.has(u));
    removedTeams = removeTeams.filter((t) => currentTeams.has(t));
  }

  const { data: after } = await octokit.rest.pulls.listRequestedReviewers({
    owner: input.owner,
    repo: input.repo,
    pull_number: input.prNumber,
  });

  return {
    added: { users: addedUsers, teams: addedTeams },
    alreadyRequested: { users: alreadyUsers, teams: alreadyTeams },
    removed: { users: removedUsers, teams: removedTeams },
    pending: {
      users: after.users.map((u) => u.login),
      teams: after.teams.map((t) => t.slug),
    },
  };
}

export interface ReviewerSearchResult {
  kind: "user" | "team";
  /** GitHub login (users) or `org/slug` (teams) – what to pass to request_reviewers. */
  handle: string;
  /** Display name (users: profile name; teams: team name). May be null. */
  name: string | null;
  /** Avatar URL where available. */
  avatarUrl: string | null;
  /** Org login the candidate is sourced from (always set for teams; for users
   *  this is the org they were matched in). */
  org: string;
}

/**
 * Search for *reviewers* – people and teams – within the orgs that host RFC
 * repos visible to the user. Replaces the previous global-GitHub user search
 * (10-result cap on the global namespace was near-useless for common names).
 *
 * Results pool across orgs and are capped at `limit` (default 20). Users from
 * the search API include their display name; teams come from
 * `orgs/{org}/teams` filtered locally on slug and name.
 */
export async function searchReviewers(input: {
  accessToken: string;
  query: string;
  limit?: number;
  /** Restrict the search to a single org. Used by the per-RFC reviewer picker
   *  on the web app, where only the RFC's owning org matters. When omitted,
   *  searches across every org that hosts an RFC repo visible to the user
   *  (the default MCP behavior). */
  org?: string;
}): Promise<ReviewerSearchResult[]> {
  const { accessToken, query } = input;
  const trimmed = query.trim();
  if (!trimmed) return [];
  const limit = Math.min(input.limit ?? 20, 50);
  const octokit = new Octokit({ auth: accessToken });

  let orgs: string[];
  if (input.org) {
    orgs = [input.org];
  } else {
    const repos = await listReposWithRFCs(accessToken);
    // Unique orgs from RFC repos. Personal-account owners are also acceptable
    // (their "org" search just returns themselves) but rarely useful.
    orgs = Array.from(new Set(repos.map((r) => r.owner)));
  }
  if (orgs.length === 0) return [];

  const queryLower = trimmed.toLowerCase();
  const results: ReviewerSearchResult[] = [];

  await Promise.all(
    orgs.map(async (org) => {
      // Users via org-scoped search. Profile lookups run in parallel so the
      // per-keystroke latency stays bounded (~1 round-trip instead of ~N).
      try {
        const { data } = await octokit.rest.search.users({
          q: `${trimmed} org:${org}`,
          per_page: 10,
        });
        const userHits = await Promise.all(
          data.items.map(async (u) => {
            let name: string | null = null;
            try {
              const { data: profile } = await octokit.rest.users.getByUsername({
                username: u.login,
              });
              name = profile.name ?? null;
            } catch {
              // Profile fetch is best-effort.
            }
            return {
              kind: "user" as const,
              handle: u.login,
              name,
              avatarUrl: u.avatar_url,
              org,
            };
          }),
        );
        results.push(...userHits);
      } catch (error) {
        captureServerException(error as Error, undefined, {
          function: "searchReviewers",
          subfunction: "search.users",
          org,
        });
      }
      // Teams via teams listing, filtered locally.
      try {
        const teams = await octokit.paginate(octokit.rest.teams.list, {
          org,
          per_page: 100,
        });
        for (const t of teams) {
          if (
            t.slug.toLowerCase().includes(queryLower) ||
            t.name.toLowerCase().includes(queryLower)
          ) {
            results.push({
              kind: "team",
              handle: `${org}/${t.slug}`,
              name: t.name,
              avatarUrl: null,
              org,
            });
          }
        }
      } catch (_error) {
        // Token may lack `read:org` for this org – skip silently.
      }
    }),
  );

  // De-duplicate by handle (rare for users – but a team and a user could
  // share a name across orgs).
  const seen = new Set<string>();
  const deduped: ReviewerSearchResult[] = [];
  for (const r of results) {
    const key = `${r.kind}:${r.handle}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }
  return deduped.slice(0, limit);
}

export interface SearchResult {
  number: number;
  owner: string;
  repo: string;
  title: string;
  url: string;
  state: string;
  matchedOn: "title" | "body";
}

/**
 * Deterministic text search across RFC pull requests the user can see. Uses
 * GitHub's search API. No LLM, no embeddings.
 */
export async function searchRFCs(input: {
  accessToken: string;
  query: string;
  limit?: number;
  ownerFilter?: string;
}): Promise<SearchResult[]> {
  const { accessToken, query } = input;
  const limit = Math.min(input.limit ?? 20, 50);
  const octokit = new Octokit({ auth: accessToken });

  const ownerClause = input.ownerFilter ? ` user:${input.ownerFilter}` : "";

  try {
    const issueSearch = `${query} is:pr in:title,body${ownerClause}`;
    const { data: prData } = await octokit.rest.search.issuesAndPullRequests({
      q: issueSearch,
      per_page: limit,
    });

    // Strip GitHub search qualifiers (`label:foo`) and surrounding quotes
    // before classifying – otherwise `"design doc"` would never match a title
    // because the title doesn't contain the literal quotes.
    const haystackQuery = query
      .replace(/\b[a-z]+:[^\s"]+/gi, " ")
      .replace(/["']/g, "")
      .trim()
      .toLowerCase();

    return prData.items
      .filter((item) => item.pull_request)
      .map((item) => {
        const repoUrl = item.repository_url;
        const parts = repoUrl.split("/");
        const repo = parts[parts.length - 1];
        const owner = parts[parts.length - 2];
        const matchedOn: SearchResult["matchedOn"] =
          haystackQuery && item.title.toLowerCase().includes(haystackQuery)
            ? "title"
            : "body";
        return {
          number: item.number,
          owner,
          repo,
          title: item.title,
          url: item.html_url,
          state: item.state,
          matchedOn,
        };
      });
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "searchRFCs",
      query,
    });
    return [];
  }
}
