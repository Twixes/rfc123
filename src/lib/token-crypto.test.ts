import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptToken, encryptToken, isEncryptedToken } from "./token-crypto";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("token-crypto", () => {
  it("round-trips a typical GitHub OAuth token", async () => {
    const token = `gho_${"a".repeat(36)}`;
    const ct = await encryptToken(token);
    // JWE Compact serialization: 5 base64url segments separated by `.`
    expect(ct.split(".")).toHaveLength(5);
    expect(ct).not.toContain(token);
    expect(await decryptToken(ct)).toBe(token);
  });

  it("encodes the kid in the JWE header for rotation", async () => {
    const ct = await encryptToken("gho_x");
    // The protected header is the first segment, base64url-encoded JSON.
    const headerB64 = ct.split(".")[0];
    const header = JSON.parse(
      Buffer.from(headerB64, "base64url").toString("utf8"),
    );
    expect(header.alg).toBe("dir");
    expect(header.enc).toBe("A256GCM");
    expect(header.kid).toBe("v1");
  });

  it("produces a different ciphertext on each call (random IV)", async () => {
    const token = "gho_secret";
    const a = await encryptToken(token);
    const b = await encryptToken(token);
    expect(a).not.toBe(b);
  });

  it("passes through legacy plaintext tokens unchanged", async () => {
    const legacy = "ghp_legacyTokenStillWorks";
    expect(isEncryptedToken(legacy)).toBe(false);
    expect(await decryptToken(legacy)).toBe(legacy);
  });

  it("detects tampering via the AEAD tag", async () => {
    const ct = await encryptToken("gho_tampered");
    const segments = ct.split(".");
    // Flip the auth tag (last segment).
    segments[4] =
      segments[4].slice(0, -2) + (segments[4].endsWith("AA") ? "BB" : "AA");
    const flipped = segments.join(".");
    await expect(decryptToken(flipped)).rejects.toThrow();
  });
});
