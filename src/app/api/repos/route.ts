import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { api, convexClient, secretKey } from "@/lib/convex";
import {
  getCurrentUser,
  listReposWithRFCs,
  type RepoOption,
} from "@/lib/github";

export async function GET() {
  const session = await auth();

  if (!(session as { accessToken?: string })?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accessToken = (session as unknown as { accessToken: string })
      .accessToken;
    const [adopted, viewer] = await Promise.all([
      listReposWithRFCs(accessToken),
      // Single Convex round-trip: resolve the viewer + their pending repos.
      // Best-effort – an outage shouldn't take the repos list down.
      (async () => {
        try {
          const ghUser = await getCurrentUser(accessToken);
          return await convexClient().query(api.repos.viewerWithPendingRepos, {
            secret: secretKey(),
            githubUserId: ghUser.id,
          });
        } catch (e) {
          console.error("[/api/repos] pending adoption lookup failed:", e);
          return { user: null, repos: [] };
        }
      })(),
    ]);

    const adoptedKeys = new Set(adopted.map((r) => r.fullName));
    const pendingOptions: RepoOption[] = [];
    for (const row of viewer.repos) {
      // Hide rows that resolved (the sweep will surface merged repos) or where
      // the sweep already picked the repo up ahead of the row cleanup.
      if (!row.pendingAdoption || row.pendingAdoption.resolvedAt) continue;
      if (adoptedKeys.has(row.fullName)) continue;
      pendingOptions.push({
        owner: row.owner,
        name: row.name,
        fullName: row.fullName,
        canPush: true,
        pendingAdoption: {
          prNumber: row.pendingAdoption.prNumber,
          prUrl: row.pendingAdoption.prUrl,
          layout: row.layout,
        },
      });
    }
    return NextResponse.json([...adopted, ...pendingOptions]);
  } catch (error) {
    console.error("Error fetching repos:", error);
    return NextResponse.json(
      { error: "Failed to fetch repos" },
      { status: 500 },
    );
  }
}
