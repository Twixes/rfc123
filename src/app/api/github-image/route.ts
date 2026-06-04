import { auth, getAccessToken } from "@/auth";
import { getPublicGitHubToken } from "@/lib/public-access";

const ALLOWED_HOSTS = new Set([
  "github.com",
  "private-user-images.githubusercontent.com",
]);

// Hosts GitHub's user-attachment endpoints legitimately redirect to. The first
// hop carries the user's OAuth token; redirects beyond it MUST NOT – undici's
// `fetch` does not strip `Authorization` on cross-origin redirects, so we follow
// manually and re-issue without credentials.
const REDIRECT_FOLLOW_HOSTS = new Set([
  "objects.githubusercontent.com",
  "private-user-images.githubusercontent.com",
  "github-cloud.s3.amazonaws.com",
  "github-production-user-asset-6210df.s3.amazonaws.com",
]);

// Cap on proxied response bytes. Tight enough to neutralize bandwidth-amplification
// abuse, loose enough for any reasonable issue/PR attachment (GitHub's UI limit is 10MB).
const MAX_PROXY_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

// Anything that browsers will execute scripts in must be forced to download
// rather than render same-origin via top-level navigation.
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
  // Anonymous viewers fall back to the public token; the host allowlist
  // below keeps the proxy scoped to GitHub regardless of which token wins.
  const accessToken = getAccessToken(session) ?? getPublicGitHubToken();
  if (!accessToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  if (
    !ALLOWED_HOSTS.has(parsed.hostname) ||
    (parsed.hostname === "github.com" &&
      !parsed.pathname.startsWith("/user-attachments/"))
  ) {
    return new Response("URL not allowed", { status: 403 });
  }

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

  try {
    // First hop: GitHub. Sends the user's token because the attachment URL
    // is access-controlled by GitHub. This MUST NOT follow redirects with the
    // Authorization header attached – undici does not strip credentials on
    // cross-origin redirects, and GitHub will 302 to S3 / Azure Blob storage.
    const first = await fetch(targetUrl, {
      headers: { Authorization: `token ${accessToken}` },
      redirect: "manual",
      signal: ac.signal,
    });

    let response = first;
    if (first.status >= 300 && first.status < 400) {
      const location = first.headers.get("location");
      if (!location) {
        return new Response("Bad redirect", { status: 502 });
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, targetUrl);
      } catch {
        return new Response("Bad redirect target", { status: 502 });
      }
      if (!REDIRECT_FOLLOW_HOSTS.has(nextUrl.hostname)) {
        return new Response("Redirect target not allowed", { status: 502 });
      }
      // Re-fetch WITHOUT the Authorization header. The signed object-storage
      // URL already carries its own short-lived authorization.
      response = await fetch(nextUrl.toString(), {
        redirect: "follow",
        signal: ac.signal,
      });
    }

    if (!response.ok) {
      return new Response("Failed to fetch image", { status: response.status });
    }

    const lengthHeader = response.headers.get("Content-Length");
    if (lengthHeader) {
      const declared = Number.parseInt(lengthHeader, 10);
      if (Number.isFinite(declared) && declared > MAX_PROXY_BYTES) {
        return new Response("Asset too large", { status: 413 });
      }
    }

    const upstreamType =
      response.headers.get("Content-Type") || "application/octet-stream";
    const headers: Record<string, string> = {
      "Content-Type": upstreamType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    };
    // Force download for anything browsers would execute when opened in a tab –
    // prevents same-origin XSS via attacker-controlled SVG uploads to GitHub.
    if (isExecutableMime(upstreamType)) {
      headers["Content-Disposition"] = 'attachment; filename="asset"';
    }

    // Stream the body but enforce the byte cap defensively for upstreams that
    // omit Content-Length.
    const reader = response.body?.getReader();
    if (!reader) return new Response(null, { headers });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let total = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_PROXY_BYTES) {
              controller.error(new Error("Asset exceeded byte cap"));
              await reader.cancel();
              return;
            }
            controller.enqueue(value);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });

    return new Response(stream, { headers });
  } catch {
    return new Response("Failed to fetch image", { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
