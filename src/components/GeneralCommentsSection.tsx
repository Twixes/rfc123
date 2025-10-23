import { CommentBox } from "@/components/CommentBox"
import type { Comment } from "@/lib/github"

interface GeneralCommentsSectionProps {
  comments: Comment[]
  prNumber: number
}

export function GeneralCommentsSection({
  comments,
  prNumber,
}: GeneralCommentsSectionProps) {
  return (
    <div className="mt-8">
      <h2 className="mb-4 border-b-[3px] border-black pb-2 text-2xl font-bold text-black">
        General Comments
      </h2>
      <div className="space-y-0">
        {comments.map((comment) => (
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
          <CommentBox prNumber={prNumber} />
        </div>
      </div>
    </div>
  )
}
