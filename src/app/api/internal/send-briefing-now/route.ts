import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { formatBriefingBlocks, formatBriefingFallback } from "@/lib/briefing";
import { api, convexClient, secretKey } from "@/lib/convex";
import {
  filterRFCsAwaitingReview,
  getCurrentUser,
  getGrantedScopes,
  listAllRFCs,
  listUserTeams,
} from "@/lib/github";
import { postMessage } from "@/lib/slack";

/**
 * Dev-only: send the current user's daily briefing immediately, bypassing
 * the hour/weekday/idempotency gates the real cron applies. Useful for
 * eyeballing the Slack message without waiting for the next scheduled run.
 */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await auth();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ghUser = await getCurrentUser(accessToken);

  const [user, links] = await Promise.all([
    convexClient().query(api.users.getByGithubUserId, {
      secret: secretKey(),
      githubUserId: ghUser.id,
    }),
    convexClient().query(api.slack.listLinksForUser, {
      secret: secretKey(),
      githubUserId: ghUser.id,
    }),
  ]);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const activeLink = links.find((l) => l.isActive);
  if (!activeLink) {
    return NextResponse.json(
      { error: "No active Slack workspace linked" },
      { status: 400 },
    );
  }
  const install = await convexClient().query(api.slack.getInstallByTeamId, {
    secret: secretKey(),
    teamId: activeLink.teamId,
  });
  if (!install) {
    return NextResponse.json(
      { error: "Slack workspace install missing" },
      { status: 400 },
    );
  }

  // Fall back to a `read:org`-free flow when the token doesn't carry that
  // scope: listUserTeams already returns [] in that case, but listAllRFCs
  // would throw on the Team GraphQL fragment – so we ask it to skip the
  // fragment. Team-requested-only reviews are then silently dropped, same
  // as pre-briefing behavior.
  const scopes = await getGrantedScopes(accessToken);
  const hasReadOrg = scopes.includes("read:org");
  const teams = hasReadOrg ? await listUserTeams(accessToken) : [];
  const allRFCs = await listAllRFCs(accessToken, ghUser.login, {
    withTeamFields: hasReadOrg,
  });
  const awaiting = filterRFCsAwaitingReview(allRFCs, teams);

  if (awaiting.length === 0) {
    return NextResponse.json({ sent: false, count: 0, reason: "empty" });
  }

  await postMessage(install.botToken, {
    channel: activeLink.slackUserId,
    text: formatBriefingFallback(awaiting),
    blocks: formatBriefingBlocks(awaiting),
    unfurl_links: false,
  });

  return NextResponse.json({ sent: true, count: awaiting.length });
}
