import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // One row per RFC123 user. Keyed by GitHub numeric user id (stable across
  // login renames). We persist the GitHub access token here so the daily
  // briefing cron can call GitHub when the user is not actively browsing.
  // TODO: replace token storage with a GitHub App installation flow.
  users: defineTable({
    githubUserId: v.number(),
    githubLogin: v.string(),
    githubAccessToken: v.string(),
    // Cached GitHub team memberships ("org/slug"). Refreshed lazily by the
    // briefing action so we can credit team-requested reviews to members.
    githubTeams: v.optional(v.array(v.string())),
    githubTeamsRefreshedAt: v.optional(v.number()),
    notifyHour: v.number(),
    timezone: v.string(),
    notificationsEnabled: v.boolean(),
    // Local YMD string (e.g. "2026-05-17") of the last sent briefing, in the
    // user's own timezone. Used purely for idempotency – protects against
    // the cron action retrying mid-loop.
    lastSentYmdLocal: v.optional(v.string()),
  })
    .index("by_github_user_id", ["githubUserId"])
    .index("by_notify_hour", ["notifyHour"]),

  // Each Slack workspace that has installed the RFC123 Slack app.
  slackInstalls: defineTable({
    teamId: v.string(),
    teamName: v.string(),
    botToken: v.string(),
    botUserId: v.string(),
    installedByUserId: v.id("users"),
    installedAt: v.number(),
  }).index("by_team_id", ["teamId"]),

  // Links between an RFC123 user and a Slack user in a specific workspace.
  // A user may have multiple links (one per workspace they're in); exactly
  // one is marked active and used as the DM target.
  slackLinks: defineTable({
    userId: v.id("users"),
    teamId: v.string(),
    slackUserId: v.string(),
    // Resolved via Slack `users.info` at link time. May be missing for old
    // rows or if Slack rejected the lookup. Display falls back to slackUserId.
    slackUserName: v.optional(v.string()),
    isActive: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_team", ["userId", "teamId"]),

  // OAuth 2.1 + Dynamic Client Registration clients for the /mcp endpoint.
  // Each registered MCP client (Claude.ai, ChatGPT, an IDE, …) gets one row.
  // We don't store `clientSecret` for public clients; for confidential clients
  // we store a SHA-256 hash.
  mcpClients: defineTable({
    clientId: v.string(),
    clientSecretHash: v.optional(v.string()),
    clientName: v.string(),
    redirectUris: v.array(v.string()),
    tokenEndpointAuthMethod: v.string(), // "none" (public) | "client_secret_post"
    grantTypes: v.array(v.string()),
    responseTypes: v.array(v.string()),
    scope: v.optional(v.string()),
    createdAt: v.number(),
    // True when every redirect_uri matches a hostname on the Next.js side's
    // trusted-clients allowlist (`src/lib/mcp-trusted-clients.ts`). Drives the
    // "unverified client" warning on the consent screen. Optional so legacy
    // rows registered before this field existed default to unverified
    // (handled by `getClient` returning `verified ?? false`).
    verified: v.optional(v.boolean()),
  }).index("by_client_id", ["clientId"]),

  // Short-lived authorization codes minted by /authorize and consumed once at
  // /token. PKCE-required (S256). Codes expire in ~10 minutes.
  mcpAuthCodes: defineTable({
    code: v.string(),
    clientId: v.string(),
    userId: v.id("users"),
    redirectUri: v.string(),
    codeChallenge: v.string(),
    codeChallengeMethod: v.string(),
    scope: v.optional(v.string()),
    expiresAt: v.number(),
    consumed: v.boolean(),
  }).index("by_code", ["code"]),

  // Per-user view of an RFC123 repo. The long-term aim is for this to replace
  // the Redis-backed `viewer_repos` / `.rfc123.json` sweep. Today rows only
  // exist while a `.rfc123.json` adoption PR is in flight (the direct commit
  // was rejected by branch protection): the row is deleted once the PR merges
  // and the viewer-repo sweep takes over, or once it closes unmerged.
  repos: defineTable({
    userId: v.id("users"),
    owner: v.string(),
    name: v.string(),
    fullName: v.string(),
    layout: v.union(v.literal("flat"), v.literal("multi-directory")),
    pendingAdoption: v.optional(
      v.object({
        prNumber: v.number(),
        prUrl: v.string(),
        branchName: v.string(),
        defaultBranch: v.string(),
        createdAt: v.number(),
        resolvedAt: v.optional(v.number()),
        resolution: v.optional(
          v.union(v.literal("merged"), v.literal("closed")),
        ),
      }),
    ),
  })
    .index("by_user", ["userId"])
    .index("by_user_repo", ["userId", "owner", "name"]),

  // Opaque MCP access tokens. The MCP server hands these to clients; we look
  // them up on every /mcp request to resolve the acting user. The user row
  // still holds the user's GitHub access token used to drive GitHub API calls.
  mcpAccessTokens: defineTable({
    token: v.string(),
    clientId: v.string(),
    userId: v.id("users"),
    scope: v.optional(v.string()),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),
});
