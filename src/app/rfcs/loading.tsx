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
          <h1 className="text-5xl font-bold uppercase tracking-tight text-black">
            <Link href="/" className="hover:underline">
              RFC123
            </Link>
          </h1>
          <div className="mt-3 h-5 w-48 animate-pulse bg-gray-20" />
        </div>
        <div className="flex items-center gap-4">
          {session?.user?.image && (
            <div className="h-10 w-10 border-2 border-black">
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
              className="border-2 border-black bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-black transition-all hover:bg-black hover:text-white"
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
