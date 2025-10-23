import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GeneralCommentsSection } from "@/components/GeneralCommentsSection";
import { InlineCommentableMarkdown } from "@/components/InlineCommentableMarkdown";
import { RFCMetadataHeader } from "@/components/RFCMetadataHeader";
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

      <RFCMetadataHeader rfc={rfc} />

      <div className="border-2 border-black bg-white p-8">
        <InlineCommentableMarkdown
          content={rfc.markdownContent}
          prNumber={rfc.number}
          comments={lineComments}
          onCommentSubmit={handleInlineComment}
        />
      </div>

      <GeneralCommentsSection
        comments={generalComments}
        prNumber={rfc.number}
      />
    </div>
  );
}
