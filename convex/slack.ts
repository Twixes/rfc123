import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalQuery,
  type MutationCtx,
  mutation,
  query,
} from "./_generated/server";
import { requireSecret } from "./lib/auth";

/**
 * Record (or refresh) a Slack workspace install. The installer is also
 * linked as an active Slack user in that workspace.
 */
export const recordInstall = mutation({
  args: {
    secret: v.string(),
    githubUserId: v.number(),
    teamId: v.string(),
    teamName: v.string(),
    botToken: v.string(),
    botUserId: v.string(),
    installerSlackUserId: v.string(),
    installerSlackUserName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireSecret(args.secret);

    const user = await ctx.db
      .query("users")
      .withIndex("by_github_user_id", (q) =>
        q.eq("githubUserId", args.githubUserId),
      )
      .unique();
    if (!user) throw new Error("User not found");

    const existing = await ctx.db
      .query("slackInstalls")
      .withIndex("by_team_id", (q) => q.eq("teamId", args.teamId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        teamName: args.teamName,
        botToken: args.botToken,
        botUserId: args.botUserId,
      });
    } else {
      await ctx.db.insert("slackInstalls", {
        teamId: args.teamId,
        teamName: args.teamName,
        botToken: args.botToken,
        botUserId: args.botUserId,
        installedByUserId: user._id,
        installedAt: Date.now(),
      });
    }

    await upsertLinkForUser(ctx, {
      userId: user._id,
      teamId: args.teamId,
      slackUserId: args.installerSlackUserId,
      slackUserName: args.installerSlackUserName,
      makeActive: true,
    });
  },
});

/**
 * Save (or update) a user→workspace Slack link. Setting makeActive=true
 * deactivates any existing active link for the same user.
 */
export const linkSlackUser = mutation({
  args: {
    secret: v.string(),
    githubUserId: v.number(),
    teamId: v.string(),
    slackUserId: v.string(),
    slackUserName: v.optional(v.string()),
    makeActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    requireSecret(args.secret);

    const user = await ctx.db
      .query("users")
      .withIndex("by_github_user_id", (q) =>
        q.eq("githubUserId", args.githubUserId),
      )
      .unique();
    if (!user) throw new Error("User not found");

    await upsertLinkForUser(ctx, {
      userId: user._id,
      teamId: args.teamId,
      slackUserId: args.slackUserId,
      slackUserName: args.slackUserName,
      makeActive: args.makeActive,
    });
  },
});

/**
 * Mark exactly one of a user's links active (by teamId). All others are
 * deactivated. Lets the user pick which Slack community to be DMed in.
 */
export const setActiveLink = mutation({
  args: {
    secret: v.string(),
    githubUserId: v.number(),
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    requireSecret(args.secret);

    const user = await ctx.db
      .query("users")
      .withIndex("by_github_user_id", (q) =>
        q.eq("githubUserId", args.githubUserId),
      )
      .unique();
    if (!user) throw new Error("User not found");

    const links = await ctx.db
      .query("slackLinks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    let found = false;
    for (const link of links) {
      const shouldBeActive = link.teamId === args.teamId;
      if (shouldBeActive) found = true;
      if (link.isActive !== shouldBeActive) {
        await ctx.db.patch(link._id, { isActive: shouldBeActive });
      }
    }
    if (!found) {
      throw new Error("No Slack link found for that workspace");
    }
  },
});

export const disconnectLink = mutation({
  args: {
    secret: v.string(),
    githubUserId: v.number(),
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    requireSecret(args.secret);

    const user = await ctx.db
      .query("users")
      .withIndex("by_github_user_id", (q) =>
        q.eq("githubUserId", args.githubUserId),
      )
      .unique();
    if (!user) throw new Error("User not found");

    const link = await ctx.db
      .query("slackLinks")
      .withIndex("by_user_and_team", (q) =>
        q.eq("userId", user._id).eq("teamId", args.teamId),
      )
      .unique();
    if (link) {
      await ctx.db.delete(link._id);
    }
  },
});

/**
 * Look up the bot token for a workspace. Used by the OAuth "link" callback so
 * we can hit Slack's users.info on behalf of the workspace without requesting
 * bot scopes from the linking user.
 */
export const getInstallByTeamId = query({
  args: { secret: v.string(), teamId: v.string() },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    const install = await ctx.db
      .query("slackInstalls")
      .withIndex("by_team_id", (q) => q.eq("teamId", args.teamId))
      .unique();
    if (!install) return null;
    return { botToken: install.botToken, teamName: install.teamName };
  },
});

/** Public – used by /settings to render the workspace picker. */
export const listLinksForUser = query({
  args: { secret: v.string(), githubUserId: v.number() },
  handler: async (ctx, args) => {
    requireSecret(args.secret);

    const user = await ctx.db
      .query("users")
      .withIndex("by_github_user_id", (q) =>
        q.eq("githubUserId", args.githubUserId),
      )
      .unique();
    if (!user) return [];

    const links = await ctx.db
      .query("slackLinks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const enriched = await Promise.all(
      links.map(async (link) => {
        const install = await ctx.db
          .query("slackInstalls")
          .withIndex("by_team_id", (q) => q.eq("teamId", link.teamId))
          .unique();
        return {
          teamId: link.teamId,
          slackUserId: link.slackUserId,
          slackUserName: link.slackUserName,
          isActive: link.isActive,
          teamName: install?.teamName ?? link.teamId,
        };
      }),
    );
    return enriched;
  },
});

// Internal-only – used by the briefing action.
export const getActiveLinkAndInstall = internalQuery({
  args: { userId: v.id("users") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    link: Doc<"slackLinks">;
    install: Doc<"slackInstalls">;
  } | null> => {
    const link = await ctx.db
      .query("slackLinks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();
    if (!link) return null;
    const install = await ctx.db
      .query("slackInstalls")
      .withIndex("by_team_id", (q) => q.eq("teamId", link.teamId))
      .unique();
    if (!install) return null;
    return { link, install };
  },
});

async function upsertLinkForUser(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    teamId: string;
    slackUserId: string;
    slackUserName?: string;
    makeActive: boolean;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("slackLinks")
    .withIndex("by_user_and_team", (q) =>
      q.eq("userId", args.userId).eq("teamId", args.teamId),
    )
    .unique();

  if (args.makeActive) {
    const others = await ctx.db
      .query("slackLinks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const o of others) {
      if (o.teamId !== args.teamId && o.isActive) {
        await ctx.db.patch(o._id, { isActive: false });
      }
    }
  }

  if (existing) {
    await ctx.db.patch(existing._id, {
      slackUserId: args.slackUserId,
      slackUserName: args.slackUserName ?? existing.slackUserName,
      isActive: args.makeActive || existing.isActive,
    });
  } else {
    await ctx.db.insert("slackLinks", {
      userId: args.userId,
      teamId: args.teamId,
      slackUserId: args.slackUserId,
      slackUserName: args.slackUserName,
      isActive: args.makeActive,
    });
  }
}
