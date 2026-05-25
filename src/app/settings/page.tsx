import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import RFCsTopBar from "@/components/RFCsTopBar";
import { api, convexClient, secretKey } from "@/lib/convex";
import { getCurrentUser } from "@/lib/github";
import { encryptToken } from "@/lib/token-crypto";
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
  // Idempotent – patches existing row with the latest token.
  await convexClient().mutation(api.users.upsertFromGithub, {
    secret: secretKey(),
    githubUserId: ghUser.id,
    githubLogin: ghUser.login,
    githubAccessToken: await encryptToken(accessToken),
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
    <div className="min-h-screen px-4 sm:px-8 py-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <RFCsTopBar user={session?.user ?? null} />
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
        />
      </div>
    </div>
  );
}
