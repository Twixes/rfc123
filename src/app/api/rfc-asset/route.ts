import { auth } from "@/auth";
import { contentTypeForAsset } from "@/lib/asset-mime";
import { getOctokit } from "@/lib/github";
import { normalizeRepoPath } from "@/lib/markdown-assets";

// MIME types browsers execute scripts in when opened as a top-level document.
// Anything matching gets a `Content-Disposition: attachment` so a malicious
// SVG checked into a repo cannot run JS in the rfc123 origin via direct
// navigation to /api/rfc-asset?...
const EXECUTABLE_MIME_PREFIXES = [
  "image/svg",
  "text/html",
  "application/xhtml",
];
function isExecutableMime(mime: string): boolean {
  const lower = mime.toLowerCase();
  return EXECUTABLE_MIME_PREFIXES.some((p) => lower.startsWith(p));
}

export async function GET(request: Request) {
  const session = await auth();
  const accessToken = (session as { accessToken?: string })?.accessToken;

  if (!accessToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const ref = searchParams.get("ref");
  const pathParam = searchParams.get("path");

  if (!owner || !repo || !ref || !pathParam) {
    return new Response("Missing owner, repo, ref, or path", { status: 400 });
  }

  const path = normalizeRepoPath(pathParam);
  if (!path) {
    return new Response("Invalid path", { status: 400 });
  }

  try {
    const octokit = await getOctokit(accessToken);
    const fileResp = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner,
        repo,
        path,
        ref,
      },
    );

    const data = fileResp.data as {
      type?: string;
      encoding?: string;
      content?: string;
      sha?: string;
    };

    if (data.type !== "file" || !data.sha) {
      return new Response("Not a file", { status: 404 });
    }

    // Contents API returns empty content for files >1MB; fall back to Git Blob API.
    const base64 =
      data.encoding === "base64" && data.content
        ? data.content
        : (
            await octokit.rest.git.getBlob({
              owner,
              repo,
              file_sha: data.sha,
            })
          ).data.content;

    const buffer = Buffer.from(base64, "base64");
    const contentType = contentTypeForAsset(buffer, path);

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    };
    if (isExecutableMime(contentType)) {
      // Browsers ignore Content-Disposition for `<img src>` so embedding still
      // works; top-level navigation downloads instead of executing.
      headers["Content-Disposition"] = 'attachment; filename="asset"';
    }

    return new Response(new Uint8Array(buffer), { headers });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      return new Response("Not found", { status: 404 });
    }
    console.error("[rfc-asset]", err);
    return new Response("Failed to fetch asset", { status: 502 });
  }
}
