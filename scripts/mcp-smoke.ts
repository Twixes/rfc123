/**
 * End-to-end smoke test for the RFC123 MCP server.
 *
 * Usage:
 *   pnpm dev          # in one terminal, after `npx convex dev`
 *   pnpm exec tsx scripts/mcp-smoke.ts http://localhost:3000
 *
 * Walks the OAuth 2.1 + DCR flow programmatically up to the /authorize step
 * (which needs a human's GitHub session), prints the URL to open, waits for
 * an auth code on stdin, then exchanges it for a Bearer token and calls a
 * couple of MCP tools. This is the script the user would run end-to-end to
 * verify the deployment works; CI integration is a follow-up.
 */
import { createHash, randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function main() {
  const origin = process.argv[2] ?? "http://localhost:3000";

  console.log(`> Discovering metadata at ${origin}`);
  const prMeta = await (
    await fetch(`${origin}/.well-known/oauth-protected-resource`)
  ).json();
  console.log("  protected-resource:", prMeta);
  const asUrl = prMeta.authorization_servers?.[0];
  if (!asUrl) throw new Error("No authorization_servers in PR metadata");

  const asMeta = await (
    await fetch(`${asUrl}/.well-known/oauth-authorization-server`)
  ).json();
  console.log("  auth-server:", asMeta);

  console.log(`> Registering a client at ${asMeta.registration_endpoint}`);
  const reg = await fetch(asMeta.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "rfc123 smoke test",
      redirect_uris: [`${origin}/_mcp_smoke_redirect`],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp",
    }),
  }).then((r) => r.json());
  console.log("  registered client:", reg.client_id);

  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(
    createHash("sha256").update(codeVerifier).digest(),
  );
  const state = base64url(randomBytes(16));

  const authorizeUrl = new URL(asMeta.authorization_endpoint);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", reg.client_id);
  authorizeUrl.searchParams.set(
    "redirect_uri",
    `${origin}/_mcp_smoke_redirect`,
  );
  authorizeUrl.searchParams.set("scope", "mcp");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  console.log("");
  console.log("> Open this URL in a browser signed into RFC123:");
  console.log(`  ${authorizeUrl.toString()}`);
  console.log("");
  console.log(
    "> After consenting, your browser will be redirected to a URL like:",
  );
  console.log(`  ${origin}/_mcp_smoke_redirect?code=...&state=...`);
  console.log("> Paste the full redirect URL here:");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const redirected = (await rl.question("redirect url: ")).trim();
  rl.close();
  const parsed = new URL(redirected);
  const code = parsed.searchParams.get("code");
  const returnedState = parsed.searchParams.get("state");
  if (!code) throw new Error("No code in redirect URL");
  if (returnedState !== state) throw new Error("state mismatch");

  console.log(`> Exchanging code at ${asMeta.token_endpoint}`);
  const tokenResp = await fetch(asMeta.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}/_mcp_smoke_redirect`,
      client_id: reg.client_id,
      code_verifier: codeVerifier,
    }),
  });
  if (!tokenResp.ok) {
    console.error("  token endpoint failed:", await tokenResp.text());
    process.exit(1);
  }
  const tokenJson = await tokenResp.json();
  console.log("  got token, expires_in:", tokenJson.expires_in);

  console.log("");
  console.log("> Calling MCP `initialize` …");
  const init = await fetch(`${origin}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${tokenJson.access_token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "mcp-smoke", version: "0.0.1" },
      },
    }),
  });
  console.log("  initialize status:", init.status);
  const initBody = await init.text();
  console.log("  initialize body (truncated):", initBody.slice(0, 400));

  console.log("");
  console.log("> Calling `tools/list` to enumerate the registered tools …");
  const toolsList = await fetch(`${origin}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${tokenJson.access_token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }),
  });
  console.log("  tools/list status:", toolsList.status);
  console.log(
    "  tools/list body (truncated):",
    (await toolsList.text()).slice(0, 800),
  );

  console.log("");
  console.log("> Calling tool `rfc123_list_repos_with_rfcs` …");
  const listRepos = await fetch(`${origin}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${tokenJson.access_token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "rfc123_list_repos_with_rfcs", arguments: {} },
    }),
  });
  console.log("  list_repos status:", listRepos.status);
  console.log(
    "  list_repos body (truncated):",
    (await listRepos.text()).slice(0, 600),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
