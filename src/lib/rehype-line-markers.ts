import type { Element, Root, Text } from "hast";
import { visit } from "unist-util-visit";

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
      if (node.tagName === "code" && node.children && node.position) {
        // Check if this is an inline code element (no newlines) or a block
        const textContent = node.children
          .filter((child) => child.type === "text")
          .map((child) => (child as Text).value)
          .join("");

        // Only process block code (contains newlines), not inline code
        if (textContent && textContent.includes("\n")) {
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

      // For all other elements, use the markdown source line number
      if (node.position?.start?.line) {
        const lineNumber = node.position.start.line;

        // Add data-line attribute to the element itself for hover styling
        // Skip the root element and body
        if (
          node.tagName !== "div" ||
          (node.tagName === "div" && node.properties?.className)
        ) {
          if (!node.properties) {
            node.properties = {};
          }
          node.properties["data-line-element"] = lineNumber;
        }

        // If we haven't added a marker for this line yet
        if (!linesSeen.has(lineNumber)) {
          linesSeen.add(lineNumber);

          // Create an invisible marker element for position calculation
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

          // Insert marker at the beginning of this element's children
          if (node.children) {
            node.children.unshift(marker);
          }
        }
      }
    });
  };
}
