import Link from "next/link"
import { auth, signIn, signOut } from "@/auth"

export default async function LandingPage() {
    const session = await auth()

    return (
        <div className="flex min-h-screen items-center justify-center px-8">
            <div className="w-full max-w-4xl">
                <div className="border-4 border-black bg-white p-8">
                    <h1 className="text-5xl font-bold uppercase tracking-tighter text-black">RFC123</h1>

                    <p className="mb-6 text-xl font-medium leading-tight text-black">The RFC platform for teams.</p>

                    <div className="mb-6 flex gap-8">
                        <div className="flex-1">
                            <div className="mb-2 h-1 w-12" style={{ backgroundColor: "var(--cyan)" }} />
                            <div className="text-2xl font-bold text-black">1. Draft</div>
                            <p className="mt-1 text-sm font-medium text-gray-70">Write rich RFCs in Markdown</p>
                        </div>
                        <div className="flex-1">
                            <div className="mb-2 h-1 w-12" style={{ backgroundColor: "var(--magenta)" }} />
                            <div className="text-2xl font-bold text-black">2. Discuss</div>
                            <p className="mt-1 text-sm font-medium text-gray-70">Comment line-by-line easily</p>
                        </div>
                        <div className="flex-1">
                            <div className="mb-2 h-1 w-12" style={{ backgroundColor: "var(--yellow)" }} />
                            <div className="text-2xl font-bold text-black">3. Distribute</div>
                            <p className="mt-1 text-sm font-medium text-gray-70">Reach the conclusion ASAP</p>
                        </div>
                    </div>

                    <div className="mb-6 border-t-4 border-black pt-6">
                        <h2 className="mb-4 text-xl font-bold tracking-tight text-black">How it works</h2>
                        <div className="space-y-3">
                            <div className="flex gap-3">
                                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center border-2 border-black bg-black text-sm font-bold text-white">
                                    1
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-black">
                                        <strong>Create a GitHub repository</strong> with a{" "}
                                        <code className="bg-gray-10 px-1.5 py-0.5 font-mono text-xs">
                                            requests-for-comments/
                                        </code>{" "}
                                        directory. Then create a pull request with a Markdown file in that directory.
                                        This is your RFC draft.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center border-2 border-black bg-black text-sm font-bold text-white">
                                    2
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-black">
                                        <strong>Sign into RFC123</strong> with your GitHub account. RFC123 will discover
                                        all PRs from your repositories containing a{" "}
                                        <code className="bg-gray-10 px-1.5 py-0.5 font-mono text-xs">
                                            requests-for-comments/
                                        </code>{" "}
                                        directory with Markdown files.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center border-2 border-black bg-black text-sm font-bold text-white">
                                    3
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-black">
                                        <strong>Review and comment</strong> on any RFC. Click line numbers or select
                                        text to add inline comments. All comments are posted directly to the GitHub PR
                                        as review comments.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center border-2 border-black bg-black text-sm font-bold text-white">
                                    4
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-black">
                                        <strong>Iterate and merge</strong>. The RFC author updates their draft based on feedback,
                                        and finally merges it. The RFC is now official.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {session ? (
                        <div className="flex gap-3">
                            <Link
                                href="/rfcs"
                                className="inline-block border-2 border-black bg-black px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition-all hover:bg-white hover:text-black cursor-pointer"
                            >
                                View RFCs
                            </Link>
                            <form
                                action={async () => {
                                    "use server"
                                    await signOut({ redirectTo: "/" })
                                }}
                            >
                                <button
                                    type="submit"
                                    className="inline-block border-2 border-black bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-black transition-all hover:bg-black hover:text-white cursor-pointer"
                                >
                                    Log out
                                </button>
                            </form>
                        </div>
                    ) : (
                        <form
                            action={async () => {
                                "use server"
                                await signIn("github")
                            }}
                        >
                            <button
                                type="submit"
                                className="inline-block border-2 border-black bg-black px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition-all hover:bg-white hover:text-black cursor-pointer"
                            >
                                Sign in with GitHub
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
