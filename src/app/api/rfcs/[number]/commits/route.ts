import { type NextRequest, NextResponse } from "next/server";
import { auth, getAccessToken } from "@/auth";
import { listRFCCommits } from "@/lib/github";

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
  if (!owner || !repo || !Number.isFinite(prNumber)) {
    return NextResponse.json({ error: "Missing owner/repo" }, { status: 400 });
  }
  try {
    const history = await listRFCCommits(accessToken, owner, repo, prNumber);
    return NextResponse.json(history);
  } catch (error) {
    console.error("Error listing RFC commits:", error);
    return NextResponse.json(
      { error: "Failed to list RFC commits" },
      { status: 500 },
    );
  }
}
