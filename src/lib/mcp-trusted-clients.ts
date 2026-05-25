/**
 * Hostname-suffix allowlist of MCP clients whose Dynamic Client Registration
 * we trust without manual review. Anything registering with a redirect_uri
 * outside this list is `verified: false` and gets a prominent warning on the
 * OAuth consent screen.
 *
 * This is intentionally conservative — the cost of falsely treating an
 * attacker-controlled client as verified is one-click account takeover, while
 * the cost of falsely treating a legitimate new client as unverified is one
 * checkbox of user friction. Add entries deliberately, after verifying the
 * domain is operated by the named vendor.
 */
const TRUSTED_HOST_SUFFIXES = [
  // --- Anthropic ---
  // Claude.ai web, Claude Desktop, Claude Code, Claude API console.
  "claude.ai",
  "claude.com",
  "anthropic.com",

  // --- OpenAI / ChatGPT ---
  // ChatGPT MCP connectors document OAuth callbacks at
  //   chatgpt.com/aip/{gpt-id}/oauth/callback
  //   chat.openai.com/aip/{gpt-id}/oauth/callback
  // chat.openai.com is matched via the openai.com suffix.
  "openai.com",
  "chatgpt.com",

  // --- Cursor IDE ---
  "cursor.com",
  "cursor.sh",

  // --- Windsurf (formerly Codeium) ---
  // codeium.com still resolves for legacy installs.
  "windsurf.com",
  "codeium.com",

  // --- Zed Industries (Zed editor) ---
  "zed.dev",

  // --- Continue.dev (open-source IDE assistant) ---
  "continue.dev",

  // --- Sourcegraph (Cody) ---
  "sourcegraph.com",

  // --- Raycast (MCP-enabled launcher) ---
  "raycast.com",

  // --- Replit (Replit Agent + MCP connectors) ---
  "replit.com",

  // --- Postman (MCP client and connector testing) ---
  "postman.com",

  // --- Local development / native IDEs ---
  // Loopback ports used by desktop apps and CLIs (Claude Code, Codex CLI,
  // Gemini CLI, Goose, Aider, etc.) for short-lived OAuth callbacks. These
  // are technically reachable by any local process, but at that point an
  // attacker already controls the box.
  "localhost",
  "127.0.0.1",
  "[::1]",
] as const;

/** True when `host` is exactly one of the trusted entries or a subdomain of one. */
function isTrustedHost(host: string): boolean {
  const lower = host.toLowerCase();
  return TRUSTED_HOST_SUFFIXES.some(
    (suffix) => lower === suffix || lower.endsWith(`.${suffix}`),
  );
}

/**
 * Decide whether a freshly-registered client should be marked `verified`.
 * Verified iff EVERY redirect_uri parses to a trusted host. One untrusted URI
 * (or one we can't parse) demotes the whole client to unverified.
 */
export function shouldAutoVerifyClient(redirectUris: string[]): boolean {
  if (redirectUris.length === 0) return false;
  for (const uri of redirectUris) {
    try {
      const parsed = new URL(uri);
      if (!isTrustedHost(parsed.hostname)) return false;
    } catch {
      return false;
    }
  }
  return true;
}
