import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";

export default async function LandingPage() {
  const session = await auth();

  return (
    <div className="flex min-h-screen items-center justify-center px-8">
      <div className="w-full max-w-4xl">
        <div className="border-4 border-black bg-white p-12">
          <h1 className="text-7xl font-bold uppercase tracking-tighter text-black">
            RFC123
          </h1>

          <p className="mb-10 text-2xl font-medium leading-tight text-black">
            The RFC platform for teams.
          </p>

          <div className="mb-10 flex gap-12">
            <div className="flex-1">
              <div
                className="mb-2 h-1 w-12"
                style={{ backgroundColor: "var(--cyan)" }}
              />
              <div className="text-3xl font-bold text-black">1. Draft</div>
              <p className="mt-2 text-sm font-medium text-gray-70">
                Write rich RFCs in Markdown
              </p>
            </div>
            <div className="flex-1">
              <div
                className="mb-2 h-1 w-12"
                style={{ backgroundColor: "var(--magenta)" }}
              />
              <div className="text-3xl font-bold text-black">2. Discuss</div>
              <p className="mt-2 text-sm font-medium text-gray-70">
                Comment line-by-line easily
              </p>
            </div>
            <div className="flex-1">
              <div
                className="mb-2 h-1 w-12"
                style={{ backgroundColor: "var(--yellow)" }}
              />
              <div className="text-3xl font-bold text-black">3. Distribute</div>
              <p className="mt-2 text-sm font-medium text-gray-70">
                Reach conclusions ASAP
              </p>
            </div>
          </div>

          {session ? (
            <div className="flex gap-4">
              <Link
                href="/rfcs"
                className="inline-block border-[3px] border-black bg-black px-8 py-4 text-lg font-bold uppercase tracking-wider text-white transition-all hover:bg-white hover:text-black"
              >
                View RFCs
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button
                  type="submit"
                  className="inline-block border-[3px] border-black bg-white px-8 py-4 text-lg font-bold uppercase tracking-wider text-black transition-all hover:bg-black hover:text-white"
                >
                  Log out
                </button>
              </form>
            </div>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn("github");
              }}
            >
              <button
                type="submit"
                className="inline-block border-[3px] border-black bg-black px-8 py-4 text-lg font-bold uppercase tracking-wider text-white transition-all hover:bg-white hover:text-black"
              >
                Sign in with GitHub
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
