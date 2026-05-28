"use client";

import { useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { ClickableImage } from "@/components/ClickableImage";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import {
  proxyMarkdownImageSrc,
  type RfcMarkdownImageAssets,
} from "@/lib/markdown-assets";
import {
  MARKDOWN_INLINE_CODE_CLASS,
  MARKDOWN_PRE_CLASS,
} from "@/lib/markdown-code";
import { extractMermaidChart } from "@/lib/markdown-mermaid";
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

const PROSE_WRAPPER_CLASS =
  "prose prose-zinc max-w-none [&>*:first-child]:mt-0 [&>*:first-child]:pt-0 [&>*:last-child]:mb-0 [&>*:last-child]:pb-0";

/** Markdown component map for the Pretty RFC view (no comment UI). */
export function createRfcPrettyMarkdownComponents(
  assets?: RfcMarkdownAssets,
): Components {
  return {
    h1: ({ children }) => (
      <h1 className="mb-3 mt-4 py-2 border-b border-gray-20 text-4xl font-serif! font-normal! tracking-tight leading-tight text-foreground">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="mb-3 mt-3 py-2 border-b border-gray-20 text-3xl font-serif! font-normal! tracking-tight leading-tight text-foreground">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mb-2 mt-4 text-xl font-sans! font-semibold! leading-snug text-foreground">
        {children}
      </h3>
    ),
    p: ({ children }) => <p className="my-2">{children}</p>,
    a: ({ href, children }) => (
      <a
        href={href}
        className="text-foreground underline decoration-cyan underline-offset-2 transition-all hover:decoration-foreground"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold">{children}</strong>
    ),
    hr: () => <hr className="my-6 border-0 border-t-2 border-gray-20" />,
    ul: ({ children }) => (
      <ul className="my-2 ml-6 list-disc space-y-0.5 text-gray-90">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="my-2 ml-6 list-decimal space-y-0.5 text-gray-90">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="text-gray-90 leading-relaxed">{children}</li>
    ),
    code: ({ className, children, ...props }) => {
      const isInline = !className;
      if (isInline) {
        return (
          <code className={MARKDOWN_INLINE_CODE_CLASS} {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    pre: ({ children }) => {
      const chart = extractMermaidChart(children);
      if (chart !== null) {
        return (
          <div className="mermaid-block my-4">
            <MermaidDiagram chart={chart} />
          </div>
        );
      }
      return (
        <pre
          className={`my-4 max-w-full whitespace-pre-wrap ${MARKDOWN_PRE_CLASS}`}
        >
          {children}
        </pre>
      );
    },
    blockquote: ({ children }) => (
      <blockquote className="my-4 border-l-2 border-l-magenta bg-gray-5 py-2 pl-4 pr-4 italic text-gray-70">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto">
        <table className="min-w-full border border-gray-20 rounded">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-gray-10">{children}</thead>,
    tbody: ({ children }) => (
      <tbody className="divide-y divide-gray-20 bg-surface">{children}</tbody>
    ),
    tr: ({ children }) => <tr className="border-gray-20">{children}</tr>,
    th: ({ children }) => (
      <th className="border border-gray-20 px-4 py-2 text-left text-sm font-medium text-foreground">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-gray-20 px-4 py-2 text-sm text-gray-90">
        {children}
      </td>
    ),
    img: ({ src, alt, ...props }) => (
      <ClickableImage
        src={
          typeof src === "string"
            ? proxyMarkdownImageSrc(src, assets)
            : undefined
        }
        alt={(alt as string) ?? ""}
        {...props}
      />
    ),
  };
}

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
      assetOwner != null &&
      assetRepo != null &&
      assetHeadRef != null &&
      assetMarkdownFilePath != null
        ? createRfcPrettyMarkdownComponents({
            owner: assetOwner,
            repo: assetRepo,
            headRef: assetHeadRef,
            markdownFilePath: assetMarkdownFilePath,
          })
        : createRfcPrettyMarkdownComponents(undefined),
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
