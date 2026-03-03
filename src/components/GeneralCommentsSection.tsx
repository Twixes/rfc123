import { CommentBox } from "@/components/CommentBox";
import { CommentMarkdown } from "@/components/CommentMarkdown";
import type { Comment } from "@/lib/github";

interface GeneralCommentsSectionProps {
  owner: string;
  repo: string;
  comments: Comment[];
  prNumber: number;
  onCommentPosted?: (comment: string) => void;
}

export function GeneralCommentsSection({
  owner,
  repo,
  comments,
  prNumber,
  onCommentPosted,
}: GeneralCommentsSectionProps) {
  return (
    <div className="mt-8">
      <h2 className="mb-4 border-b border-gray-20 pb-2 text-2xl font-serif text-foreground">
        General Comments
      </h2>
      <div className="space-y-0 border border-gray-20 rounded-md overflow-hidden">
        {comments.map((comment) => (
          <div
            key={comment.id}
            className="border-b border-gray-20 bg-surface p-6"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="h-6 w-6 rounded-full overflow-hidden border border-gray-20">
                <img
                  src={comment.userAvatar}
                  alt={comment.user}
                  className="h-full w-full"
                />
              </div>
              <span className="text-sm font-medium text-foreground">
                {comment.user}
              </span>
              <span className="text-xs text-gray-50">
                commented on{" "}
                {new Date(comment.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <CommentMarkdown content={comment.body} />
          </div>
        ))}
        <div className="bg-surface p-6">
          <CommentBox
            owner={owner}
            repo={repo}
            prNumber={prNumber}
            onCommentPosted={onCommentPosted}
          />
        </div>
      </div>
    </div>
  );
}
