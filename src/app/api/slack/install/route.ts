import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildInstallUrl, buildLinkUrl, slackRedirectUri } from "@/lib/slack";

/**
 * Kick off Slack OAuth. Two modes via `?mode=install|link`:
 *   - install: full bot install (workspace admin grants scopes)
 *   - link:    user-only – links the current user to an already-installed
 *              workspace, no bot scopes needed
 *
 * We sign the state value (cookie + URL) so the callback can verify it
 * without needing server-side storage.
 */
export async function GET(req: Request) {
  const base = process.env.NEXTAUTH_URL;
  if (!base) {
    return NextResponse.json(
      { error: "NEXTAUTH_URL is not set" },
      { status: 500 },
    );
  }
  const session = await auth();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) {
    return NextResponse.redirect(new URL("/api/auth/signin", base));
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "link" ? "link" : "install";

  const csrf = crypto.randomBytes(16).toString("hex");
  const state = `${mode}:${csrf}`;

  const target = mode === "link" ? buildLinkUrl : buildInstallUrl;
  const slackUrl = target(slackRedirectUri(), state);

  const res = NextResponse.redirect(slackUrl);
  res.cookies.set("slack_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/slack",
    maxAge: 600,
  });
  return res;
}
