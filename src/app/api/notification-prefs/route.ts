import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { api, convexClient, secretKey } from "@/lib/convex";
import { getCurrentUser } from "@/lib/github";
import { encryptToken } from "@/lib/token-crypto";

export async function POST(req: Request) {
  const session = await auth();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    notifyHour?: number;
    timezone?: string;
    notificationsEnabled?: boolean;
  } | null;

  if (
    !body ||
    typeof body.notifyHour !== "number" ||
    typeof body.timezone !== "string" ||
    typeof body.notificationsEnabled !== "boolean"
  ) {
    return NextResponse.json(
      { error: "notifyHour, timezone, notificationsEnabled required" },
      { status: 400 },
    );
  }

  // Sanity-check the IANA zone. `Intl.DateTimeFormat` throws on invalid.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: body.timezone });
  } catch {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }

  const ghUser = await getCurrentUser(accessToken);

  // First-time saves need the user row to exist. The JWT callback in auth.ts
  // upserts on sign-in, but if Convex was unreachable then, do it here too.
  await convexClient().mutation(api.users.upsertFromGithub, {
    secret: secretKey(),
    githubUserId: ghUser.id,
    githubLogin: ghUser.login,
    githubAccessToken: await encryptToken(accessToken),
  });

  await convexClient().mutation(api.users.saveNotificationPrefs, {
    secret: secretKey(),
    githubUserId: ghUser.id,
    notifyHour: body.notifyHour,
    timezone: body.timezone,
    notificationsEnabled: body.notificationsEnabled,
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await auth();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ghUser = await getCurrentUser(accessToken);

  const [user, links] = await Promise.all([
    convexClient().query(api.users.getByGithubUserId, {
      secret: secretKey(),
      githubUserId: ghUser.id,
    }),
    convexClient().query(api.slack.listLinksForUser, {
      secret: secretKey(),
      githubUserId: ghUser.id,
    }),
  ]);

  return NextResponse.json({
    user: user
      ? {
          notifyHour: user.notifyHour,
          timezone: user.timezone,
          notificationsEnabled: user.notificationsEnabled,
        }
      : null,
    slackLinks: links,
  });
}

export async function PATCH(req: Request) {
  // Change which Slack workspace is the active DM target.
  const session = await auth();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    activeTeamId?: string;
  } | null;
  if (!body?.activeTeamId) {
    return NextResponse.json(
      { error: "activeTeamId required" },
      { status: 400 },
    );
  }

  const ghUser = await getCurrentUser(accessToken);
  await convexClient().mutation(api.slack.setActiveLink, {
    secret: secretKey(),
    githubUserId: ghUser.id,
    teamId: body.activeTeamId,
  });
  return NextResponse.json({ ok: true });
}
