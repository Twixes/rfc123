import Link from "next/link";
import type { ReactNode } from "react";
import { auth, signIn } from "@/auth";
import ConnectAgentButton from "@/components/ConnectAgentButton";
import Footer from "@/components/Footer";
import RFCsTopBar from "@/components/RFCsTopBar";

const PRIMARY_BTN =
  "inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-medium text-surface transition-all hover:opacity-80 cursor-pointer";
const SECONDARY_BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-gray-30 bg-surface px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-medium text-foreground transition-all hover:bg-gray-5 cursor-pointer";

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

function PlusIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <title>New</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4v16m8-8H4"
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

  const actions = (
    <>
      <ConnectAgentButton variant="secondary" label="Connect agent" />
      {session ? (
        <>
          <Link href="/rfcs" className={SECONDARY_BTN}>
            <ListIcon />
            View RFCs
          </Link>
          <Link href="/rfcs/new" className={PRIMARY_BTN}>
            <PlusIcon />
            New RFC
          </Link>
        </>
      ) : (
        <form
          action={async () => {
            "use server";
            await signIn("github");
          }}
        >
          <button type="submit" className={PRIMARY_BTN}>
            Sign in/up with GitHub
          </button>
        </form>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-216 flex-1 px-4 sm:px-8 py-6 sm:py-12">
        <RFCsTopBar
          user={session?.user ?? null}
          homeHref="/"
          actions={actions}
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
