import { ConvexHttpClient } from "convex/browser";
import { getCurrentUser } from "@/lib/github";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

export { api } from "../../convex/_generated/api";

/**
 * Resolve the viewer's Convex `users` row from their GitHub access token.
 * Returns null when the user has signed in but Convex doesn't have a row yet
 * (rare – the JWT callback upserts on sign-in). Callers that *need* the row
 * to exist should error out on null.
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
