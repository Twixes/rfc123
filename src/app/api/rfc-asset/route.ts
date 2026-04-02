import { auth } from "@/auth";
import { contentTypeForAsset } from "@/lib/asset-mime";
import { getOctokit } from "@/lib/github";
import { normalizeRepoPath } from "@/lib/markdown-assets";

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
      size?: number;
    };

    if (data.type !== "file" || data.encoding !== "base64" || !data.content) {
      return new Response("Not a file", { status: 404 });
    }

    const buffer = Buffer.from(data.content, "base64");
    const contentType = contentTypeForAsset(buffer, path);

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      return new Response("Not found", { status: 404 });
    }
    console.error("[rfc-asset]", err);
    return new Response("Failed to fetch asset", { status: 502 });
  }
}
