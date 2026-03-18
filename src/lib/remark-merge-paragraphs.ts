import type { Root, Paragraph, Text } from "mdast";

/**
 * Remark plugin that merges consecutive single-line paragraphs that don't end
 * with sentence-ending punctuation (. ! ?). This keeps structured content like
 *
 *   User sessions:
 *   Frequency: high
 *   Meaning density: low
 *
 * in one block with line breaks, while preserving separate paragraphs for
 * prose that ends with . ! ?
 */
export function remarkMergeParagraphs() {
  return (tree: Root) => {
    const children = tree.children;
    if (!Array.isArray(children) || children.length < 2) return;

    const SENTENCE_END = /[.!?]$/;
    const MAX_MERGE_LENGTH = 120; // Don't merge very long lines (likely prose)

    function getParagraphText(node: unknown): string | null {
      if (!node || typeof node !== "object" || (node as { type?: string }).type !== "paragraph") return null;
      const p = node as Paragraph;
      if (!p.children?.length) return null;
      // Single text child only
      if (p.children.length === 1 && p.children[0].type === "text") {
        return (p.children[0] as Text).value;
      }
      return null;
    }

    function isMergeable(text: string): boolean {
      if (text.length > MAX_MERGE_LENGTH) return false;
      return !SENTENCE_END.test(text.trim());
    }

    let i = 0;
    while (i < children.length) {
      const node = children[i];
      if (node.type !== "paragraph") {
        i++;
        continue;
      }

      const text = getParagraphText(node);
      if (text === null || !isMergeable(text)) {
        i++;
        continue;
      }

      // Collect mergeable paragraphs
      const run: number[] = [i];
      let j = i + 1;
      while (j < children.length) {
        const next = children[j];
        if (next.type !== "paragraph") break;
        const nextText = getParagraphText(next);
        if (nextText === null || !isMergeable(nextText)) break;
        run.push(j);
        j++;
      }

      if (run.length < 2) {
        i++;
        continue;
      }

      // Build merged paragraph: text1 + break + text2 + break + text3 ...
      const texts = run.map((idx) => getParagraphText(children[idx]) ?? "");
      const newChildren: Array<Text | { type: "break" }> = [];
      for (let k = 0; k < texts.length; k++) {
        newChildren.push({ type: "text", value: texts[k] as string });
        if (k < texts.length - 1) {
          newChildren.push({ type: "break" });
        }
      }

      const first = children[i] as Paragraph;
      const last = children[run[run.length - 1]] as Paragraph;
      const merged: Paragraph = {
        type: "paragraph",
        children: newChildren,
        position:
          first.position && last.position
            ? { start: first.position.start, end: last.position.end }
            : first.position,
      };

      // Replace run with merged paragraph
      children.splice(i, run.length, merged);
      i += 1;
    }
  };
}
