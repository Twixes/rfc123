/**
 * Slack OAuth + Web API helpers. Stays framework-agnostic and only depends
 * on `fetch`. The Slack app has two distinct OAuth modes the redirect URL
 * handles in one place:
 *
 *  - Install:  `scope=...` granted   → response has `team`, `bot_user_id`,
 *                                       `access_token` (xoxb-), and
 *                                       `authed_user.id` (the installer).
 *  - Link:     `user_scope=...` only → response has `team`, `authed_user.id`
 *                                       but no bot token.
 *
 * Distribution mode is "any workspace can install"; we record bot tokens
 * per-workspace and link a user to one Slack user_id per workspace.
 */

const SLACK_API = "https://slack.com/api";

/**
 * Externally-visible callback URL. We read `NEXTAUTH_URL` rather than
 * deriving from the incoming request: behind a tunnel/proxy (ngrok, Vercel
 * preview, etc.) Next.js sees `X-Forwarded-Proto: https` but keeps the
 * internal listening host, producing junk like `https://localhost:3000`.
 */
export function slackRedirectUri(): string {
  const base = process.env.NEXTAUTH_URL;
  if (!base) throw new Error("NEXTAUTH_URL is not set");
  return `${base.replace(/\/$/, "")}/api/slack/oauth/callback`;
}

export const SLACK_BOT_SCOPES = [
  "chat:write",
  "im:write",
  "users:read",
  "users:read.email",
  "team:read",
].join(",");

export const SLACK_USER_SCOPES = ["openid", "email", "profile"].join(",");

export interface SlackOAuthV2Response {
  ok: boolean;
  error?: string;
  app_id?: string;
  authed_user?: { id: string; access_token?: string; scope?: string };
  scope?: string;
  token_type?: string;
  access_token?: string;
  bot_user_id?: string;
  team?: { id: string; name: string };
  enterprise?: { id: string; name: string } | null;
}

export async function exchangeOAuthCode(
  code: string,
  redirectUri: string,
): Promise<SlackOAuthV2Response> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("SLACK_CLIENT_ID / SLACK_CLIENT_SECRET not configured");
  }
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });
  const res = await fetch(`${SLACK_API}/oauth.v2.access`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as SlackOAuthV2Response;
  if (!json.ok) {
    throw new Error(`Slack OAuth failed: ${json.error ?? "unknown"}`);
  }
  return json;
}

export function buildInstallUrl(redirectUri: string, state: string): string {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) throw new Error("SLACK_CLIENT_ID not configured");
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SLACK_BOT_SCOPES,
    user_scope: SLACK_USER_SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export function buildLinkUrl(redirectUri: string, state: string): string {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) throw new Error("SLACK_CLIENT_ID not configured");
  // No `scope` → user-only authorization, no bot install side-effect.
  const params = new URLSearchParams({
    client_id: clientId,
    user_scope: SLACK_USER_SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

/**
 * Resolve a Slack user_id to a human-readable handle. Prefers display name,
 * falls back to real name, then login. Returns undefined on any failure —
 * the caller should fall back to showing the raw user_id.
 */
export async function fetchSlackUserName(
  botToken: string,
  slackUserId: string,
): Promise<string | undefined> {
  try {
    const res = await fetch(
      `${SLACK_API}/users.info?user=${encodeURIComponent(slackUserId)}`,
      { headers: { Authorization: `Bearer ${botToken}` } },
    );
    const json = (await res.json()) as {
      ok: boolean;
      user?: {
        name?: string;
        real_name?: string;
        profile?: { display_name?: string; real_name?: string };
      };
    };
    if (!json.ok || !json.user) return undefined;
    const p = json.user.profile;
    return (
      p?.display_name ||
      p?.real_name ||
      json.user.real_name ||
      json.user.name ||
      undefined
    );
  } catch {
    return undefined;
  }
}

export interface PostMessageOptions {
  channel: string;
  text: string;
  blocks?: unknown[];
  unfurl_links?: boolean;
}

export async function postMessage(
  botToken: string,
  opts: PostMessageOptions,
): Promise<void> {
  const res = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify(opts),
  });
  const json = (await res.json()) as { ok: boolean; error?: string };
  if (!json.ok) {
    throw new Error(`Slack postMessage failed: ${json.error ?? "unknown"}`);
  }
}
