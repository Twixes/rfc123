"use client";

import type { ComponentProps } from "react";
import TextareaAutosize from "react-textarea-autosize";

export const COMMENT_DRAFT_TEXTAREA_CLASS =
  "w-full resize-none rounded-sm border border-gray-20 bg-surface px-3 py-2 text-sm text-foreground placeholder-gray-40 transition-shadow focus:outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20";

type CommentDraftTextareaProps = Omit<
  ComponentProps<typeof TextareaAutosize>,
  "minRows"
> & {
  minRows?: number;
};

export function CommentDraftTextarea({
  minRows = 1,
  className = COMMENT_DRAFT_TEXTAREA_CLASS,
  ...props
}: CommentDraftTextareaProps) {
  return (
    <TextareaAutosize minRows={minRows} className={className} {...props} />
  );
}
