import { CompactEncrypt, compactDecrypt } from "jose";

/**
 * Envelope encryption for GitHub OAuth tokens at rest in Convex. The token
 * never leaves Next.js in plaintext: we encrypt on the way into Convex and
 * decrypt on the way out. Convex stores opaque ciphertext; a Convex breach
 * (or a leaked SECRET_KEY) yields ciphertext that cannot be replayed against
 * GitHub without the separately-held TOKEN_ENCRYPTION_KEY.
 *
 * Format: a JWE Compact Serialization with `alg=dir`, `enc=A256GCM`, and a
 * `kid` header set to the active key id. The `kid` slot is what makes key
 * rotation cheap later — register a second key under a new id, start
 * encrypting with the new one, keep decrypting with both while you sweep old
 * rows. `jose`'s `compactDecrypt` looks up the key via the resolver below.
 *
 * We use `jose` rather than hand-rolling AES-GCM so the on-disk format is a
 * documented standard (RFC 7516) and the AEAD plumbing is library-tested.
 */

const ENC = "A256GCM";
const ALG = "dir";
const ACTIVE_KID = "v1";

let cachedKeys: Map<string, Uint8Array> | null = null;

function loadKeys(): Map<string, Uint8Array> {
  if (cachedKeys) return cachedKeys;
  const b64 = process.env.TOKEN_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Generate with `openssl rand -base64 32`.",
    );
  }
  const raw = Buffer.from(b64, "base64");
  if (raw.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  const map = new Map<string, Uint8Array>();
  map.set(ACTIVE_KID, new Uint8Array(raw));
  // Rotation hook: each retired key gets its own env var so decrypt still
  // works for rows that haven't been re-encrypted yet. Uncomment and rename
  // when you rotate.
  //   const prev = process.env.TOKEN_ENCRYPTION_KEY_V0;
  //   if (prev) map.set("v0", new Uint8Array(Buffer.from(prev, "base64")));
  cachedKeys = map;
  return map;
}

/**
 * JWE Compact Serialization is exactly five base64url segments joined by `.`.
 * Any other shape is treated as a legacy plaintext token (rows written before
 * encryption shipped). Once every row is encrypted this fallback can go.
 */
function looksLikeJwe(s: string): boolean {
  return s.split(".").length === 5;
}

export async function encryptToken(plaintext: string): Promise<string> {
  if (!plaintext) throw new Error("encryptToken called with empty plaintext");
  const keys = loadKeys();
  const key = keys.get(ACTIVE_KID);
  if (!key) throw new Error(`No key registered for kid=${ACTIVE_KID}`);
  return await new CompactEncrypt(new TextEncoder().encode(plaintext))
    .setProtectedHeader({ alg: ALG, enc: ENC, kid: ACTIVE_KID })
    .encrypt(key);
}

export async function decryptToken(stored: string): Promise<string> {
  if (!looksLikeJwe(stored)) {
    // Legacy plaintext row, written before this module existed. Returned as-is
    // so calls don't break mid-migration. New writes always produce JWE.
    return stored;
  }
  const keys = loadKeys();
  const { plaintext } = await compactDecrypt(stored, (header) => {
    const kid = typeof header.kid === "string" ? header.kid : undefined;
    const k = kid ? keys.get(kid) : undefined;
    if (!k) throw new Error(`No key registered for kid=${kid ?? "<missing>"}`);
    return k;
  });
  return new TextDecoder().decode(plaintext);
}

/** True if `stored` is in the encrypted-at-rest format. */
export function isEncryptedToken(stored: string): boolean {
  return looksLikeJwe(stored);
}
