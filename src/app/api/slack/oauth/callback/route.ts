import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { api, convexClient, secretKey } from "@/lib/convex";
import { getCurrentUser } from "@/lib/github";
import {
  exchangeOAuthCode,
  fetchSlackUserName,
  type SlackOAuthV2Response,
  slackRedirectUri,
} from "@/lib/slack";

function appUrl(path: string): URL {
  const base = process.env.NEXTAUTH_URL;
  if (!base) throw new Error("NEXTAUTH_URL is not set");
  return new URL(path, base);
}

function slackErrorRedirect(message: string): NextResponse {
  const target = appUrl("/settings");
  target.searchParams.set("slack_error", message);
  return NextResponse.redirect(target);
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) {
    return NextResponse.redirect(appUrl("/api/auth/signin"));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const stateCookie = req.cookies.get("slack_oauth_state")?.value;

  // Split errors apart so we can tell which condition failed.
  if (!code) return slackErrorRedirect("Missing code");
  if (!stateParam) return slackErrorRedirect("Missing state in URL");
  if (!stateCookie) {
    return slackErrorRedirect(
      "Missing state cookie — likely a cross-origin issue. Make sure you started the install on the same host as NEXTAUTH_URL.",
    );
  }
  if (stateParam !== stateCookie) {
    return slackErrorRedirect(
      `State mismatch (url=${stateParam.slice(0, 16)}… cookie=${stateCookie.slice(0, 16)}…)`,
    );
  }

  const [mode] = stateParam.split(":");
  if (mode !== "install" && mode !== "link") {
    return slackErrorRedirect(`Unknown mode in state: ${mode}`);
  }

  let oauth: SlackOAuthV2Response;
  try {
    oauth = await exchangeOAuthCode(code, slackRedirectUri());
  } catch (err) {
    return slackErrorRedirect((err as Error).message);
  }

  const team = oauth.team;
  const authedUser = oauth.authed_user;
  if (!team || !authedUser?.id) {
    return slackErrorRedirect("Slack response missing team or user");
  }

  const ghUser = await getCurrentUser(accessToken);
  const githubUserId = ghUser.id;

  try {
    if (mode === "install") {
      if (!oauth.access_token || !oauth.bot_user_id) {
        return slackErrorRedirect("Slack install missing bot token");
      }
      // Resolve the installer's Slack handle with the bot token we just
      // received. Best-effort — falls back to user_id in the UI.
      const slackUserName = await fetchSlackUserName(
        oauth.access_token,
        authedUser.id,
      );
      await convexClient().mutation(api.slack.recordInstall, {
        secret: secretKey(),
        githubUserId,
        teamId: team.id,
        teamName: team.name,
        botToken: oauth.access_token,
        botUserId: oauth.bot_user_id,
        installerSlackUserId: authedUser.id,
        installerSlackUserName: slackUserName,
      });
    } else {
      // Look up the bot token for this team so we can resolve the linking
      // user's handle. If the install doesn't exist, the link itself still
      // works — we just won't have a friendly name.
      const install = await convexClient().query(api.slack.getInstallByTeamId, {
        secret: secretKey(),
        teamId: team.id,
      });
      const slackUserName = install
        ? await fetchSlackUserName(install.botToken, authedUser.id)
        : undefined;
      await convexClient().mutation(api.slack.linkSlackUser, {
        secret: secretKey(),
        githubUserId,
        teamId: team.id,
        slackUserId: authedUser.id,
        slackUserName,
        makeActive: true,
      });
    }

    // Connecting Slack is itself opt-in — flip the digest on.
    await convexClient().mutation(api.users.enableNotifications, {
      secret: secretKey(),
      githubUserId,
    });
  } catch (err) {
    return slackErrorRedirect((err as Error).message);
  }

  const res = NextResponse.redirect(appUrl("/settings?slack=connected"));
  res.cookies.delete("slack_oauth_state");
  return res;
}
