import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listRFCs } from "@/lib/github";

export default async function Home() {
  const session = await auth();

  if (!(session as { accessToken?: string })?.accessToken) {
    redirect("/api/auth/signin");
  }

  const rfcs = await listRFCs(
    (session as unknown as { accessToken: string }).accessToken,
  );

  console.log(rfcs);
  return (
    <div className="mx-auto min-h-screen max-w-6xl px-8 py-12">
      <header className="mb-12 flex items-start justify-between">
        <div>
          <h1 className="text-5xl font-bold uppercase tracking-tight text-black">
            RFC123
          </h1>
          <p className="mt-3 text-sm font-medium tracking-wide text-gray-50">
            {process.env.GITHUB_ORG}/{process.env.GITHUB_REPO} Pull Requests
          </p>
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
              await signOut();
            }}
          >
            <button
              type="submit"
              className="border-2 border-black bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-black transition-all hover:bg-black hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="space-y-0">
        {rfcs.map((rfc, index) => (
          <Link
            key={rfc.number}
            href={`/rfcs/${rfc.number}`}
            className="group block border-b-2 border-black bg-white px-6 py-5 transition-all hover:bg-gray-10"
            style={{
              borderTop: index === 0 ? "2px solid black" : "none",
            }}
          >
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1">
                <div className="mb-2 flex items-baseline gap-3">
                  <h2 className="text-xl font-bold tracking-tight text-black">
                    {rfc.title}
                  </h2>
                  <span
                    className="border-2 px-2 py-0.5 text-xs font-bold uppercase tracking-wider"
                    style={{
                      borderColor:
                        rfc.status === "open"
                          ? "var(--cyan)"
                          : rfc.status === "merged"
                            ? "var(--yellow)"
                            : "var(--gray-30)",
                      backgroundColor:
                        rfc.status === "open"
                          ? "var(--cyan)"
                          : rfc.status === "merged"
                            ? "var(--yellow)"
                            : "var(--gray-10)",
                      color: "black",
                    }}
                  >
                    {rfc.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium tracking-wide text-gray-70">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 border-2 border-black">
                      <img
                        src={rfc.authorAvatar}
                        alt={rfc.author}
                        className="h-full w-full"
                      />
                    </div>
                    <span>{rfc.author}</span>
                  </div>
                  <span className="font-mono">#{rfc.number}</span>
                  <span>
                    {new Date(rfc.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  {rfc.inlineCommentCount > 0 && (
                    <span className="border-l-2 border-gray-30 pl-4">
                      {rfc.inlineCommentCount} inline
                    </span>
                  )}
                  {rfc.regularCommentCount > 0 && (
                    <span className="border-l-2 border-gray-30 pl-4">
                      {rfc.regularCommentCount} general
                    </span>
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
