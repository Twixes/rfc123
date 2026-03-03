import type { Metadata } from "next";
import { auth } from "@/auth";
import { getCurrentUserLogin, getOctokit } from "@/lib/github";
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
  try {
    const t1 = performance.now();
    const octokit = await getOctokit(accessToken);
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: Number(number),
    });
    console.log(`[RFC detail generateMetadata] pulls.get() took ${(performance.now() - t1).toFixed(0)}ms`);
    console.log(`[RFC detail generateMetadata] total took ${(performance.now() - t0).toFixed(0)}ms`);
    return {
      title: `${pr.title} (#${number})`,
    };
  } catch {
    console.log(`[RFC detail generateMetadata] failed, total took ${(performance.now() - t0).toFixed(0)}ms`);
    return {
      title: `RFC #${number}`,
    };
  }
}

export default async function RFCPage({ params }: PageProps) {
  const t0 = performance.now();
  const session = await auth();
  console.log(`[RFC detail page] auth() took ${(performance.now() - t0).toFixed(0)}ms`);
  const { owner, repo, number } = await params;

  // Middleware handles auth redirect, so we can safely assert session exists here
  const accessToken = (session as unknown as { accessToken: string }).accessToken;

  const t1 = performance.now();
  const currentUserLogin = await getCurrentUserLogin(accessToken);
  console.log(`[RFC detail page] getCurrentUserLogin() took ${(performance.now() - t1).toFixed(0)}ms`);

  // Get current user's avatar
  const t2 = performance.now();
  const octokit = await getOctokit(accessToken);
  const { data: user } = await octokit.rest.users.getAuthenticated();
  console.log(`[RFC detail page] getAuthenticated() (uncached!) took ${(performance.now() - t2).toFixed(0)}ms`);
  console.log(`[RFC detail page] total server component took ${(performance.now() - t0).toFixed(0)}ms`);

  return (
    <RFCDetailClient
      owner={owner}
      repo={repo}
      prNumber={Number(number)}
      currentUser={currentUserLogin}
      currentUserAvatar={user.avatar_url}
    />
  );
}
