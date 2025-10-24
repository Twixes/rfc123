import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { postComment } from "@/lib/github";

export async function POST(request: Request) {
  const session = await auth();

  if (!(session as { accessToken?: string })?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { owner, repo, prNumber, body: commentBody, path, line } = body;

  if (!owner || !repo || !prNumber || !commentBody) {
    return NextResponse.json(
      { error: "Missing required parameters" },
      { status: 400 },
    );
  }

  try {
    await postComment(
      (session as unknown as { accessToken: string }).accessToken,
      owner,
      repo,
      prNumber,
      commentBody,
      path,
      line,
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error posting comment:", error);
    return NextResponse.json(
      { error: "Failed to post comment" },
      { status: 500 },
    );
  }
}
