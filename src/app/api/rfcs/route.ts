import { NextResponse } from "next/server";
import { auth, getAccessToken } from "@/auth";
import {
  createRFC,
  getCurrentUser,
  getCurrentUserLogin,
  getGrantedScopes,
  listAllRFCs,
  listRFCs,
  loadRfcConfig,
} from "@/lib/github";
import { getPostHogServer } from "@/lib/posthog-server";
import { getReadToken } from "@/lib/public-access";
import { slugify } from "@/lib/slugify";

export async function GET(request: Request) {
  const session = await auth();
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const sessionToken = getAccessToken(session);

  if (!sessionToken && !(owner && repo)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [readToken, currentUserLogin, hasReadOrg] = await Promise.all([
      sessionToken ??
        (owner && repo ? getReadToken(session, owner, repo) : null),
      sessionToken ? getCurrentUserLogin(sessionToken) : "",
      sessionToken
        ? getGrantedScopes(sessionToken).then((s) => s.includes("read:org"))
        : false,
    ]);
    if (!readToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const headers =
      sessionToken && !hasReadOrg
        ? { "X-RFC123-Missing-Scopes": "read:org" }
        : undefined;
    const listOpts = {
      withTeamFields: hasReadOrg,
      deferInlineCommentCounts: true,
    };
    const rfcs =
      !owner || !repo
        ? await listAllRFCs(readToken, currentUserLogin, listOpts)
        : await listRFCs(readToken, owner, repo, currentUserLogin, listOpts);
    // Hide other people's drafts; keep the viewer's own so they can resume.
    const visibleRfcs = rfcs.filter(
      (rfc) => !rfc.isDraft || rfc.author === currentUserLogin,
    );
    return NextResponse.json(visibleRfcs, { headers });
  } catch (error) {
    console.error("Error fetching RFCs:", error);
    return NextResponse.json(
      { error: "Failed to fetch RFCs" },
      { status: 500 },
    );
  }
}

interface CreateRFCBody {
  owner?: string;
  repo?: string;
  title?: string;
  rfcBody?: string;
  prBody?: string;
  /** GitHub user logins to request review from. */
  users?: string[];
  /** Bare team slugs (no `org/` prefix) to request review from. */
  teams?: string[];
  draft?: boolean;
  /** For `layout: multi-directory` repos, the team subdirectory to commit into. */
  team?: string;
}

export async function POST(request: Request) {
  const session = await auth();

  if (!(session as { accessToken?: string })?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as CreateRFCBody;
  const {
    owner,
    repo,
    title,
    rfcBody,
    prBody,
    users = [],
    teams = [],
    draft = false,
    team,
  } = body;

  if (!owner || !repo || !title?.trim() || !rfcBody?.trim()) {
    return NextResponse.json(
      { error: "owner, repo, title, and rfcBody are required" },
      { status: 400 },
    );
  }

  const slug = slugify(title);
  if (!slug) {
    return NextResponse.json(
      { error: "Title must produce a non-empty slug" },
      { status: 400 },
    );
  }

  const teamTrimmed =
    typeof team === "string" && team.trim() ? team.trim() : undefined;

  try {
    const accessToken = (session as unknown as { accessToken: string })
      .accessToken;
    // Multi-directory repos require a team; otherwise rfcFilePath silently
    // omits the segment and the RFC lands at the directory root.
    const config = await loadRfcConfig(accessToken, owner, repo);
    if (config.layout === "multi-directory" && !teamTrimmed) {
      return NextResponse.json(
        { error: "This repo uses a per-team layout; `team` is required." },
        { status: 400 },
      );
    }

    const user = await getCurrentUser(accessToken);

    const result = await createRFC({
      accessToken,
      owner,
      repo,
      title: title.trim(),
      rfcBody,
      prBody: prBody ?? "",
      slug,
      username: user.login,
      reviewers: users.filter((r): r is string => typeof r === "string"),
      teamReviewers: teams.filter((r): r is string => typeof r === "string"),
      draft,
      team: teamTrimmed,
    });

    getPostHogServer()?.capture({
      distinctId: user.login,
      event: "rfc_created",
      properties: {
        draft,
        owner,
        repo,
        reviewer_count: users.length,
        team_reviewer_count: teams.length,
        user_login: user.login,
      },
    });

    return NextResponse.json({ ...result, slug });
  } catch (error) {
    const err = error as Error & { code?: string; status?: number };
    console.error("Error creating RFC:", err);
    if (err.code === "no_write_access" || err.status === 403) {
      return NextResponse.json(
        { error: "You don't have write access to this repository." },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: err.message || "Failed to create RFC" },
      { status: 500 },
    );
  }
}
