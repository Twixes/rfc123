"use client";

import { motion } from "motion/react";
import { CommentBox } from "@/components/CommentBox";
import { CommentMarkdown } from "@/components/CommentMarkdown";
import { CommentPermalink } from "@/components/CommentPermalink";
import { RelativeTime } from "@/components/RelativeTime";
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
    <section className="mt-16">
      <div className="mb-6 flex items-baseline gap-4">
        <h2 className="text-2xl sm:text-3xl font-serif font-normal tracking-tight text-foreground">
          General comments
        </h2>
        <span className="h-px flex-1 bg-gray-20" />
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-gray-50">
          {comments.length === 0
            ? "No comments yet"
            : comments.length === 1
              ? "1 comment"
              : `${comments.length} comments`}
        </span>
      </div>

      {commentsLoading && comments.length === 0 ? (
        <motion.ul
          className="space-y-8"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.08 } },
            hidden: {},
          }}
        >
          {["skeleton-0", "skeleton-1"].map((id) => (
            <motion.li
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
            </motion.li>
          ))}
        </motion.ul>
      ) : (
        comments.length > 0 && (
          <motion.ul
            className="mb-10 divide-y divide-gray-20"
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.04 } },
              hidden: {},
            }}
          >
            {comments.map((comment) => (
              <motion.li
                key={comment.id}
                id={`comment-${comment.id}`}
                className={`py-6 transition-colors duration-700 ${
                  highlightedCommentId === comment.id ? "bg-cyan/10" : ""
                }`}
                variants={{
                  visible: { opacity: 1, y: 0 },
                  hidden: { opacity: 0, y: 8 },
                }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
              >
                <div className="mb-3 flex items-center gap-2">
                  <img
                    src={comment.userAvatar}
                    alt={comment.user}
                    className="h-6 w-6 rounded-full border border-gray-20"
                  />
                  <span className="text-sm font-medium text-foreground">
                    {comment.user}
                  </span>
                  <span className="text-gray-30">·</span>
                  <span className="text-xs text-gray-50">
                    <RelativeTime date={comment.createdAt} />
                  </span>
                  <CommentPermalink commentId={comment.id} />
                </div>
                <CommentMarkdown content={comment.body} />
              </motion.li>
            ))}
          </motion.ul>
        )
      )}

      <CommentBox
        owner={owner}
        repo={repo}
        prNumber={prNumber}
        onCommentPosted={onCommentPosted}
      />
    </section>
  );
}
