/**
 * Pure path utilities for RFC markdown images. Safe to import from client components
 * (no Octokit / Node-only deps). Re-exported from `github.ts` for server code.
 */

/** Normalize a repo-relative path; rejects escape above repo root. */
export function normalizeRepoPath(path: string): string | null {
  const segments = path.split("/").filter(Boolean);
  const stack: string[] = [];
  for (const seg of segments) {
    if (seg === "..") {
      if (stack.length === 0) return null;
      stack.pop();
    } else if (seg !== ".") {
      stack.push(seg);
    }
  }
  return stack.join("/");
}

/**
 * Resolve a markdown image href relative to the RFC markdown file (GitHub behavior).
 * When there is no markdown file (body-only RFC), paths are relative to the repo root.
 */
export function resolveMarkdownImageRepoPath(
  markdownFilePath: string | null,
  href: string,
): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  const baseDir = markdownFilePath?.includes("/")
    ? markdownFilePath.slice(0, markdownFilePath.lastIndexOf("/"))
    : "";

  try {
    const base = `https://rfc-asset.invalid/${baseDir ? `${baseDir}/` : ""}`;
    const resolved = new URL(trimmed, base);
    const rawPath = resolved.pathname.replace(/^\//, "");
    return normalizeRepoPath(rawPath);
  } catch {
    return null;
  }
}

/** True for paths that should be resolved against the repo (not absolute http(s) URLs). */
export function isRelativeMarkdownAssetSrc(src: string): boolean {
  const s = src.trim();
  if (!s) return false;
  if (s.startsWith("//")) return false;
  return !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(s);
}

export interface RfcMarkdownImageAssets {
  owner: string;
  repo: string;
  headRef: string;
  markdownFilePath: string | null;
}

/** Proxy markdown image src for private repos and GitHub attachments. */
export function proxyMarkdownImageSrc(
  src: string,
  assets?: RfcMarkdownImageAssets | null,
): string {
  if (assets && isRelativeMarkdownAssetSrc(src)) {
    const repoPath = resolveMarkdownImageRepoPath(assets.markdownFilePath, src);
    if (repoPath) {
      return `/api/rfc-asset?owner=${encodeURIComponent(assets.owner)}&repo=${encodeURIComponent(assets.repo)}&ref=${encodeURIComponent(assets.headRef)}&path=${encodeURIComponent(repoPath)}`;
    }
  }
  try {
    const url = new URL(src);
    if (
      url.hostname === "github.com" &&
      url.pathname.startsWith("/user-attachments/")
    ) {
      return `/api/github-image?url=${encodeURIComponent(src)}`;
    }
  } catch {
    /* keep src */
  }
  return src;
}
