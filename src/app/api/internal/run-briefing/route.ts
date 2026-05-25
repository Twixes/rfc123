import { NextResponse } from "next/server";
import {
  decideShouldSend,
  formatBriefingBlocks,
  formatBriefingFallback,
  localClock,
} from "@/lib/briefing";
import { api, convexClient, secretKey } from "@/lib/convex";
import {
  filterRFCsAwaitingReview,
  getGrantedScopes,
  listAllRFCs,
  listUserTeams,
} from "@/lib/github";
import { postMessage } from "@/lib/slack";
import { decryptToken } from "@/lib/token-crypto";

const TEAM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Internal worker called by the Convex hourly cron. Iterates every user
 * with notifications enabled + an active Slack link, decides who is due
 * right now (their local clock matches their preferred hour, isn't a
 * weekend, hasn't already been sent), and sends the DM.
 *
 * Auth: `Authorization: Bearer ${SECRET_KEY}`
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.SECRET_KEY ?? ""}`;
  if (!process.env.SECRET_KEY || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await callListEnabledUsers();

  const now = new Date();
  const results = await Promise.allSettled(
    users.map((user) => processUser(user, now)),
  );

  const summary = results.map((r, i) => {
    const u = users[i];
    if (r.status === "fulfilled") {
      return { githubLogin: u.githubLogin, ...r.value };
    }
    return {
      githubLogin: u.githubLogin,
      sent: false,
      error: (r.reason as Error).message,
    };
  });

  return NextResponse.json({ users: users.length, summary });
}

type EnabledUser = Awaited<ReturnType<typeof callListEnabledUsers>>[number];

async function callListEnabledUsers() {
  const rows = await convexClient().query(
    api.users.listEnabledUsersWithActiveLink,
    { secret: secretKey() },
  );
  // Convex stores the GitHub OAuth token encrypted at rest; decrypt here so
  // downstream code can keep treating `githubAccessToken` as a usable token.
  return await Promise.all(
    rows.map(async (row) => ({
      ...row,
      githubAccessToken: await decryptToken(row.githubAccessToken),
    })),
  );
}

async function processUser(
  user: EnabledUser,
  now: Date,
): Promise<{ sent: boolean; reason?: string; count?: number }> {
  const decision = decideShouldSend(user, now);
  if (!decision.shouldSend) {
    return { sent: false, reason: decision.reason };
  }

  // Gracefully degrade when the user's token predates the `read:org` scope
  // request: skip team-membership lookup and the Team GraphQL fragment.
  // They'll still get a briefing for direct review requests; team-requested
  // ones reappear once they sign back in.
  const scopes = await getGrantedScopes(user.githubAccessToken);
  const hasReadOrg = scopes.includes("read:org");

  let teams = hasReadOrg ? (user.githubTeams ?? []) : [];
  if (
    hasReadOrg &&
    (!user.githubTeamsRefreshedAt ||
      Date.now() - user.githubTeamsRefreshedAt > TEAM_CACHE_TTL_MS)
  ) {
    teams = await listUserTeams(user.githubAccessToken);
    await convexClient().mutation(api.users.setCachedTeams, {
      secret: secretKey(),
      userId: user.userId,
      teams,
    });
  }

  const allRFCs = await listAllRFCs(user.githubAccessToken, user.githubLogin, {
    withTeamFields: hasReadOrg,
  });
  const awaiting = filterRFCsAwaitingReview(allRFCs, teams);

  if (awaiting.length === 0) {
    // Mark sent anyway so we don't keep checking this user for the rest of
    // the hour. (The decision logic already skips other hours.)
    const { ymd } = localClock(now, user.timezone);
    await convexClient().mutation(api.users.markBriefingSent, {
      secret: secretKey(),
      userId: user.userId,
      ymdLocal: ymd,
    });
    return { sent: false, reason: "empty", count: 0 };
  }

  await postMessage(user.slackBotToken, {
    channel: user.slackUserId,
    text: formatBriefingFallback(awaiting),
    blocks: formatBriefingBlocks(awaiting),
    unfurl_links: false,
  });

  const { ymd } = localClock(now, user.timezone);
  await convexClient().mutation(api.users.markBriefingSent, {
    secret: secretKey(),
    userId: user.userId,
    ymdLocal: ymd,
  });

  return { sent: true, count: awaiting.length };
}
