/**
 * Server-secret guard for Convex public functions. We don't use Convex Auth
 * (yet) – the Next.js app calls Convex from server-only API routes that have
 * already authenticated the user via NextAuth, and passes a shared secret.
 *
 * The secret lives in two places:
 *   - process.env.SECRET_KEY on the Next.js side
 *   - Set via `npx convex env set SECRET_KEY <value>` on Convex
 */
export function requireSecret(provided: string): void {
  const expected = process.env.SECRET_KEY;
  if (!expected) {
    throw new Error(
      "SECRET_KEY is not configured on the Convex deployment.",
    );
  }
  if (provided !== expected) {
    throw new Error("Invalid server secret.");
  }
}
