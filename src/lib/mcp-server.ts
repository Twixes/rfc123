import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getCurrentUser,
  getRFCDetail,
  groupIntoThreads,
  listAllRFCs,
  listReposWithRFCs,
  listRFCs,
  listUserTeams,
} from "./github";
import {
  fetchAllRfcComments,
  listReviewThreads,
  mergeRFC,
  requestReviewers,
  resolveRfcRef,
  searchReviewers,
  searchRFCs,
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

const jsonResult = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  structuredContent: data as Record<string, unknown>,
});

/**
 * Resolve a per-RFC tool's input to `{auth, owner, repo, number}`. If the
 * caller omitted owner/repo we look the PR up across every RFC repo the
 * user can access – so agents (and humans) can refer to an RFC by number
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
 *
 * Surface rule: the agent reads and synthesizes – in chat. Every word that
 * lands on GitHub is typed by a human. The only writes exposed here are
 * *structural* (request reviewers, merge) – no prose.
 */
export function registerMcpCapabilities(server: McpServer) {
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
        "involvement comes first – agents should prioritize those.",
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
        "a single RFC. Returns `markdownContentNumbered` – a line-numbered " +
        "view of the body – so agents can cite specific lines back to the " +
        "user. Comments are returned separately by rfc123_get_rfc_comments.",
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
        "find prior art when reviewing.",
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
        "Search for reviewers – users *and* teams – within the orgs that " +
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

  server.registerTool(
    "rfc123_request_reviewers",
    {
      title: "Request / remove reviewers",
      description:
        "Add and/or remove reviewers (users or teams) on an RFC in one " +
        "call. Use rfc123_search_reviewers first to resolve handles. " +
        "Passing a user who previously reviewed and is no longer pending " +
        "re-requests them. Structural action – no prose. Returns a " +
        "structured echo of what was added, what was already requested, " +
        "what was removed, and the final pending list.",
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
    "rfc123_merge_rfc",
    {
      title: "Merge RFC",
      description:
        "Merge an RFC's pull request. Refuses by default unless: at least " +
        "one APPROVE review exists, zero review threads are unresolved, and " +
        "a `### Decision (...)` block is present in the RFC body. Pass " +
        "`force: true` to override (caller owns the consequences). " +
        "`mergeMethod` defaults to squash if the repo allows it, otherwise " +
        "the first method the repo permits. Structural action – no prose.",
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

  // The skills catalog is exposed as an MCP resource (rfc123://skills/catalog),
  // not a tool – it's static reference data, not an action. Agents read it
  // via ReadMcpResourceTool when the user asks about installing skills.
  server.registerResource(
    "skills-catalog",
    "rfc123://skills/catalog",
    {
      title: "RFC123 agent skills catalog",
      description:
        "List of agent-side skills (workflow recipes that compose RFC123 " +
        "tools) plus installation instructions. Static reference data – " +
        "read this once when the user asks about skills.",
      mimeType: "application/json",
    },
    async (uri) => {
      const iss = issuerUrl();
      const skills = [
        {
          name: "discuss-rfc",
          summary:
            "Ground a conversation about a specific RFC in the proposal " +
            "and (when the host is a coding agent) the surrounding repo.",
        },
        {
          name: "pressure-test-rfc",
          summary:
            "Strawman / steelman each claim in an RFC, surface unstated " +
            "assumptions and missing options.",
        },
        {
          name: "compare-to-codebase",
          summary:
            "Read the RFC, then the repo at the PR head, and flag every " +
            "claim that contradicts the current code.",
        },
        {
          name: "synthesize-discussion",
          summary:
            "Cluster every comment and thread by theme; show the roll-up " +
            "in chat for the user to rework in their own voice.",
        },
        {
          name: "extract-action-items",
          summary:
            "Walk every comment and surface explicit '@x will do Y' items " +
            "as a chat checklist.",
        },
        {
          name: "compare-alternatives",
          summary:
            "Build an Option-A-vs-B comparison table from the RFC's claims " +
            "and present it in chat.",
        },
        {
          name: "suggest-reviewers",
          summary:
            "Recommend reviewers from PR file paths, prior commenters, and " +
            "team mapping; on the user's approval, request them.",
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
                rule:
                  "The agent reads, clusters, strawmans, steelmans, and " +
                  "synthesizes – in chat. Every word that lands on GitHub " +
                  "is typed by a human.",
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
        `\n*RFC ${owner}/${repo}#${number} – ${detail.status}` +
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

  // Prompts below are all chat-terminating: they help the user think, then
  // stop. They never instruct the agent to post or commit on the user's
  // behalf. If the user wants the output on the RFC, they edit it in
  // themselves – in their own voice. RFCs are human-written; copying LLM
  // prose verbatim is the failure mode we're avoiding.

  server.registerPrompt(
    "pressure_test_rfc",
    {
      title: "Pressure-test an RFC",
      description:
        "Strawman and steelman each claim in an RFC, surface unstated " +
        "assumptions, and flag missing alternatives. Loads the " +
        "pressure-test-rfc skill. Output stays in chat.",
      argsSchema: rfcRefArgs,
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Help me pressure-test RFC ${args.owner && args.repo ? `${args.owner}/${args.repo}#${args.number}` : `#${args.number}`}.\n\n` +
              "Load the `pressure-test-rfc` skill. Read the RFC and threads. " +
              "Walk each substantive claim, strawman and steelman it, name " +
              "the unstated assumptions, and propose missing alternatives. " +
              "Show me the analysis in chat. Do not post anything to " +
              "GitHub.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "compare_to_codebase",
    {
      title: "Compare an RFC to the codebase",
      description:
        "Read the RFC, read the repo at the PR head, and flag every claim " +
        "that contradicts the current code. Loads the compare-to-codebase " +
        "skill. Output stays in chat.",
      argsSchema: rfcRefArgs,
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Compare RFC ${args.owner && args.repo ? `${args.owner}/${args.repo}#${args.number}` : `#${args.number}`} against the codebase.\n\n` +
              "Load the `compare-to-codebase` skill. Read the RFC, then " +
              "read the repository at the PR head ref. For every factual " +
              "claim (file paths, APIs, behavior, dependencies), check the " +
              "code and flag contradictions or omissions. Show me a " +
              "checklist in chat. Do not post anything to GitHub.",
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
        "Read all comments + threads on an RFC and produce a themed " +
        "roll-up. Loads the synthesize-discussion skill. Output stays in " +
        "chat.",
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
              "Load the `synthesize-discussion` skill. Use " +
              "rfc123_get_rfc_comments and rfc123_list_review_threads to " +
              "read everything. Group concerns by theme; flag what's " +
              "settled vs. unresolved; cite commenters by @login. Show me " +
              "the synthesis in chat. If I want any of it on the RFC, " +
              "I'll rework it in my own voice – don't expect me to copy " +
              "yours.",
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
        "compare-alternatives skill. Output stays in chat.",
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
              "Show me the markdown in chat. If I want it on the RFC, I'll " +
              "edit it in myself – rewriting the cells in my own voice as " +
              "I go.",
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
        "Pull explicit '@x will do Y' items from the discussion. Loads the " +
        "extract-action-items skill. Output stays in chat.",
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
              "rfc123_get_rfc_comments. Surface explicit owners + actions. " +
              "Show me a markdown checklist in chat. If I want it on the " +
              "RFC, I'll edit it in myself – rewriting items in my own " +
              "voice as I go.",
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
              "ranked list with reasons; on approval, call " +
              "rfc123_request_reviewers.",
          },
        },
      ],
    }),
  );
}
