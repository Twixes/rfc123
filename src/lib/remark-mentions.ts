import type { Root, Text, Link } from "mdast";
import { visit } from "unist-util-visit";

/**
 * Remark plugin to convert @username mentions into GitHub user links.
 * Transforms @foo into a link to https://github.com/foo
 */
export function remarkMentions() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined) return;

      // Skip if already inside a link
      if (parent.type === "link") return;

      const text = node.value;
      // Match @username pattern (letters, numbers, hyphens)
      // GitHub usernames can contain alphanumeric chars and hyphens, but can't start with hyphen
      const mentionRegex = /@([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)/g;

      const matches = Array.from(text.matchAll(mentionRegex));

      if (matches.length === 0) return;

      // Split the text into parts and create new nodes
      const newNodes: Array<Text | Link> = [];
      let lastIndex = 0;

      for (const match of matches) {
        const matchStart = match.index!;
        const matchEnd = matchStart + match[0].length;
        const username = match[1];

        // Add text before the mention
        if (matchStart > lastIndex) {
          newNodes.push({
            type: "text",
            value: text.slice(lastIndex, matchStart),
          });
        }

        // Add the mention as a link
        newNodes.push({
          type: "link",
          url: `https://github.com/${username}`,
          children: [
            {
              type: "text",
              value: `@${username}`,
            },
          ],
        });

        lastIndex = matchEnd;
      }

      // Add remaining text after last mention
      if (lastIndex < text.length) {
        newNodes.push({
          type: "text",
          value: text.slice(lastIndex),
        });
      }

      // Replace the original text node with the new nodes
      parent.children.splice(index, 1, ...newNodes);
    });
  };
}
