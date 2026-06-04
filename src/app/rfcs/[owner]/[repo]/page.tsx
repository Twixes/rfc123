import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, getAccessToken } from "@/auth";
import { getCurrentUserLogin } from "@/lib/github";
import { isRepoPublic } from "@/lib/public-access";
import RFCsPageClient from "../../RFCsPageClient";

interface PageProps {
  params: Promise<{ owner: string; repo: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo} – RFCs` };
}

export default async function RepoRFCListPage({ params }: PageProps) {
  const { owner, repo } = await params;
  const session = await auth();
  const sessionToken = getAccessToken(session);

  // Same gate as the detail page: anonymous viewers only see public repos.
  if (!sessionToken && !(await isRepoPublic(owner, repo))) {
    const callbackUrl = `/rfcs/${owner}/${repo}`;
    redirect(`/invite?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const viewerLogin = sessionToken
    ? await getCurrentUserLogin(sessionToken).catch(() => null)
    : null;

  return (
    <RFCsPageClient
      session={session}
      viewerLogin={viewerLogin}
      repoLock={{ owner, name: repo }}
      isAnonymous={!sessionToken}
    />
  );
}
