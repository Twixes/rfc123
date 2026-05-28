"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import {
  createRfcMarkdownComponents,
  createRfcPrettyMarkdownComponents,
  PROSE_WRAPPER_CLASS,
} from "@/components/rfc-pretty-markdown-components";
import type { RfcMarkdownImageAssets } from "@/lib/markdown-assets";
import { remarkMentions } from "@/lib/remark-mentions";
import { remarkMergeParagraphs } from "@/lib/remark-merge-paragraphs";

type PluginList = NonNullable<
  React.ComponentProps<typeof ReactMarkdown>["rehypePlugins"]
>;

/** Same remark/rehype stack as Pretty read view, minus line markers. */
export const RFC_PRETTY_REMARK_PLUGINS: PluginList = [
  remarkGfm,
  remarkMentions,
  remarkBreaks,
  remarkMergeParagraphs,
];

export const RFC_PRETTY_REHYPE_PLUGINS: PluginList = [
  [rehypeHighlight, { plainText: ["mermaid"] }],
];

export type RfcMarkdownAssets = RfcMarkdownImageAssets;

export {
  PROSE_WRAPPER_CLASS,
  createRfcMarkdownComponents,
  createRfcPrettyMarkdownComponents,
};

interface RfcPrettyMarkdownProps {
  content: string;
  assets?: RfcMarkdownAssets;
  className?: string;
}

/** Pretty RFC markdown (read or edit preview) without inline comments. */
export function RfcPrettyMarkdown({
  content,
  assets,
  className,
}: RfcPrettyMarkdownProps) {
  const assetOwner = assets?.owner;
  const assetRepo = assets?.repo;
  const assetHeadRef = assets?.headRef;
  const assetMarkdownFilePath = assets?.markdownFilePath;
  const components = useMemo(
    () =>
      createRfcMarkdownComponents({
        assets:
          assetOwner != null &&
          assetRepo != null &&
          assetHeadRef != null &&
          assetMarkdownFilePath != null
            ? {
                owner: assetOwner,
                repo: assetRepo,
                headRef: assetHeadRef,
                markdownFilePath: assetMarkdownFilePath,
              }
            : undefined,
      }),
    [assetOwner, assetRepo, assetHeadRef, assetMarkdownFilePath],
  );

  return (
    <div className={className ?? PROSE_WRAPPER_CLASS}>
      <ReactMarkdown
        remarkPlugins={RFC_PRETTY_REMARK_PLUGINS}
        rehypePlugins={RFC_PRETTY_REHYPE_PLUGINS}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
