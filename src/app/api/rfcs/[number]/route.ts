import { NextResponse } from "next/server";
import { auth, getAccessToken } from "@/auth";
import { getCurrentUserLogin, getRFCDetail } from "@/lib/github";
import { getReadToken } from "@/lib/public-access";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const session = await auth();
  const { number } = await params;
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing owner or repo parameter" },
      { status: 400 },
    );
  }

  const readToken = await getReadToken(session, owner, repo);
  if (!readToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // currentUserLogin is only used to derive `reviewRequested` for the viewer.
  // For anonymous (public-token) reads there's no viewer, so leave it empty.
  const sessionToken = getAccessToken(session);
  const currentUserLogin = sessionToken
    ? await getCurrentUserLogin(sessionToken)
    : "";

  try {
    const rfc = await getRFCDetail(
      readToken,
      owner,
      repo,
      Number(number),
      currentUserLogin,
    );
    return NextResponse.json(rfc);
  } catch (error) {
    console.error("Error fetching RFC detail:", error);
    return NextResponse.json(
      { error: "Failed to fetch RFC detail" },
      { status: 500 },
    );
  }
}
