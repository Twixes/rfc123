import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { api, convexClient, secretKey } from "@/lib/convex";
import { sha256Hex } from "@/lib/mcp-oauth";
import { type AuthExtra, registerMcpCapabilities } from "@/lib/mcp-server";

/**
 * Streamable HTTP MCP endpoint at /mcp. SSE is disabled – we only support the
 * modern transport (the MCP spec deprecated SSE in 2025-03). Every request
 * carries an OAuth Bearer token minted by /api/mcp-oauth/token, which we
 * resolve to a user + GitHub access token via Convex.
 *
 * Why a static `app/mcp/route.ts` rather than the `[transport]` pattern from
 * the README: we expose exactly one URL (`/mcp`) for the streamable HTTP
 * transport, no `/sse` or `/message` siblings, so the dynamic segment buys
 * nothing.
 */
const handler = createMcpHandler(
  (server) => registerMcpCapabilities(server),
  {
    serverInfo: {
      name: "rfc123",
      version: "0.1.0",
    },
    instructions:
      "RFC123 helps you reason about engineering RFCs (markdown pull " +
      "requests). The MCP surface is read+route only — there is no tool " +
      "that posts comments, replies, reviews, or RFC bodies on the user's " +
      "behalf. The agent reads, clusters, strawmans, steelmans, and " +
      "synthesizes — in chat. Every word that lands on GitHub is typed by " +
      "a human. Review-craft skills install via " +
      "`/plugin install rfc123-skills` (catalog at " +
      "`rfc123://skills/catalog`).\n\n" +
      "Tool routing guide:\n" +
      "• Find work: `rfc123_list_rfcs` (filter with `onlyMine:true` for the " +
      "review queue; pass `status:open` + `includeDrafts:false` for the " +
      "high-priority cut). The response carries `viewerInvolvement` per RFC.\n" +
      "• Read content: `rfc123_get_rfc` (body + decision blocks + reviewer " +
      "state + merge readiness, line-numbered markdown for accurate " +
      "citation). Comments come from `rfc123_get_rfc_comments` (full " +
      "bodies, grouped threads) or `rfc123_list_review_threads` (resolution " +
      "state).\n" +
      "• Find prior art: `rfc123_search_rfcs` (text search across RFC PRs).\n" +
      "• Structural writes (no prose): `rfc123_request_reviewers` (add or " +
      "remove reviewer requests) and `rfc123_merge_rfc` (refuses without " +
      "approval + resolved threads + a Decision block; pass `force:true` " +
      "to override).",
  },
  {
    streamableHttpEndpoint: "/mcp",
    disableSse: true,
    maxDuration: 60,
    verboseLogs: process.env.NODE_ENV !== "production",
  },
);

/**
 * Resolve an opaque MCP access token to its user. Returns the GitHub access
 * token in `extra` so tool handlers can drive Octokit per-request without an
 * additional round-trip.
 */
const verifyToken = async (
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;
  try {
    const row = await convexClient().query(api.mcpOAuth.resolveAccessToken, {
      secret: secretKey(),
      tokenHash: sha256Hex(bearerToken),
    });
    if (!row) return undefined;
    const extra: AuthExtra = {
      userId: row.user.userId,
      githubUserId: row.user.githubUserId,
      githubLogin: row.user.githubLogin,
      githubAccessToken: row.user.githubAccessToken,
    };
    return {
      token: bearerToken,
      clientId: row.clientId,
      scopes: row.scope ? row.scope.split(" ").filter(Boolean) : ["mcp"],
      expiresAt: Math.floor(row.expiresAt / 1000),
      extra: extra as unknown as Record<string, unknown>,
    };
  } catch (error) {
    console.error("[mcp] verifyToken failed", error);
    return undefined;
  }
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
