import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Comment } from "@/lib/github";
import { getOctokit } from "@/lib/github";
import { fetchReactionsForCommentNodes } from "@/lib/reactions";

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

    // Paginate so PRs with >30 inline comments don't drop later ones –
    // missing parents would also break reply-threading in groupIntoThreads.
    const [reviewComments, issueComments] = await Promise.all([
      octokit.paginate(octokit.rest.pulls.listReviewComments, {
        owner,
        repo,
        pull_number: Number(number),
        per_page: 100,
      }),
      octokit.paginate(octokit.rest.issues.listComments, {
        owner,
        repo,
        issue_number: Number(number),
        per_page: 100,
      }),
    ]);

    const comments: Comment[] = [
      ...reviewComments.map((c) => ({
        id: c.id,
        nodeId: c.node_id,
        user: c.user?.login || "unknown",
        userAvatar: c.user?.avatar_url || "",
        body: c.body || "",
        createdAt: c.created_at,
        path: c.path,
        line: c.line || c.original_line,
        diffHunk: c.diff_hunk,
        inReplyToId: c.in_reply_to_id ?? undefined,
        // GitHub nulls `line` once the comment's anchor moves off the diff;
        // `original_line` still positions the comment, but it's outdated.
        outdated: c.line == null,
      })),
      ...issueComments.map((c) => ({
        id: c.id,
        nodeId: c.node_id,
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

    // Enrich with reactions in a single GraphQL call. Counts come from
    // `reactors.totalCount`; `viewerHasReacted` tells us which kinds the
    // current user has applied, so we can render toggle state correctly.
    try {
      const nodeIds = comments
        .map((c) => c.nodeId)
        .filter((id): id is string => !!id);
      const reactionMap = await fetchReactionsForCommentNodes(octokit, nodeIds);
      for (const comment of comments) {
        if (!comment.nodeId) continue;
        const reactions = reactionMap.get(comment.nodeId);
        if (reactions) comment.reactions = reactions;
      }
    } catch (e) {
      // Don't fail the whole comments fetch over a reactions hiccup – the UI
      // degrades to "no reactions" and a refresh will retry.
      console.error("Failed to load reaction groups:", e);
    }

    return NextResponse.json(comments);
  } catch (error) {
    console.error("Error fetching comments:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 },
    );
  }
}
