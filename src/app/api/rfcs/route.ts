import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createRFC,
  getCurrentUser,
  getCurrentUserLogin,
  getGrantedScopes,
  listAllRFCs,
  listRFCs,
} from "@/lib/github";
import { slugify } from "@/lib/slugify";

export async function GET(request: Request) {
  const session = await auth();

  if (!(session as { accessToken?: string })?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  try {
    const accessToken = (session as unknown as { accessToken: string })
      .accessToken;
    const [currentUserLogin, scopes] = await Promise.all([
      getCurrentUserLogin(accessToken),
      getGrantedScopes(accessToken),
    ]);
    const hasReadOrg = scopes.includes("read:org");
    // Sentinel header the client reads to decide whether to render the
    // "please re-auth for full features" banner. We still return RFCs in
    // the degraded mode – direct review requests work; team-requested ones
    // are silently dropped until the user signs back in with `read:org`.
    const headers = hasReadOrg
      ? undefined
      : { "X-RFC123-Missing-Scopes": "read:org" };
    const listOpts = {
      withTeamFields: hasReadOrg,
      // List page loads counts progressively via GET /api/rfcs/comment-counts.
      deferInlineCommentCounts: true,
    };
    const rfcs =
      !owner || !repo
        ? await listAllRFCs(accessToken, currentUserLogin, listOpts)
        : await listRFCs(accessToken, owner, repo, currentUserLogin, listOpts);
    return NextResponse.json(rfcs, { headers });
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
  reviewers?: string[];
  draft?: boolean;
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
    reviewers = [],
    draft = false,
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

  try {
    const accessToken = (session as unknown as { accessToken: string })
      .accessToken;
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
      reviewers: reviewers.filter((r): r is string => typeof r === "string"),
      draft,
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
