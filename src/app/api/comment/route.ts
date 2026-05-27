import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCurrentUserLogin, postComment } from "@/lib/github";
import { getPostHogServer } from "@/lib/posthog-server";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!(session as { accessToken?: string })?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { owner, repo, prNumber, body, path, line, replyToCommentId } =
    await request.json();

  if (!owner || !repo || !prNumber || !body) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  try {
    const accessToken = (session as unknown as { accessToken: string })
      .accessToken;
    await postComment(
      accessToken,
      owner,
      repo,
      prNumber,
      body,
      path,
      line,
      replyToCommentId,
    );
    getCurrentUserLogin(accessToken)
      .then((userLogin) => {
        getPostHogServer()?.capture({
          distinctId: userLogin,
          event: "comment_posted",
          properties: {
            is_inline: !!line,
            is_reply: replyToCommentId != null,
            owner,
            repo,
            rfc_number: prNumber,
          },
        });
      })
      .catch(() => {});
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error posting comment:", error);
    return NextResponse.json(
      { error: "Failed to post comment" },
      { status: 500 },
    );
  }
}
