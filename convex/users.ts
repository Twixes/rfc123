import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireSecret } from "./lib/auth";

const userArgs = {
  secret: v.string(),
  githubUserId: v.number(),
  githubLogin: v.string(),
  githubAccessToken: v.string(),
};

/**
 * Upsert the user's identity + GitHub token. Called from NextAuth's JWT
 * callback so the token stays fresh in Convex. Creates the row on first
 * sign-in with sensible defaults (notifications off, 9 AM UTC) – the user
 * sets a real timezone the first time they open /settings.
 */
export const upsertFromGithub = mutation({
  args: userArgs,
  handler: async (ctx, args) => {
    requireSecret(args.secret);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_github_user_id", (q) =>
        q.eq("githubUserId", args.githubUserId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        githubLogin: args.githubLogin,
        githubAccessToken: args.githubAccessToken,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      githubUserId: args.githubUserId,
      githubLogin: args.githubLogin,
      githubAccessToken: args.githubAccessToken,
      notifyHour: 9,
      timezone: "UTC",
      notificationsEnabled: false,
    });
  },
});

export const getByGithubUserId = query({
  args: { secret: v.string(), githubUserId: v.number() },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    return await ctx.db
      .query("users")
      .withIndex("by_github_user_id", (q) =>
        q.eq("githubUserId", args.githubUserId),
      )
      .unique();
  },
});

/**
 * Save notification preferences. Setting `notificationsEnabled` to true also
 * requires an active Slack link to exist (we check on the cron side, not
 * here, so the form can be saved before the user finishes linking Slack).
 */
export const saveNotificationPrefs = mutation({
  args: {
    secret: v.string(),
    githubUserId: v.number(),
    notifyHour: v.number(),
    timezone: v.string(),
    notificationsEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    requireSecret(args.secret);

    if (args.notifyHour < 0 || args.notifyHour > 23) {
      throw new Error("notifyHour must be 0..23");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_github_user_id", (q) =>
        q.eq("githubUserId", args.githubUserId),
      )
      .unique();
    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      notifyHour: args.notifyHour,
      timezone: args.timezone,
      notificationsEnabled: args.notificationsEnabled,
    });
  },
});

/**
 * Flip the digest on. Called by the Slack OAuth callback after a successful
 * install/link – the act of connecting Slack is itself opt-in.
 */
export const enableNotifications = mutation({
  args: { secret: v.string(), githubUserId: v.number() },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    const user = await ctx.db
      .query("users")
      .withIndex("by_github_user_id", (q) =>
        q.eq("githubUserId", args.githubUserId),
      )
      .unique();
    if (!user) throw new Error("User not found");
    if (!user.notificationsEnabled) {
      await ctx.db.patch(user._id, { notificationsEnabled: true });
    }
  },
});

/**
 * Called by the briefing worker. Returns every user with notifications
 * enabled – the worker re-derives each one's local clock to decide who is
 * actually due right now. Bounded; this is a small users table.
 */
export const listEnabledUsersWithActiveLink = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    const users = await ctx.db.query("users").take(1000);

    const enabled = users.filter((u) => u.notificationsEnabled);

    const enriched = await Promise.all(
      enabled.map(async (user) => {
        const link = await ctx.db
          .query("slackLinks")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .filter((q) => q.eq(q.field("isActive"), true))
          .first();
        if (!link) return null;
        const install = await ctx.db
          .query("slackInstalls")
          .withIndex("by_team_id", (q) => q.eq("teamId", link.teamId))
          .unique();
        if (!install) return null;
        return {
          userId: user._id,
          githubUserId: user.githubUserId,
          githubLogin: user.githubLogin,
          githubAccessToken: user.githubAccessToken,
          notifyHour: user.notifyHour,
          timezone: user.timezone,
          lastSentYmdLocal: user.lastSentYmdLocal,
          githubTeams: user.githubTeams,
          githubTeamsRefreshedAt: user.githubTeamsRefreshedAt,
          slackUserId: link.slackUserId,
          slackTeamId: link.teamId,
          slackBotToken: install.botToken,
        };
      }),
    );

    return enriched.filter((e): e is NonNullable<typeof e> => e !== null);
  },
});

export const markBriefingSent = mutation({
  args: {
    secret: v.string(),
    userId: v.id("users"),
    ymdLocal: v.string(),
  },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    await ctx.db.patch(args.userId, { lastSentYmdLocal: args.ymdLocal });
  },
});

export const setCachedTeams = mutation({
  args: {
    secret: v.string(),
    userId: v.id("users"),
    teams: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    await ctx.db.patch(args.userId, {
      githubTeams: args.teams,
      githubTeamsRefreshedAt: Date.now(),
    });
  },
});

export type ConvexUser = Doc<"users">;
export type ConvexUserId = Id<"users">;
