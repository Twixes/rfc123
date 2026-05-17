import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { api, convexClient, secretKey } from "@/lib/convex";
import { getCurrentUser } from "@/lib/github";
import SettingsClient from "./SettingsClient";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ slack?: string; slack_error?: string }>;
}) {
  const session = await auth();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) {
    redirect("/api/auth/signin?callbackUrl=/settings");
  }

  const ghUser = await getCurrentUser(accessToken);

  // Make sure the Convex row exists so the settings UI has something to show.
  // Idempotent — patches existing row with the latest token.
  await convexClient().mutation(api.users.upsertFromGithub, {
    secret: secretKey(),
    githubUserId: ghUser.id,
    githubLogin: ghUser.login,
    githubAccessToken: accessToken,
  });

  const [user, slackLinks] = await Promise.all([
    convexClient().query(api.users.getByGithubUserId, {
      secret: secretKey(),
      githubUserId: ghUser.id,
    }),
    convexClient().query(api.slack.listLinksForUser, {
      secret: secretKey(),
      githubUserId: ghUser.id,
    }),
  ]);

  const params = await searchParams;

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/rfcs"
            className="text-sm text-gray-70 hover:text-foreground transition-colors"
          >
            ← Back to RFCs
          </Link>
        </div>
        <SettingsClient
          initialPrefs={{
            notifyHour: user?.notifyHour ?? 9,
            timezone: user?.timezone ?? null,
            notificationsEnabled: user?.notificationsEnabled ?? false,
          }}
          initialSlackLinks={slackLinks}
          slackBanner={
            params.slack_error
              ? { kind: "err", text: params.slack_error }
              : null
          }
          isDev={process.env.NODE_ENV === "development"}
        />
      </div>
    </div>
  );
}
