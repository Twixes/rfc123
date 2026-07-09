import type { Element, Root, Text } from "hast";
import { visit } from "unist-util-visit";

function findFirstDescendantLine(node: Element): number | undefined {
  const visitNode = (n: Element | Text): number | undefined => {
    if (n.type === "element") {
      if (n.position?.start?.line) return n.position.start.line;
      // Marker spans have data-line from our plugin
      const dataLine = n.properties?.["data-line"];
      if (dataLine != null) return Number(dataLine);
      for (const child of n.children) {
        const line = visitNode(child as Element | Text);
        if (line != null) return line;
      }
    }
    return undefined;
  };
  for (const child of node.children) {
    const line = visitNode(child as Element | Text);
    if (line != null) return line;
  }
  return undefined;
}

// Void elements that cannot have children
function flattenText(nodes: (Element | Text)[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") {
      out += node.value;
    } else if (node.type === "element") {
      out += flattenText(node.children as (Element | Text)[]);
    }
  }
  return out;
}

function createLineMarker(lineNum: number): Element {
  return {
    type: "element",
    tagName: "span",
    properties: {
      "data-line": lineNum,
      style:
        "display:inline;width:0;height:0;overflow:hidden;pointer-events:none;",
    },
    children: [],
  };
}

function wrapWithHighlightStack(
  text: string,
  stack: Element[],
): Element | Text {
  let node: Element | Text = { type: "text", value: text };
  for (let i = stack.length - 1; i >= 0; i--) {
    const el = stack[i];
    node = {
      type: "element",
      tagName: el.tagName,
      properties: { ...el.properties },
      children: [node],
    };
  }
  return node;
}

/** Split already-highlighted code on newlines without stripping hljs spans. */
function injectLineMarkersPreservingHighlight(
  code: Element,
  baseLineNumber: number,
  linesSeen: Set<number>,
): void {
  const lineContents: (Element | Text)[][] = [[]];

  const append = (nodes: (Element | Text)[]) => {
    lineContents[lineContents.length - 1].push(...nodes);
  };
  const newline = () => {
    lineContents.push([]);
  };

  const walk = (nodes: (Element | Text)[], stack: Element[]) => {
    for (const node of nodes) {
      if (node.type === "text") {
        const parts = node.value.split("\n");
        for (let i = 0; i < parts.length; i++) {
          if (i > 0) newline();
          if (parts[i].length > 0) {
            append([wrapWithHighlightStack(parts[i], stack)]);
          }
        }
      } else if (node.type === "element") {
        walk(node.children as (Element | Text)[], [...stack, node]);
      }
    }
  };

  walk(code.children as (Element | Text)[], []);

  // Drop trailing empty lines – the closing fence (and authors' blank
  // tails) leave empty arrays at the end of `lineContents`. Rendering
  // them would put dead vertical space at the bottom of the block.
  while (
    lineContents.length > 1 &&
    lineContents[lineContents.length - 1].length === 0
  ) {
    lineContents.pop();
  }

  const newChildren: (Element | Text)[] = [];
  for (let i = 0; i < lineContents.length; i++) {
    const lineNum = baseLineNumber + 1 + i;
    linesSeen.add(lineNum);
    // Wrap each line in a block-level span. The `data-line` marker attribute
    // stays on this element so position-calc and click routing still find it
    // via `[data-line]`. `data-line-element` lets the hover-highlight
    // CSS attach to the line. `min-width:100%` makes the highlight stretch
    // to the visible right edge of the code block. Empty source lines get
    // a single space so the block has visible height.
    const children: (Element | Text)[] =
      lineContents[i].length > 0
        ? lineContents[i]
        : [{ type: "text", value: " " }];
    const lineSpan: Element = {
      type: "element",
      tagName: "span",
      properties: {
        "data-line": lineNum,
        "data-line-element": lineNum,
        className: ["code-line"],
        style: "display:block;min-width:100%;",
      },
      children,
    };
    newChildren.push(lineSpan);
  }
  code.children = newChildren;
}

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Rehype plugin that injects invisible line markers into the rendered HTML.
 * These markers allow us to accurately calculate line positions after rendering.
 *
 * This works by using markdown source line numbers and injecting
 * span elements at the start of each line's content.
 * For code blocks, each line within the block gets its own marker based on
 * the corresponding source line.
 */
export function rehypeLineMarkers() {
  return (tree: Root) => {
    const linesSeen = new Set<number>();

    visit(tree, "element", (node: Element) => {
      // Skip void elements that cannot have children
      if (VOID_ELEMENTS.has(node.tagName)) {
        return;
      }

      // Special handling for code blocks - each line gets a marker
      // Skip mermaid blocks – they need pristine text for rendering
      const classes = Array.isArray(node.properties?.className)
        ? node.properties.className
        : [];
      if (
        node.tagName === "code" &&
        classes.some((c) => String(c) === "language-mermaid")
      ) {
        return;
      }
      if (node.tagName === "code" && node.children && node.position) {
        const textContent = flattenText(node.children as (Element | Text)[]);

        // Only process block code (contains newlines), not inline code
        if (textContent.includes("\n")) {
          const baseLineNumber = node.position.start.line;
          const highlighted = node.children.some(
            (child) => child.type === "element",
          );

          if (highlighted) {
            injectLineMarkersPreservingHighlight(
              node,
              baseLineNumber,
              linesSeen,
            );
          } else {
            const codeLines = textContent.split("\n");
            const newChildren: (Element | Text)[] = [];

            for (let i = 0; i < codeLines.length; i++) {
              const lineNum = baseLineNumber + 1 + i;
              linesSeen.add(lineNum);
              newChildren.push(createLineMarker(lineNum));
              const lineText: Text = {
                type: "text",
                value: codeLines[i] + (i < codeLines.length - 1 ? "\n" : ""),
              };
              newChildren.push(lineText);
            }

            node.children = newChildren;
          }
          return;
        }
      }

      // Skip table and tr – tables get markers in the dedicated table pass
      if (node.tagName === "table" || node.tagName === "tr") return;

      // Skip `pre` wrappers around code blocks. The inner `<code>` already
      // injected per-line markers for the content; adding another marker on
      // the `pre` here would map the opening-fence line to the same Y as
      // the first content line and stack the two numbers on top of each
      // other in the gutter.
      if (
        node.tagName === "pre" &&
        node.children?.some(
          (child) => child.type === "element" && child.tagName === "code",
        )
      ) {
        return;
      }

      // For all other elements, inject an invisible marker span for position tracking
      if (node.position?.start?.line) {
        const lineNumber = node.position.start.line;

        if (!linesSeen.has(lineNumber)) {
          linesSeen.add(lineNumber);

          const marker = createLineMarker(lineNumber);

          if (node.children) {
            node.children.unshift(marker);
          }
        }
      }
    });

    // Table rows: assign line numbers based on structure (header=line N, separator=+1,
    // first data=+2, etc.) and inject markers into first cell to avoid column layout issues.
    visit(tree, "element", (node: Element, _index, _parent) => {
      if (node.tagName !== "table" || !node.position?.start?.line) return;

      const tableLine = node.position.start.line;
      let trIndex = 0;

      for (const section of node.children) {
        if (section.type !== "element") continue;
        const sectionEl = section as Element;
        if (sectionEl.tagName !== "thead" && sectionEl.tagName !== "tbody")
          continue;

        for (const row of sectionEl.children) {
          if (row.type !== "element") continue;
          const tr = row as Element;
          if (tr.tagName !== "tr") continue;

          // Header = tableLine, first data = +2 (separator line), then +1 per row
          const lineNumber =
            trIndex === 0 ? tableLine : tableLine + 2 + (trIndex - 1);
          trIndex++;

          if (!linesSeen.has(lineNumber) && tr.children?.length) {
            const firstCell = tr.children[0];
            if (
              firstCell.type === "element" &&
              (firstCell.tagName === "th" || firstCell.tagName === "td")
            ) {
              linesSeen.add(lineNumber);
              const marker = createLineMarker(lineNumber);
              if (firstCell.children) {
                (firstCell as Element).children.unshift(marker);
              }
            }
          }

          if (!tr.properties) tr.properties = {};
          tr.properties["data-line-element"] = lineNumber;
        }
      }
    });

    // Add data-line-element (and data-line-end for multi-line blocks) for per-line hover/comment UI.
    // 1. Top-level block elements (p, h1, blockquote, etc.) – but NOT ol/ul
    for (const child of tree.children) {
      if (child.type === "element" && child.position?.start?.line) {
        const el = child as Element;
        const tag = el.tagName;
        if (tag === "ol" || tag === "ul") continue; // list containers handled by li
        if (tag === "table") continue; // table container handled by tr
        if (!el.properties) el.properties = {};
        el.properties["data-line-element"] = child.position.start.line;
        const endLine = child.position?.end?.line;
        if (endLine != null && endLine > child.position.start.line) {
          el.properties["data-line-end"] = endLine;
        }
      }
    }

    // 2. li elements – each list item gets its own line for individual highlighting
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "li") return;
      const lineNumber =
        node.position?.start?.line ?? findFirstDescendantLine(node);
      if (lineNumber != null) {
        if (!node.properties) node.properties = {};
        node.properties["data-line-element"] = lineNumber;
      }
    });

    // 3. tr elements – table rows are handled in the table pass above; other tr (unlikely) get position-based line
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "tr") return;
      if (node.properties?.["data-line-element"]) return; // already set by table pass
      const lineNumber =
        node.position?.start?.line ?? findFirstDescendantLine(node);
      if (lineNumber != null) {
        if (!node.properties) node.properties = {};
        node.properties["data-line-element"] = lineNumber;
      }
    });
  };
}
