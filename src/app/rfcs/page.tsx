import { auth } from "@/auth";
import RFCsPageClient from "./RFCsPageClient";

export default async function RFCsPage() {
  const session = await auth();

  // Middleware handles auth redirect, so we can safely assert session exists here
  return <RFCsPageClient session={session} />;
}
