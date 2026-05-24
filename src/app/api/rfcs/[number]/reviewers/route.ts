import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ForbiddenError,
  setRfcRequestedReviewers,
  TeamNoAccessError,
} from "@/lib/github";

export async function PUT(
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

  const body = (await request.json()) as {
    users?: unknown;
    teams?: unknown;
  };
  const users = Array.isArray(body.users)
    ? body.users.filter((u): u is string => typeof u === "string")
    : [];
  const teams = Array.isArray(body.teams)
    ? body.teams.filter((t): t is string => typeof t === "string")
    : [];

  try {
    const result = await setRfcRequestedReviewers(
      (session as unknown as { accessToken: string }).accessToken,
      owner,
      repo,
      prNumber,
      users,
      teams,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { error: "Only the RFC author can edit reviewers." },
        { status: 403 },
      );
    }
    if (error instanceof TeamNoAccessError) {
      return NextResponse.json(
        {
          error: `The team @${error.org}/${error.team} doesn't have access to ${error.org}/${error.repo}, so GitHub won't accept it as a reviewer.`,
          kind: "team_no_access",
          team: error.team,
          org: error.org,
          repo: error.repo,
        },
        { status: 422 },
      );
    }
    console.error("Error updating reviewers:", error);
    return NextResponse.json(
      { error: "Failed to update reviewers" },
      { status: 500 },
    );
  }
}
