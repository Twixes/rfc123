import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * Locate the `<code class="language-mermaid">` element inside the children
 * passed to a `<pre>` component, regardless of whether rehype plugins have
 * injected sibling marker spans alongside it.
 *
 * Returns the chart source as a trimmed string, or `null` if no mermaid
 * code block is present.
 */
export function extractMermaidChart(children: ReactNode): string | null {
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    const props = (
      child as ReactElement<{ className?: string; children?: unknown }>
    ).props;
    if (!props.className?.includes("language-mermaid")) continue;
    return flattenText(props.children).trim();
  }
  return null;
}

function flattenText(node: unknown): string {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (isValidElement(node)) {
    return flattenText(
      (node as ReactElement<{ children?: ReactNode }>).props.children,
    );
  }
  return "";
}
