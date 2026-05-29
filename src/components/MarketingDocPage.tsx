import Link from "next/link";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import ConnectAgentButton from "@/components/ConnectAgentButton";
import Footer from "@/components/Footer";
import { GitHubSignInForm } from "@/components/GitHubSignInForm";
import RFCsTopBar from "@/components/RFCsTopBar";
import { RFCsTopBarPrimaryAction } from "@/components/RFCsTopBarActions";
import { MARKETING_SECONDARY_BUTTON_CLASS } from "@/lib/marketing-button-classes";

function ListIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <title>List</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h10"
      />
    </svg>
  );
}

interface MarketingDocPageProps {
  eyebrow: string;
  title: string;
  children: ReactNode;
}

export default async function MarketingDocPage({
  eyebrow,
  title,
  children,
}: MarketingDocPageProps) {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-216 flex-1 px-4 sm:px-8 py-6 sm:py-12">
        <RFCsTopBar
          user={session?.user ?? null}
          homeHref="/"
          secondaryActions={
            <>
              <ConnectAgentButton variant="secondary" label="Connect agent" />
              {session && (
                <Link href="/rfcs" className={MARKETING_SECONDARY_BUTTON_CLASS}>
                  <ListIcon />
                  View RFCs
                </Link>
              )}
            </>
          }
          primaryActions={
            session ? <RFCsTopBarPrimaryAction /> : <GitHubSignInForm />
          }
        />

        <section className="mb-6">
          <div className="mb-6 flex items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-gray-50">
              {eyebrow}
            </span>
            <span className="h-px flex-1 bg-gray-20" />
          </div>
          <h1 className="max-w-3xl text-balance text-3xl sm:text-5xl font-serif font-normal leading-[1.05] tracking-tight text-foreground">
            {title}
          </h1>
        </section>

        <div>{children}</div>
      </main>

      <div className="mx-auto w-full max-w-216 px-4 sm:px-8 pb-6">
        <Footer />
      </div>
    </div>
  );
}
