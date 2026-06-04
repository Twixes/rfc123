import "server-only";

import { getAccessToken } from "@/auth";
import { getCachedJsonData, setCachedJsonData } from "./cache";
import { getOctokit } from "./github";

/**
 * Read-only fallback for unauthenticated visitors. The token never goes near
 * a write API; `getReadToken` only hands it out for *public* repos.
 */
function publicGitHubToken(): string | null {
  const token = process.env.PUBLIC_GITHUB_TOKEN;
  return typeof token === "string" && token.length > 0 ? token : null;
}

const REPO_VISIBILITY_TTL_SECONDS = 3600;
function repoVisibilityCacheKey(owner: string, repo: string): string {
  return `repo_visibility:v1:${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

/**
 * Probes GitHub for whether `owner/repo` is publicly accessible. Cached for
 * an hour. Returns false on any error (404, network, missing token) so a
 * misbehaving probe can't accidentally hand the public token to a private
 * repo path.
 */
export async function isRepoPublic(
  owner: string,
  repo: string,
): Promise<boolean> {
  const cacheKey = repoVisibilityCacheKey(owner, repo);
  const cached = await getCachedJsonData<boolean>(cacheKey);
  if (typeof cached === "boolean") return cached;

  const token = publicGitHubToken();
  if (!token) return false;

  try {
    const octokit = await getOctokit(token);
    const { data } = await octokit.rest.repos.get({ owner, repo });
    const isPublic = data.private === false;
    await setCachedJsonData(cacheKey, isPublic, REPO_VISIBILITY_TTL_SECONDS, {
      name: "isRepoPublic:repo_visibility",
    });
    return isPublic;
  } catch {
    return false;
  }
}

/**
 * Returns a GitHub token usable for *reads* against `owner/repo`: the
 * viewer's own token when signed in, the PUBLIC_GITHUB_TOKEN when the repo
 * is public, otherwise null (caller should 401). The returned token is
 * never safe for writes – the public path is shared across visitors.
 */
export async function getReadToken(
  session: unknown,
  owner: string,
  repo: string,
): Promise<string | null> {
  const viewerToken = getAccessToken(session);
  if (viewerToken) return viewerToken;
  if (!(await isRepoPublic(owner, repo))) return null;
  return publicGitHubToken();
}

/** Bare public token for callers that have already verified visibility
 *  upstream (e.g. the landing-page widget that hard-codes one repo). */
export function getPublicGitHubToken(): string | null {
  return publicGitHubToken();
}
