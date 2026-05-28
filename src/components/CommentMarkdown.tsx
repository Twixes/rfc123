"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { ClickableImage } from "@/components/ClickableImage";
import {
  MARKDOWN_INLINE_CODE_CLASS_COMPACT,
  MARKDOWN_PRE_CLASS_COMPACT,
} from "@/lib/markdown-code";
import { markdownSanitizeSchema } from "@/lib/markdown-sanitize-schema";
import { remarkMentions } from "@/lib/remark-mentions";

interface CommentMarkdownProps {
  content: string;
}

export const CommentMarkdown = memo(function CommentMarkdown({
  content,
}: CommentMarkdownProps) {
  return (
    <div className="text-sm text-gray-90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMentions]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, markdownSanitizeSchema],
          rehypeHighlight,
        ]}
        components={{
          img: ({ src, alt, ...props }) => {
            let proxiedSrc = src;
            try {
              if (typeof src === "string") {
                const url = new URL(src);
                if (
                  url.hostname === "github.com" &&
                  url.pathname.startsWith("/user-attachments/")
                ) {
                  proxiedSrc = `/api/github-image?url=${encodeURIComponent(src)}`;
                }
              }
            } catch {}
            return (
              <ClickableImage
                src={proxiedSrc as string | undefined}
                alt={(alt as string) ?? ""}
                {...props}
              />
            );
          },
          h1: ({ children }) => (
            <h1 className="mb-1 mt-2 text-base font-sans font-semibold text-foreground">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1 mt-2 text-base font-sans font-semibold text-foreground">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2 text-sm font-sans font-semibold text-foreground">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="my-1 text-gray-90">{children}</p>,
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
          ul: ({ children }) => (
            <ul className="my-1 ml-4 list-disc space-y-0.5 text-gray-90">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1 ml-4 list-decimal space-y-0.5 text-gray-90">
              {children}
            </ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className={MARKDOWN_INLINE_CODE_CLASS_COMPACT} {...props}>
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
          pre: ({ children }) => (
            <pre className={`my-2 ${MARKDOWN_PRE_CLASS_COMPACT}`}>
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-l-magenta bg-gray-5 py-1 pl-2 pr-2 text-sm italic text-gray-70">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full border border-gray-20 text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-10">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-gray-20 bg-surface">
              {children}
            </tbody>
          ),
          tr: ({ children }) => <tr className="border-gray-20">{children}</tr>,
          th: ({ children }) => (
            <th className="border border-gray-20 px-2 py-1 text-left text-xs font-medium text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-20 px-2 py-1 text-xs text-gray-90">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
