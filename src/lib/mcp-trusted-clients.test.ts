import { describe, expect, it } from "vitest";
import { shouldAutoVerifyClient } from "./mcp-trusted-clients";

describe("shouldAutoVerifyClient", () => {
  it("verifies Claude.ai callback", () => {
    expect(
      shouldAutoVerifyClient(["https://claude.ai/api/mcp/oauth/callback"]),
    ).toBe(true);
  });

  it("verifies Claude subdomain callback", () => {
    expect(shouldAutoVerifyClient(["https://api.claude.com/mcp/cb"])).toBe(
      true,
    );
  });

  it("verifies Cursor callback", () => {
    expect(shouldAutoVerifyClient(["https://cursor.com/mcp/cb"])).toBe(true);
  });

  it("verifies ChatGPT OAuth callback", () => {
    expect(
      shouldAutoVerifyClient([
        "https://chatgpt.com/aip/g-deadbeef/oauth/callback",
      ]),
    ).toBe(true);
    expect(
      shouldAutoVerifyClient([
        "https://chat.openai.com/aip/g-deadbeef/oauth/callback",
      ]),
    ).toBe(true);
  });

  it("verifies Windsurf and Codeium hosts", () => {
    expect(shouldAutoVerifyClient(["https://windsurf.com/cb"])).toBe(true);
    expect(shouldAutoVerifyClient(["https://codeium.com/cb"])).toBe(true);
  });

  it("verifies Zed, Continue, Sourcegraph, Raycast, Replit, Postman", () => {
    expect(shouldAutoVerifyClient(["https://zed.dev/oauth/cb"])).toBe(true);
    expect(shouldAutoVerifyClient(["https://continue.dev/cb"])).toBe(true);
    expect(shouldAutoVerifyClient(["https://sourcegraph.com/cody/cb"])).toBe(
      true,
    );
    expect(shouldAutoVerifyClient(["https://raycast.com/cb"])).toBe(true);
    expect(shouldAutoVerifyClient(["https://replit.com/cb"])).toBe(true);
    expect(shouldAutoVerifyClient(["https://www.postman.com/cb"])).toBe(true);
  });

  it("does NOT verify broad hosts that happen to host some agents", () => {
    // github.com / google.com / microsoft.com host all sorts of user content
    // and would be too dangerous to auto-trust as a class.
    expect(shouldAutoVerifyClient(["https://github.com/login/oauth/cb"])).toBe(
      false,
    );
    expect(shouldAutoVerifyClient(["https://google.com/oauth/cb"])).toBe(false);
    expect(shouldAutoVerifyClient(["https://copilot.microsoft.com/cb"])).toBe(
      false,
    );
  });

  it("verifies loopback (native IDE)", () => {
    expect(shouldAutoVerifyClient(["http://127.0.0.1:53219/cb"])).toBe(true);
    expect(shouldAutoVerifyClient(["http://localhost:53219/cb"])).toBe(true);
  });

  it("rejects lookalike domains", () => {
    expect(shouldAutoVerifyClient(["https://claude-ai.evil/cb"])).toBe(false);
    expect(shouldAutoVerifyClient(["https://claude.ai.evil.tld/cb"])).toBe(
      false,
    );
    expect(shouldAutoVerifyClient(["https://notclaude.ai/cb"])).toBe(false);
  });

  it("requires every redirect URI to be trusted", () => {
    expect(
      shouldAutoVerifyClient([
        "https://claude.ai/cb",
        "https://attacker.example/cb",
      ]),
    ).toBe(false);
  });

  it("rejects an empty list", () => {
    expect(shouldAutoVerifyClient([])).toBe(false);
  });

  it("rejects malformed URIs", () => {
    expect(shouldAutoVerifyClient(["not a url"])).toBe(false);
  });
});
