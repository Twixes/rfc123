import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createRFC,
  getCurrentUser,
  getRFCDetail,
  groupIntoThreads,
  listAllRFCs,
  listReposWithRFCs,
  listRFCs,
  listUserTeams,
  postComment,
} from "./github";
import {
  closeRFC,
  fetchAllRfcComments,
  listReviewThreads,
  mergeRFC,
  registerDecision as registerDecisionCommit,
  reopenRFC,
  requestReviewers,
  resolveReviewThread,
  resolveRfcRef,
  searchReviewers,
  searchRFCs,
  submitReview,
  updateRfcBody,
  withFooter,
} from "./mcp-github";
import { issuerUrl } from "./mcp-oauth";

/** Auth context attached by withMcpAuth → verifyToken (see mcp/route.ts). */
export interface AuthExtra {
  userId: string;
  githubUserId: number;
  githubLogin: string;
  githubAccessToken: string;
}

function getAuth(extra: unknown): AuthExtra {
  const e = extra as { authInfo?: { extra?: AuthExtra } };
  if (!e.authInfo?.extra?.githubAccessToken) {
    throw new Error("Missing auth context");
  }
  return e.authInfo.extra;
}

const textResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

const jsonResult = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  structuredContent: data as Record<string, unknown>,
});

/**
 * Resolve a per-RFC tool's input to `{auth, owner, repo, number}`. If the
 * caller omitted owner/repo we look the PR up across every RFC repo the
 * user can access — so agents (and humans) can refer to an RFC by number
 * alone in single-repo orgs and most multi-repo orgs.
 */
async function resolveCtx(
  extra: unknown,
  args: { owner?: string; repo?: string; number: number },
) {
  const auth = getAuth(extra);
  const ref = await resolveRfcRef(auth.githubAccessToken, args);
  return { auth, ...ref };
}

/**
 * Viewer-involvement signals attached to every RFC we surface. Agents lean
 * on these to figure out *what to care about*: the user's own RFCs and the
 * ones they're being asked to review come first; everything else is context.
 */
interface ViewerRfcInvolvement {
  /** The current user opened this PR. */
  authoredByMe: boolean;
  /** Direct reviewer request on the current user. */
  reviewRequestedFromMe: boolean;
  /** Teams the current user is on that have a pending review request. */
  reviewRequestedFromMyTeams: string[];
  /** True if any of the above are true. */
  isMine: boolean;
}

function rfcInvolvement(
  rfc: {
    author: string;
    reviewRequested: boolean;
    requestedTeamSlugs: string[];
  },
  meLogin: string,
  userTeams: ReadonlySet<string>,
): ViewerRfcInvolvement {
  const authoredByMe = rfc.author === meLogin;
  const reviewRequestedFromMe = rfc.reviewRequested;
  const reviewRequestedFromMyTeams = rfc.requestedTeamSlugs.filter((slug) =>
    userTeams.has(slug),
  );
  return {
    authoredByMe,
    reviewRequestedFromMe,
    reviewRequestedFromMyTeams,
    isMine:
      authoredByMe ||
      reviewRequestedFromMe ||
      reviewRequestedFromMyTeams.length > 0,
  };
}

/**
 * Sort with the user's own involvement first, then by created date desc.
 * The list-tools order influences whether the agent treats a particular RFC
 * as foreground or background context.
 */
function sortByInvolvement<
  T extends { viewerInvolvement: ViewerRfcInvolvement; createdAt: string },
>(rfcs: T[]): T[] {
  return [...rfcs].sort((a, b) => {
    if (a.viewerInvolvement.isMine !== b.viewerInvolvement.isMine) {
      return a.viewerInvolvement.isMine ? -1 : 1;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

interface ViewerThreadInvolvement {
  startedByMe: boolean;
  iReplied: boolean;
  mentionsMe: boolean;
  /** Heuristic: I'm in the thread (started/replied/mentioned) and the last
   *  comment isn't mine. Agents should treat these as needing my attention. */
  awaitingMyReply: boolean;
  isMine: boolean;
}

function threadInvolvement(
  thread: {
    comments: Array<{ author: string | null; body: string }>;
  },
  meLogin: string,
): ViewerThreadInvolvement {
  if (thread.comments.length === 0) {
    return {
      startedByMe: false,
      iReplied: false,
      mentionsMe: false,
      awaitingMyReply: false,
      isMine: false,
    };
  }
  const meMention = new RegExp(`@${meLogin}\\b`, "i");
  const startedByMe = thread.comments[0].author === meLogin;
  const iReplied = thread.comments.some((c) => c.author === meLogin);
  const mentionsMe = thread.comments.some((c) => meMention.test(c.body));
  const lastAuthor = thread.comments[thread.comments.length - 1].author;
  const involved = startedByMe || iReplied || mentionsMe;
  return {
    startedByMe,
    iReplied,
    mentionsMe,
    awaitingMyReply: involved && lastAuthor !== meLogin,
    isMine: involved,
  };
}

/**
 * Register every tool, resource, and prompt on the MCP server. All behavior
 * is deterministic – no LLM calls, no embedding lookups. Multi-step
 * reasoning is delegated to the agent-side skills (`skills/`).
 */
export function registerMcpCapabilities(server: McpServer) {
  // Note: `rfc123_whoami` was removed — every other tool's response already
  // carries `viewerInvolvement` / `viewer.login`. Callers that need an
  // explicit identity check can read the `rfc123://me` resource.

  server.registerTool(
    "rfc123_list_repos_with_rfcs",
    {
      title: "List repos with RFCs",
      description:
        "List every repository the user can access that holds RFC markdown files.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const auth = getAuth(extra);
      const repos = await listReposWithRFCs(auth.githubAccessToken);
      return jsonResult({ repos });
    },
  );

  server.registerTool(
    "rfc123_list_rfcs",
    {
      title: "List RFCs",
      description:
        "List RFCs across a specific repo (or all accessible repos when " +
        "omitted). Each result carries a `viewerInvolvement` field showing " +
        "whether the current user authored the RFC, is a requested reviewer, " +
        "or is on a requested team. Results are sorted so the user's own " +
        "involvement comes first — agents should prioritize those.",
      inputSchema: {
        owner: z.string().optional(),
        repo: z.string().optional(),
        status: z.enum(["open", "merged", "closed"]).optional(),
        includeDrafts: z.boolean().optional(),
        onlyMine: z
          .boolean()
          .optional()
          .describe(
            "Keep only RFCs the current user is involved in (authored or " +
              "requested as reviewer, directly or via team).",
          ),
        author: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args, extra) => {
      const auth = getAuth(extra);
      const [me, userTeams] = await Promise.all([
        getCurrentUser(auth.githubAccessToken),
        listUserTeams(auth.githubAccessToken),
      ]);
      const teamSet = new Set(userTeams);
      const rfcs =
        args.owner && args.repo
          ? await listRFCs(
              auth.githubAccessToken,
              args.owner,
              args.repo,
              me.login,
            )
          : await listAllRFCs(auth.githubAccessToken, me.login);
      const decorated = rfcs.map((r) => ({
        ...r,
        viewerInvolvement: rfcInvolvement(r, me.login, teamSet),
      }));
      const filtered = decorated.filter((r) => {
        if (args.status && r.status !== args.status) return false;
        if (args.includeDrafts === false && r.isDraft) return false;
        if (args.onlyMine && !r.viewerInvolvement.isMine) return false;
        if (args.author && r.author !== args.author) return false;
        return true;
      });
      const sorted = sortByInvolvement(filtered);
      const sliced = args.limit ? sorted.slice(0, args.limit) : sorted;
      const mineCount = sliced.filter((r) => r.viewerInvolvement.isMine).length;
      return jsonResult({
        count: sliced.length,
        countInvolvingMe: mineCount,
        viewer: { login: me.login, teams: userTeams },
        rfcs: sliced,
      });
    },
  );

  server.registerTool(
    "rfc123_get_rfc",
    {
      title: "Get RFC",
      description:
        "Fetch the markdown body, reviewers (with per-reviewer state), " +
        "status, merge-readiness, parsed decision blocks, and metadata for " +
        "a single RFC. Returns `markdownContentNumbered` — a line-numbered " +
        "view of the body — so agents can target inline comments accurately. " +
        "Comments are returned separately by rfc123_get_rfc_comments.",
      inputSchema: {
        owner: z
          .string()
          .optional()
          .describe(
            "Repository owner. Omit to auto-resolve across your RFC repos.",
          ),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Omit to auto-resolve."),
        number: z.coerce.number().int().positive(),
      },
    },
    async (args, extra) => {
      const { auth, owner, repo, number } = await resolveCtx(extra, args);
      const [me, userTeams] = await Promise.all([
        getCurrentUser(auth.githubAccessToken),
        listUserTeams(auth.githubAccessToken),
      ]);
      const teamSet = new Set(userTeams);
      const detail = await getRFCDetail(
        auth.githubAccessToken,
        owner,
        repo,
        number,
        me.login,
      );
      const { comments: _, ...rest } = detail;
      const numbered = detail.markdownContent
        .split("\n")
        .map((line, i) => `${String(i + 1).padStart(4, " ")}  ${line}`)
        .join("\n");
      return jsonResult({
        ...rest,
        markdownContentNumbered: numbered,
        viewer: { login: me.login, teams: userTeams },
        viewerInvolvement: rfcInvolvement(rest, me.login, teamSet),
      });
    },
  );

  server.registerTool(
    "rfc123_get_rfc_comments",
    {
      title: "Get RFC comments",
      description:
        "Return every comment on an RFC – general (issue) and inline " +
        "(review) – plus a grouped thread structure. Each comment is " +
        "decorated with `viewerInvolvement.{byMe, mentionsMe}` so the agent " +
        "can foreground the user's own comments and direct mentions.",
      inputSchema: {
        owner: z
          .string()
          .optional()
          .describe(
            "Repository owner. Omit to auto-resolve across your RFC repos.",
          ),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Omit to auto-resolve."),
        number: z.coerce.number().int().positive(),
      },
    },
    async (args, extra) => {
      const { auth, owner, repo, number } = await resolveCtx(extra, args);
      const me = await getCurrentUser(auth.githubAccessToken);
      const { flat } = await fetchAllRfcComments(
        auth.githubAccessToken,
        owner,
        repo,
        number,
      );
      const meMention = new RegExp(`@${me.login}\\b`, "i");
      const decorated = flat.map((c) => ({
        ...c,
        viewerInvolvement: {
          byMe: c.user === me.login,
          mentionsMe: meMention.test(c.body),
        },
      }));
      return jsonResult({
        count: decorated.length,
        countByMe: decorated.filter((c) => c.viewerInvolvement.byMe).length,
        countMentioningMe: decorated.filter(
          (c) => c.viewerInvolvement.mentionsMe,
        ).length,
        viewer: { login: me.login },
        comments: decorated,
        threads: groupIntoThreads(flat),
      });
    },
  );

  server.registerTool(
    "rfc123_list_review_threads",
    {
      title: "List review threads",
      description:
        "List the PR's review threads with resolution state (resolved / " +
        "unresolved, outdated) AND per-thread viewer involvement: " +
        "startedByMe, iReplied, mentionsMe, awaitingMyReply. Threads " +
        "awaiting the user's reply come first; threads the user is in come " +
        "before threads they aren't.",
      inputSchema: {
        owner: z
          .string()
          .optional()
          .describe(
            "Repository owner. Omit to auto-resolve across your RFC repos.",
          ),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Omit to auto-resolve."),
        number: z.coerce.number().int().positive(),
        includeResolved: z.boolean().optional(),
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Threads per page (default 50, max 100)."),
        after: z
          .string()
          .optional()
          .describe(
            "Cursor from the previous response's `pageInfo.endCursor`. " +
              "Omit to fetch the first page.",
          ),
      },
    },
    async (args, extra) => {
      const { auth, owner, repo, number } = await resolveCtx(extra, args);
      const me = await getCurrentUser(auth.githubAccessToken);
      const { threads, pageInfo } = await listReviewThreads(
        auth.githubAccessToken,
        owner,
        repo,
        number,
        { pageSize: args.pageSize, after: args.after },
      );
      const decorated = threads.map((t) => ({
        ...t,
        viewerInvolvement: threadInvolvement(t, me.login),
      }));
      const filtered = args.includeResolved
        ? decorated
        : decorated.filter((t) => !t.isResolved);
      // Surface threads needing the user's response first, then their own
      // threads, then everything else.
      const sorted = [...filtered].sort((a, b) => {
        if (
          a.viewerInvolvement.awaitingMyReply !==
          b.viewerInvolvement.awaitingMyReply
        )
          return a.viewerInvolvement.awaitingMyReply ? -1 : 1;
        if (a.viewerInvolvement.isMine !== b.viewerInvolvement.isMine)
          return a.viewerInvolvement.isMine ? -1 : 1;
        return 0;
      });
      return jsonResult({
        count: sorted.length,
        countInvolvingMe: sorted.filter((t) => t.viewerInvolvement.isMine)
          .length,
        countAwaitingMyReply: sorted.filter(
          (t) => t.viewerInvolvement.awaitingMyReply,
        ).length,
        viewer: { login: me.login },
        threads: sorted,
        pageInfo,
      });
    },
  );

  server.registerTool(
    "rfc123_search_rfcs",
    {
      title: "Search RFCs",
      description:
        "Deterministic text search across RFC pull requests the user can " +
        "access (GitHub Search API; matches title and body). Use this to " +
        "find prior art before drafting a new RFC.",
      inputSchema: {
        query: z.string().min(1),
        ownerFilter: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async (args, extra) => {
      const auth = getAuth(extra);
      const results = await searchRFCs({
        accessToken: auth.githubAccessToken,
        query: args.query,
        limit: args.limit,
        ownerFilter: args.ownerFilter,
      });
      return jsonResult({ count: results.length, results });
    },
  );

  server.registerTool(
    "rfc123_search_reviewers",
    {
      title: "Search reviewers (users + teams)",
      description:
        "Search for reviewers — users *and* teams — within the orgs that " +
        "host RFC repos visible to you. Returns `{kind, handle, name, " +
        "avatarUrl, org}` per result, deduplicated and capped (default 20). " +
        "Use the `handle` directly in rfc123_request_reviewers.users / " +
        ".teams (teams come back as `org/slug`).",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("Login fragment, name fragment, or team slug fragment."),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async (args, extra) => {
      const auth = getAuth(extra);
      const results = await searchReviewers({
        accessToken: auth.githubAccessToken,
        query: args.query,
        limit: args.limit,
      });
      return jsonResult({ count: results.length, results });
    },
  );

  // The skills catalog is exposed as an MCP resource (rfc123://skills/catalog),
  // not a tool — it's static reference data, not an action. Agents read it
  // via ReadMcpResourceTool when the user asks about installing skills.

  // Body-bearing write tools below all append the via-Claude footer via withFooter.

  server.registerTool(
    "rfc123_post_general_comment",
    {
      title: "Post general comment",
      description:
        "Post a top-level discussion comment on an RFC. Use this for " +
        "stateless conversation: status updates, synthesis roll-ups, " +
        "informal nudges. **Do not use this when carrying a formal review " +
        "verdict** — call rfc123_submit_review with state=COMMENT/APPROVE/" +
        "REQUEST_CHANGES instead. To reply within an inline thread, use " +
        "rfc123_reply_to_comment.",
      inputSchema: {
        owner: z
          .string()
          .optional()
          .describe(
            "Repository owner. Omit to auto-resolve across your RFC repos.",
          ),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Omit to auto-resolve."),
        number: z.coerce.number().int().positive(),
        body: z.string().min(1),
      },
    },
    async (args, extra) => {
      const { auth, owner, repo, number } = await resolveCtx(extra, args);
      await postComment(
        auth.githubAccessToken,
        owner,
        repo,
        number,
        withFooter(args.body),
      );
      return textResult(
        `Posted general comment on ${owner}/${repo}#${number}.`,
      );
    },
  );

  server.registerTool(
    "rfc123_post_inline_comment",
    {
      title: "Post inline comment",
      description:
        "Add a single inline review comment on a line (or range) of a file " +
        "in the RFC's pull request. Prefer rfc123_submit_review with a " +
        "`comments` array when posting ≥2 inline notes or carrying an " +
        "APPROVE / REQUEST_CHANGES verdict — that batches them into one " +
        "review event instead of N notifications. `line` is the line number " +
        "in the PR's head file (the version under review). Pass `startLine` " +
        "for a multi-line range comment.",
      inputSchema: {
        owner: z
          .string()
          .optional()
          .describe(
            "Repository owner. Omit to auto-resolve across your RFC repos.",
          ),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Omit to auto-resolve."),
        number: z.coerce.number().int().positive(),
        path: z.string(),
        line: z.coerce
          .number()
          .int()
          .positive()
          .describe(
            "End line in the PR head file (RIGHT side by default). For a " +
              "single-line comment, this is the line itself.",
          ),
        body: z.string().min(1),
        startLine: z.coerce
          .number()
          .int()
          .positive()
          .optional()
          .describe("Start line for a multi-line range comment."),
        side: z
          .enum(["LEFT", "RIGHT"])
          .optional()
          .describe("Diff side for `line`. Defaults to RIGHT (head version)."),
        startSide: z
          .enum(["LEFT", "RIGHT"])
          .optional()
          .describe("Diff side for `startLine`. Defaults to RIGHT."),
      },
    },
    async (args, extra) => {
      const { auth, owner, repo, number } = await resolveCtx(extra, args);
      await postComment(
        auth.githubAccessToken,
        owner,
        repo,
        number,
        withFooter(args.body),
        args.path,
        args.line,
        undefined,
        {
          startLine: args.startLine,
          side: args.side,
          startSide: args.startSide,
        },
      );
      const range = args.startLine
        ? `${args.path}:${args.startLine}-${args.line}`
        : `${args.path}:${args.line}`;
      return textResult(`Posted inline comment on ${range}.`);
    },
  );

  server.registerTool(
    "rfc123_reply_to_comment",
    {
      title: "Reply to review comment",
      description:
        "Post a reply within an existing inline review-comment thread. " +
        "Pass `andResolve: true` to mark the thread resolved in the same " +
        "call — the 90% pattern after a satisfying reply. The resolve step " +
        "is best-effort; failure is reported in the response but does not " +
        "fail the reply.",
      inputSchema: {
        owner: z
          .string()
          .optional()
          .describe(
            "Repository owner. Omit to auto-resolve across your RFC repos.",
          ),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Omit to auto-resolve."),
        number: z.coerce.number().int().positive(),
        replyToCommentId: z.coerce.number().int().positive(),
        body: z.string().min(1),
        andResolve: z
          .boolean()
          .optional()
          .describe(
            "If true, mark the surrounding thread resolved after replying.",
          ),
      },
    },
    async (args, extra) => {
      const { auth, owner, repo, number } = await resolveCtx(extra, args);
      await postComment(
        auth.githubAccessToken,
        owner,
        repo,
        number,
        withFooter(args.body),
        undefined,
        undefined,
        args.replyToCommentId,
      );
      let resolvedThreadId: string | null = null;
      let resolveError: string | null = null;
      if (args.andResolve) {
        try {
          const { threads } = await listReviewThreads(
            auth.githubAccessToken,
            owner,
            repo,
            number,
          );
          const containing = threads.find((t) =>
            t.comments.some((c) => c.databaseId === args.replyToCommentId),
          );
          if (!containing) {
            resolveError = `No thread contains comment ${args.replyToCommentId}.`;
          } else if (containing.isResolved) {
            resolvedThreadId = containing.id;
          } else {
            await resolveReviewThread(auth.githubAccessToken, containing.id);
            resolvedThreadId = containing.id;
          }
        } catch (error) {
          resolveError = (error as Error).message;
        }
      }
      return jsonResult({
        replied: true,
        rfc: `${owner}/${repo}#${number}`,
        replyToCommentId: args.replyToCommentId,
        resolvedThreadId,
        resolveError,
      });
    },
  );

  server.registerTool(
    "rfc123_submit_review",
    {
      title: "Submit PR review",
      description:
        "Submit a formal PR review carrying state APPROVE, REQUEST_CHANGES, " +
        "or COMMENT, optionally bundling one or more inline comments into a " +
        "single review event. Prefer this over rfc123_post_inline_comment " +
        "when (a) you're carrying a verdict, or (b) you're dropping ≥2 " +
        "inline notes — bundling them produces one PR notification instead " +
        "of N. REQUEST_CHANGES blocks merge org-wide; pass " +
        "`confirmBlocksMerge: true` to acknowledge.",
      inputSchema: {
        owner: z
          .string()
          .optional()
          .describe(
            "Repository owner. Omit to auto-resolve across your RFC repos.",
          ),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Omit to auto-resolve."),
        number: z.coerce.number().int().positive(),
        state: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]),
        body: z.string().optional(),
        comments: z
          .array(
            z.object({
              path: z.string(),
              line: z.coerce.number().int().positive(),
              body: z.string().min(1),
              startLine: z.coerce.number().int().positive().optional(),
              side: z.enum(["LEFT", "RIGHT"]).optional(),
              startSide: z.enum(["LEFT", "RIGHT"]).optional(),
            }),
          )
          .optional(),
        confirmBlocksMerge: z
          .boolean()
          .optional()
          .describe(
            "Required `true` when state=REQUEST_CHANGES — acknowledges that " +
              "the review blocks merge org-wide until dismissed or rescinded.",
          ),
      },
    },
    async (args, extra) => {
      if (args.state === "REQUEST_CHANGES" && !args.confirmBlocksMerge) {
        throw new Error(
          "submit_review with state=REQUEST_CHANGES blocks merging until the " +
            "review is dismissed or the reviewer rescinds it. Pass " +
            "`confirmBlocksMerge: true` to acknowledge.",
        );
      }
      const { auth, owner, repo, number } = await resolveCtx(extra, args);
      const result = await submitReview({
        accessToken: auth.githubAccessToken,
        owner,
        repo,
        prNumber: number,
        state: args.state,
        body: args.body,
        comments: args.comments,
      });
      return jsonResult({
        state: args.state,
        reviewId: result.reviewId,
        url: result.htmlUrl,
      });
    },
  );

  server.registerTool(
    "rfc123_request_reviewers",
    {
      title: "Request / remove reviewers",
      description:
        "Add and/or remove reviewers (users or teams) on an RFC in one " +
        "call. Use rfc123_search_reviewers first to resolve handles. " +
        "Passing a user who previously reviewed and is no longer pending " +
        "re-requests them. Returns a structured echo of what was added, " +
        "what was already requested, what was removed, and the final " +
        "pending list — no follow-up read required.",
      inputSchema: {
        owner: z
          .string()
          .optional()
          .describe(
            "Repository owner. Omit to auto-resolve across your RFC repos.",
          ),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Omit to auto-resolve."),
        number: z.coerce.number().int().positive(),
        users: z
          .array(z.string())
          .optional()
          .describe("Logins to request (or re-request). Skipped if empty."),
        teams: z
          .array(z.string())
          .optional()
          .describe("Team slugs (`org/slug` or plain slug) to request."),
        removeUsers: z
          .array(z.string())
          .optional()
          .describe("Logins to remove from the pending request list."),
        removeTeams: z
          .array(z.string())
          .optional()
          .describe("Team slugs to remove from the pending request list."),
      },
    },
    async (args, extra) => {
      const { auth, owner, repo, number } = await resolveCtx(extra, args);
      const result = await requestReviewers({
        accessToken: auth.githubAccessToken,
        owner,
        repo,
        prNumber: number,
        users: args.users,
        teams: args.teams,
        removeUsers: args.removeUsers,
        removeTeams: args.removeTeams,
      });
      return jsonResult({ rfc: `${owner}/${repo}#${number}`, ...result });
    },
  );

  server.registerTool(
    "rfc123_create_rfc",
    {
      title: "Create RFC",
      description:
        "Create a new RFC in a specific repository: branches off the default " +
        "branch, commits the markdown body, opens a pull request, and " +
        "requests the specified reviewers. The agent must pick the target " +
        "repo first — call rfc123_list_repos_with_rfcs if uncertain. " +
        "Defaults: `draft: true` (so reviewers aren't notified until the " +
        "author un-drafts on GitHub); `directory` auto-detected from the " +
        "repo's layout (`requests-for-comments/` / `RFCs/` / `rfcs/` / " +
        "`docs/rfcs/`, falling back to `requests-for-comments`); branch " +
        "name `rfc/<username>/<slug>`, with a `-<random>` suffix on collision.",
      inputSchema: {
        owner: z.string().describe("Repository owner the RFC will live in."),
        repo: z.string().describe("Repository name the RFC will live in."),
        title: z.string().min(1),
        rfcBody: z.string().min(1),
        prBody: z.string().optional(),
        reviewers: z.array(z.string()).optional(),
        draft: z
          .boolean()
          .optional()
          .describe(
            "Open as draft PR. Defaults to true — pass false only after the " +
              "author has reviewed the rendered RFC.",
          ),
        directory: z
          .string()
          .optional()
          .describe(
            "RFC directory, e.g. `requests-for-comments`. Auto-detected when omitted.",
          ),
        branchName: z
          .string()
          .optional()
          .describe(
            "Override the branch name. Auto-generated when omitted.",
          ),
      },
    },
    async (args, extra) => {
      const auth = getAuth(extra);
      const me = await getCurrentUser(auth.githubAccessToken);
      const { slugify } = await import("./slugify");
      const slug = slugify(args.title);
      const result = await createRFC({
        accessToken: auth.githubAccessToken,
        owner: args.owner,
        repo: args.repo,
        title: args.title,
        rfcBody: withFooter(args.rfcBody),
        prBody:
          args.prBody !== undefined ? withFooter(args.prBody) : args.title,
        slug,
        username: me.login,
        reviewers: args.reviewers ?? [],
        draft: args.draft ?? true,
        directory: args.directory,
        branchName: args.branchName,
      });
      return jsonResult(result);
    },
  );

  server.registerTool(
    "rfc123_update_rfc_body",
    {
      title: "Update RFC body",
      description:
        "Replace the markdown body of an RFC by committing a new version to " +
        "the PR head branch (footer appended automatically). Requires " +
        "`changeDescription` — a one-line summary of what changed, used as " +
        "the commit message so the PR timeline reads meaningfully. " +
        "Concurrent edits are handled with optimistic SHA-locking + one " +
        "transparent retry; a second conflict surfaces as a clear error. " +
        "The response includes line-count deltas so callers can confirm " +
        "the edit without re-reading.",
      inputSchema: {
        owner: z
          .string()
          .optional()
          .describe(
            "Repository owner. Omit to auto-resolve across your RFC repos.",
          ),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Omit to auto-resolve."),
        number: z.coerce.number().int().positive(),
        newContent: z.string().min(1),
        changeDescription: z
          .string()
          .min(1)
          .describe(
            "One-line summary of the change, e.g. " +
              "'Tighten security section; address @alice feedback'. " +
              "Used as the commit message.",
          ),
      },
    },
    async (args, extra) => {
      const { auth, owner, repo, number } = await resolveCtx(extra, args);
      const result = await updateRfcBody({
        accessToken: auth.githubAccessToken,
        owner,
        repo,
        prNumber: number,
        newContent: args.newContent,
        changeDescription: args.changeDescription,
      });
      return jsonResult(result);
    },
  );

  server.registerTool(
    "rfc123_register_decision",
    {
      title: "Register decision",
      description:
        "Append a dated `### Decision (YYYY-MM-DD by @login)` block to the " +
        "RFC body, commit it to the PR branch, and apply the " +
        "`decision-registered` label so `hasDecision` shows up in list views. " +
        "Rationale is required — a decision without rationale is the exact " +
        "anti-pattern this tool prevents. Pass `resolvesThreadIds` to " +
        "auto-resolve the inline threads this decision settles.",
      inputSchema: {
        owner: z
          .string()
          .optional()
          .describe(
            "Repository owner. Omit to auto-resolve across your RFC repos.",
          ),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Omit to auto-resolve."),
        number: z.coerce.number().int().positive(),
        decision: z
          .string()
          .min(1)
          .describe("One-sentence statement of what was decided."),
        rationale: z
          .string()
          .min(1)
          .describe(
            "Why this decision — the constraints, tradeoffs, or context that " +
              "led here. Required.",
          ),
        resolvesThreadIds: z
          .array(z.string().min(1))
          .optional()
          .describe(
            "Optional review-thread IDs (from rfc123_list_review_threads) " +
              "that this decision resolves. They will be marked resolved.",
          ),
      },
    },
    async (args, extra) => {
      const { auth, owner, repo, number } = await resolveCtx(extra, args);
      const me = await getCurrentUser(auth.githubAccessToken);
      const result = await registerDecisionCommit({
        accessToken: auth.githubAccessToken,
        owner,
        repo,
        prNumber: number,
        decision: args.decision,
        rationale: args.rationale,
        decidedBy: me.login,
        resolvesThreadIds: args.resolvesThreadIds,
      });
      return jsonResult(result);
    },
  );

  server.registerTool(
    "rfc123_resolve_review_thread",
    {
      title: "Resolve review thread(s)",
      description:
        "Mark one or more review-comment threads as resolved. Pass " +
        "`threadIds` for explicit resolution, or pass `filter` + `number` to " +
        "bulk-resolve every matching unresolved thread on a single RFC. " +
        "Filters: `outdated` (lines no longer present in the diff) or " +
        "`startedByMe` (threads the current user opened — useful for an " +
        "author closing out their own questions). Use `rfc123_reply_to_comment` " +
        "with `andResolve: true` for the common reply-then-resolve pattern.",
      inputSchema: {
        threadIds: z
          .array(z.string().min(1))
          .optional()
          .describe("Explicit thread node IDs to resolve."),
        filter: z
          .enum(["outdated", "startedByMe", "all"])
          .optional()
          .describe(
            "Resolve every unresolved thread on the PR matching this filter. " +
              "Requires `number`.",
          ),
        owner: z
          .string()
          .optional()
          .describe(
            "Repository owner. Required (with `repo`+`number`) when using `filter`.",
          ),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Required when using `filter`."),
        number: z
          .coerce.number()
          .int()
          .positive()
          .optional()
          .describe("PR number. Required when using `filter`."),
      },
    },
    async (args, extra) => {
      const auth = getAuth(extra);
      let targetIds: string[] = args.threadIds ?? [];
      if (args.filter) {
        if (!args.number) {
          throw new Error("`filter` requires `number` (and optionally owner+repo).");
        }
        const ref = await resolveRfcRef(auth.githubAccessToken, {
          owner: args.owner,
          repo: args.repo,
          number: args.number,
        });
        const me = await getCurrentUser(auth.githubAccessToken);
        // Page through everything — bulk resolve needs the full set.
        let cursor: string | undefined;
        const allThreads: Awaited<
          ReturnType<typeof listReviewThreads>
        >["threads"] = [];
        do {
          const page = await listReviewThreads(
            auth.githubAccessToken,
            ref.owner,
            ref.repo,
            ref.number,
            { pageSize: 100, after: cursor },
          );
          allThreads.push(...page.threads);
          cursor = page.pageInfo.hasNextPage
            ? page.pageInfo.endCursor ?? undefined
            : undefined;
        } while (cursor);
        const matching = allThreads.filter((t) => {
          if (t.isResolved) return false;
          if (args.filter === "outdated") return t.isOutdated;
          if (args.filter === "startedByMe")
            return t.comments[0]?.author === me.login;
          return true; // "all"
        });
        targetIds.push(...matching.map((t) => t.id));
      }
      if (targetIds.length === 0) {
        throw new Error(
          "Nothing to resolve — pass `threadIds` or a `filter` that matched ≥1 thread.",
        );
      }
      const resolved: string[] = [];
      const failed: Array<{ threadId: string; error: string }> = [];
      for (const id of targetIds) {
        try {
          await resolveReviewThread(auth.githubAccessToken, id);
          resolved.push(id);
        } catch (error) {
          failed.push({ threadId: id, error: (error as Error).message });
        }
      }
      return jsonResult({ resolved, failed });
    },
  );

  server.registerTool(
    "rfc123_merge_rfc",
    {
      title: "Merge RFC",
      description:
        "Merge an RFC's pull request. Refuses by default unless: at least " +
        "one APPROVE review exists, zero review threads are unresolved, and " +
        "a `### Decision (...)` block is present in the RFC body. Pass " +
        "`force: true` to override (caller owns the consequences). " +
        "`mergeMethod` defaults to squash if the repo allows it, otherwise " +
        "the first method the repo permits.",
      inputSchema: {
        owner: z
          .string()
          .optional()
          .describe(
            "Repository owner. Omit to auto-resolve across your RFC repos.",
          ),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Omit to auto-resolve."),
        number: z.coerce.number().int().positive(),
        mergeMethod: z.enum(["merge", "squash", "rebase"]).optional(),
        commitTitle: z.string().optional(),
        commitMessage: z.string().optional(),
        force: z
          .boolean()
          .optional()
          .describe(
            "Bypass the approve / threads / decision preflight. Use sparingly.",
          ),
      },
    },
    async (args, extra) => {
      const { auth, owner, repo, number } = await resolveCtx(extra, args);
      const result = await mergeRFC({
        accessToken: auth.githubAccessToken,
        owner,
        repo,
        prNumber: number,
        mergeMethod: args.mergeMethod,
        commitTitle: args.commitTitle,
        commitMessage: args.commitMessage,
        force: args.force,
      });
      return jsonResult(result);
    },
  );

  server.registerTool(
    "rfc123_close_rfc",
    {
      title: "Close RFC",
      description:
        "Close an RFC's pull request without merging. Requires a `reason` " +
        "which is auto-posted as a wrap-up comment before the close event, " +
        "so future readers see *why* the proposal was abandoned.",
      inputSchema: {
        owner: z
          .string()
          .optional()
          .describe(
            "Repository owner. Omit to auto-resolve across your RFC repos.",
          ),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Omit to auto-resolve."),
        number: z.coerce.number().int().positive(),
        reason: z
          .string()
          .min(1)
          .describe(
            "Why this RFC is being closed. Auto-posted as a comment.",
          ),
      },
    },
    async (args, extra) => {
      const { auth, owner, repo, number } = await resolveCtx(extra, args);
      const result = await closeRFC({
        accessToken: auth.githubAccessToken,
        owner,
        repo,
        prNumber: number,
        reason: args.reason,
      });
      return jsonResult({
        closed: true,
        rfc: `${owner}/${repo}#${number}`,
        ...result,
      });
    },
  );

  server.registerTool(
    "rfc123_reopen_rfc",
    {
      title: "Reopen RFC",
      description:
        "Reopen a previously-closed RFC pull request. Requires a `reason` " +
        "which is auto-posted as a comment. Cannot reopen merged PRs — the " +
        "tool returns a clear error in that case.",
      inputSchema: {
        owner: z
          .string()
          .optional()
          .describe(
            "Repository owner. Omit to auto-resolve across your RFC repos.",
          ),
        repo: z
          .string()
          .optional()
          .describe("Repository name. Omit to auto-resolve."),
        number: z.coerce.number().int().positive(),
        reason: z
          .string()
          .min(1)
          .describe("Why this RFC is being reopened. Auto-posted as a comment."),
      },
    },
    async (args, extra) => {
      const { auth, owner, repo, number } = await resolveCtx(extra, args);
      const result = await reopenRFC({
        accessToken: auth.githubAccessToken,
        owner,
        repo,
        prNumber: number,
        reason: args.reason,
      });
      return jsonResult({
        reopened: true,
        rfc: `${owner}/${repo}#${number}`,
        ...result,
      });
    },
  );

  server.registerResource(
    "me",
    "rfc123://me",
    {
      title: "Current user",
      description: "GitHub identity of the user this MCP session is acting as.",
      mimeType: "application/json",
    },
    async (uri, extra) => {
      const auth = getAuth(extra);
      const me = await getCurrentUser(auth.githubAccessToken);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(me, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "skills-catalog",
    "rfc123://skills/catalog",
    {
      title: "RFC123 agent skills catalog",
      description:
        "List of agent-side skills (workflow recipes that compose RFC123 " +
        "tools) plus installation instructions. Static reference data — " +
        "read this once when the user asks about skills.",
      mimeType: "application/json",
    },
    async (uri) => {
      const iss = issuerUrl();
      const skills = [
        {
          name: "draft-rfc",
          summary: "Turn a 1-paragraph brief into a structured RFC draft.",
        },
        {
          name: "synthesize-discussion",
          summary:
            "Cluster comments by theme and post a roll-up to the discussion.",
        },
        {
          name: "propose-revision",
          summary:
            "Read the RFC and discussion, then propose a revised body diff.",
        },
        {
          name: "compare-alternatives",
          summary:
            "Build an Option-A-vs-B comparison table from the RFC's claims.",
        },
        {
          name: "extract-action-items",
          summary:
            "Walk every comment and surface explicit '@x will do Y' items.",
        },
        {
          name: "suggest-reviewers",
          summary:
            "Recommend reviewers from PR file paths, prior commenters, and team mapping.",
        },
        {
          name: "register-decision",
          summary:
            "Coach the user through writing a decision + rationale, then commit it.",
        },
        {
          name: "resolve-threads",
          summary:
            "Walk every unresolved thread, propose a reply, mark resolved.",
        },
        {
          name: "discuss-rfc",
          summary:
            "Ground a conversation about a specific RFC in the proposal " +
              "and (when the host is a coding agent) the surrounding repo.",
        },
      ];
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                plugin: {
                  name: "rfc123-skills",
                  install: "/plugin install rfc123-skills",
                  rawUrl: `${iss}/skills`,
                },
                skills,
                usage:
                  "In Claude Code, install with /plugin marketplace add and /plugin install. " +
                  "Or clone the SKILL.md files from " +
                  `${iss}/skills/<name>/SKILL.md into ~/.claude/skills/.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerResource(
    "rfc",
    new ResourceTemplate("rfc123://rfcs/{owner}/{repo}/{number}", {
      list: undefined,
    }),
    {
      title: "RFC body",
      description:
        "Full markdown body + metadata of a specific RFC. Attach to a chat " +
        "to give the agent direct context.",
      mimeType: "text/markdown",
    },
    async (uri, variables, extra) => {
      const auth = getAuth(extra);
      const me = await getCurrentUser(auth.githubAccessToken);
      const owner = String(variables.owner);
      const repo = String(variables.repo);
      const number = Number.parseInt(String(variables.number), 10);
      const detail = await getRFCDetail(
        auth.githubAccessToken,
        owner,
        repo,
        number,
        me.login,
      );
      const header =
        `# ${detail.title}\n` +
        `\n*RFC ${owner}/${repo}#${number} — ${detail.status}` +
        (detail.isDraft ? " (draft)" : "") +
        `, by @${detail.author}*\n\n---\n\n`;
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: header + detail.markdownContent,
          },
        ],
      };
    },
  );

  server.registerResource(
    "rfc-comments",
    new ResourceTemplate("rfc123://rfcs/{owner}/{repo}/{number}/comments", {
      list: undefined,
    }),
    {
      title: "RFC comments",
      description: "Every comment (general + inline) on an RFC, as JSON.",
      mimeType: "application/json",
    },
    async (uri, variables, extra) => {
      const { raw } = await fetchAllRfcComments(
        getAuth(extra).githubAccessToken,
        String(variables.owner),
        String(variables.repo),
        Number.parseInt(String(variables.number), 10),
      );
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(raw, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "rfc-threads",
    new ResourceTemplate("rfc123://rfcs/{owner}/{repo}/{number}/threads", {
      list: undefined,
    }),
    {
      title: "RFC review threads",
      description:
        "Review threads on an RFC with their resolved/unresolved state.",
      mimeType: "application/json",
    },
    async (uri, variables, extra) => {
      const auth = getAuth(extra);
      const owner = String(variables.owner);
      const repo = String(variables.repo);
      const number = Number.parseInt(String(variables.number), 10);
      const { threads, pageInfo } = await listReviewThreads(
        auth.githubAccessToken,
        owner,
        repo,
        number,
      );
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              { count: threads.length, threads, pageInfo },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  const rfcRefArgs = {
    number: z
      .string()
      .describe("RFC pull-request number")
      .regex(/^\d+$/, "Must be a positive integer"),
    owner: z
      .string()
      .optional()
      .describe("Optional: repository owner. Omitted to auto-resolve."),
    repo: z
      .string()
      .optional()
      .describe("Optional: repository name. Omitted to auto-resolve."),
  };

  server.registerPrompt(
    "draft_rfc",
    {
      title: "Draft an RFC",
      description:
        "Walk the user through drafting an RFC from a brief, then create " +
        "the pull request. Loads the draft-rfc skill.",
      argsSchema: {
        owner: z.string().describe("Target repository owner"),
        repo: z.string().describe("Target repository name"),
        topic: z.string().describe("Short description of what to RFC about"),
      },
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Help me draft a new RFC for ${args.owner}/${args.repo} on this topic: ${args.topic}.\n\n` +
              "Load the `draft-rfc` agent skill (see the `rfc123://skills/catalog` resource). Ask me " +
              "clarifying questions to fill out Background, Proposal, " +
              "Alternatives considered, and Open questions. Once I'm happy, " +
              "call rfc123_create_rfc to open the pull request.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "synthesize_discussion",
    {
      title: "Synthesize an RFC's discussion",
      description:
        "Read all comments + threads on an RFC and post a roll-up that " +
        "groups them by theme. Loads the synthesize-discussion skill.",
      argsSchema: rfcRefArgs,
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Synthesize the discussion on RFC ${args.owner && args.repo ? `${args.owner}/${args.repo}#${args.number}` : `#${args.number}`}.\n\n` +
              "Load the `synthesize-discussion` skill. Use rfc123_get_rfc_comments " +
              "and rfc123_list_review_threads to read everything. Group concerns by " +
              "theme; flag what's settled vs. unresolved; cite commenters by " +
              "@login. Post the synthesis as a general comment.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "propose_revision",
    {
      title: "Propose an RFC revision",
      description:
        "Read the RFC + discussion, propose a revised body addressing the " +
        "open feedback. Loads the propose-revision skill.",
      argsSchema: {
        ...rfcRefArgs,
        instruction: z
          .string()
          .describe("Free-form directive: 'tighten the security section', etc.")
          .optional(),
      },
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Propose a revision to RFC ${args.owner && args.repo ? `${args.owner}/${args.repo}#${args.number}` : `#${args.number}`}` +
              (args.instruction ? ` (instruction: ${args.instruction})` : "") +
              ".\n\nLoad the `propose-revision` skill. Read the RFC body and " +
              "all unresolved threads. Show me a unified diff first. After I " +
              "approve, call rfc123_update_rfc_body to commit.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "compare_alternatives",
    {
      title: "Compare alternatives",
      description:
        "Build an Option-A-vs-B comparison table for the RFC. Loads the " +
        "compare-alternatives skill.",
      argsSchema: rfcRefArgs,
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Build a comparison table of the alternatives in RFC ${args.owner && args.repo ? `${args.owner}/${args.repo}#${args.number}` : `#${args.number}`}.\n\n` +
              "Load the `compare-alternatives` skill. Extract the options " +
              "from the body, propose comparison axes, fill in the table. " +
              "Show me the markdown before committing it via rfc123_update_rfc_body.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "extract_action_items",
    {
      title: "Extract action items",
      description:
        "Pull explicit '@x will do Y' items from the discussion and post a " +
        "checklist. Loads the extract-action-items skill.",
      argsSchema: rfcRefArgs,
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Extract action items from RFC ${args.owner && args.repo ? `${args.owner}/${args.repo}#${args.number}` : `#${args.number}`}.\n\n` +
              "Load the `extract-action-items` skill. Read every comment via " +
              "rfc123_get_rfc_comments. Surface explicit owners + actions. Post a " +
              "markdown checklist as a general comment.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "suggest_reviewers",
    {
      title: "Suggest reviewers",
      description:
        "Recommend reviewers based on PR file paths, prior commenters, and " +
        "team mappings. Loads the suggest-reviewers skill.",
      argsSchema: rfcRefArgs,
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Suggest reviewers for RFC ${args.owner && args.repo ? `${args.owner}/${args.repo}#${args.number}` : `#${args.number}`}.\n\n` +
              "Load the `suggest-reviewers` skill. Look at file paths in the " +
              "PR, prior comment authors, and team membership. Show me a " +
              "ranked list with reasons; on approval, call rfc123_request_reviewers.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "rfc123_register_decision",
    {
      title: "Register a decision",
      description:
        "Walk through capturing a decision + rationale, then commit it as " +
        "a Decision block on the RFC. Loads the register-decision skill.",
      argsSchema: rfcRefArgs,
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Help me register a decision on RFC ${args.owner && args.repo ? `${args.owner}/${args.repo}#${args.number}` : `#${args.number}`}.\n\n` +
              "Load the `register-decision` skill. Ask me to state the " +
              "decision in one sentence and a brief rationale. Then call " +
              "rfc123_register_decision to commit it to the RFC body.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "resolve_threads",
    {
      title: "Resolve open review threads",
      description:
        "Walk every unresolved thread, propose a reply, and mark resolved.",
      argsSchema: rfcRefArgs,
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Help me resolve open threads on RFC ${args.owner && args.repo ? `${args.owner}/${args.repo}#${args.number}` : `#${args.number}`}.\n\n` +
              "Load the `resolve-threads` skill. For each unresolved thread, " +
              "summarize the concern and propose a reply. After I approve, " +
              "post the reply with rfc123_reply_to_comment and call " +
              "rfc123_resolve_review_thread on the thread id.",
          },
        },
      ],
    }),
  );
}
