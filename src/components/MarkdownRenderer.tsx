"use client";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { remarkMentions } from "@/lib/remark-mentions";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-zinc max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMentions]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-2 mt-6 text-3xl font-serif text-foreground">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-5 text-2xl font-serif text-foreground">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-4 text-xl font-serif text-foreground">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="my-2 leading-relaxed text-gray-90">{children}</p>
          ),
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
            <ul className="my-2 ml-6 list-disc space-y-1 text-gray-90">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-6 list-decimal space-y-1 text-gray-90">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  className="border border-gray-20 rounded-sm bg-gray-5 px-1.5 py-0.5 font-mono text-sm text-foreground"
                  {...props}
                >
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
            <pre className="my-4 overflow-x-auto border border-gray-30 rounded bg-gray-90 p-4">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className="my-4 border-l-2 bg-gray-5 py-2 pl-4 pr-4 italic text-gray-70"
              style={{ borderLeftColor: "var(--magenta)" }}
            >
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
          thead: ({ children }) => (
            <thead className="bg-gray-10">{children}</thead>
          ),
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
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
