import { NextResponse } from "next/server";
import { auth, getAccessToken } from "@/auth";
import { api, convexClient, loadViewerUserRow, secretKey } from "@/lib/convex";
import { finalizeAdoptedRepo, getAdoptionPrStatus } from "@/lib/github";
import { VALID_GITHUB_REPO_NAME } from "@/lib/rfc-config";

export async function GET(request: Request) {
  const accessToken = getAccessToken(await auth());
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const owner = url.searchParams.get("owner")?.trim();
  const name = url.searchParams.get("name")?.trim();
  if (!owner || !name || !VALID_GITHUB_REPO_NAME.test(name)) {
    return NextResponse.json(
      { error: "owner and name are required" },
      { status: 400 },
    );
  }

  try {
    const userRow = await loadViewerUserRow(accessToken);
    if (!userRow) {
      return NextResponse.json({ status: "missing" });
    }

    const repoRow = await convexClient().query(api.repos.getForUserRepo, {
      secret: secretKey(),
      userId: userRow._id,
      owner,
      name,
    });
    if (!repoRow?.pendingAdoption) {
      return NextResponse.json({ status: "missing" });
    }

    const pending = repoRow.pendingAdoption;
    const pr = await getAdoptionPrStatus(
      accessToken,
      owner,
      name,
      pending.prNumber,
    );

    if (pr.state === "merged") {
      await finalizeAdoptedRepo(accessToken, owner, name, repoRow.layout);
      await convexClient().mutation(api.repos.clearAdoption, {
        secret: secretKey(),
        userId: userRow._id,
        owner,
        name,
      });
      return NextResponse.json({
        status: "adopted",
        owner,
        name,
        fullName: repoRow.fullName,
        pr,
      });
    }

    if (pr.state === "closed") {
      await convexClient().mutation(api.repos.resolvePendingAdoption, {
        secret: secretKey(),
        userId: userRow._id,
        owner,
        name,
        resolution: "closed",
      });
      return NextResponse.json({
        status: "closed",
        owner,
        name,
        fullName: repoRow.fullName,
        pr,
      });
    }

    return NextResponse.json({
      status: "pending",
      owner,
      name,
      fullName: repoRow.fullName,
      layout: repoRow.layout,
      pr: {
        number: pending.prNumber,
        url: pending.prUrl,
        branchName: pending.branchName,
        defaultBranch: pending.defaultBranch,
      },
    });
  } catch (error) {
    console.error("Error checking adoption PR status:", error);
    return NextResponse.json(
      { error: "Couldn't check adoption status." },
      { status: 500 },
    );
  }
}
