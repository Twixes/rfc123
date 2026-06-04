import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth, getAccessToken } from "@/auth";
import { getCurrentUser, getRFCTitle } from "@/lib/github";
import { getPublicGitHubToken, isRepoPublic } from "@/lib/public-access";
import RFCDetailClient from "./RFCDetailClient";

interface PageProps {
  params: Promise<{
    owner: string;
    repo: string;
    number: string;
    slug?: string[];
  }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const session = await auth();
  const { owner, repo, number } = await params;
  const sessionToken = getAccessToken(session);
  const readToken =
    sessionToken ??
    ((await isRepoPublic(owner, repo)) ? getPublicGitHubToken() : null);
  if (!readToken) return { title: `RFC #${number}` };
  const title = await getRFCTitle(readToken, owner, repo, Number(number));
  return {
    title: title ? `${title} (#${number})` : `RFC #${number}`,
  };
}

export default async function RFCPage({ params }: PageProps) {
  const session = await auth();
  const { owner, repo, number } = await params;
  const sessionToken = getAccessToken(session);

  if (!sessionToken) {
    if (!(await isRepoPublic(owner, repo))) {
      const callbackUrl = `/rfcs/${owner}/${repo}/${number}`;
      redirect(`/invite?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
    return (
      <Suspense fallback={null}>
        <RFCDetailClient
          owner={owner}
          repo={repo}
          prNumber={Number(number)}
          currentUser=""
          currentUserAvatar=""
          isAnonymous
        />
      </Suspense>
    );
  }

  const currentUser = await getCurrentUser(sessionToken);
  return (
    <Suspense fallback={null}>
      <RFCDetailClient
        owner={owner}
        repo={repo}
        prNumber={Number(number)}
        currentUser={currentUser.login}
        currentUserAvatar={currentUser.avatarUrl}
      />
    </Suspense>
  );
}
