import { redirect } from "next/navigation";
import { auth } from "@/auth";
import RFCDetailClient from "./RFCDetailClient";

interface PageProps {
  params: Promise<{ owner: string; repo: string; number: string }>;
}

export default async function RFCPage({ params }: PageProps) {
  const session = await auth();
  const { owner, repo, number } = await params;

  if (!(session as { accessToken?: string })?.accessToken) {
    redirect("/api/auth/signin");
  }

  return (
    <RFCDetailClient owner={owner} repo={repo} prNumber={Number(number)} />
  );
}
