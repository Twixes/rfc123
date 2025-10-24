import { auth } from "@/auth";
import { getCurrentUserLogin, getOctokit } from "@/lib/github";
import RFCDetailClient from "./RFCDetailClient";

interface PageProps {
  params: Promise<{ owner: string; repo: string; number: string }>;
}

export default async function RFCPage({ params }: PageProps) {
  const session = await auth();
  const { owner, repo, number } = await params;

  // Middleware handles auth redirect, so we can safely assert session exists here
  const accessToken = (session as unknown as { accessToken: string }).accessToken;
  const currentUserLogin = await getCurrentUserLogin(accessToken);

  // Get current user's avatar
  const octokit = await getOctokit(accessToken);
  const { data: user } = await octokit.rest.users.getAuthenticated();

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
