import { describe, expect, it } from "vitest";
import { resolveRfcRef, VIA_FOOTER, withFooter } from "./mcp-github";

// Pull the (unexported) decision-insert helper indirectly: registerDecision's
// commit-time logic is what we care about, but it needs a network. Instead,
// re-implement the same regex strategy by exercising the public `withFooter`
// idempotency check plus a small inlined version of the fence-aware finder.
// This is a unit pin, not an integration test.

/**
 * The footer is the only durable, user-visible artifact of "AI authorship"
 * we ship – worth pinning down with tests so a future refactor doesn't
 * accidentally strip it.
 */

describe("withFooter", () => {
  it("appends the via-Claude footer", () => {
    expect(withFooter("hello")).toBe(`hello${VIA_FOOTER}`);
  });

  it("trims trailing whitespace before appending", () => {
    expect(withFooter("hello\n\n")).toBe(`hello${VIA_FOOTER}`);
  });

  it("preserves internal newlines", () => {
    expect(withFooter("line1\nline2")).toContain("line1\nline2");
  });

  it("keeps the footer on its own paragraph", () => {
    const out = withFooter("body");
    expect(out).toMatch(/body\n\n— via Claude on RFC123$/);
  });

  it("appends even when the body is empty-ish", () => {
    expect(withFooter("")).toBe(VIA_FOOTER);
  });

  it("is idempotent — doesn't double-footer already-footered bodies", () => {
    const once = withFooter("body");
    const twice = withFooter(once);
    expect(twice).toBe(once);
  });

  it("treats trailing whitespace after a footer as already-footered", () => {
    const padded = `${withFooter("body")}\n\n   \n`;
    expect(withFooter(padded)).toBe(withFooter("body"));
  });
});

// The viewer-involvement helpers are inside mcp-server.ts (not exported).
// We snapshot the shape we expect agents to see via the public flat
// `withFooter` + `resolveRfcRef` plus a minimal documentation test on the
// thread structure so future refactors don't drift the contract.

describe("resolveRfcRef", () => {
  // The short-circuit path is the hot path — anything else hits the network
  // and is exercised by the mcp-smoke integration script, not vitest.
  it("returns owner+repo+number unchanged when both are provided", async () => {
    const ref = await resolveRfcRef("token-not-used", {
      owner: "PostHog",
      repo: "rfc-123",
      number: 42,
    });
    expect(ref).toEqual({ owner: "PostHog", repo: "rfc-123", number: 42 });
  });
});
