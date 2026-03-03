import Link from "next/link"
import { auth, signIn, signOut } from "@/auth"
import AccountDropdown from "@/components/AccountDropdown"

export default async function LandingPage() {
    const session = await auth()

    return (
        <div className="flex min-h-screen items-center justify-center px-4 sm:px-8 py-8 sm:py-0">
            <div className="w-full max-w-4xl">
                <div className="border border-gray-20 rounded-md shadow-md bg-surface p-4 sm:p-8">
                    <h1 className="font-serif font-normal text-4xl sm:text-6xl text-foreground">RFC123</h1>

                    <p className="mb-6 text-lg sm:text-xl font-light leading-tight text-gray-70">The RFC platform for teams.</p>

                    <div className="mb-6 flex flex-col sm:flex-row gap-6 sm:gap-8">
                        <div className="flex-1">
                            <div className="mb-2 h-0.5 w-12" style={{ backgroundColor: "var(--cyan)" }} />
                            <div className="text-xl sm:text-2xl font-serif text-foreground">1. Draft<sup className="text-xs ml-0.5 font-sans font-medium text-gray-50">SOON</sup></div>
                            <p className="mt-1 text-sm text-gray-70">Write rich RFCs in Markdown,<br/>automatically creating a GitHub PR.</p>
                        </div>
                        <div className="flex-1">
                            <div className="mb-2 h-0.5 w-12" style={{ backgroundColor: "var(--magenta)" }} />
                            <div className="text-xl sm:text-2xl font-serif text-foreground">2. Discuss</div>
                            <p className="mt-1 text-sm text-gray-70">Comment line-by-line,<br/>Google Docs-style.</p>
                        </div>
                        <div className="flex-1">
                            <div className="mb-2 h-0.5 w-12" style={{ backgroundColor: "var(--yellow)" }} />
                            <div className="text-xl sm:text-2xl font-serif text-foreground">3. Decide<sup className="text-xs ml-0.5 font-sans font-medium text-gray-50">SOON</sup></div>
                            <p className="mt-1 text-sm text-gray-70">Reach conclusions ASAP<br/>thanks to Slack notifications.</p>
                        </div>
                    </div>

                    <div className="mb-6 border-t border-gray-20 pt-6">
                        <h2 className="mb-4 text-2xl font-serif text-foreground">How it works</h2>
                        <div className="space-y-3">
                            <div className="flex gap-3">
                                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-gray-30 text-sm font-medium text-gray-70">
                                    1
                                </div>
                                <div>
                                    <p className="text-sm text-foreground">
                                        <strong>Create a GitHub repository</strong> with a{" "}
                                        <code className="bg-gray-5 border border-gray-20 rounded-sm px-1.5 py-0.5 font-mono text-xs">
                                            requests-for-comments/
                                        </code>{" "}
                                        directory. Then create a pull request with a Markdown file in that directory.
                                        This is your RFC draft.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-gray-30 text-sm font-medium text-gray-70">
                                    2
                                </div>
                                <div>
                                    <p className="text-sm text-foreground">
                                        <strong>Sign into RFC123</strong> with your GitHub account. RFC123 will discover
                                        all PRs from your repositories containing a{" "}
                                        <code className="bg-gray-5 border border-gray-20 rounded-sm px-1.5 py-0.5 font-mono text-xs">
                                            requests-for-comments/
                                        </code>{" "}
                                        directory with Markdown files.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-gray-30 text-sm font-medium text-gray-70">
                                    3
                                </div>
                                <div>
                                    <p className="text-sm text-foreground">
                                        <strong>Review and comment</strong> on any RFC. Click line numbers or select
                                        text to add inline comments. All comments are posted directly to the GitHub PR
                                        as review comments.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-gray-30 text-sm font-medium text-gray-70">
                                    4
                                </div>
                                <div>
                                    <p className="text-sm text-foreground">
                                        <strong>Iterate and merge</strong>. The RFC author updates their draft based on
                                        feedback, and finally merges it. The RFC is now official.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                        <div className="flex gap-3 items-center">
                            {session ? (
                                <>
                                    <Link
                                        href="/rfcs"
                                        className="inline-block rounded-md bg-foreground px-4 py-2 text-sm font-medium text-surface transition-all hover:opacity-80 cursor-pointer"
                                    >
                                        View RFCs
                                    </Link>
                                    {session.user && (
                                        <AccountDropdown user={session.user} />
                                    )}
                                </>
                            ) : (
                                <form
                                    action={async () => {
                                        "use server"
                                        await signIn("github")
                                    }}
                                >
                                    <button
                                        type="submit"
                                        className="inline-block rounded-md bg-foreground px-4 py-2 text-sm font-medium text-surface transition-all hover:opacity-80 cursor-pointer"
                                    >
                                        Sign in with GitHub
                                    </button>
                                </form>
                            )}
                        </div>
                        <span className="text-sm text-gray-50 sm:grow sm:text-right">
                            <a
                                href="https://github.com/Twixes/rfc123"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:text-foreground transition-colors"
                            >
                                View RFC123 source code
                            </a>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
