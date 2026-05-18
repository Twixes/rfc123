import { describe, expect, it } from "vitest";
import {
  AUTH_CODE_TTL_SECONDS,
  pkceS256,
  randomToken,
  SUPPORTED_SCOPES,
  sha256Hex,
} from "./mcp-oauth";

/**
 * These are the pure pieces of the MCP OAuth machinery – no network, no DB.
 * Together they cover the parts where a bug would silently break security:
 * PKCE validation, opaque-token entropy, and TTL constants.
 */

describe("pkceS256", () => {
  it("matches the RFC 7636 example", () => {
    // RFC 7636 §4.6 reference vector.
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(pkceS256(verifier)).toBe(challenge);
  });

  it("is deterministic", () => {
    const v = "abc123";
    expect(pkceS256(v)).toBe(pkceS256(v));
  });

  it("differs between distinct verifiers", () => {
    expect(pkceS256("a")).not.toBe(pkceS256("b"));
  });
});

describe("randomToken", () => {
  it("produces URL-safe output (no =, +, or /)", () => {
    for (let i = 0; i < 50; i++) {
      const t = randomToken();
      expect(t).not.toMatch(/[=+/]/);
    }
  });

  it("emits >= 128 bits of entropy at the default size", () => {
    // Base64url of 32 bytes is 43 chars. Sanity-check that we're not
    // accidentally truncating below the OAuth 2.1 minimum.
    const t = randomToken();
    expect(t.length).toBeGreaterThanOrEqual(43);
  });

  it("doesn't repeat across 1000 calls", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(randomToken());
    expect(set.size).toBe(1000);
  });
});

describe("sha256Hex", () => {
  it("matches the known SHA-256 of 'abc'", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("constants", () => {
  it("keeps auth codes short-lived (RFC 6749 §4.1.2 SHOULD ≤ 10 min)", () => {
    expect(AUTH_CODE_TTL_SECONDS).toBeLessThanOrEqual(10 * 60);
  });

  it("exposes the mcp scope", () => {
    expect(SUPPORTED_SCOPES).toContain("mcp");
  });
});
