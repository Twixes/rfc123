import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ForbiddenError, updateRFCTitle } from "@/lib/github";

const MAX_TITLE_LENGTH = 256;

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

  const payload = (await request.json()) as { title?: string };
  const title = typeof payload.title === "string" ? payload.title.trim() : null;
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json({ error: "Title too long" }, { status: 400 });
  }

  try {
    const result = await updateRFCTitle(
      (session as unknown as { accessToken: string }).accessToken,
      owner,
      repo,
      prNumber,
      title,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { error: "Only the RFC author can edit its title." },
        { status: 403 },
      );
    }
    console.error("Error updating RFC title:", error);
    return NextResponse.json(
      { error: "Failed to update RFC title" },
      { status: 500 },
    );
  }
}
