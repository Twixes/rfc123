import { ConvexHttpClient } from "convex/browser";

export { api } from "../../convex/_generated/api";

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
