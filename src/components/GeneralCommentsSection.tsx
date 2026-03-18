"use client";

import { motion } from "motion/react";
import { CommentBox } from "@/components/CommentBox";
import { CommentMarkdown } from "@/components/CommentMarkdown";
import { CommentPermalink } from "@/components/CommentPermalink";
import type { Comment } from "@/lib/github";

interface GeneralCommentsSectionProps {
  owner: string;
  repo: string;
  comments: Comment[];
  commentsLoading?: boolean;
  prNumber: number;
  highlightedCommentId?: number | null;
  onCommentPosted?: (comment: string) => void;
}

export function GeneralCommentsSection({
  owner,
  repo,
  comments,
  commentsLoading,
  prNumber,
  highlightedCommentId,
  onCommentPosted,
}: GeneralCommentsSectionProps) {
  return (
    <div className="mt-8">
      <h2 className="mb-4 border-b border-gray-20 pb-2 text-4xl font-serif tracking-tight text-foreground">
        General comments
      </h2>
      <div className="space-y-0 border border-gray-20 rounded-md overflow-hidden">
        {commentsLoading && comments.length === 0 ? (
          <div className="bg-surface p-6">
            <motion.div
              className="space-y-6"
              initial="hidden"
              animate="visible"
              variants={{
                visible: { transition: { staggerChildren: 0.08 } },
                hidden: {},
              }}
            >
              {["skeleton-0", "skeleton-1"].map((id) => (
                <motion.div
                  key={id}
                  className="flex items-start gap-3"
                  variants={{
                    visible: { opacity: 1, y: 0 },
                    hidden: { opacity: 0, y: 8 },
                  }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="h-6 w-6 animate-pulse rounded-full bg-gray-20" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 animate-pulse rounded bg-gray-20" />
                    <div className="h-4 w-full animate-pulse rounded bg-gray-20" />
                    <div className="h-4 w-5/6 animate-pulse rounded bg-gray-20" />
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.05 } },
              hidden: {},
            }}
          >
            {comments.map((comment) => (
              <motion.div
                key={comment.id}
                id={`comment-${comment.id}`}
                className={`border-b border-gray-20 bg-surface p-6 transition-colors duration-700 ${highlightedCommentId === comment.id ? "bg-cyan/10" : ""}`}
                variants={{
                  visible: { opacity: 1, y: 0 },
                  hidden: { opacity: 0, y: 8 },
                }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
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
                <CommentPermalink commentId={comment.id} />
              </div>
              <CommentMarkdown content={comment.body} />
              </motion.div>
            ))}
          </motion.div>
        )}
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
