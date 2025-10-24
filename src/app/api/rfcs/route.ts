import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listRFCs, listAllRFCs, getOctokit, getCurrentUserLogin } from "@/lib/github";
import { getCachedJsonData, setCachedJsonData } from "@/lib/cache";

export async function GET(request: Request) {
  const session = await auth();

  if (!(session as { accessToken?: string })?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  try {
    const accessToken = (session as unknown as { accessToken: string })
      .accessToken;
    const currentUserLogin = await getCurrentUserLogin(accessToken);
    // If no owner/repo specified, fetch from all repos
    if (!owner || !repo) {
      const rfcs = await listAllRFCs(accessToken, currentUserLogin);
      return NextResponse.json(rfcs);
    }

    // Otherwise fetch from specific repo
    const rfcs = await listRFCs(accessToken, owner, repo, currentUserLogin);
    return NextResponse.json(rfcs);
  } catch (error) {
    console.error("Error fetching RFCs:", error);
    return NextResponse.json(
      { error: "Failed to fetch RFCs" },
      { status: 500 },
    );
  }
}
