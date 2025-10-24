import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRFCDetail } from "@/lib/github";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const session = await auth();
  const { number } = await params;

  if (!(session as { accessToken?: string })?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing owner or repo parameter" },
      { status: 400 },
    );
  }

  try {
    const rfc = await getRFCDetail(
      (session as unknown as { accessToken: string }).accessToken,
      owner,
      repo,
      Number(number),
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
