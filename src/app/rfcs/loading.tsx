import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import RFCListSkeleton from "@/components/RFCListSkeleton";

export default async function Loading() {
  const session = await auth();

  if (!(session as { accessToken?: string })?.accessToken) {
    redirect("/api/auth/signin");
  }

  return (
    <div className="mx-auto min-h-screen max-w-240 px-4 sm:px-8 py-6 sm:py-12">
      <header className="mb-8 sm:mb-10 flex flex-col sm:flex-row items-start sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-5xl font-serif font-normal text-foreground">
            <Link href="/" className="hover:opacity-70 transition-opacity">
              RFC123
            </Link>
          </h1>
          <div className="mt-3 h-5 w-40 animate-pulse rounded bg-gray-20" />
        </div>
        <div className="flex items-center gap-3">
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
          {session?.user?.image ? (
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full overflow-hidden border border-gray-20">
              <img
                src={session.user.image}
                alt={session.user.name || "User"}
                className="h-full w-full"
              />
            </div>
          ) : (
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full animate-pulse bg-gray-20" />
          )}
        </div>
      </header>

      <RFCListSkeleton />
    </div>
  );
}
