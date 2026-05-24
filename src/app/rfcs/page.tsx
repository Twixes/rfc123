import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, getAccessToken } from "@/auth";
import { listReposWithRFCs, type RepoOption } from "@/lib/github";
import RFCsPageClient from "./RFCsPageClient";

export const metadata: Metadata = {
  title: "RFCs",
};

export default async function RFCsPage() {
  const session = await auth();
  const accessToken = getAccessToken(session);

  // Send a user with no RFC-bearing repos straight to onboarding. We use the
  // same detector the picker does (`listReposWithRFCs`) so a user who has a
  // hundred unrelated repos but no RFCs gets onboarded just like one with
  // zero repos. The redirect is intentionally outside the try/catch: a GH
  // outage shouldn't block the page, but `redirect()` works by throwing and
  // must propagate.
  let rfcRepos: RepoOption[] | null = null;
  if (accessToken) {
    try {
      rfcRepos = await listReposWithRFCs(accessToken);
    } catch {
      // Transient GH error – fall through to the client render.
    }
  }
  if (rfcRepos && rfcRepos.length === 0) redirect("/onboarding");

  return <RFCsPageClient session={session} />;
}
