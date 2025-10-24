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
            <h1 className="mb-2 mt-6 text-3xl font-bold uppercase tracking-tight text-black">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-5 text-2xl font-bold uppercase tracking-tight text-black">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-4 text-xl font-bold uppercase tracking-tight text-black">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="my-2 leading-relaxed text-gray-90">{children}</p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="border-b-2 font-bold text-black transition-all hover:border-black"
              style={{ borderBottomColor: "var(--cyan)" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="my-2 ml-6 list-square space-y-1 text-gray-90">
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
                  className="border border-black bg-gray-10 px-1.5 py-0.5 font-mono text-sm font-bold text-black"
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
            <pre className="my-4 overflow-x-auto border-2 border-black bg-black p-4">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className="my-4 border-l-[3px] bg-gray-10 py-2 pl-4 pr-4 font-medium italic text-gray-90"
              style={{ borderLeftColor: "var(--magenta)" }}
            >
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="min-w-full border-2 border-black">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-black text-white">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-black bg-white">{children}</tbody>
          ),
          tr: ({ children }) => <tr className="border-black">{children}</tr>,
          th: ({ children }) => (
            <th className="border border-black px-4 py-2 text-left text-sm font-bold uppercase tracking-wide text-white">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-black px-4 py-2 text-sm text-gray-90">
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
