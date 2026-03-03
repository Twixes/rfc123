import type { Metadata } from "next";
import { auth } from "@/auth";
import RFCsPageClient from "./RFCsPageClient";

export const metadata: Metadata = {
  title: "RFCs",
};

export default async function RFCsPage() {
  const session = await auth();

  // Middleware handles auth redirect, so we can safely assert session exists here
  return <RFCsPageClient session={session} />;
}
