import type { Element, Root } from "hast";
import { describe, expect, it } from "vitest";
import { rehypeLineMarkers } from "./rehype-line-markers";

function position(line: number) {
  return {
    start: { line, column: 1, offset: 0 },
    end: { line, column: 10, offset: 9 },
  };
}

function paragraph(line: number, text: string): Element {
  return {
    type: "element",
    tagName: "p",
    properties: {},
    children: [{ type: "text", value: text }],
    position: position(line),
  };
}

/** `data-line` values of every injected marker, in document order. */
function markerLines(tree: Root): number[] {
  const lines: number[] = [];
  const walk = (node: Element | Root) => {
    for (const child of node.children ?? []) {
      if (child.type !== "element") continue;
      const line = child.properties?.["data-line"];
      if (line != null) lines.push(Number(line));
      walk(child);
    }
  };
  walk(tree);
  return lines;
}

describe("rehypeLineMarkers", () => {
  it("injects a data-line marker per block element", () => {
    const tree: Root = {
      type: "root",
      children: [paragraph(1, "first"), paragraph(3, "second")],
    };
    rehypeLineMarkers()(tree);
    expect(markerLines(tree)).toEqual([1, 3]);
  });

  it("injects per-line markers inside code blocks", () => {
    const code: Element = {
      type: "element",
      tagName: "code",
      properties: {},
      children: [{ type: "text", value: "a\nb" }],
      position: position(2),
    };
    const pre: Element = {
      type: "element",
      tagName: "pre",
      properties: {},
      children: [code],
      position: position(2),
    };
    const tree: Root = { type: "root", children: [pre] };
    rehypeLineMarkers()(tree);
    // Fence opens on line 2, so content lines are 3 and 4.
    expect(markerLines(tree)).toEqual([3, 4]);
  });
});
