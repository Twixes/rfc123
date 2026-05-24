import { NextResponse } from "next/server";
import { auth, getAccessToken } from "@/auth";
import { createRfcRepo, type RfcLayout } from "@/lib/github";
import { VALID_GITHUB_REPO_NAME } from "@/lib/rfc-config";

interface CreateRepoBody {
  owner?: string;
  name?: string;
  isOrg?: boolean;
  visibility?: "private" | "public";
  layout?: RfcLayout;
  teams?: string[];
}

export async function POST(request: Request) {
  const accessToken = getAccessToken(await auth());
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as CreateRepoBody;
  const owner = body.owner?.trim();
  const name = body.name?.trim();
  const visibility = body.visibility === "public" ? "public" : "private";
  const layout: RfcLayout =
    body.layout === "multi-directory" ? "multi-directory" : "flat";
  const teams = Array.isArray(body.teams)
    ? body.teams.filter((t): t is string => typeof t === "string")
    : [];
  if (!owner || !name) {
    return NextResponse.json(
      { error: "owner and name are required" },
      { status: 400 },
    );
  }
  if (!VALID_GITHUB_REPO_NAME.test(name)) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
  if (layout === "multi-directory" && teams.length === 0) {
    return NextResponse.json(
      { error: "Per-team layout needs at least one team" },
      { status: 400 },
    );
  }
  try {
    const result = await createRfcRepo({
      accessToken,
      owner,
      isOrg: !!body.isOrg,
      name,
      visibility,
      layout,
      teams,
    });
    return NextResponse.json(result);
  } catch (error) {
    const err = error as Error & { status?: number; message?: string };
    console.error("Error creating RFC repo:", err);
    // 403 usually means the org's OAuth-app policy hasn't approved RFC123,
    // or the org restricted repo creation. Surface the approval URL so the
    // user has a one-click path to fix it instead of seeing a generic error.
    if (err.status === 403) {
      return NextResponse.json(
        {
          error:
            "GitHub blocked creating this repo. The org may need to approve RFC123 in its OAuth app policy, or you may not have permission to create repos there.",
          approvalUrl: `https://github.com/organizations/${owner}/settings/oauth_application_policy`,
        },
        { status: 403 },
      );
    }
    if (err.status === 422) {
      return NextResponse.json(
        { error: err.message ?? "Repo name is not allowed." },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: err.message ?? "Failed to create repo" },
      { status: 500 },
    );
  }
}
