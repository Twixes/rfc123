import { syntaxTree } from "@codemirror/language";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

function normalizeMarkdownHref(raw: string): string | null {
  const trimmed = raw.trim().replace(/^<|>$/g, "");
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : trimmed.startsWith("www.")
      ? `https://${trimmed}`
      : null;
  if (!candidate) return null;
  if (/^https?:\/\//i.test(candidate) || /^mailto:/i.test(candidate)) {
    return candidate;
  }
  return null;
}

function hrefFromNode(
  state: { doc: { sliceString: (from: number, to: number) => string } },
  node: {
    type: { name: string };
    from: number;
    to: number;
    getChild: (name: string) => { from: number; to: number } | null;
  },
): string | null {
  const name = node.type.name;
  if (name === "URL" || name === "Autolink") {
    return normalizeMarkdownHref(state.doc.sliceString(node.from, node.to));
  }
  if (name === "Link" || name === "Image") {
    const url = node.getChild("URL");
    if (url) {
      return normalizeMarkdownHref(state.doc.sliceString(url.from, url.to));
    }
  }
  return null;
}

function hrefAtPosition(
  state: Parameters<typeof syntaxTree>[0],
  pos: number,
): string | null {
  const tree = syntaxTree(state);
  if (!tree.length) return null;
  const node = tree.resolveInner(pos, -1);
  for (let cur: typeof node | null = node; cur; cur = cur.parent) {
    const href = hrefFromNode(state, cur);
    if (href) return href;
  }
  return null;
}

function hrefOnUrlToken(
  state: Parameters<typeof syntaxTree>[0],
  pos: number,
): string | null {
  const tree = syntaxTree(state);
  if (!tree.length) return null;
  const node = tree.resolveInner(pos, -1);
  if (node.type.name === "URL" || node.type.name === "Autolink") {
    return normalizeMarkdownHref(state.doc.sliceString(node.from, node.to));
  }
  return null;
}

function openHref(href: string) {
  window.open(href, "_blank", "noopener,noreferrer");
}

function buildLinkDecorations(view: EditorView): DecorationSet {
  const marks: Array<{ from: number; to: number; href: string }> = [];
  const seen = new Set<string>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === "URL" || node.name === "Autolink") {
          const href = normalizeMarkdownHref(
            view.state.doc.sliceString(node.from, node.to),
          );
          if (!href) return;
          const key = `${node.from}:${node.to}`;
          if (seen.has(key)) return;
          seen.add(key);
          marks.push({ from: node.from, to: node.to, href });
        }
        if (node.name === "Link" || node.name === "Image") {
          const url = node.node.getChild("URL");
          if (!url) return;
          const href = normalizeMarkdownHref(
            view.state.doc.sliceString(url.from, url.to),
          );
          if (!href) return;
          const key = `${url.from}:${url.to}`;
          if (seen.has(key)) return;
          seen.add(key);
          marks.push({ from: url.from, to: url.to, href });
        }
      },
    });
  }

  marks.sort((a, b) => a.from - b.from);
  const builder = [];
  for (const { from, to, href } of marks) {
    builder.push(
      Decoration.mark({
        class: "cm-markdown-link",
        attributes: {
          title: `${href} — click to open; ⌘-click anywhere on the link`,
        },
      }).range(from, to),
    );
  }
  return Decoration.set(builder, true);
}

const linkPointerPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildLinkDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildLinkDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** Clickable markdown links in the source editor (text stays fully editable). */
export function markdownLinkClicks() {
  return [
    linkPointerPlugin,
    EditorView.domEventHandlers({
      mousedown(event, view) {
        const pos = view.posAtCoords({
          x: event.clientX,
          y: event.clientY,
        });
        if (pos == null) return false;

        const modifier = event.metaKey || event.ctrlKey;
        const middleClick = event.button === 1;
        const href =
          modifier || middleClick
            ? hrefAtPosition(view.state, pos)
            : hrefOnUrlToken(view.state, pos);
        if (!href) return false;

        event.preventDefault();
        openHref(href);
        return true;
      },
    }),
    EditorView.baseTheme({
      ".cm-markdown-link": {
        cursor: "pointer",
      },
    }),
  ];
}
