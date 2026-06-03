import { type NextRequest, NextResponse } from "next/server";
import { auth, getAccessToken } from "@/auth";
import { getRFCContentAt } from "@/lib/github";

const SHA_RE = /^[0-9a-f]{7,40}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  const session = await auth();
  const accessToken = getAccessToken(session);
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { number } = await params;
  const prNumber = Number.parseInt(number, 10);
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const sha = searchParams.get("sha");
  const path = searchParams.get("path");
  if (!owner || !repo || !Number.isFinite(prNumber) || !sha || !path) {
    return NextResponse.json(
      { error: "Missing owner/repo/sha/path" },
      { status: 400 },
    );
  }
  if (!SHA_RE.test(sha)) {
    return NextResponse.json({ error: "Invalid sha" }, { status: 400 });
  }
  try {
    const content = await getRFCContentAt(accessToken, owner, repo, sha, path);
    if (content == null) {
      return NextResponse.json(
        { error: "File not found at this commit" },
        { status: 404 },
      );
    }
    return NextResponse.json({ content });
  } catch (error) {
    console.error("Error fetching RFC content at sha:", error);
    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 },
    );
  }
}
