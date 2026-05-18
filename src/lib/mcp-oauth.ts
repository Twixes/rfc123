import { createHash, randomBytes } from "node:crypto";

export function issuerUrl(): string {
  const url =
    process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return url.replace(/\/$/, "");
}

export function resourceUrl(): string {
  return `${issuerUrl()}/mcp`;
}

export function randomToken(byteLen = 32): string {
  return randomBytes(byteLen)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** RFC 7636 §4.2 — base64url(SHA-256(verifier)). */
export function pkceS256(verifier: string): string {
  return createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export const SUPPORTED_SCOPES = ["mcp"] as const;
export const DEFAULT_SCOPE = "mcp";

/**
 * Access tokens last 24h. TODO: implement refresh tokens — without them,
 * clients re-run the full PKCE flow daily, which Claude.ai handles but with
 * a visible browser pop. Kept short until then to bound blast radius of a
 * leaked token (we don't yet have a /revoke HTTP endpoint either).
 */
export const ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60;

/** Authorization-code lifetime: 10 minutes (RFC 6749 §4.1.2 SHOULD ≤ 10m). */
export const AUTH_CODE_TTL_SECONDS = 10 * 60;
