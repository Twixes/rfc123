import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { searchReviewers } from "@/lib/mcp-github";

/**
 * Unified reviewer search (users + teams). Used by the per-RFC reviewer
 * picker, which scopes results to the RFC repo's owning org so suggestions
 * actually have access to the repo.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!(session as { accessToken?: string })?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const org = searchParams.get("org")?.trim() ?? "";

  if (query.length < 2) return NextResponse.json([]);

  try {
    const results = await searchReviewers({
      accessToken: (session as unknown as { accessToken: string }).accessToken,
      query,
      org: org || undefined,
      limit: 20,
    });
    return NextResponse.json(results);
  } catch (error) {
    console.error("Error searching reviewers:", error);
    return NextResponse.json(
      { error: "Failed to search reviewers" },
      { status: 500 },
    );
  }
}
