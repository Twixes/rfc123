import { redirect } from "next/navigation";
import { auth } from "@/auth";
import RFCsPageClient from "./RFCsPageClient";

export default async function RFCsPage() {
  const session = await auth();

  if (!(session as { accessToken?: string })?.accessToken) {
    redirect("/api/auth/signin");
  }

  return <RFCsPageClient session={session} />;
}
