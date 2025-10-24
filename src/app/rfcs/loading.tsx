import { auth } from '@/auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function Loading() {
  const session = await auth()

  if (!(session as { accessToken?: string })?.accessToken) {
      redirect("/api/auth/signin")
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
                    <p className="mt-3 text-sm font-medium tracking-wide text-gray-50">
                        {process.env.GITHUB_ORG}/{process.env.GITHUB_REPO}
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    {session?.user?.image && (
                        <div className="h-10 w-10 border-2 border-black">
                            <img src={session.user.image} alt={session.user.name || "User"} className="h-full w-full" />
                        </div>
                    )}
                    <form
                        action={async () => {
                            "use server"
                            const { signOut } = await import("@/auth")
                            await signOut({ redirectTo: "/" })
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
                {[...Array(5)].map((_, index) => (
                    <div
                        key={index}
                        className="block border-b-2 border-black bg-white px-6 py-5"
                        style={{
                            borderTop: index === 0 ? "2px solid black" : "none",
                        }}
                    >
                        <div className="flex items-start justify-between gap-6">
                            <div className="flex-1">
                                <div className="mb-2 flex items-baseline gap-3">
                                    <div className="h-7 w-96 animate-pulse bg-gray-20" />
                                    <div className="h-6 w-16 animate-pulse border-2 border-gray-30 bg-gray-10" />
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <div className="h-5 w-5 animate-pulse border-2 border-black bg-gray-20" />
                                        <div className="h-4 w-24 animate-pulse bg-gray-20" />
                                    </div>
                                    <div className="h-4 w-12 animate-pulse bg-gray-20" />
                                    <div className="h-4 w-24 animate-pulse bg-gray-20" />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
