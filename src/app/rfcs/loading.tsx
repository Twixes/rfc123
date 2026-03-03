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
    <div className="mx-auto min-h-screen max-w-240 px-8 py-12">
      <header className="mb-12 flex items-start justify-between">
        <div>
          <h1 className="text-5xl font-serif font-normal text-foreground">
            <Link href="/" className="hover:opacity-70 transition-opacity">
              RFC123
            </Link>
          </h1>
          <div className="mt-3 h-5 w-48 animate-pulse rounded bg-gray-20" />
        </div>
        <div className="flex items-center gap-4">
          {session?.user?.image && (
            <div className="h-10 w-10 rounded-full overflow-hidden border border-gray-20">
              <img
                src={session.user.image}
                alt={session.user.name || "User"}
                className="h-full w-full"
              />
            </div>
          )}
          <form
            action={async () => {
              "use server";
              const { signOut } = await import("@/auth");
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="rounded-md border border-gray-20 bg-surface px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-gray-5"
            >
              Log out
            </button>
          </form>
        </div>
      </header>

      <RFCListSkeleton />
    </div>
  );
}
