"use client";

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";
import { markdownLinkClicks } from "@/lib/codemirror-markdown-links";

const MONO_FONT =
  'ui-monospace, "SF Mono", Monaco, "Cascadia Code", Menlo, Consolas, monospace';

const markdownEmphasisHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.link, textDecoration: "underline" },
  { tag: tags.url, textDecoration: "underline" },
]);

interface RFCMarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}

export function RFCMarkdownEditor({
  value,
  onChange,
  className,
}: RFCMarkdownEditorProps) {
  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(markdownEmphasisHighlight, { fallback: false }),
      EditorView.lineWrapping,
      markdownLinkClicks(),
      EditorView.theme({
        "&": { backgroundColor: "transparent" },
        "&.cm-focused": { outline: "none" },
        ".cm-scroller": {
          overflow: "visible",
          fontFamily: MONO_FONT,
        },
        ".cm-content": {
          fontFamily: MONO_FONT,
          fontSize: "0.875rem",
          lineHeight: "1.625",
          color: "var(--gray-90)",
          caretColor: "var(--foreground)",
          padding: "1.25rem 1.5rem",
          minHeight: "18rem",
        },
        ".cm-gutters": { display: "none" },
        ".cm-activeLine": { backgroundColor: "transparent" },
        ".cm-selectionBackground": {
          backgroundColor: "var(--cyan-light) !important",
        },
        "&.cm-focused .cm-selectionBackground": {
          backgroundColor: "var(--cyan-light) !important",
        },
      }),
    ],
    [],
  );

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      className={className}
      height="auto"
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
        indentOnInput: false,
      }}
    />
  );
}
