import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { api, convexClient, secretKey } from "@/lib/convex";
import {
  AUTH_CODE_TTL_SECONDS,
  DEFAULT_SCOPE,
  randomToken,
} from "@/lib/mcp-oauth";

const CSRF_COOKIE = "rfc123_mcp_csrf";

/**
 * OAuth 2.1 authorization endpoint. Two phases:
 *
 *   1. GET → if the user is not signed into RFC123, bounce them to the
 *      NextAuth GitHub flow with a callbackUrl that returns here. If they
 *      are signed in, show a minimal consent screen.
 *
 *   2. POST (consent) → mint an authorization code in Convex and 302 to
 *      the client's redirect_uri with `?code=...&state=...`.
 *
 * PKCE (S256) is required: we reject requests without `code_challenge`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const validated = await validateRequest(params);
  if ("error" in validated) {
    return validated.error;
  }

  const session = await auth();

  if (!session || !(session as { accessToken?: string })?.accessToken) {
    // Round-trip through NextAuth, then come back to this same URL.
    const callback = new URL(request.url);
    const signIn = new URL("/api/auth/signin", url.origin);
    signIn.searchParams.set("callbackUrl", callback.toString());
    redirect(signIn.toString());
  }

  const sessionUser = (
    session as { user?: { name?: string; email?: string; image?: string } }
  ).user;

  // CSRF: mint a per-consent token, set as SameSite=Strict HttpOnly cookie,
  // and embed in the form. The POST handler requires both to match. Without
  // this, a SameSite=Lax NextAuth session cookie permits cross-origin POSTs
  // to forge consent.
  const csrfToken = randomToken(24);
  const response = new NextResponse(
    consentHtml({
      clientName: validated.clientName,
      redirectUri: validated.redirectUri,
      scope: validated.scope ?? DEFAULT_SCOPE,
      userName: sessionUser?.name ?? sessionUser?.email ?? "your account",
      userAvatar: sessionUser?.image,
      params: {
        response_type: "code",
        client_id: validated.clientId,
        redirect_uri: validated.redirectUri,
        scope: validated.scope ?? DEFAULT_SCOPE,
        ...(validated.state !== null ? { state: validated.state } : {}),
        code_challenge: validated.codeChallenge,
        code_challenge_method: "S256",
        csrf_token: csrfToken,
      },
    }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
  response.cookies.set(CSRF_COOKIE, csrfToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: url.protocol === "https:",
    path: "/api/mcp-oauth/authorize",
    maxAge: 10 * 60,
  });
  return response;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const params = new URLSearchParams();
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") params.set(k, v);
  }

  const validated = await validateRequest(params);
  if ("error" in validated) {
    return validated.error;
  }

  // CSRF check: form value must match the cookie we set on GET. SameSite=Strict
  // means the cookie won't accompany cross-origin POSTs at all in modern
  // browsers; the form-match check is belt-and-suspenders for older ones.
  const cookieStore = await cookies();
  const cookieCsrf = cookieStore.get(CSRF_COOKIE)?.value ?? null;
  const formCsrf = form.get("csrf_token");
  if (
    typeof formCsrf !== "string" ||
    !cookieCsrf ||
    formCsrf !== cookieCsrf ||
    formCsrf.length < 16
  ) {
    return errorPage(
      "invalid_request",
      "CSRF check failed. Please re-open the consent screen.",
    );
  }

  const session = await auth();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!session || !accessToken) {
    return errorPage(
      "access_denied",
      "Your RFC123 session has expired. Sign in again, then re-authorize.",
    );
  }

  const decision = form.get("decision");
  if (decision !== "allow") {
    return errorRedirect(
      validated.redirectUri,
      validated.state,
      "access_denied",
      "User declined consent",
    );
  }

  // Resolve the user's Convex row from the GitHub profile we re-derive on
  // every request (so we don't depend on stale NextAuth JWT shape).
  const { Octokit } = await import("octokit");
  const octokit = new Octokit({ auth: accessToken });
  const { data: gh } = await octokit.rest.users.getAuthenticated();
  const userRow = await convexClient().query(api.users.getByGithubUserId, {
    secret: secretKey(),
    githubUserId: gh.id,
  });
  if (!userRow) {
    return errorPage(
      "server_error",
      "Your RFC123 account is missing. Sign out and back in, then re-authorize.",
    );
  }

  const code = randomToken(32);
  await convexClient().mutation(api.mcpOAuth.createAuthCode, {
    secret: secretKey(),
    code,
    clientId: validated.clientId,
    userId: userRow._id,
    redirectUri: validated.redirectUri,
    codeChallenge: validated.codeChallenge,
    codeChallengeMethod: "S256",
    scope: validated.scope,
    expiresAt: Date.now() + AUTH_CODE_TTL_SECONDS * 1000,
  });

  const redirectUrl = new URL(validated.redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (validated.state) redirectUrl.searchParams.set("state", validated.state);
  return NextResponse.redirect(redirectUrl.toString(), 302);
}

type ValidatedRequest = {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state: string | null;
  scope: string | undefined;
  codeChallenge: string;
};

async function validateRequest(
  params: URLSearchParams,
): Promise<ValidatedRequest | { error: NextResponse }> {
  const responseType = params.get("response_type");
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const state = params.get("state");
  const scope = params.get("scope") ?? undefined;
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");

  // Per RFC 6749 §4.1.2.1: only `client_id` / `redirect_uri` errors render
  // to the user. Once those validate, all other errors are returned via a
  // redirect to the client's `redirect_uri` so the client app can handle
  // them. This avoids the client hanging on our error page.
  if (!clientId) {
    return { error: errorPage("invalid_request", "client_id is required") };
  }
  if (!redirectUri) {
    return { error: errorPage("invalid_request", "redirect_uri is required") };
  }

  const client = await convexClient().query(api.mcpOAuth.getClient, {
    secret: secretKey(),
    clientId,
  });
  if (!client) {
    return { error: errorPage("invalid_client", "Unknown client_id") };
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return {
      error: errorPage("invalid_request", "redirect_uri not registered"),
    };
  }

  if (responseType !== "code") {
    return {
      error: errorRedirect(
        redirectUri,
        state,
        "unsupported_response_type",
        "Only response_type=code is supported",
      ),
    };
  }
  if (!codeChallenge) {
    return {
      error: errorRedirect(
        redirectUri,
        state,
        "invalid_request",
        "code_challenge is required (PKCE)",
      ),
    };
  }
  if (codeChallengeMethod !== "S256") {
    return {
      error: errorRedirect(
        redirectUri,
        state,
        "invalid_request",
        "code_challenge_method must be S256",
      ),
    };
  }

  return {
    clientId,
    clientName: client.clientName,
    redirectUri,
    state,
    scope,
    codeChallenge,
  };
}

function errorPage(code: string, description: string) {
  const body = `${SHARED_STYLE}
<body>
  <main class="wrap">
    <a class="brand" href="/">RFC123</a>
    <div class="card">
      <div class="eyebrow"><span class="dot dot-magenta"></span>OAuth error · ${escapeHtml(code)}</div>
      <h1>Something stopped your authorization.</h1>
      <p class="lede">${escapeHtml(description)}</p>
      <div class="actions">
        <a href="/" class="btn btn-primary">Back to RFC123</a>
      </div>
    </div>
  </main>
</body>`;
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OAuth error · RFC123</title></head>${body}</html>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function errorRedirect(
  redirectUri: string,
  state: string | null,
  code: string,
  description: string,
) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", code);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString(), 302);
}

/**
 * Shared styles for OAuth screens. Inlined because these are raw HTML route
 * handlers – they don't get Tailwind or next/font automatically. Color tokens
 * mirror globals.css so the consent flow feels like part of the app.
 */
const SHARED_STYLE = `<style>
  @font-face {
    font-family: "Lastik";
    src: url("/fonts/L-Regular.woff2") format("woff2");
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: "Lastik";
    src: url("/fonts/L-Bold.woff2") format("woff2");
    font-weight: 700;
    font-style: normal;
    font-display: swap;
  }
  :root {
    --background: #f9f9fb;
    --surface: #ffffff;
    --foreground: #1a1a1f;
    --gray-5: #f8f8f9;
    --gray-10: #f0f0f2;
    --gray-20: #e1e1e3;
    --gray-30: #c9c9cc;
    --gray-40: #b0b0b3;
    --gray-50: #87878c;
    --gray-70: #525257;
    --cyan: #5b9eb5;
    --cyan-light: #ebf5f8;
    --magenta: #c4567a;
    --magenta-light: #f5ebef;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--background);
    color: var(--foreground);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    font-feature-settings: "kern" 1, "liga" 1;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    line-height: 1.5;
  }
  .wrap {
    max-width: 32rem;
    margin: 3rem auto 4rem;
    padding: 0 1.5rem;
  }
  .brand {
    display: inline-block;
    font-family: "Lastik", Georgia, serif;
    font-size: 2rem;
    font-weight: 400;
    letter-spacing: -0.02em;
    color: var(--foreground);
    text-decoration: none;
    margin-bottom: 1.5rem;
    transition: opacity 0.15s;
  }
  .brand:hover { opacity: 0.7; }
  .card {
    background: var(--surface);
    border: 1px solid var(--gray-20);
    border-radius: 6px;
    padding: 1.75rem;
  }
  .eyebrow {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gray-50);
    margin-bottom: 1.25rem;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
  }
  .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .dot-cyan { background: var(--cyan); }
  .dot-magenta { background: var(--magenta); }
  h1 {
    font-family: "Lastik", Georgia, serif;
    font-weight: 400;
    font-size: 1.875rem;
    line-height: 1.1;
    letter-spacing: -0.02em;
    margin: 0 0 0.75rem;
    color: var(--foreground);
  }
  h1 .client {
    font-style: italic;
  }
  .lede {
    margin: 0 0 1.25rem;
    font-size: 0.9375rem;
    color: var(--gray-70);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.875rem;
    border: 1px solid var(--gray-20);
    border-radius: 6px;
    background: var(--gray-5);
    font-size: 0.8125rem;
    color: var(--gray-70);
    margin-bottom: 1.5rem;
  }
  .who img {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid var(--gray-20);
  }
  .who strong { color: var(--foreground); font-weight: 600; }
  .perms-label {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--gray-50);
    margin: 0 0 0.625rem;
  }
  .perms {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
    font-size: 0.875rem;
    color: var(--foreground);
  }
  .perms li {
    position: relative;
    padding: 0.375rem 0 0.375rem 1.25rem;
  }
  .perms li + li {
    border-top: 1px dashed var(--gray-20);
  }
  .perms li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.875rem;
    width: 8px;
    height: 1px;
    background: var(--magenta);
    opacity: 0.7;
  }
  .footnote {
    font-size: 0.8125rem;
    color: var(--gray-70);
    background: var(--cyan-light);
    border: 1px solid color-mix(in srgb, var(--cyan) 30%, transparent);
    border-radius: 6px;
    padding: 0.625rem 0.875rem;
    margin: 0 0 1.5rem;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .btn {
    font: inherit;
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    transition: opacity 0.15s, background 0.15s;
    border: 1px solid var(--gray-30);
    background: var(--surface);
    color: var(--foreground);
  }
  .btn:hover { background: var(--gray-5); }
  .btn-primary {
    background: var(--foreground);
    color: var(--surface);
    border-color: var(--foreground);
  }
  .btn-primary:hover { background: var(--foreground); opacity: 0.85; }
  .meta {
    margin: 1.25rem 0 0;
    padding-top: 1rem;
    border-top: 1px solid var(--gray-20);
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 11px;
    color: var(--gray-50);
    line-height: 1.55;
    word-break: break-all;
  }
  .meta-row { display: flex; gap: 0.5rem; align-items: baseline; }
  .meta-row + .meta-row { margin-top: 0.375rem; }
  .meta-label {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--gray-40);
    flex-shrink: 0;
  }
  .meta-value { color: var(--gray-70); }
  code {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    background: var(--gray-10);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
    font-size: 0.85em;
    color: var(--foreground);
  }
  *:focus-visible {
    outline: 2px solid var(--cyan);
    outline-offset: 2px;
  }
</style>`;

function consentHtml(input: {
  clientName: string;
  redirectUri: string;
  scope: string;
  userName: string;
  userAvatar?: string;
  params: Record<string, string>;
}): string {
  const hiddenFields = Object.entries(input.params)
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`,
    )
    .join("");

  const redirectHost = (() => {
    try {
      return new URL(input.redirectUri).host;
    } catch {
      return input.redirectUri;
    }
  })();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Authorize ${escapeHtml(input.clientName)} · RFC123</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
${SHARED_STYLE}
</head>
<body>
  <main class="wrap">
    <a class="brand" href="/">RFC123</a>
    <div class="card">
      <div class="eyebrow">
        <span class="dot dot-cyan"></span>
        Authorize MCP client
      </div>
      <h1>Let <span class="client">${escapeHtml(input.clientName)}</span> act on RFC123 as you?</h1>
      <p class="lede">An agent is asking for permission to use RFC123 on your behalf.</p>

      <div class="who">
        ${input.userAvatar ? `<img src="${escapeHtml(input.userAvatar)}" alt="">` : ""}
        <span>Signed in as <strong>${escapeHtml(input.userName)}</strong></span>
      </div>

      <p class="perms-label">What it can do</p>
      <ul class="perms">
        <li>List and read RFCs in repositories you have access to</li>
        <li>Post comments, replies, and reviews on RFCs</li>
        <li>Create new RFCs (branches and pull requests)</li>
        <li>Approve, request changes, merge, close, or reopen RFCs</li>
      </ul>

      <p class="footnote">Every comment or RFC body posted via MCP gets a <code>– via ${escapeHtml(input.clientName)} on RFC123</code> footer.</p>

      <form method="POST" action="/api/mcp-oauth/authorize">
        ${hiddenFields}
        <div class="actions">
          <button type="submit" name="decision" value="deny" class="btn">Decline</button>
          <button type="submit" name="decision" value="allow" class="btn btn-primary">Authorize</button>
        </div>
      </form>

      <div class="meta">
        <div class="meta-row">
          <span class="meta-label">Redirect to</span>
          <span class="meta-value">${escapeHtml(redirectHost)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Scope</span>
          <span class="meta-value">${escapeHtml(input.scope)}</span>
        </div>
      </div>
    </div>
  </main>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
