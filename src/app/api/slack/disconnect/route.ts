import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { api, convexClient, secretKey } from "@/lib/convex";
import { getCurrentUser } from "@/lib/github";

export async function POST(req: Request) {
  const session = await auth();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { teamId?: string };
  if (!body.teamId) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 });
  }

  const ghUser = await getCurrentUser(accessToken);

  await convexClient().mutation(api.slack.disconnectLink, {
    secret: secretKey(),
    githubUserId: ghUser.id,
    teamId: body.teamId,
  });

  return NextResponse.json({ ok: true });
}
