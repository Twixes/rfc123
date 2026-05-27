import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireSecret } from "./lib/auth";

const layoutValidator = v.union(
  v.literal("flat"),
  v.literal("multi-directory"),
);

const findRow = (
  ctx: QueryCtx,
  userId: Id<"users">,
  owner: string,
  name: string,
) =>
  ctx.db
    .query("repos")
    .withIndex("by_user_repo", (q) =>
      q.eq("userId", userId).eq("owner", owner).eq("name", name),
    )
    .unique();

export const upsertPendingAdoption = mutation({
  args: {
    secret: v.string(),
    userId: v.id("users"),
    owner: v.string(),
    name: v.string(),
    fullName: v.string(),
    layout: layoutValidator,
    prNumber: v.number(),
    prUrl: v.string(),
    branchName: v.string(),
    defaultBranch: v.string(),
  },
  handler: async (ctx, args) => {
    requireSecret(args.secret);

    const pendingAdoption = {
      prNumber: args.prNumber,
      prUrl: args.prUrl,
      branchName: args.branchName,
      defaultBranch: args.defaultBranch,
      createdAt: Date.now(),
    };

    const existing = await findRow(ctx, args.userId, args.owner, args.name);
    if (existing) {
      await ctx.db.patch(existing._id, {
        fullName: args.fullName,
        layout: args.layout,
        pendingAdoption,
      });
      return existing._id;
    }
    return await ctx.db.insert("repos", {
      userId: args.userId,
      owner: args.owner,
      name: args.name,
      fullName: args.fullName,
      layout: args.layout,
      pendingAdoption,
    });
  },
});

export const resolvePendingAdoption = mutation({
  args: {
    secret: v.string(),
    userId: v.id("users"),
    owner: v.string(),
    name: v.string(),
    resolution: v.union(v.literal("merged"), v.literal("closed")),
  },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    const existing = await findRow(ctx, args.userId, args.owner, args.name);
    if (!existing?.pendingAdoption) return;
    await ctx.db.patch(existing._id, {
      pendingAdoption: {
        ...existing.pendingAdoption,
        resolvedAt: Date.now(),
        resolution: args.resolution,
      },
    });
  },
});

export const clearAdoption = mutation({
  args: {
    secret: v.string(),
    userId: v.id("users"),
    owner: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    const existing = await findRow(ctx, args.userId, args.owner, args.name);
    if (!existing) return;
    await ctx.db.delete(existing._id);
  },
});

export const getForUserRepo = query({
  args: {
    secret: v.string(),
    userId: v.id("users"),
    owner: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    return await findRow(ctx, args.userId, args.owner, args.name);
  },
});

/**
 * One-round-trip lookup used by the /api/repos hot path: resolves the user
 * row from the GitHub user id and returns their pending adoptions inline so
 * we don't pay two Convex requests on every page load.
 */
export const viewerWithPendingRepos = query({
  args: { secret: v.string(), githubUserId: v.number() },
  handler: async (ctx, args) => {
    requireSecret(args.secret);
    const user = await ctx.db
      .query("users")
      .withIndex("by_github_user_id", (q) =>
        q.eq("githubUserId", args.githubUserId),
      )
      .unique();
    if (!user) return { user: null, repos: [] as Doc<"repos">[] };
    const repos = await ctx.db
      .query("repos")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return { user, repos };
  },
});

export type ConvexRepo = Doc<"repos">;
export type ConvexRepoId = Id<"repos">;
