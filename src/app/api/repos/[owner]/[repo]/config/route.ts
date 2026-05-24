import { NextResponse } from "next/server";
import { auth, getAccessToken } from "@/auth";
import { listRepoTeamDirectories, loadRfcConfig } from "@/lib/github";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const accessToken = getAccessToken(await auth());
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { owner, repo } = await params;
  try {
    const config = await loadRfcConfig(accessToken, owner, repo);
    // For multi-directory layouts the team list is whatever directories exist
    // at the repo root – derived, never stored. Skip the call entirely for
    // flat repos since the picker won't show a team field.
    const teams =
      config.layout === "multi-directory"
        ? await listRepoTeamDirectories(accessToken, owner, repo)
        : [];
    return NextResponse.json({ ...config, teams });
  } catch (error) {
    console.error("Error loading RFC config:", error);
    return NextResponse.json(
      { error: "Failed to load RFC config" },
      { status: 500 },
    );
  }
}
