import { ConvexHttpClient } from "convex/browser";
import { getCurrentUser } from "@/lib/github";
import { encryptToken } from "@/lib/token-crypto";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

export { api } from "../../convex/_generated/api";

/**
 * Resolve the viewer's Convex `users` row from their GitHub access token.
 * Returns null when the user has signed in but Convex doesn't have a row yet
 * (rare – the JWT callback upserts on sign-in). Callers that *need* the row
 * to exist should error out on null, or use `loadOrCreateViewerUserRow`.
 */
export async function loadViewerUserRow(
  accessToken: string,
): Promise<Doc<"users"> | null> {
  const ghUser = await getCurrentUser(accessToken);
  return await convexClient().query(api.users.getByGithubUserId, {
    secret: secretKey(),
    githubUserId: ghUser.id,
  });
}

/**
 * Like `loadViewerUserRow`, but lazily creates the row when it doesn't exist.
 * Use from write paths that *need* a row to attach data to – legacy sessions
 * from before the JWT-callback upsert shipped won't have one until the user
 * signs back in, and silently skipping the write strands their data.
 */
export async function loadOrCreateViewerUserRow(
  accessToken: string,
): Promise<Doc<"users">> {
  const ghUser = await getCurrentUser(accessToken);
  const existing = await convexClient().query(api.users.getByGithubUserId, {
    secret: secretKey(),
    githubUserId: ghUser.id,
  });
  if (existing) return existing;
  await convexClient().mutation(api.users.upsertFromGithub, {
    secret: secretKey(),
    githubUserId: ghUser.id,
    githubLogin: ghUser.login,
    githubAccessToken: await encryptToken(accessToken),
  });
  const created = await convexClient().query(api.users.getByGithubUserId, {
    secret: secretKey(),
    githubUserId: ghUser.id,
  });
  if (!created) {
    // Should be impossible: we just upserted under the same id. Surface loudly
    // rather than continuing with a null we already established shouldn't be.
    throw new Error(
      `[loadOrCreateViewerUserRow] upsert succeeded but row not found for githubUserId=${ghUser.id}`,
    );
  }
  return created;
}

/**
 * Convex HTTP client for use from Next.js server routes. The Next.js side
 * holds the shared secret; pass `secretKey()` as the first arg to every
 * Convex function (queries and mutations enforce it).
 */
let _client: ConvexHttpClient | null = null;
export function convexClient(): ConvexHttpClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  _client = new ConvexHttpClient(url);
  return _client;
}

export function secretKey(): string {
  const secret = process.env.SECRET_KEY;
  if (!secret) throw new Error("SECRET_KEY is not set");
  return secret;
}
