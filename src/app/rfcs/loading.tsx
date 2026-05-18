import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import RFCListSkeleton from "@/components/RFCListSkeleton";
import RFCsTopBar from "@/components/RFCsTopBar";

export default async function Loading() {
  const session = await auth();

  if (!(session as { accessToken?: string })?.accessToken) {
    redirect("/api/auth/signin");
  }

  return (
    <div className="mx-auto min-h-screen max-w-240 px-4 sm:px-8 py-6 sm:py-12">
      <RFCsTopBar
        user={session?.user ?? null}
        homeHref="/"
        actions={
          <Link
            href="/rfcs/new"
            className="rounded-md bg-foreground px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-medium text-surface transition-all hover:opacity-80 cursor-pointer flex items-center gap-1.5"
          >
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
            New RFC
          </Link>
        }
      />

      <RFCListSkeleton />
    </div>
  );
}
