import type { Metadata } from "next";
import { auth } from "@/auth";
import RFCsTopBar from "@/components/RFCsTopBar";
import OnboardingClient from "./OnboardingClient";

export const metadata: Metadata = {
  title: "Set up RFCs",
};

export default async function OnboardingPage() {
  const session = await auth();

  return (
    <div className="min-h-screen px-4 sm:px-8 py-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <RFCsTopBar user={session?.user ?? null} homeHref="/" />
        <OnboardingClient />
      </div>
    </div>
  );
}
