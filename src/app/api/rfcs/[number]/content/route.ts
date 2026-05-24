import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ContentConflictError,
  ForbiddenError,
  updateRFCContent,
} from "@/lib/github";

const MAX_BODY_BYTES = 1_000_000;
const MAX_COMMIT_MESSAGE_BYTES = 1024;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  const session = await auth();
  if (!(session as { accessToken?: string })?.accessToken) {
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

  const payload = (await request.json()) as {
    body?: string;
    commitMessage?: string;
    baseFileSha?: string;
  };
  const body = typeof payload.body === "string" ? payload.body : null;
  const baseFileSha =
    typeof payload.baseFileSha === "string" ? payload.baseFileSha : null;
  const commitMessage =
    typeof payload.commitMessage === "string" && payload.commitMessage.trim()
      ? payload.commitMessage.trim()
      : "Update RFC";
  if (body == null || !baseFileSha) {
    return NextResponse.json(
      { error: "Missing body or baseFileSha" },
      { status: 400 },
    );
  }
  if (Buffer.byteLength(body, "utf-8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "RFC body too large" }, { status: 413 });
  }
  if (Buffer.byteLength(commitMessage, "utf-8") > MAX_COMMIT_MESSAGE_BYTES) {
    return NextResponse.json(
      { error: "Commit message too long" },
      { status: 400 },
    );
  }

  try {
    const result = await updateRFCContent(
      (session as unknown as { accessToken: string }).accessToken,
      owner,
      repo,
      prNumber,
      { content: body, message: commitMessage, baseFileSha },
    );
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
