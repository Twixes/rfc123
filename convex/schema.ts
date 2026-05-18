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
});
