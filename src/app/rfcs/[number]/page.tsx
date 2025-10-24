import { redirect } from "next/navigation";
import { auth } from "@/auth";
import RFCDetailClient from "./RFCDetailClient";

interface PageProps {
  params: Promise<{ number: string }>;
}

export default async function RFCPage({ params }: PageProps) {
  const session = await auth();
  const { number } = await params;

  if (!(session as { accessToken?: string })?.accessToken) {
    redirect("/api/auth/signin");
  }

  return <RFCDetailClient prNumber={Number(number)} />;
}
