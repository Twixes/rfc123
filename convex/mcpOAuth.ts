import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireSecret } from "./lib/auth";

/**
 * Dynamic Client Registration (RFC 7591). Called by /api/mcp-oauth/register.
 * The Next.js side does the SHA-256 hashing of the client secret (if any)
 * before calling us; we just persist.
 */
export const registerClient = mutation({
  args: {
    secret: v.string(),
    clientId: v.string(),
    clientSecretHash: v.optional(v.string()),
    clientName: v.string(),
    redirectUris: v.array(v.string()),
    tokenEndpointAuthMethod: v.string(),
    grantTypes: v.array(v.string()),
    responseTypes: v.array(v.string()),
    scope: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    return await ctx.db.insert("mcpClients", {
      clientId: args.clientId,
      clientSecretHash: args.clientSecretHash,
      clientName: args.clientName,
      redirectUris: args.redirectUris,
      tokenEndpointAuthMethod: args.tokenEndpointAuthMethod,
      grantTypes: args.grantTypes,
      responseTypes: args.responseTypes,
      scope: args.scope,
      createdAt: Date.now(),
    });
  },
});

export const getClient = query({
  args: { secret: v.string(), clientId: v.string() },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    return await ctx.db
      .query("mcpClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
  },
});

/** Mint an authorization code at /authorize. PKCE is required (S256). */
export const createAuthCode = mutation({
  args: {
    secret: v.string(),
    code: v.string(),
    clientId: v.string(),
    userId: v.id("users"),
    redirectUri: v.string(),
    codeChallenge: v.string(),
    codeChallengeMethod: v.string(),
    scope: v.optional(v.string()),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    return await ctx.db.insert("mcpAuthCodes", {
      code: args.code,
      clientId: args.clientId,
      userId: args.userId,
      redirectUri: args.redirectUri,
      codeChallenge: args.codeChallenge,
      codeChallengeMethod: args.codeChallengeMethod,
      scope: args.scope,
      expiresAt: args.expiresAt,
      consumed: false,
    });
  },
});

/**
 * Atomically validate-and-consume an authorization code at /token. The
 * caller passes everything we need to validate (clientId, redirectUri,
 * codeChallenge); we do the lookup, all the checks, and the consume in one
 * Convex mutation – so a thief who learns a code can't burn it just by
 * presenting it under a different client_id (the row stays unconsumed if
 * validation fails). Returns `{ status: "ok", row }` on success, otherwise
 * `{ status: "<reason>" }` so the caller can map to OAuth error codes.
 */
export const consumeAuthCode = mutation({
  args: {
    secret: v.string(),
    code: v.string(),
    clientId: v.string(),
    redirectUri: v.string(),
    codeChallenge: v.string(),
  },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    const row = await ctx.db
      .query("mcpAuthCodes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!row) return { status: "not_found" as const };
    if (row.consumed) return { status: "already_consumed" as const };
    if (row.expiresAt < Date.now()) return { status: "expired" as const };
    if (row.clientId !== args.clientId)
      return { status: "client_mismatch" as const };
    if (row.redirectUri !== args.redirectUri)
      return { status: "redirect_mismatch" as const };
    if (row.codeChallenge !== args.codeChallenge)
      return { status: "pkce_failed" as const };
    await ctx.db.patch(row._id, { consumed: true });
    return {
      status: "ok" as const,
      row: {
        userId: row.userId,
        clientId: row.clientId,
        scope: row.scope,
      },
    };
  },
});

/**
 * Store the SHA-256 hash of the access token, never the raw token. A Convex
 * breach therefore yields hashes that can't be presented to /mcp. The same
 * hash function is run on every incoming Bearer token before lookup.
 */
export const createAccessToken = mutation({
  args: {
    secret: v.string(),
    tokenHash: v.string(),
    clientId: v.string(),
    userId: v.id("users"),
    scope: v.optional(v.string()),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    return await ctx.db.insert("mcpAccessTokens", {
      token: args.tokenHash,
      clientId: args.clientId,
      userId: args.userId,
      scope: args.scope,
      expiresAt: args.expiresAt,
    });
  },
});

export const resolveAccessToken = query({
  args: { secret: v.string(), tokenHash: v.string() },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    const row = await ctx.db
      .query("mcpAccessTokens")
      .withIndex("by_token", (q) => q.eq("token", args.tokenHash))
      .unique();
    if (!row) return null;
    if (row.revokedAt) return null;
    if (row.expiresAt < Date.now()) return null;
    const user = await ctx.db.get(row.userId);
    if (!user) return null;
    return {
      tokenId: row._id,
      clientId: row.clientId,
      scope: row.scope,
      expiresAt: row.expiresAt,
      user: {
        userId: user._id,
        githubUserId: user.githubUserId,
        githubLogin: user.githubLogin,
        githubAccessToken: user.githubAccessToken,
      },
    };
  },
});

export const revokeAccessToken = mutation({
  args: { secret: v.string(), tokenHash: v.string() },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    const row = await ctx.db
      .query("mcpAccessTokens")
      .withIndex("by_token", (q) => q.eq("token", args.tokenHash))
      .unique();
    if (!row) return;
    await ctx.db.patch(row._id, { revokedAt: Date.now() });
  },
});
