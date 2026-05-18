import { Octokit } from "octokit";
import { DECISION_LABEL, listReposWithRFCs } from "./github";
import { captureServerException } from "./posthog-server";

/**
 * MCP-specific GitHub helpers. These wrap Octokit calls used only by the MCP
 * server's tools – review-thread resolution, decision-block commits, body
 * updates, PR-review verbs, and a deterministic text search over the user's
 * RFC repos. Kept separate from `src/lib/github.ts` because that module is
 * already large and pulls in caches the MCP path doesn't always need.
 */

/** Append a one-line "via Claude" footer to any AI-authored content. */
export const VIA_FOOTER = "\n\n— via Claude on RFC123";

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
 * with that number — the agent should then prompt the user (or call
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
        // game — re-listing files would multiply API calls per resolution.
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

/**
 * Idempotent: if the body already ends with the footer (e.g. it was read
 * back from a previous MCP edit), don't double-append. Without this, every
 * round-trip through `update_rfc_body` or `register_decision` would stack a
 * new footer on top of the old.
 */
export function withFooter(body: string): string {
  const trimmed = body.trimEnd();
  if (trimmed.endsWith(VIA_FOOTER.trim())) return trimmed;
  return trimmed + VIA_FOOTER;
}

export interface ReviewThread {
  id: string; // GraphQL node id (use for rfc123_resolve_review_thread)
  /** databaseId of the first comment — pass this directly to rfc123_reply_to_comment. */
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
 * List a page of review threads on a PR with their resolution state, diff
 * context, and the first-comment databaseId (the thing needed to reply via
 * rfc123_reply_to_comment). `pageSize` defaults to 50, max 100.
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

  const threads: ReviewThread[] = resp.repository.pullRequest.reviewThreads.nodes.map(
    (t) => {
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
    },
  );
  return { threads, pageInfo: resp.repository.pullRequest.reviewThreads.pageInfo };
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

export async function resolveReviewThread(
  accessToken: string,
  threadId: string,
): Promise<void> {
  const octokit = new Octokit({ auth: accessToken });
  await octokit.graphql(
    `mutation($id: ID!) {
       resolveReviewThread(input: { threadId: $id }) { thread { id } }
     }`,
    { id: threadId },
  );
}

export interface UpdateBodyResult {
  commitSha: string;
  branch: string;
  path: string;
  linesBefore: number;
  linesAfter: number;
  linesAdded: number;
  linesRemoved: number;
  /** Whether the commit retried after a SHA conflict. */
  retriedOnConflict: boolean;
}

/**
 * Commit a transformation of the RFC's .md file on the PR head branch.
 * Single source of truth for "find the .md file, read current body, write
 * new body + via-Claude footer". The `mutate` callback receives the current
 * body and returns the new body; the footer is added after.
 *
 * On a 409 SHA conflict (someone else committed in the meantime) the call
 * transparently re-reads and retries once. A second conflict surfaces as a
 * human-readable error.
 */
async function commitRfcBodyUpdate(input: {
  accessToken: string;
  owner: string;
  repo: string;
  prNumber: number;
  commitMessage: string;
  mutate: (currentBody: string) => string;
}): Promise<UpdateBodyResult> {
  const { accessToken, owner, repo, prNumber } = input;
  const octokit = new Octokit({ auth: accessToken });
  const [{ data: pr }, { data: files }] = await Promise.all([
    octokit.rest.pulls.get({ owner, repo, pull_number: prNumber }),
    octokit.rest.pulls.listFiles({ owner, repo, pull_number: prNumber }),
  ]);
  const branch = pr.head.ref;
  const mdFile = files.find((f) => f.filename.endsWith(".md"));
  if (!mdFile) throw new Error("PR has no .md file to update.");

  const readCurrent = async () => {
    const existing = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: mdFile.filename,
      ref: branch,
    });
    if (Array.isArray(existing.data) || existing.data.type !== "file") {
      throw new Error(`Path ${mdFile.filename} is not a regular file`);
    }
    return {
      body: Buffer.from(existing.data.content, "base64").toString("utf-8"),
      sha: existing.data.sha,
    };
  };

  const writeOnce = async (sha: string, newBody: string) =>
    octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: mdFile.filename,
      message: input.commitMessage,
      content: Buffer.from(withFooter(newBody), "utf-8").toString("base64"),
      branch,
      sha,
    });

  let { body: currentBody, sha } = await readCurrent();
  let newBody = input.mutate(currentBody);
  let retriedOnConflict = false;
  let result;
  try {
    result = await writeOnce(sha, newBody);
  } catch (error) {
    const e = error as { status?: number };
    if (e.status !== 409) throw error;
    retriedOnConflict = true;
    ({ body: currentBody, sha } = await readCurrent());
    newBody = input.mutate(currentBody);
    try {
      result = await writeOnce(sha, newBody);
    } catch (innerError) {
      const ie = innerError as { status?: number };
      if (ie.status === 409) {
        throw new Error(
          `Update conflict on ${owner}/${repo}#${prNumber}: the RFC was modified ` +
            "twice while writing. Re-read with rfc123_get_rfc and try again.",
        );
      }
      throw innerError;
    }
  }

  const finalBody = withFooter(newBody);
  const beforeLines = currentBody.split("\n");
  const afterLines = finalBody.split("\n");
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const l of afterLines) if (!beforeSet.has(l)) linesAdded++;
  for (const l of beforeLines) if (!afterSet.has(l)) linesRemoved++;

  return {
    commitSha: result.data.commit.sha ?? "",
    branch,
    path: mdFile.filename,
    linesBefore: beforeLines.length,
    linesAfter: afterLines.length,
    linesAdded,
    linesRemoved,
    retriedOnConflict,
  };
}

export async function updateRfcBody(input: {
  accessToken: string;
  owner: string;
  repo: string;
  prNumber: number;
  newContent: string;
  changeDescription: string;
}): Promise<UpdateBodyResult> {
  return commitRfcBodyUpdate({
    accessToken: input.accessToken,
    owner: input.owner,
    repo: input.repo,
    prNumber: input.prNumber,
    commitMessage: `RFC update: ${input.changeDescription}`,
    mutate: () => input.newContent,
  });
}

export interface RegisterDecisionResult extends UpdateBodyResult {
  resolvedThreadIds: string[];
  labelApplied: boolean;
}

/**
 * Append a `### Decision (YYYY-MM-DD by @login)` block to the RFC body and
 * apply the `decision-registered` label so `hasDecision` propagates to list
 * views. Optionally resolves the inline threads that the decision settles.
 *
 * Rationale is required because a decision without rationale is the exact
 * anti-pattern this tool exists to prevent — six months later, no one
 * remembers *why*. The schema enforces it; this helper trusts the schema.
 */
export async function registerDecision(input: {
  accessToken: string;
  owner: string;
  repo: string;
  prNumber: number;
  decision: string;
  rationale: string;
  decidedBy: string;
  resolvesThreadIds?: string[];
}): Promise<RegisterDecisionResult> {
  const ymd = new Date().toISOString().slice(0, 10);
  const entry =
    `### Decision (${ymd} by @${input.decidedBy})\n\n` +
    `${input.decision.trim()}\n\n` +
    `**Rationale:** ${input.rationale.trim()}\n`;

  const commitResult = await commitRfcBodyUpdate({
    accessToken: input.accessToken,
    owner: input.owner,
    repo: input.repo,
    prNumber: input.prNumber,
    commitMessage: "Register decision via Claude on RFC123",
    mutate: (current) => insertDecisionEntry(current, entry),
  });

  const octokit = new Octokit({ auth: input.accessToken });
  let labelApplied = false;
  try {
    await octokit.rest.issues.addLabels({
      owner: input.owner,
      repo: input.repo,
      issue_number: input.prNumber,
      labels: [DECISION_LABEL],
    });
    labelApplied = true;
  } catch (error) {
    // Label may not exist in the repo yet — create it once, then retry.
    try {
      await octokit.rest.issues.createLabel({
        owner: input.owner,
        repo: input.repo,
        name: DECISION_LABEL,
        color: "0e8a16",
        description: "RFC has a registered decision (auto-set by RFC123).",
      });
      await octokit.rest.issues.addLabels({
        owner: input.owner,
        repo: input.repo,
        issue_number: input.prNumber,
        labels: [DECISION_LABEL],
      });
      labelApplied = true;
    } catch (innerError) {
      captureServerException(innerError as Error, undefined, {
        function: "registerDecision",
        subfunction: "addLabel",
        owner: input.owner,
        repo: input.repo,
        prNumber: input.prNumber,
      });
    }
  }

  const resolvedThreadIds: string[] = [];
  for (const threadId of input.resolvesThreadIds ?? []) {
    try {
      await resolveReviewThread(input.accessToken, threadId);
      resolvedThreadIds.push(threadId);
    } catch (error) {
      captureServerException(error as Error, undefined, {
        function: "registerDecision",
        subfunction: "resolveThread",
        threadId,
      });
    }
  }

  return { ...commitResult, resolvedThreadIds, labelApplied };
}

/**
 * Find a `## Decisions` heading outside fenced code blocks. If one exists,
 * insert `entry` just below it; otherwise append a new section at the end.
 * A line-walker so an RFC that quotes the convention in a ```code``` block
 * doesn't get its example mangled.
 */
function insertDecisionEntry(current: string, entry: string): string {
  const lines = current.split("\n");
  let inFence = false;
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && /^##\s+Decisions\s*$/.test(lines[i])) {
      headingIdx = i;
      break;
    }
  }
  if (headingIdx === -1) {
    return `${current.trimEnd()}\n\n## Decisions\n\n${entry}`;
  }
  const before = lines.slice(0, headingIdx + 1).join("\n");
  const after = lines.slice(headingIdx + 1).join("\n");
  return `${before}\n\n${entry}\n${after}`;
}

export type ReviewState = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export interface ReviewCommentInput {
  path: string;
  line: number;
  body: string;
  /** Start of a multi-line range. When omitted, the comment is a single-line note on `line`. */
  startLine?: number;
  /** Which side of the diff `line` refers to. Defaults to RIGHT (the head version). */
  side?: "LEFT" | "RIGHT";
  /** Which side of the diff `startLine` refers to. Defaults to RIGHT. */
  startSide?: "LEFT" | "RIGHT";
}

/**
 * Submit a single GitHub PR review. `COMMENT` reviews don't carry approval
 * weight but are how senior reviewers usually bundle inline notes + an
 * overall summary.
 */
export async function submitReview(input: {
  accessToken: string;
  owner: string;
  repo: string;
  prNumber: number;
  state: ReviewState;
  body?: string;
  comments?: ReviewCommentInput[];
}): Promise<{ reviewId: number; htmlUrl: string }> {
  const { accessToken, owner, repo, prNumber, state } = input;
  const octokit = new Octokit({ auth: accessToken });
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  const { data } = await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: pr.head.sha,
    event: state,
    body: input.body ? withFooter(input.body) : undefined,
    comments: input.comments?.map((c) => ({
      path: c.path,
      line: c.line,
      body: withFooter(c.body),
      side: c.side,
      start_line: c.startLine,
      start_side: c.startSide,
    })),
  });

  return { reviewId: data.id, htmlUrl: data.html_url };
}

export interface MergePreflightFailure {
  reason: string;
  approvals: number;
  unresolvedThreadCount: number;
  hasDecision: boolean;
}

/**
 * Refuse to merge an RFC silently. The default path requires:
 *  1. at least one APPROVE review,
 *  2. zero unresolved review threads,
 *  3. a `### Decision (...)` block in the RFC body.
 *
 * `force: true` bypasses every check — the caller is on the hook for why.
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
  preflight: { approvals: number; unresolvedThreadCount: number; hasDecision: boolean };
}> {
  const octokit = new Octokit({ auth: input.accessToken });
  const [reviewsRes, threadsRes, repoInfo, prRes, filesRes] = await Promise.all([
    octokit.rest.pulls.listReviews({
      owner: input.owner,
      repo: input.repo,
      pull_number: input.prNumber,
    }),
    listReviewThreads(input.accessToken, input.owner, input.repo, input.prNumber),
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
  ]);

  // Latest review state per user — same logic as getRFCDetail.
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

  // Decision block check — read the .md file from the head branch.
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

/**
 * Close the PR after first posting `reason` as a wrap-up comment so future
 * readers see *why* the RFC was abandoned. The comment lands before the
 * close event, in GitHub's event order.
 */
export async function closeRFC(input: {
  accessToken: string;
  owner: string;
  repo: string;
  prNumber: number;
  reason: string;
}): Promise<{ closingCommentUrl: string | null }> {
  const octokit = new Octokit({ auth: input.accessToken });
  const body = withFooter(`**Closing this RFC.** ${input.reason.trim()}`);
  let closingCommentUrl: string | null = null;
  try {
    const { data } = await octokit.rest.issues.createComment({
      owner: input.owner,
      repo: input.repo,
      issue_number: input.prNumber,
      body,
    });
    closingCommentUrl = data.html_url ?? null;
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "closeRFC",
      subfunction: "createComment",
      owner: input.owner,
      repo: input.repo,
      prNumber: input.prNumber,
    });
  }
  await octokit.rest.pulls.update({
    owner: input.owner,
    repo: input.repo,
    pull_number: input.prNumber,
    state: "closed",
  });
  return { closingCommentUrl };
}

/**
 * Reopen a closed PR after first posting `reason` as a comment explaining
 * why. Mirrors closeRFC. Merged PRs cannot be reopened — that surfaces as
 * GitHub's own error, with a friendlier hint here.
 */
export async function reopenRFC(input: {
  accessToken: string;
  owner: string;
  repo: string;
  prNumber: number;
  reason: string;
}): Promise<{ reopeningCommentUrl: string | null }> {
  const octokit = new Octokit({ auth: input.accessToken });
  const body = withFooter(`**Reopening this RFC.** ${input.reason.trim()}`);
  let reopeningCommentUrl: string | null = null;
  try {
    const { data } = await octokit.rest.issues.createComment({
      owner: input.owner,
      repo: input.repo,
      issue_number: input.prNumber,
      body,
    });
    reopeningCommentUrl = data.html_url ?? null;
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "reopenRFC",
      subfunction: "createComment",
      owner: input.owner,
      repo: input.repo,
      prNumber: input.prNumber,
    });
  }
  try {
    await octokit.rest.pulls.update({
      owner: input.owner,
      repo: input.repo,
      pull_number: input.prNumber,
      state: "open",
    });
  } catch (error) {
    const e = error as { status?: number; message?: string };
    if (e.status === 422) {
      throw new Error(
        `Cannot reopen ${input.owner}/${input.repo}#${input.prNumber}: ` +
          "this PR was merged, not closed. Open a new RFC that supersedes it.",
      );
    }
    throw error;
  }
  return { reopeningCommentUrl };
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

  if (addedUsers.length > 0 || addedTeams.length > 0 || wantUsers.length > 0 || wantTeams.length > 0) {
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
  /** GitHub login (users) or `org/slug` (teams) — what to pass to request_reviewers. */
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
 * Search for *reviewers* — people and teams — within the orgs that host RFC
 * repos visible to the user. Replaces the previous global-GitHub user search
 * (10-result cap on the global namespace was near-useless for common names).
 *
 * Results pool across orgs and are capped at `limit` (default 20). Users from
 * the search API include their display name; teams come from `orgs/{org}/teams`
 * filtered locally on slug and name.
 */
export async function searchReviewers(input: {
  accessToken: string;
  query: string;
  limit?: number;
}): Promise<ReviewerSearchResult[]> {
  const { accessToken, query } = input;
  const trimmed = query.trim();
  if (!trimmed) return [];
  const limit = Math.min(input.limit ?? 20, 50);
  const octokit = new Octokit({ auth: accessToken });

  const repos = await listReposWithRFCs(accessToken);
  // Unique orgs from RFC repos. Personal-account owners are also acceptable
  // (their "org" search just returns themselves) but rarely useful.
  const orgs = Array.from(new Set(repos.map((r) => r.owner)));
  if (orgs.length === 0) return [];

  const queryLower = trimmed.toLowerCase();
  const results: ReviewerSearchResult[] = [];

  await Promise.all(
    orgs.map(async (org) => {
      // Users via org-scoped search.
      try {
        const { data } = await octokit.rest.search.users({
          q: `${trimmed} org:${org}`,
          per_page: 10,
        });
        for (const u of data.items) {
          let name: string | null = null;
          try {
            const { data: profile } = await octokit.rest.users.getByUsername({
              username: u.login,
            });
            name = profile.name ?? null;
          } catch {
            // Profile fetch is best-effort.
          }
          results.push({
            kind: "user",
            handle: u.login,
            name,
            avatarUrl: u.avatar_url,
            org,
          });
        }
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
      } catch (error) {
        // Token may lack `read:org` for this org — skip silently.
      }
    }),
  );

  // De-duplicate by handle (rare for users — but a team and a user could
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
 * GitHub's search API for the heavy lifting: `is:pr extension:md "<query>"` for
 * file-content matches and `is:pr in:title,body "<query>"` for metadata. No
 * LLM, no embeddings.
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
    // before classifying — otherwise `"design doc"` would never match a title
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
