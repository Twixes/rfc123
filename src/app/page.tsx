import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listRFCs } from "@/lib/github";

export default async function Home() {
  const session = await auth();

  if (!session?.accessToken) {
    redirect("/api/auth/signin");
  }

  const rfcs = await listRFCs(session.accessToken as string);

  console.log(rfcs);
  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <header className="mb-12 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            RFCs
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            PostHog/meta pull requests
          </p>
        </div>
        <div className="flex items-center gap-4">
          {session.user?.image && (
            <img
              src={session.user.image}
              alt={session.user.name || "User"}
              className="h-8 w-8 rounded-full"
            />
          )}
          <form
            action={async () => {
              "use server";
              const { signOut } = await import("@/auth");
              await signOut();
            }}
          >
            <button
              type="submit"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="space-y-2">
        {rfcs.map((rfc) => (
          <Link
            key={rfc.number}
            href={`/rfc/${rfc.number}`}
            className="block rounded-lg border border-zinc-200 bg-white px-6 py-4 transition-all hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                    {rfc.title}
                  </h2>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                      rfc.status === "open"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : rfc.status === "merged"
                          ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                          : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {rfc.status}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
                  <div className="flex items-center gap-2">
                    <img
                      src={rfc.authorAvatar}
                      alt={rfc.author}
                      className="h-5 w-5 rounded-full"
                    />
                    <span>{rfc.author}</span>
                  </div>
                  <span>#{rfc.number}</span>
                  <span>
                    {new Date(rfc.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  {rfc.inlineCommentCount > 0 && (
                    <span>{rfc.inlineCommentCount} inline</span>
                  )}
                  {rfc.regularCommentCount > 0 && (
                    <span>{rfc.regularCommentCount} comments</span>
                  )}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
