import type { Metadata } from "next";
import { auth } from "@/auth";
import { getCurrentUser, getRFCTitle } from "@/lib/github";
import RFCDetailClient from "./RFCDetailClient";

interface PageProps {
  params: Promise<{ owner: string; repo: string; number: string; slug?: string[] }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const t0 = performance.now();
  const session = await auth();
  console.log(`[RFC detail generateMetadata] auth() took ${(performance.now() - t0).toFixed(0)}ms`);
  const { owner, repo, number } = await params;
  const accessToken = (session as unknown as { accessToken: string }).accessToken;
  const t1 = performance.now();
  const title = await getRFCTitle(accessToken, owner, repo, Number(number));
  console.log(`[RFC detail generateMetadata] getRFCTitle() took ${(performance.now() - t1).toFixed(0)}ms`);
  console.log(`[RFC detail generateMetadata] total took ${(performance.now() - t0).toFixed(0)}ms`);
  return {
    title: title ? `${title} (#${number})` : `RFC #${number}`,
  };
}

export default async function RFCPage({ params }: PageProps) {
  const t0 = performance.now();
  const session = await auth();
  console.log(`[RFC detail page] auth() took ${(performance.now() - t0).toFixed(0)}ms`);
  const { owner, repo, number } = await params;

  // Middleware handles auth redirect, so we can safely assert session exists here
  const accessToken = (session as unknown as { accessToken: string }).accessToken;

  const t1 = performance.now();
  const currentUser = await getCurrentUser(accessToken);
  console.log(`[RFC detail page] getCurrentUser() took ${(performance.now() - t1).toFixed(0)}ms`);
  console.log(`[RFC detail page] total server component took ${(performance.now() - t0).toFixed(0)}ms`);

  return (
    <RFCDetailClient
      owner={owner}
      repo={repo}
      prNumber={Number(number)}
      currentUser={currentUser.login}
      currentUserAvatar={currentUser.avatarUrl}
    />
  );
}
