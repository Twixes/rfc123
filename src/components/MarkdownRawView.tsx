"use client";

import { useEffect, useRef } from "react";
import hljs from "highlight.js/lib/core";
import markdown from "highlight.js/lib/languages/markdown";

hljs.registerLanguage("markdown", markdown);

interface MarkdownRawViewProps {
  content: string;
}

export function MarkdownRawView({ content }: MarkdownRawViewProps) {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.removeAttribute("data-highlighted");
      hljs.highlightElement(codeRef.current);
    }
  }, [content]);

  return (
    <pre className="overflow-x-auto rounded border border-gray-30 bg-gray-90 p-4">
      <code ref={codeRef} className="language-markdown text-sm leading-relaxed">
        {content}
      </code>
    </pre>
  );
}
