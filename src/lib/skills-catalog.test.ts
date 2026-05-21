import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The MCP server advertises a skills catalog at `rfc123://skills/catalog`.
 * That list must match the actual SKILL.md files under `skills/`, and every
 * skill's `allowed-tools` must reference only tools the MCP server still
 * exposes. Without these pins, a future tool deletion silently breaks the
 * skills, or a future skill drift goes unannounced.
 */

const SKILLS_DIR = join(__dirname, "..", "..", "skills");

const ADVERTISED_SKILLS = [
  "discuss-rfc",
  "pressure-test-rfc",
  "compare-to-codebase",
  "synthesize-discussion",
  "extract-action-items",
  "compare-alternatives",
  "suggest-reviewers",
];

const EXPOSED_TOOLS = new Set([
  "mcp__rfc123__rfc123_list_repos_with_rfcs",
  "mcp__rfc123__rfc123_list_rfcs",
  "mcp__rfc123__rfc123_get_rfc",
  "mcp__rfc123__rfc123_get_rfc_comments",
  "mcp__rfc123__rfc123_list_review_threads",
  "mcp__rfc123__rfc123_search_rfcs",
  "mcp__rfc123__rfc123_search_reviewers",
  "mcp__rfc123__rfc123_request_reviewers",
  "mcp__rfc123__rfc123_merge_rfc",
]);

function readFrontmatter(skillName: string): {
  name: string;
  allowedTools: string[];
} {
  const path = join(SKILLS_DIR, skillName, "SKILL.md");
  const raw = readFileSync(path, "utf-8");
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`No frontmatter in ${path}`);
  const block = match[1];
  const nameMatch = block.match(/^name:\s*(.+)$/m);
  if (!nameMatch) throw new Error(`No name in frontmatter of ${path}`);
  const allowedToolsBlock = block.match(
    /^allowed-tools:\s*\n((?:\s*-\s*.+\n?)+)/m,
  );
  const allowedTools = allowedToolsBlock
    ? allowedToolsBlock[1]
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("- "))
        .map((l) => l.slice(2).trim())
    : [];
  return { name: nameMatch[1].trim(), allowedTools };
}

describe("skills catalog", () => {
  it("advertises exactly the skills present on disk", () => {
    const onDisk = readdirSync(SKILLS_DIR).filter((entry) =>
      statSync(join(SKILLS_DIR, entry)).isDirectory(),
    );
    expect([...onDisk].sort()).toEqual([...ADVERTISED_SKILLS].sort());
  });

  for (const skillName of ADVERTISED_SKILLS) {
    it(`${skillName}: frontmatter name matches the directory`, () => {
      const fm = readFrontmatter(skillName);
      expect(fm.name).toBe(skillName);
    });

    it(`${skillName}: allowed-tools reference only exposed tools`, () => {
      const fm = readFrontmatter(skillName);
      for (const tool of fm.allowedTools) {
        // Skills may reference host-provided tools (e.g. AskUserQuestion)
        // but if they prefix with mcp__rfc123__ the tool must exist.
        if (tool.startsWith("mcp__rfc123__")) {
          expect(EXPOSED_TOOLS.has(tool)).toBe(true);
        }
      }
    });
  }
});
