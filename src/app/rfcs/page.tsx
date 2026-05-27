import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, getAccessToken } from "@/auth";
import { getCurrentUserLogin, hasAnyRfcBearingRepo } from "@/lib/github";
import RFCsPageClient from "./RFCsPageClient";

export const metadata: Metadata = {
  title: "RFCs",
};

export default async function RFCsPage() {
  const session = await auth();
  const accessToken = getAccessToken(session);

  // Send a user with no RFC-bearing repos straight to onboarding. The check
  // uses a single GitHub code-search call (`hasAnyRfcBearingRepo`) instead of
  // the full per-org sweep that `/api/repos` runs – the sweep can take tens
  // of seconds for viewers in giant orgs, and blocking the page render on it
  // means the user never gets past loading.tsx. The full list still lands
  // shortly after via the client-side `/api/repos` call.
  //
  // The redirect is intentionally outside the try/catch: a GH outage
  // shouldn't block the page, but `redirect()` works by throwing and must
  // propagate.
  let hasRfcRepos = true;
  let viewerLogin: string | null = null;
  if (accessToken) {
    try {
      [hasRfcRepos, viewerLogin] = await Promise.all([
        hasAnyRfcBearingRepo(accessToken),
        getCurrentUserLogin(accessToken),
      ]);
    } catch {
      // Transient GH error – fall through to the client render.
    }
  }
  if (!hasRfcRepos) redirect("/onboarding");

  return <RFCsPageClient session={session} viewerLogin={viewerLogin} />;
}
