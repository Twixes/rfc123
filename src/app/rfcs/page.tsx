import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listReposWithRFCs } from "@/lib/github";
import RFCsPageClient from "./RFCsPageClient";

export default async function RFCsPage() {
  const session = await auth();

  if (!(session as { accessToken?: string })?.accessToken) {
    redirect("/api/auth/signin");
  }

  const availableRepos = await listReposWithRFCs(
    (session as unknown as { accessToken: string }).accessToken,
  );

  return <RFCsPageClient availableRepos={availableRepos} session={session} />;
}
