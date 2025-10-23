"use client";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

interface CommentMarkdownProps {
  content: string;
}

export function CommentMarkdown({ content }: CommentMarkdownProps) {
  return (
    <div className="text-sm leading-relaxed text-gray-90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-1 mt-2 text-base font-bold text-black">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1 mt-2 text-base font-bold text-black">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2 text-sm font-bold text-black">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="my-1 leading-relaxed text-gray-90">{children}</p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="border-b font-bold text-black transition-all hover:border-black"
              style={{ borderBottomColor: "var(--cyan)" }}
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
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  className="border border-black bg-gray-10 px-1 py-0.5 font-mono text-xs font-bold text-black"
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
            <pre className="my-2 overflow-x-auto border-2 border-black bg-black p-2 text-xs">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className="my-2 border-l-2 bg-gray-10 py-1 pl-2 pr-2 text-sm italic text-gray-90"
              style={{ borderLeftColor: "var(--magenta)" }}
            >
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full border border-black text-xs">
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
            <th className="border border-black px-2 py-1 text-left text-xs font-bold text-white">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-black px-2 py-1 text-xs text-gray-90">
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
