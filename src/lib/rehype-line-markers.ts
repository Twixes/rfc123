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
      // Skip mermaid blocks — they need pristine text for rendering
      const classes = Array.isArray(node.properties?.className) ? node.properties.className : [];
      if (node.tagName === "code" && classes.some((c) => String(c) === "language-mermaid")) {
        return;
      }
      if (node.tagName === "code" && node.children && node.position) {
        // Check if this is an inline code element (no newlines) or a block
        const textContent = node.children
          .filter((child) => child.type === "text")
          .map((child) => (child as Text).value)
          .join("");

        // Only process block code (contains newlines), not inline code
        if (textContent?.includes("\n")) {
          const codeLines = textContent.split("\n");
          const baseLineNumber = node.position.start.line;

          // Clear existing children and rebuild with line markers
          const newChildren: (Element | Text)[] = [];

          for (let i = 0; i < codeLines.length; i++) {
            // Line number in the source markdown
            // +1 because the first line inside the code fence is the line after the opening ```
            const lineNum = baseLineNumber + 1 + i;
            linesSeen.add(lineNum);

            // Add marker for this line
            const marker: Element = {
              type: "element",
              tagName: "span",
              properties: {
                id: `line-marker-${lineNum}`,
                "data-line": lineNum,
                style:
                  "display:inline;width:0;height:0;overflow:hidden;pointer-events:none;",
              },
              children: [],
            };
            newChildren.push(marker);

            // Add the text content for this line
            const lineText: Text = {
              type: "text",
              value: codeLines[i] + (i < codeLines.length - 1 ? "\n" : ""),
            };
            newChildren.push(lineText);
          }

          node.children = newChildren;
          // Skip the default element processing below
          return;
        }
      }

      // Skip table and tr — tables get markers in the dedicated table pass
      if (node.tagName === "table" || node.tagName === "tr") return;

      // For all other elements, inject an invisible marker span for position tracking
      if (node.position?.start?.line) {
        const lineNumber = node.position.start.line;

        if (!linesSeen.has(lineNumber)) {
          linesSeen.add(lineNumber);

          const marker: Element = {
            type: "element",
            tagName: "span",
            properties: {
              id: `line-marker-${lineNumber}`,
              "data-line": lineNumber,
              style:
                "display:inline;width:0;height:0;overflow:hidden;pointer-events:none;",
            },
            children: [],
          };

          if (node.children) {
            node.children.unshift(marker);
          }
        }
      }
    });

    // Table rows: assign line numbers based on structure (header=line N, separator=+1,
    // first data=+2, etc.) and inject markers into first cell to avoid column layout issues.
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "table" || !node.position?.start?.line) return;

      const tableLine = node.position.start.line;
      let trIndex = 0;

      for (const section of node.children) {
        if (section.type !== "element") continue;
        const sectionEl = section as Element;
        if (sectionEl.tagName !== "thead" && sectionEl.tagName !== "tbody") continue;

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
              const marker: Element = {
                type: "element",
                tagName: "span",
                properties: {
                  id: `line-marker-${lineNumber}`,
                  "data-line": lineNumber,
                  style:
                    "display:inline;width:0;height:0;overflow:hidden;pointer-events:none;",
                },
                children: [],
              };
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
    // 1. Top-level block elements (p, h1, blockquote, etc.) — but NOT ol/ul
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

    // 2. li elements — each list item gets its own line for individual highlighting
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "li") return;
      const lineNumber =
        node.position?.start?.line ??
        findFirstDescendantLine(node);
      if (lineNumber != null) {
        if (!node.properties) node.properties = {};
        node.properties["data-line-element"] = lineNumber;
      }
    });

    // 3. tr elements — table rows are handled in the table pass above; other tr (unlikely) get position-based line
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "tr") return;
      if (node.properties?.["data-line-element"]) return; // already set by table pass
      const lineNumber =
        node.position?.start?.line ??
        findFirstDescendantLine(node);
      if (lineNumber != null) {
        if (!node.properties) node.properties = {};
        node.properties["data-line-element"] = lineNumber;
      }
    });
  };
}
