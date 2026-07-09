"use client";

import { useCallback } from "react";
import { CopyLinkButton } from "@/components/CopyLinkButton";

interface CommentPermalinkProps {
  commentId: number;
}

export function CommentPermalink({ commentId }: CommentPermalinkProps) {
  const mutateUrl = useCallback(
    (url: URL) => {
      url.hash = `comment-${commentId}`;
    },
    [commentId],
  );

  return (
    <CopyLinkButton
      mutateUrl={mutateUrl}
      ariaLabel="Copy link to comment"
      className="group/link relative ml-auto shrink-0 rounded p-0.5 text-gray-30 transition-colors hover:text-gray-70"
      iconClassName="h-3 w-3"
    />
  );
}
