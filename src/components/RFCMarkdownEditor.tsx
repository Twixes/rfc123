"use client";

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { type Ref, useMemo } from "react";
import { diffHighlight } from "@/lib/codemirror-diff";
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
  /** Forwarded to @uiw/react-codemirror so callers can reach `.view` for
   *  things like measuring line coordinates from outside the editor. */
  editorRef?: Ref<ReactCodeMirrorRef>;
  /** Called once per CodeMirror update; consumers use it to re-measure line
   *  positions when the doc, viewport, or geometry changes. */
  onEditorUpdate?: () => void;
  /** When set, the editor overlays a word-level diff between `diffAgainst`
   *  and the current buffer. Added/changed ranges get a green mark; removed
   *  text appears as inline strikethrough widgets. */
  diffAgainst?: string;
}

export function RFCMarkdownEditor({
  value,
  onChange,
  className,
  editorRef,
  onEditorUpdate,
  diffAgainst,
}: RFCMarkdownEditorProps) {
  const extensions = useMemo(() => {
    const base = [
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
        ".cm-gutters": {
          backgroundColor: "transparent",
          border: "none",
        },
        ".cm-lineNumbers .cm-gutterElement": {
          fontFamily: MONO_FONT,
          fontSize: "0.75rem",
          color: "var(--gray-40)",
          padding: "0 0 0 1rem",
          minWidth: "1.5rem",
        },
        ".cm-activeLine": { backgroundColor: "transparent" },
        ".cm-selectionBackground": {
          backgroundColor: "var(--cyan-light) !important",
        },
        "&.cm-focused .cm-selectionBackground": {
          backgroundColor: "var(--cyan-light) !important",
        },
      }),
    ];
    if (onEditorUpdate) {
      // Selection-only updates don't change line geometry, so they don't need
      // to wake measurement consumers. docChanged covers typing; geometryChanged
      // covers wrap/zoom; viewportChanged covers scroll into a new region.
      base.push(
        EditorView.updateListener.of((u) => {
          if (u.docChanged || u.geometryChanged || u.viewportChanged) {
            onEditorUpdate();
          }
        }),
      );
    }
    if (diffAgainst !== undefined) {
      base.push(diffHighlight(diffAgainst));
    }
    return base;
  }, [onEditorUpdate, diffAgainst]);

  return (
    <CodeMirror
      ref={editorRef}
      value={value}
      onChange={onChange}
      extensions={extensions}
      className={className}
      height="auto"
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
        indentOnInput: false,
      }}
    />
  );
}
