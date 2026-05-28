"use client";

import hljs from "highlight.js/lib/core";
import markdown from "highlight.js/lib/languages/markdown";
import { useEffect, useRef } from "react";
import { MARKDOWN_PRE_CLASS } from "@/lib/markdown-code";

hljs.registerLanguage("markdown", markdown);

interface MarkdownRawViewProps {
  content: string;
}

export function MarkdownRawView({ content }: MarkdownRawViewProps) {
  const codeRef = useRef<HTMLElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-highlight when the source text changes; hljs caches via the data-highlighted attribute we strip above
  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.removeAttribute("data-highlighted");
      hljs.highlightElement(codeRef.current);
    }
  }, [content]);

  return (
    <pre className={MARKDOWN_PRE_CLASS}>
      <code ref={codeRef} className="language-markdown text-sm">
        {content}
      </code>
    </pre>
  );
}
