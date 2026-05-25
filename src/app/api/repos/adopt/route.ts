import { NextResponse } from "next/server";
import { auth, getAccessToken } from "@/auth";
import {
  api,
  convexClient,
  loadOrCreateViewerUserRow,
  secretKey,
} from "@/lib/convex";
import { adoptRfcRepo, type RfcLayout } from "@/lib/github";
import { VALID_GITHUB_REPO_NAME } from "@/lib/rfc-config";

interface AdoptRepoBody {
  owner?: string;
  name?: string;
  layout?: RfcLayout;
}

export async function POST(request: Request) {
  const accessToken = getAccessToken(await auth());
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as AdoptRepoBody;
  const owner = body.owner?.trim();
  const name = body.name?.trim();
  const layout: RfcLayout =
    body.layout === "multi-directory" ? "multi-directory" : "flat";
  if (!owner || !name) {
    return NextResponse.json(
      { error: "owner and name are required" },
      { status: 400 },
    );
  }
  if (!VALID_GITHUB_REPO_NAME.test(name)) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
  try {
    // Adoption and the viewer-row lookup are independent – run them together
    // so the Convex round-trip doesn't extend the request beyond GitHub's
    // latency floor. Errors from either propagate to the 500 branch below –
    // surfacing a real failure beats showing the user a phantom pending UI
    // that the picker can't track.
    const [result, userRow] = await Promise.all([
      adoptRfcRepo({ accessToken, owner, name, layout }),
      loadOrCreateViewerUserRow(accessToken),
    ]);

    if (result.status === "pending") {
      await convexClient().mutation(api.repos.upsertPendingAdoption, {
        secret: secretKey(),
        userId: userRow._id,
        owner: result.owner,
        name: result.name,
        fullName: result.fullName,
        layout,
        prNumber: result.pr.number,
        prUrl: result.pr.url,
        branchName: result.pr.branchName,
        defaultBranch: result.pr.defaultBranch,
      });
      return NextResponse.json({
        status: "pending",
        owner: result.owner,
        name: result.name,
        fullName: result.fullName,
        pr: result.pr,
      });
    }

    // `alreadyAdopted` means the file was already on the default branch when
    // we tried – no prior pending row to clear, so skip the Convex hit.
    if (!result.alreadyAdopted) {
      await convexClient().mutation(api.repos.clearAdoption, {
        secret: secretKey(),
        userId: userRow._id,
        owner: result.owner,
        name: result.name,
      });
    }

    return NextResponse.json({
      status: "adopted",
      owner: result.owner,
      name: result.name,
      fullName: result.fullName,
      alreadyAdopted: result.alreadyAdopted,
    });
  } catch (error) {
    const err = error as Error & { status?: number; code?: string };
    console.error("Error adopting RFC repo:", err);
    if (err.code === "no_write_access" || err.status === 403) {
      return NextResponse.json(
        {
          error:
            "You don't have write access to this repository, so .rfc123.json can't be committed there. Ask a maintainer to add the file or grant you push access.",
        },
        { status: 403 },
      );
    }
    if (err.status === 404) {
      return NextResponse.json(
        { error: "Repository not found." },
        { status: 404 },
      );
    }
    // err.message can include raw GitHub response excerpts (branch protection
    // rule names, internal IDs) – return a generic message; server logs above
    // retain the detail.
    return NextResponse.json(
      { error: "Couldn't add this repo. Please try again." },
      { status: 500 },
    );
  }
}
