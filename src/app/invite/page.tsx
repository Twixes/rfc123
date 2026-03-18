import Link from "next/link";
import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import { StaggeredFadeIn } from "@/components/StaggeredFadeIn";

interface InvitePageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const session = await auth();
  const { callbackUrl } = await searchParams;

  // If already authenticated, redirect to the RFC or home
  if (session) {
    if (callbackUrl?.startsWith("/rfcs/")) {
      redirect(callbackUrl);
    }
    redirect("/rfcs");
  }

  // Validate callbackUrl is a safe RFC path
  const isValidCallback =
    typeof callbackUrl === "string" &&
    callbackUrl.startsWith("/rfcs/") &&
    !callbackUrl.includes("..");

  return (
    <div className="flex min-h-screen items-center justify-center px-4 sm:px-8 py-8 sm:py-0">
      <div className="w-full max-w-4xl">
        <div className="border border-gray-20 rounded-md bg-surface p-4 sm:p-8">
          <StaggeredFadeIn delay={0}>
            <h1 className="mb-6 font-serif font-normal text-4xl sm:text-6xl text-foreground">
              You&apos;ve been invited to comment on this RFC
            </h1>
          </StaggeredFadeIn>

          <StaggeredFadeIn delay={0.12}>
          <div className="mb-6 border-t border-gray-20 pt-6">
            <h2 className="mb-4 text-2xl font-serif text-foreground">
              How it works
            </h2>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gray-30 text-sm font-medium text-gray-70">
                  1
                </div>
                <div>
                  <p className="text-sm text-foreground">
                    <strong>Sign in with GitHub</strong> to access the RFC. We
                    only need read access to view and comment.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gray-30 text-sm font-medium text-gray-70">
                  2
                </div>
                <div>
                  <p className="text-sm text-foreground">
                    <strong>Read and comment</strong> line-by-line, Google
                    Docs-style. Click line numbers or select text to add inline
                    comments.
                  </p>
                </div>
              </div>
            </div>
          </div>
          </StaggeredFadeIn>

          <StaggeredFadeIn delay={0.24}>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <form
              action={async () => {
                "use server";
                await signIn("github", {
                  callbackUrl: isValidCallback ? callbackUrl : "/rfcs",
                });
              }}
            >
              <button
                type="submit"
                className="flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-surface transition-all hover:opacity-80 cursor-pointer"
              >
                Sign in with GitHub to continue
              </button>
            </form>
            <span className="text-sm text-gray-50 sm:grow sm:text-right">
              <Link
                href="/"
                className="underline hover:text-foreground transition-colors"
              >
                Learn more about RFC123
              </Link>
            </span>
          </div>
          </StaggeredFadeIn>
        </div>
      </div>
    </div>
  );
}
