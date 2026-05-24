import { NextResponse } from "next/server";
import { auth, getAccessToken } from "@/auth";
import { listWritableRepos, searchAccessibleRepos } from "@/lib/github";

/**
 * Query params:
 *  - `q` (optional): live search via `searchAccessibleRepos`. Fans out one
 *    `user:<login>`-scoped GitHub search per owner the viewer belongs to,
 *    which is what makes private org repos surface (the unscoped repo-search
 *    index hides them even from people who can read them).
 *  - `filter=adoptable` (optional): only return repos the viewer can push to
 *    that don't already have `.rfc123.json`.
 *  - `limit` (optional): truncate the response.
 *
 * Without `q`, returns the cached `listWritableRepos` sweep – used by the
 * create-RFC picker and by the modal's initial "recents" load.
 */
export async function GET(request: Request) {
  const accessToken = getAccessToken(await auth());
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const adoptable = url.searchParams.get("filter") === "adoptable";
  const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = limitParam > 0 ? limitParam : null;

  try {
    if (q) {
      const matches = await searchAccessibleRepos(accessToken, q, {
        limit: limit ?? 20,
        adoptableOnly: adoptable,
      });
      return NextResponse.json(matches);
    }

    let result = await listWritableRepos(accessToken);
    if (adoptable) {
      result = result.filter((r) => r.canPush && !r.hasRFCs);
    }
    if (limit) result = result.slice(0, limit);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching writable repos:", error);
    return NextResponse.json(
      { error: "Failed to fetch writable repos" },
      { status: 500 },
    );
  }
}
