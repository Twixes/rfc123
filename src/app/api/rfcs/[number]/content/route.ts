import { type NextRequest, NextResponse } from "next/server";
import { auth, getAccessToken } from "@/auth";
import {
  ContentConflictError,
  ForbiddenError,
  getBlobContent,
  updateRFCContent,
} from "@/lib/github";
import {
  generateRfcCommitMessage,
  MAX_COMMIT_MESSAGE_BYTES,
} from "@/lib/rfc-commit-message";

const MAX_BODY_BYTES = 1_000_000;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  const session = await auth();
  const accessToken = getAccessToken(session);
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const githubLogin =
    (session as { githubLogin?: string } | null)?.githubLogin ?? undefined;

  const { number } = await params;
  const prNumber = Number.parseInt(number, 10);
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  if (!owner || !repo || !Number.isFinite(prNumber)) {
    return NextResponse.json({ error: "Missing owner/repo" }, { status: 400 });
  }

  const payload = (await request.json()) as {
    body?: string;
    commitMessage?: string;
    baseFileSha?: string;
    markdownFilePath?: string;
  };
  const body = typeof payload.body === "string" ? payload.body : null;
  const baseFileSha =
    typeof payload.baseFileSha === "string" ? payload.baseFileSha : null;
  const providedMessage =
    typeof payload.commitMessage === "string" && payload.commitMessage.trim()
      ? payload.commitMessage.trim()
      : null;
  const markdownFilePath =
    typeof payload.markdownFilePath === "string"
      ? payload.markdownFilePath
      : undefined;
  if (body == null || !baseFileSha || !markdownFilePath) {
    return NextResponse.json(
      { error: "Missing body, baseFileSha or markdownFilePath" },
      { status: 400 },
    );
  }
  if (Buffer.byteLength(body, "utf-8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "RFC body too large" }, { status: 413 });
  }
  if (
    providedMessage &&
    Buffer.byteLength(providedMessage, "utf-8") > MAX_COMMIT_MESSAGE_BYTES
  ) {
    return NextResponse.json(
      { error: "Commit message too long" },
      { status: 400 },
    );
  }

  // No commit message from the author → summarize the edit with an LLM. We
  // recover the pre-edit body from the blob the client was editing against
  // (`baseFileSha`) so the diff is computed entirely server-side. This runs as
  // a promise so `updateRFCContent` can do its author/file-lookup preflight
  // concurrently and only await the message right before writing. The
  // generator caps its own length and falls back to a generic message; neither
  // it nor `getBlobContent` rejects, so the promise is safe to leave pending.
  const commitMessage: string | Promise<string> =
    providedMessage ??
    getBlobContent(accessToken, owner, repo, baseFileSha).then((previousBody) =>
      generateRfcCommitMessage({
        previousBody,
        body,
        markdownFilePath,
        githubLogin,
      }),
    );

  try {
    const result = await updateRFCContent(accessToken, owner, repo, prNumber, {
      path: markdownFilePath,
      content: body,
      message: commitMessage,
      baseFileSha,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { error: "Only the RFC author can edit its contents." },
        { status: 403 },
      );
    }
    if (error instanceof ContentConflictError) {
      return NextResponse.json(
        {
          error:
            "This RFC has new commits on GitHub since you started editing.",
          kind: "conflict",
        },
        { status: 409 },
      );
    }
    console.error("Error updating RFC content:", error);
    return NextResponse.json(
      { error: "Failed to update RFC content" },
      { status: 500 },
    );
  }
}
