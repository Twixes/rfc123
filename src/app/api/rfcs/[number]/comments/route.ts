import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOctokit } from "@/lib/github";
import type { Comment } from "@/lib/github";

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
    const octokit = await getOctokit(
      (session as unknown as { accessToken: string }).accessToken,
    );

    // Get review comments
    const { data: reviewComments } =
      await octokit.rest.pulls.listReviewComments({
        owner,
        repo,
        pull_number: Number(number),
      });

    // Get issue comments
    const { data: issueComments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: Number(number),
    });

    const comments: Comment[] = [
      ...reviewComments.map((c) => ({
        id: c.id,
        user: c.user?.login || "unknown",
        userAvatar: c.user?.avatar_url || "",
        body: c.body || "",
        createdAt: c.created_at,
        path: c.path,
        line: c.line || c.original_line,
        diffHunk: c.diff_hunk,
      })),
      ...issueComments.map((c) => ({
        id: c.id,
        user: c.user?.login || "unknown",
        userAvatar: c.user?.avatar_url || "",
        body: c.body || "",
        createdAt: c.created_at,
      })),
    ];

    // Sort by created date
    comments.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    return NextResponse.json(comments);
  } catch (error) {
    console.error("Error fetching comments:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 },
    );
  }
}
