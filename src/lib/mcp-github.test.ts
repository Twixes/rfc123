import { describe, expect, it } from "vitest";
import { resolveRfcRef } from "./mcp-github";

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
