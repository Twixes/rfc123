import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CommentBox } from "@/components/CommentBox";
import { InlineCommentableMarkdown } from "@/components/InlineCommentableMarkdown";
import { getRFCDetail, postComment } from "@/lib/github";

interface PageProps {
  params: Promise<{ number: string }>;
}

export default async function RFCPage({ params }: PageProps) {
  const session = await auth();
  const { number } = await params;

  if (!(session as { accessToken?: string })?.accessToken) {
    redirect("/api/auth/signin");
  }

  const rfc = await getRFCDetail(
    (session as unknown as { accessToken: string }).accessToken,
    Number(number),
  );

  // Filter comments to show only those not associated with specific lines in the main comments section
  const generalComments = rfc.comments.filter((c) => !c.line);
  const lineComments = rfc.comments.filter((c) => c.line);

  async function handleInlineComment(line: number, body: string) {
    "use server";
    const session = await auth();
    if (
      !(session as { accessToken?: string })?.accessToken ||
      !rfc.markdownFilePath
    )
      return;

    await postComment(
      (session as unknown as { accessToken: string }).accessToken,
      rfc.number,
      body,
      rfc.markdownFilePath,
      line,
    );
  }

  return (
    <div className="mx-auto min-h-screen px-8 py-12">
      <nav className="mb-6">
        <Link
          href="/"
          className="border-2 border-black bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-black transition-all hover:bg-black hover:text-white"
        >
          ← Back to RFCs
        </Link>
      </nav>

      {/* Metadata header section */}
      <div className="mb-4 border-2 border-black bg-white p-8">
        <div className="mb-2 flex items-start justify-between gap-4">
          <div className="flex items-baseline gap-4">
            <span className="font-mono text-sm font-bold tracking-wide text-gray-50">
              RFC {rfc.number}
            </span>
            <span
              className="border-2 px-3 py-1 text-xs font-bold uppercase tracking-wider"
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
          <a
            href={rfc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 border-2 border-black bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-black transition-all hover:bg-black hover:text-white"
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
                strokeLinecap="square"
                strokeLinejoin="miter"
                strokeWidth={3}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </div>

        <h1 className="mb-6 text-4xl font-bold tracking-tight text-black">
          {rfc.title}
        </h1>

        <div className="grid grid-cols-1 gap-x-8 gap-y-6 border-t-2 border-black pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-50">
              Author
            </dt>
            <dd className="flex items-center gap-2">
              <div className="h-6 w-6 border-2 border-black">
                <img
                  src={rfc.authorAvatar}
                  alt={rfc.author}
                  className="h-full w-full"
                />
              </div>
              <span className="text-sm font-medium text-black">
                {rfc.author}
              </span>
            </dd>
          </div>

          {rfc.reviewers.length > 0 && (
            <div>
              <dt className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-50">
                Reviewers
              </dt>
              <dd className="flex items-center gap-2">
                {rfc.reviewers.map((reviewer) => (
                  <div
                    key={reviewer.login}
                    className="h-6 w-6 border-2 border-black"
                    title={reviewer.login}
                  >
                    <img
                      src={reviewer.avatar}
                      alt={reviewer.login}
                      className="h-full w-full"
                    />
                  </div>
                ))}
              </dd>
            </div>
          )}

          <div>
            <dt className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-50">
              Updated
            </dt>
            <dd className="text-sm font-medium text-black">
              {new Date(rfc.updatedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </dd>
          </div>

          <div>
            <dt className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-50">
              Comments
            </dt>
            <dd className="font-mono text-sm font-bold text-black">
              {rfc.commentCount}
            </dd>
          </div>
        </div>
      </div>

      <div className="border-2 border-black bg-white p-8">
        <InlineCommentableMarkdown
          content={rfc.markdownContent}
          prNumber={rfc.number}
          comments={lineComments}
          onCommentSubmit={handleInlineComment}
        />
      </div>

      {/* General comments section (not tied to specific lines) */}
      <div className="mt-8">
        <h2 className="mb-4 border-b-[3px] border-black pb-2 text-2xl font-bold text-black">
          General Comments
        </h2>
        <div className="space-y-0">
          {generalComments.map((comment) => (
            <div
              key={comment.id}
              className="border-b-2 border-black bg-white p-6"
            >
              <div className="mb-3 flex items-center gap-2">
                <div className="h-6 w-6 border-2 border-black">
                  <img
                    src={comment.userAvatar}
                    alt={comment.user}
                    className="h-full w-full"
                  />
                </div>
                <span className="text-sm font-bold text-black">
                  {comment.user}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-gray-50">
                  commented on{" "}
                  {new Date(comment.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="text-sm leading-relaxed text-gray-90">
                {comment.body}
              </div>
            </div>
          ))}
          <div className="border-2 border-black bg-white p-6">
            <CommentBox prNumber={rfc.number} />
          </div>
        </div>
      </div>
    </div>
  );
}
