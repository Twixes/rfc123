import { auth } from "@/auth";

const ALLOWED_HOSTS = new Set([
  "github.com",
  "private-user-images.githubusercontent.com",
]);

export async function GET(request: Request) {
  const session = await auth();
  const accessToken = (session as { accessToken?: string })?.accessToken;

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

  try {
    const response = await fetch(targetUrl, {
      headers: {
        Authorization: `token ${accessToken}`,
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return new Response("Failed to fetch image", { status: response.status });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Failed to fetch image", { status: 502 });
  }
}
