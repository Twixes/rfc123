import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { InlineCommentableMarkdown } from "@/components/InlineCommentableMarkdown";
import { getRFCDetail, postComment } from "@/lib/github";

interface PageProps {
  params: Promise<{ number: string }>;
}

export default async function RFCPage({ params }: PageProps) {
  const session = await auth();
  const { number } = await params;

  if (!session?.accessToken) {
    redirect("/api/auth/signin");
  }

  const rfc = await getRFCDetail(session.accessToken as string, Number(number));

  // Filter comments to show only those not associated with specific lines in the main comments section
  const generalComments = rfc.comments.filter((c) => !c.line);
  const lineComments = rfc.comments.filter((c) => c.line);

  async function handleInlineComment(line: number, body: string) {
    "use server";
    const session = await auth();
    if (!session?.accessToken || !rfc.markdownFilePath) return;

    await postComment(
      session.accessToken as string,
      rfc.number,
      body,
      rfc.markdownFilePath,
      line
    );
  }

  return (
    <div className="mx-auto min-h-screen px-6 py-12">
      <nav className="mb-8">
        <Link
          href="/"
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← Back to RFCs
        </Link>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
        {/* Main content */}
        <div>
          <header className="mb-8">
            <div className="mb-4 flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {rfc.title}
              </h1>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
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
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <img
                src={rfc.authorAvatar}
                alt={rfc.author}
                className="h-6 w-6 rounded-full"
              />
              <span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {rfc.author}
                </span>{" "}
                opened #{rfc.number} on{" "}
                {new Date(rfc.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          </header>

          <div className="rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
            <InlineCommentableMarkdown
              content={rfc.markdownContent}
              prNumber={rfc.number}
              comments={lineComments}
              onCommentSubmit={handleInlineComment}
            />
          </div>

          {/* General comments section (not tied to specific lines) */}
          {generalComments.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                General Comments
              </h2>
              <div className="space-y-4">
                {generalComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <img
                        src={comment.userAvatar}
                        alt={comment.user}
                        className="h-6 w-6 rounded-full"
                      />
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        {comment.user}
                      </span>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        commented on{" "}
                        {new Date(comment.createdAt).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}
                      </span>
                    </div>
                    <div className="text-sm text-zinc-700 dark:text-zinc-300">
                      {comment.body}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Metadata
            </h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-zinc-600 dark:text-zinc-400">Author</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <img
                    src={rfc.authorAvatar}
                    alt={rfc.author}
                    className="h-5 w-5 rounded-full"
                  />
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {rfc.author}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-zinc-600 dark:text-zinc-400">Created</dt>
                <dd className="mt-1 text-zinc-900 dark:text-zinc-50">
                  {new Date(rfc.createdAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-600 dark:text-zinc-400">
                  Last updated
                </dt>
                <dd className="mt-1 text-zinc-900 dark:text-zinc-50">
                  {new Date(rfc.updatedAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-600 dark:text-zinc-400">Comments</dt>
                <dd className="mt-1 text-zinc-900 dark:text-zinc-50">
                  {rfc.commentCount}
                </dd>
              </div>
            </dl>
          </div>

          {rfc.reviewers.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Reviewers
              </h3>
              <div className="space-y-2">
                {rfc.reviewers.map((reviewer) => (
                  <div key={reviewer.login} className="flex items-center gap-2">
                    <img
                      src={reviewer.avatar}
                      alt={reviewer.login}
                      className="h-6 w-6 rounded-full"
                    />
                    <span className="text-sm text-zinc-900 dark:text-zinc-50">
                      {reviewer.login}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <a
              href={rfc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm font-medium text-zinc-900 hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-zinc-300"
            >
              View on GitHub
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
