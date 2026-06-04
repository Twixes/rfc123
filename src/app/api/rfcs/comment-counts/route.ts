import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchInlineCommentCounts } from "@/lib/github";
import { getReadToken } from "@/lib/public-access";

export async function GET(request: Request) {
  const session = await auth();
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const numbersParam = searchParams.get("numbers");

  if (!owner || !repo || !numbersParam) {
    return NextResponse.json(
      { error: "owner, repo, and numbers are required" },
      { status: 400 },
    );
  }

  const prNumbers = numbersParam
    .split(",")
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => !Number.isNaN(n));

  if (prNumbers.length === 0) {
    return NextResponse.json({});
  }

  const readToken = await getReadToken(session, owner, repo);
  if (!readToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const counts = await fetchInlineCommentCounts(
      readToken,
      owner,
      repo,
      prNumbers,
    );
    return NextResponse.json(counts);
  } catch (error) {
    console.error("Error fetching comment counts:", error);
    return NextResponse.json(
      { error: "Failed to fetch comment counts" },
      { status: 500 },
    );
  }
}
